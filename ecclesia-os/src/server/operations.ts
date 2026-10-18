import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { z } from "zod";
import { audit } from "./seed.js";
import { requireThat, encrypt, decrypt } from "./security.js";
import { postEntry } from "./finance.js";
import { notifyTaskAssignee } from "./agenda.js";
import type { Efi } from "./efi.js";
type R = Request & { actor: Row; church: string };
const privacyRetentionCategories = ["people", "families", "attendance", "contributions", "pastoral_notes", "prayer", "documents", "audit_logs", "auth_sessions", "privacy_requests", "member_registration", "kids"] as const;
export function operations(
  app: Express,
  db: Database,
  options: { mode: string; key: Buffer; efi: Efi },
) {
  const route =
    (fn: (r: R, s: Response) => Promise<any>) =>
    (r: Request, s: Response, n: NextFunction) =>
      Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(fn, { actor: r.actor.id, church: r.church });
  };
  const admin = async (r: R) => {
    requireThat(r.actor.mfa, 403, "MFA obrigatório.");
    const [a] = await scoped(r, (q) =>
      q("SELECT local_role()='admin' AS allowed"),
    );
    requireThat(a.allowed, 403, "Administração local obrigatória.");
  };
  const networkAdmin = async (r: R, network: string) => {
    requireThat(r.actor.mfa, 403, "MFA obrigatório.");
    const rows = await db.transaction((q) =>
      q("SELECT 1 FROM network_members WHERE user_id=$1 AND network_id=$2", [
        r.actor.id,
        network,
      ]),
    );
    requireThat(rows.length, 403, "Permissão da rede obrigatória.");
  };
  const collectPrivacyExport = (q: Query, church: string, userId: string) => Promise.all([
    q("SELECT id,name,email,disabled_at FROM users WHERE id=$1", [userId]),
    q("SELECT p.id,p.name,p.email,p.phone,p.status,p.created_at,h.name AS household,EXISTS(SELECT 1 FROM member_photos photo WHERE photo.person_id=p.id) AS has_photo FROM people p LEFT JOIN households h ON h.id=p.household_id WHERE p.church_id=$1 AND p.user_id=$2", [church, userId]),
    q("SELECT m.role,m.campus_id,c.id AS church_id,c.name AS church_name FROM memberships m JOIN churches c ON c.id=m.church_id WHERE m.user_id=$1", [userId]),
    q("SELECT id,ministry,starts_at,ends_at,response,event_id,team_id FROM schedules WHERE church_id=$1 AND user_id=$2 ORDER BY starts_at", [church, userId]),
    q("SELECT id,kind,detail,status,created_at,updated_at,resolution_reason FROM privacy_requests WHERE church_id=$1 AND user_id=$2 ORDER BY created_at", [church, userId]),
    q("SELECT id,txid,amount_cents,fee_cents,status,created_at FROM pix_charges WHERE church_id=$1 AND user_id=$2 ORDER BY created_at", [church, userId]),
  ]).then(([users, people, memberships, schedules, privacy, charges]) => ({ user: users[0] ?? null, person: people[0] ?? null, memberships, schedules, privacy, contributions: charges }));
  const networkForChurch = async (r: R) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    const [row] = await db.transaction((q) => q("SELECT network_id FROM churches WHERE id=$1", [r.church]));
    requireThat(row, 404, "Igreja não encontrada.");
    return row.network_id as string;
  };
  app.get(
    "/api/regional-grants",
    route(async (r, s) => {
      const networkId = await networkForChurch(r);
      await networkAdmin(r, networkId);
      s.json(await db.transaction(async (q) => ({
        regions: await q("SELECT id,name FROM regions WHERE network_id=$1 ORDER BY name", [networkId]),
        candidates: await q("SELECT DISTINCT u.id,u.name,u.email FROM users u JOIN network_members n ON n.user_id=u.id WHERE n.network_id=$1 ORDER BY u.name", [networkId]),
        grants: await q("SELECT g.*,r.name AS region_name,u.name,u.email FROM regional_access_grants g JOIN regions r ON r.id=g.region_id JOIN users u ON u.id=g.user_id WHERE r.network_id=$1 ORDER BY g.expires_at DESC", [networkId]),
      })));
    }),
  );
  app.post(
    "/api/regional-grants",
    route(async (r, s) => {
      const b = z.object({ regionId: z.uuid(), userId: z.uuid(), scope: z.enum(["people", "cells", "finance"]), days: z.number().int().min(1).max(90) }).parse(r.body);
      const [region] = await db.transaction((q) => q("SELECT network_id FROM regions WHERE id=$1", [b.regionId]));
      requireThat(region, 404, "Regional não encontrada.");
      await networkAdmin(r, region.network_id);
      s.status(201).json(await db.transaction(async (q) => {
        requireThat((await q("SELECT 1 FROM network_members WHERE network_id=$1 AND user_id=$2", [region.network_id, b.userId])).length, 400, "Destinatário fora da rede.");
        const [grant] = await q("INSERT INTO regional_access_grants(region_id,user_id,scope,expires_at,granted_by) VALUES($1,$2,$3,now()+($4::int*interval '1 day'),$5) ON CONFLICT(region_id,user_id,scope) DO UPDATE SET expires_at=excluded.expires_at,revoked_at=NULL,granted_by=excluded.granted_by RETURNING *", [b.regionId, b.userId, b.scope, b.days, r.actor.id]);
        await audit(q, r.actor.id, r.church, "regional-grant.created", grant.id);
        return grant;
      }));
    }),
  );
  app.delete(
    "/api/regional-grants/:id",
    route(async (r, s) => {
      const grantId = z.uuid().parse(r.params.id);
      const [grant] = await db.transaction((q) => q("SELECT r.network_id FROM regional_access_grants g JOIN regions r ON r.id=g.region_id WHERE g.id=$1", [grantId]));
      requireThat(grant, 404, "Concessão regional não encontrada.");
      await networkAdmin(r, grant.network_id);
      await db.transaction(async (q) => {
        await q("UPDATE regional_access_grants SET revoked_at=now() WHERE id=$1", [grantId]);
        await audit(q, r.actor.id, r.church, "regional-grant.revoked", grantId);
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/subscription",
    route(async (r, s) => {
      await admin(r);
      const params = z.object({
        invoicePage: z.coerce.number().int().min(1).default(1),
        invoicePageSize: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(r.query);
      const [c] = await db.transaction((q) =>
        q("SELECT plan,modules FROM churches WHERE id=$1", [r.church]),
      );
      const [contract] = await scoped(r, (q) => q("SELECT id,plan,status,monthly_cents,starts_on,renews_on,modules,notes,created_at,updated_at FROM saas_contracts ORDER BY updated_at DESC LIMIT 1"));
      const invoiceData = await scoped(r, async (q) => {
        const [count] = await q("SELECT count(*)::int AS total FROM saas_invoices");
        const invoices = await q("SELECT id,contract_id,period_start,period_end,due_on,amount_cents,status,paid_at,notes,created_at,updated_at FROM saas_invoices ORDER BY due_on DESC,created_at DESC LIMIT $1 OFFSET $2", [params.invoicePageSize, (params.invoicePage - 1) * params.invoicePageSize]);
        return { invoices, invoicePagination: { total: Number(count.total), page: params.invoicePage, pageSize: params.invoicePageSize, pages: Math.max(1, Math.ceil(Number(count.total) / params.invoicePageSize)) } };
      });
      s.json({ ...c, contract: contract ?? null, ...invoiceData, billing: "manual-pilot" });
    }),
  );
  app.post("/api/subscription/contracts", route(async (r, s) => {
    await admin(r);
    const b = z.object({ plan: z.enum(["piloto","essencial","rede","enterprise"]), status: z.enum(["draft","active","suspended","cancelled"]).default("draft"), monthlyCents: z.coerce.number().int().min(0).max(999999999).default(0), startsOn: z.iso.date(), renewsOn: z.iso.date().nullable().default(null), modules: z.array(z.string().trim().min(1).max(40)).min(1), notes: z.string().max(2000).default("") }).parse(r.body);
    const row = await scoped(r, async (q) => { const [v] = await q("INSERT INTO saas_contracts(church_id,plan,status,monthly_cents,starts_on,renews_on,modules,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,plan,status,monthly_cents,starts_on,renews_on,modules,notes,created_at,updated_at", [r.church,b.plan,b.status,b.monthlyCents,b.startsOn,b.renewsOn,b.modules,b.notes,r.actor.id]); await audit(q,r.actor.id,r.church,"saas-contract.created",v.id); return v; });
    s.status(201).json(row);
  }));
  app.patch("/api/subscription/contracts/:id", route(async (r, s) => {
    await admin(r);
    const id = z.uuid().parse(r.params.id);
    const b = z.object({ plan: z.enum(["piloto","essencial","rede","enterprise"]), status: z.enum(["draft","active","suspended","cancelled"]), monthlyCents: z.coerce.number().int().min(0).max(999999999), startsOn: z.iso.date(), renewsOn: z.iso.date().nullable(), modules: z.array(z.string().trim().min(1).max(40)).min(1), notes: z.string().max(2000), reason: z.string().trim().max(500).default("") }).parse(r.body);
    const row = await scoped(r, async (q) => { await q("SELECT set_config('app.contract_reason',$1,true)", [b.reason]); const [v] = await q("UPDATE saas_contracts SET plan=$2,status=$3,monthly_cents=$4,starts_on=$5,renews_on=$6,modules=$7,notes=$8,updated_at=now() WHERE id=$1 RETURNING id,plan,status,monthly_cents,starts_on,renews_on,modules,notes,created_at,updated_at", [id,b.plan,b.status,b.monthlyCents,b.startsOn,b.renewsOn,b.modules,b.notes]); requireThat(v,404,"Contrato SaaS não encontrado."); await audit(q,r.actor.id,r.church,"saas-contract.updated",id); return v; });
    s.json(row);
  }));
  app.post("/api/subscription/invoices", route(async (r, s) => {
    await admin(r);
    const b = z.object({ contractId: z.uuid(), periodStart: z.iso.date(), periodEnd: z.iso.date(), dueOn: z.iso.date(), amountCents: z.coerce.number().int().min(0).max(999999999), notes: z.string().max(2000).default("") }).parse(r.body);
    requireThat(b.periodStart <= b.periodEnd, 400, "O período da fatura é inválido.");
    const row = await scoped(r, async (q) => { const [v] = await q("INSERT INTO saas_invoices(contract_id,church_id,period_start,period_end,due_on,amount_cents,notes,created_by) SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE EXISTS(SELECT 1 FROM saas_contracts WHERE id=$1 AND church_id=$2) RETURNING id,contract_id,period_start,period_end,due_on,amount_cents,status,paid_at,notes,created_at,updated_at", [b.contractId,r.church,b.periodStart,b.periodEnd,b.dueOn,b.amountCents,b.notes,r.actor.id]); requireThat(v,404,"Contrato SaaS não encontrado."); await audit(q,r.actor.id,r.church,"saas-invoice.created",v.id); return v; });
    s.status(201).json(row);
  }));
  app.patch("/api/subscription/invoices/:id", route(async (r, s) => {
    await admin(r);
    const id = z.uuid().parse(r.params.id);
    const b = z.object({ status: z.enum(["issued","paid","overdue","void"]), notes: z.string().max(2000).default("") }).parse(r.body);
    const row = await scoped(r, async (q) => { const [v] = await q("UPDATE saas_invoices SET status=$2,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,now()) ELSE NULL END,notes=$3,updated_at=now() WHERE id=$1 RETURNING id,contract_id,period_start,period_end,due_on,amount_cents,status,paid_at,notes,created_at,updated_at", [id,b.status,b.notes]); requireThat(v,404,"Fatura SaaS não encontrada."); await audit(q,r.actor.id,r.church,"saas-invoice.updated",id); return v; });
    s.json(row);
  }));
  app.get("/api/subscription/invoices.csv", route(async (r, s) => {
    await admin(r);
    const rows = await scoped(r, (q) => q("SELECT i.id,c.plan,i.period_start,i.period_end,i.due_on,i.amount_cents,i.status,i.paid_at,i.notes FROM saas_invoices i JOIN saas_contracts c ON c.id=i.contract_id ORDER BY i.due_on DESC,i.created_at DESC"));
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = ["id,plan,period_start,period_end,due_on,amount_cents,status,paid_at,notes", ...rows.map(v => [v.id,v.plan,v.period_start,v.period_end,v.due_on,v.amount_cents,v.status,v.paid_at,v.notes].map(escape).join(","))].join("\r\n") + "\r\n";
    s.type("text/csv; charset=utf-8").attachment("faturas-saas.csv").send("\ufeff" + csv);
  }));
  app.patch(
    "/api/subscription",
    route(async (r, s) => {
      await admin(r);
      const b = z
        .object({
          modules: z.array(z.enum(["people", "cells", "finance", "assets", "library", "assistance"])).min(1),
        })
        .parse(r.body);
      await db.transaction(async (q) => {
        await q("UPDATE churches SET modules=$1 WHERE id=$2", [
          [...new Set(b.modules)],
          r.church,
        ]);
        await audit(q, r.actor.id, r.church, "subscription.modules-updated");
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/pix/charges/:id/receipt",
    route(async (r, s) => {
      const id = z.uuid().parse(r.params.id);
      const [charge] = await scoped(r, (q) =>
        q(
          "SELECT id,txid,amount_cents,fee_cents,status,created_at,church_id FROM pix_charges WHERE id=$1",
          [id],
        ),
      );
      requireThat(
        charge && ["settled", "refunded"].includes(charge.status),
        404,
        "Comprovante disponível somente após conciliação.",
      );
      const [church] = await db.transaction((q) =>
        q("SELECT name FROM churches WHERE id=$1", [r.church]),
      );
      const format = (n: unknown) =>
        new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(Number(n) / 100);
      const receipt = [
        church.name,
        "COMPROVANTE DE CONTRIBUIÇÃO",
        `Registro: ${charge.id}`,
        `txid: ${charge.txid}`,
        `Valor bruto: ${format(charge.amount_cents)}`,
        `Tarifa registrada: ${format(charge.fee_cents)}`,
        `Valor líquido: ${format(Number(charge.amount_cents) - Number(charge.fee_cents))}`,
        `Situação: ${charge.status === "refunded" ? "DEVOLVIDO" : "CONCILIADO"}`,
        options.mode === "demo"
          ? "DEMONSTRAÇÃO — SEM VALOR FINANCEIRO"
          : "HOMOLOGAÇÃO — SEM VALOR DE PRODUÇÃO",
        "Este comprovante não assegura dedução fiscal.",
      ].join("\r\n");
      await db.transaction((q) =>
        audit(q, r.actor.id, r.church, "receipt.downloaded", id),
      );
      s.type("text/plain")
        .attachment(`comprovante-${charge.txid}.txt`)
        .send(receipt);
    }),
  );
  app.get(
    "/api/organizations",
    route(async (r, s) =>
      s.json(
        await db.transaction(async (q) => ({
          networks: await q(
            "SELECT n.* FROM networks n WHERE EXISTS(SELECT 1 FROM network_members m WHERE m.network_id=n.id AND m.user_id=$1) OR EXISTS(SELECT 1 FROM churches c JOIN memberships m ON m.church_id=c.id WHERE c.network_id=n.id AND m.user_id=$1)",
            [r.actor.id],
          ),
          regions: await q(
            "SELECT r.* FROM regions r WHERE EXISTS(SELECT 1 FROM network_members m WHERE m.network_id=r.network_id AND m.user_id=$1)",
            [r.actor.id],
          ),
        })),
      ),
    ),
  );
  app.post(
    "/api/organizations/regions",
    route(async (r, s) => {
      const b = z
        .object({
          networkId: z.uuid(),
          name: z.string().trim().min(2).max(120),
        })
        .parse(r.body);
      await networkAdmin(r, b.networkId);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [region] = await q(
            "INSERT INTO regions(network_id,name) VALUES($1,$2) RETURNING *",
            [b.networkId, b.name],
          );
          await audit(q, r.actor.id, null, "region.created", region.id);
          return region;
        }),
      );
    }),
  );
  app.post(
    "/api/organizations/churches",
    route(async (r, s) => {
      const b = z
        .object({
          networkId: z.uuid(),
          regionId: z.uuid(),
          name: z.string().trim().min(2).max(120),
          administratorId: z.uuid(),
        })
        .parse(r.body);
      await networkAdmin(r, b.networkId);
      s.status(201).json(
        await db.transaction(async (q) => {
          requireThat(
            (
              await q("SELECT 1 FROM regions WHERE id=$1 AND network_id=$2", [
                b.regionId,
                b.networkId,
              ])
            ).length,
            400,
            "Regional inválida.",
          );
          requireThat(
            (
              await q(
                "SELECT 1 FROM users WHERE id=$1 AND totp_secret IS NOT NULL",
                [b.administratorId],
              )
            ).length,
            400,
            "Administrador deve ter MFA provisionado.",
          );
          const [c] = await q(
            "INSERT INTO churches(network_id,region_id,name) VALUES($1,$2,$3) RETURNING *",
            [b.networkId, b.regionId, b.name],
          );
          await q("INSERT INTO campuses(church_id,name) VALUES($1,'Sede')", [
            c.id,
          ]);
          await q(
            "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,'admin')",
            [b.administratorId, c.id],
          );
          for (const [code, name, kind] of [
            ["bank", "Conta bancária", "asset"],
            ["giving", "Contribuições", "income"],
            ["fees", "Tarifas bancárias", "expense"],
            ["operations", "Despesas operacionais", "expense"],
          ])
            await q(
              "INSERT INTO accounts(church_id,code,name,kind) VALUES($1,$2,$3,$4)",
              [c.id, code, name, kind],
            );
          await q(
            "INSERT INTO funds(church_id,name) VALUES($1,'Dízimos e ofertas'),($1,'Missões')",
            [c.id],
          );
          await q(
            "INSERT INTO cost_centers(church_id,name) VALUES($1,'Administração')",
            [c.id],
          );
          await audit(q, r.actor.id, c.id, "church.affiliated", c.id);
          return c;
        }),
      );
    }),
  );
  app.post(
    "/api/campuses",
    route(async (r, s) => {
      await admin(r);
      const b = z
        .object({ name: z.string().trim().min(2).max(100) })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [c] = await q(
            "INSERT INTO campuses(church_id,name) VALUES($1,$2) RETURNING *",
            [r.church, b.name],
          );
          await audit(q, r.actor.id, r.church, "campus.created", c.id);
          return c;
        }),
      );
    }),
  );
  app.get(
    "/api/memberships",
    route(async (r, s) => {
      await admin(r);
      s.json(
        await db.transaction((q) =>
          q(
            "SELECT m.user_id,m.role,m.campus_id,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.church_id=$1",
            [r.church],
          ),
        ),
      );
    }),
  );
  app.post(
    "/api/memberships",
    route(async (r, s) => {
      await admin(r);
      const b = z
        .object({
          userId: z.uuid(),
          role: z.enum(["admin", "secretary", "treasurer", "leader", "member"]),
          campusId: z.uuid().nullable().default(null),
        })
        .parse(r.body);
      await db.transaction(async (q) => {
        const [u] = await q(
          "SELECT u.totp_secret,m.role,m.campus_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.church_id=$2 FOR UPDATE OF m",
          [b.userId, r.church],
        );
        requireThat(
          u && (b.role === "member" || u.totp_secret),
          400,
          "Perfil privilegiado exige MFA provisionado.",
        );
        if (b.campusId)
          requireThat(
            (
              await q("SELECT 1 FROM campuses WHERE id=$1 AND church_id=$2", [
                b.campusId,
                r.church,
              ])
            ).length,
            400,
            "Campus inválido.",
          );
        if (b.userId === r.actor.id)
          requireThat(
            b.role === "admin" && !b.campusId,
            400,
            "Não altere sua própria administração.",
          );
        if (u.role !== b.role || u.campus_id !== b.campusId) {
          await q(
            "DELETE FROM cell_assignments WHERE user_id=$1 AND church_id=$2",
            [b.userId, r.church],
          );
          await q(
            "DELETE FROM action_permissions WHERE user_id=$1 AND church_id=$2",
            [b.userId, r.church],
          );
        }
        await q(
          "INSERT INTO memberships(user_id,church_id,role,campus_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,church_id) DO UPDATE SET role=excluded.role,campus_id=excluded.campus_id",
          [b.userId, r.church, b.role, b.campusId],
        );
        await audit(q, r.actor.id, r.church, "membership.updated", b.userId);
        if (b.userId !== r.actor.id)
          await q("DELETE FROM sessions WHERE user_id=$1", [b.userId]);
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/documents",
    route(async (r, s) => {
      const params = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).parse(r.query);
      s.json(await scoped(r, async (q) => {
        const [count] = await q("SELECT count(*)::int AS total FROM documents");
        const items = await q(
          "SELECT d.id,d.name,d.media_type,d.created_at,COALESCE((SELECT json_agg(json_build_object('id',ds.id,'person_id',ds.person_id,'person_name',p.name) ORDER BY p.name) FROM document_shares ds JOIN people p ON p.id=ds.person_id WHERE ds.document_id=d.id AND ds.church_id=d.church_id AND ds.revoked_at IS NULL),'[]'::json) AS shares FROM documents d ORDER BY d.created_at DESC LIMIT $1 OFFSET $2",
          [params.pageSize, (params.page - 1) * params.pageSize],
        );
        return { items, total: count.total, page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)) };
      }));
    }),
  );
  app.get(
    "/api/portal/documents",
    route(async (r, s) => {
      s.json(await db.transaction((q) => q("SELECT d.id,d.name,d.media_type,d.created_at FROM documents d JOIN document_shares ds ON ds.document_id=d.id AND ds.church_id=d.church_id JOIN people p ON p.id=ds.person_id AND p.user_id=$2 WHERE d.church_id=$1 AND ds.revoked_at IS NULL ORDER BY d.created_at DESC", [r.church, r.actor.id])));
    }),
  );
  app.post(
    "/api/documents",
    route(async (r, s) => {
      const b = z
        .object({
          name: z
            .string()
            .trim()
            .min(1)
            .max(150)
            .regex(/^[^\\/\r\n]+$/),
          content: z.string().max(350000),
          mediaType: z.enum([
            "application/pdf",
            "text/plain",
            "image/png",
            "image/jpeg",
          ]),
        })
        .parse(r.body);
      const bytes = Buffer.from(b.content, "base64");
      requireThat(
        bytes.length > 0 && bytes.length <= 250000,
        400,
        "Documento deve ter até 250 KB.",
      );
      const magic =
        b.mediaType === "application/pdf"
          ? bytes.subarray(0, 5).toString() === "%PDF-"
          : b.mediaType === "image/png"
            ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
            : b.mediaType === "image/jpeg"
              ? bytes.subarray(0, 3).toString("hex") === "ffd8ff"
              : true;
      requireThat(magic, 400, "Conteúdo incompatível com o tipo de documento.");
      s.status(201).json(
        await scoped(r, async (q) => {
          const [d] = await q(
            "INSERT INTO documents(church_id,name,media_type,encrypted_content,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name",
            [
              r.church,
              b.name,
              b.mediaType,
              encrypt(b.content, options.key),
              r.actor.id,
            ],
          );
          await audit(q, r.actor.id, r.church, "document.uploaded", d.id);
          return d;
        }),
      );
    }),
  );
  app.post(
    "/api/documents/:id/share",
    route(async (r, s) => {
      const [permission] = await scoped(r, (q) => q("SELECT can_access('people',true) AS allowed"));
      requireThat(permission.allowed, 403, "Permissão da secretaria necessária.");
      const documentId = z.uuid().parse(r.params.id), b = z.object({ personId: z.uuid() }).parse(r.body);
      const share = await scoped(r, async (q) => {
        requireThat((await q("SELECT 1 FROM documents WHERE id=$1 AND church_id=$2", [documentId, r.church])).length, 404, "Documento não encontrado.");
        requireThat((await q("SELECT 1 FROM people WHERE id=$1 AND church_id=$2", [b.personId, r.church])).length, 400, "Pessoa não encontrada.");
        const [v] = await q("INSERT INTO document_shares(church_id,document_id,person_id,granted_by,revoked_at) VALUES($1,$2,$3,$4,NULL) ON CONFLICT(church_id,document_id,person_id) DO UPDATE SET revoked_at=NULL,granted_by=excluded.granted_by RETURNING id", [r.church, documentId, b.personId, r.actor.id]);
        await audit(q, r.actor.id, r.church, "document.shared", documentId);
        return v;
      });
      s.status(201).json(share);
    }),
  );
  app.delete(
    "/api/documents/:id/share/:person",
    route(async (r, s) => {
      const [permission] = await scoped(r, (q) => q("SELECT can_access('people',true) AS allowed"));
      requireThat(permission.allowed, 403, "Permissão da secretaria necessária.");
      const documentId = z.uuid().parse(r.params.id), personId = z.uuid().parse(r.params.person);
      await scoped(r, async (q) => {
        const rows = await q("UPDATE document_shares SET revoked_at=now() WHERE document_id=$1 AND person_id=$2 AND church_id=$3 AND revoked_at IS NULL RETURNING id", [documentId, personId, r.church]);
        requireThat(rows.length, 404, "Compartilhamento não encontrado.");
        await audit(q, r.actor.id, r.church, "document.share-revoked", documentId);
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/documents/:id",
    route(async (r, s) => {
      const id = z.uuid().parse(r.params.id);
      const [d] = await db.transaction(async (q) => {
        const rows = await q("SELECT d.* FROM documents d WHERE d.id=$1 AND d.church_id=$2 AND (EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=$3 AND m.church_id=d.church_id AND m.role IN ('admin','secretary')) OR EXISTS(SELECT 1 FROM document_shares ds JOIN people p ON p.id=ds.person_id WHERE ds.document_id=d.id AND ds.church_id=d.church_id AND ds.revoked_at IS NULL AND p.user_id=$3))", [id, r.church, r.actor.id]);
        if (rows.length) await q("INSERT INTO audit_events(church_id,actor_id,action,resource_id) VALUES($1,$2,'document.downloaded',$3)", [r.church, r.actor.id, id]);
        return rows;
      });
      requireThat(d, 404, "Documento não encontrado.");
      s.type(d.media_type)
        .attachment(d.name)
        .send(Buffer.from(decrypt(d.encrypted_content, options.key), "base64"));
    }),
  );
  app.get(
    "/api/privacy/admin",
    route(async (r, s) => {
      await admin(r);
      const params = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        status: z.enum(["all", "received", "reviewing", "fulfilled", "retained"]).default("all"),
      }).parse(r.query);
      s.json(await scoped(r, async (q) => {
        const filter = params.status === "all" ? "" : " WHERE status=$1";
        const values = params.status === "all" ? [] : [params.status];
        const [count] = await q(`SELECT count(*)::int AS total FROM privacy_requests${filter}`, values);
        const limit = values.length + 1, offset = values.length + 2;
        const items = await q(`SELECT * FROM privacy_requests${filter} ORDER BY created_at DESC LIMIT $${limit} OFFSET $${offset}`, [...values, params.pageSize, (params.page - 1) * params.pageSize]);
        return { items, total: count.total, page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)), status: params.status };
      }));
    }),
  );
  app.get("/api/privacy/retention", route(async (r, s) => {
    await admin(r);
    const rows = await scoped(r, async (q) => {
      for (const category of privacyRetentionCategories)
        await q("INSERT INTO privacy_retention_policies(church_id,category) VALUES($1,$2) ON CONFLICT (church_id,category) DO NOTHING", [r.church, category]);
      return q("SELECT category,retention_days,legal_basis,purpose,responsible,notes,updated_at FROM privacy_retention_policies WHERE church_id=$1 ORDER BY category", [r.church]);
    });
    s.json({ items: rows, categories: privacyRetentionCategories });
  }));
  app.patch("/api/privacy/retention/:category", route(async (r, s) => {
    await admin(r);
    const category = z.enum(privacyRetentionCategories).parse(r.params.category);
    const body = z.object({
      retentionDays: z.number().int().min(0).nullable(),
      legalBasis: z.string().trim().max(500),
      purpose: z.string().trim().max(500),
      responsible: z.string().trim().max(200),
      notes: z.string().trim().max(1000),
    }).parse(r.body);
    await scoped(r, async (q) => {
      await q("INSERT INTO privacy_retention_policies(church_id,category) VALUES($1,$2) ON CONFLICT (church_id,category) DO NOTHING", [r.church, category]);
      await q("UPDATE privacy_retention_policies SET retention_days=$1,legal_basis=$2,purpose=$3,responsible=$4,notes=$5,updated_by=$6,updated_at=now() WHERE church_id=$7 AND category=$8", [body.retentionDays, body.legalBasis, body.purpose, body.responsible, body.notes, r.actor.id, r.church, category]);
      await audit(q, r.actor.id, r.church, "privacy.retention-updated", category);
    });
    s.json({ ok: true });
  }));
  app.get("/api/privacy/admin/export.csv", route(async (r, s) => {
    await admin(r);
    const rows = await scoped(r, (q) => q("SELECT id,kind,status,created_at,updated_at FROM privacy_requests ORDER BY created_at DESC"));
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = ["id,kind,status,created_at,updated_at", ...rows.map(v => [v.id,v.kind,v.status,v.created_at,v.updated_at].map(escape).join(","))].join("\r\n") + "\r\n";
    s.type("text/csv; charset=utf-8").attachment("solicitacoes-privacidade.csv").send("\ufeff" + csv);
  }));
  app.patch(
    "/api/privacy/admin/:id",
    route(async (r, s) => {
      await admin(r);
      const id = z.uuid().parse(r.params.id),
        b = z
          .object({
            status: z.enum(["reviewing", "fulfilled", "retained"]),
            reason: z.string().trim().min(5).max(500),
            confirmDeletion: z.union([z.boolean(), z.literal("on")]).default(false).transform((value) => value === true || value === "on"),
          })
          .parse(r.body);
      await scoped(r, async (q) => {
        const [request] = await q("SELECT * FROM privacy_requests WHERE id=$1 AND church_id=$2 FOR UPDATE", [id, r.church]);
        requireThat(request, 404, "Solicitação não encontrada.");
        if (request.kind === "deletion" && b.status === "fulfilled") requireThat(b.confirmDeletion, 400, "Confirme a anonimização antes de concluir a exclusão.");
        const rows = await q(
          "UPDATE privacy_requests SET status=$1,resolution_reason=$2,updated_at=now() WHERE id=$3 RETURNING id",
          [b.status, b.reason, id],
        );
        requireThat(rows.length, 404, "Solicitação não encontrada.");
        if (b.status === "fulfilled" && request.kind === "correction") {
          try {
            const payload = JSON.parse(request.detail);
            if (payload?.type === "profile-change" && payload.personId && payload.changes) {
              const fields = ["name", "email", "phone"] as const;
              for (const field of fields) {
                if (payload.changes[field] !== undefined)
                  await q(`UPDATE people SET ${field}=$1 WHERE id=$2 AND church_id=$3 AND user_id=$4`, [payload.changes[field] || null, payload.personId, r.church, request.user_id]);
              }
              await audit(q, r.actor.id, r.church, "profile-change.approved", payload.personId);
            }
          } catch {
            requireThat(false, 400, "Solicitação de correção inválida.");
          }
        }
        if (b.status === "fulfilled" && request.kind === "deletion") {
          const people = await q("SELECT id FROM people WHERE church_id=$1 AND user_id=$2", [r.church, request.user_id]);
          for (const person of people) {
            await q("DELETE FROM member_photos WHERE church_id=$1 AND person_id=$2", [r.church, person.id]);
            await q("UPDATE communication_preferences SET email_opt_in=false,portal_opt_in=false,sms_opt_in=false,updated_at=now(),updated_by=$3 WHERE church_id=$1 AND person_id=$2", [r.church, person.id, r.actor.id]);
            await q("UPDATE communication_deliveries SET address_snapshot=NULL,consent_snapshot=false WHERE church_id=$1 AND person_id=$2", [r.church, person.id]);
            await q("UPDATE people SET name='Titular removido',email=NULL,phone=NULL,custom_fields='{}'::jsonb,status='inactive',anonymized_at=now() WHERE church_id=$1 AND id=$2", [r.church, person.id]);
          }
          await audit(q, r.actor.id, r.church, "privacy.deletion-anonymized", id);
        }
        await audit(q, r.actor.id, r.church, `privacy.${b.status}`, id);
      });
      if (b.status === "fulfilled" || b.status === "retained")
        await db.transaction((q) =>
          q("UPDATE operational_tasks SET status='done',version=version+1 WHERE church_id=$1 AND source_type='privacy' AND source_id=$2 AND status IN ('open','in_progress')", [r.church, id]),
        );
      s.json({ ok: true });
    }),
  );
  const sendPrivacyExport = async (r: R, s: Response, requestId: string, userId: string) => {
    const payload = await db.transaction(async (q) => {
      const data = await collectPrivacyExport(q, r.church, userId);
      await q("INSERT INTO audit_events(church_id,actor_id,action,resource_id) VALUES($1,$2,'privacy.export-downloaded',$3)", [r.church, r.actor.id, requestId]);
      return { generatedAt: new Date().toISOString(), churchId: r.church, ...data };
    });
    s.type("application/json").attachment(`ecclesia-export-${userId}.json`).send(JSON.stringify(payload, null, 2));
  };
  app.get(
    "/api/privacy/export",
    route(async (r, s) => {
      const [request] = await db.transaction((q) => q("SELECT id FROM privacy_requests WHERE church_id=$1 AND user_id=$2 AND kind='access' AND status='fulfilled' ORDER BY created_at DESC LIMIT 1", [r.church, r.actor.id]));
      requireThat(request, 409, "A solicitação de acesso precisa ser atendida antes do download.");
      await sendPrivacyExport(r, s, request.id, r.actor.id);
    }),
  );
  app.get(
    "/api/privacy/admin/:id/export",
    route(async (r, s) => {
      await admin(r);
      const requestId = z.uuid().parse(r.params.id);
      const [request] = await db.transaction((q) => q("SELECT id,user_id FROM privacy_requests WHERE id=$1 AND church_id=$2 AND kind='access' AND status='fulfilled'", [requestId, r.church]));
      requireThat(request, 404, "Solicitação de acesso atendida não encontrada.");
      await sendPrivacyExport(r, s, request.id, request.user_id);
    }),
  );
  app.get(
    "/api/prayers",
    route(async (r, s) => {
      const params = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(r.query);
      const [permission] = await scoped(r, (q) =>
        q("SELECT can_access('pastoral') AS allowed"),
      );
      requireThat(
        permission.allowed,
        403,
        "Responsabilidade pastoral obrigatória.",
      );
      const assignees = await db.transaction((q) => q("SELECT u.id,u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.church_id=$1 AND m.role IN ('admin','secretary','leader') ORDER BY u.name", [r.church]));
      const scopedResult: Row = await scoped(r, async (q) => {
        const [count] = await q("SELECT count(*)::int AS total FROM prayer_requests");
        const rows = await q(
          "SELECT pr.id,pr.user_id,pr.ciphertext,pr.resolution_ciphertext,pr.status,pr.assigned_to,pr.created_at,pr.resolved_at,pr.updated_at FROM prayer_requests pr ORDER BY CASE pr.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,pr.created_at DESC LIMIT $1 OFFSET $2",
          [params.pageSize, (params.page - 1) * params.pageSize],
        );
        return {
        items: rows.map((v) => ({ id: v.id, requesterId: v.user_id, requesterName: null, text: decrypt(v.ciphertext, options.key), resolution: v.resolution_ciphertext ? decrypt(v.resolution_ciphertext, options.key) : null, status: v.status, assignedTo: v.assigned_to, createdAt: v.created_at, resolvedAt: v.resolved_at, updatedAt: v.updated_at })),
          assignees,
          total: count.total,
          page: params.page,
          pageSize: params.pageSize,
          pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)),
        };
      });
      const requesterIds = scopedResult.items.map((v: Row) => v.requesterId).filter(Boolean);
      const requesters = requesterIds.length
        ? await db.transaction((serviceQuery) => serviceQuery("SELECT id,name FROM users WHERE id = ANY($1::uuid[])", [requesterIds]))
        : [];
      const requesterNames = new Map(requesters.map((v) => [v.id, v.name]));
      const result = {
        ...scopedResult,
        items: scopedResult.items.map((v: Row) => {
          const { requesterId, ...publicItem } = v;
          return { ...publicItem, requesterName: requesterNames.get(requesterId) ?? null };
        }),
      };
      s.json(result);
    }),
  );
  app.patch(
    "/api/prayers/:id",
    route(async (r, s) => {
      const [permission] = await scoped(r, (q) => q("SELECT can_access('pastoral',true) AS allowed"));
      requireThat(permission.allowed, 403, "Responsabilidade pastoral obrigatória.");
      const prayerId = z.uuid().parse(r.params.id);
      const b = z.object({
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        assignedTo: z.uuid().nullable().optional(),
        resolution: z.string().trim().max(4000).nullable().optional(),
      }).refine((v) => Object.keys(v).length > 0).parse(r.body);
      if (b.assignedTo) {
        const [allowed] = await db.transaction((q) => q("SELECT can_access('pastoral',true) AS allowed", []), { actor: b.assignedTo, church: r.church });
        requireThat(allowed?.allowed, 400, "Responsável sem permissão pastoral nesta igreja.");
      }
      const result: Row = await scoped(r, async (q) => {
        const [old] = await q("SELECT * FROM prayer_requests WHERE id=$1 FOR UPDATE", [prayerId]);
        requireThat(old, 404, "Pedido de oração não encontrado.");
        const status = b.status ?? old.status;
        const assigned = b.assignedTo === undefined ? old.assigned_to : b.assignedTo;
        const resolution = b.resolution === undefined ? old.resolution_ciphertext : b.resolution ? encrypt(b.resolution, options.key) : null;
        const [updated] = await q("UPDATE prayer_requests SET status=$2,assigned_to=$3,resolution_ciphertext=$4,resolved_at=CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING id,status,assigned_to,resolution_ciphertext,resolved_at,updated_at", [prayerId, status, assigned, resolution]);
        await audit(q, r.actor.id, r.church, "prayer.updated", prayerId);
        return { ...updated, resolution: updated.resolution_ciphertext ? decrypt(updated.resolution_ciphertext, options.key) : null, resolution_ciphertext: undefined };
      });
      await db.transaction(async (q) => {
        if (result.status === "resolved" || result.status === "closed") {
          await q("UPDATE operational_tasks SET status='done',version=version+1,completed_at=COALESCE(completed_at,now()) WHERE church_id=$1 AND source_type='prayer_request' AND source_id=$2 AND status IN ('open','in_progress')", [r.church, prayerId]);
        } else if (result.assigned_to) {
          const [task] = await q("INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'pastoral',$2,CURRENT_DATE+3,$3,$4,'prayer_request',$5) ON CONFLICT DO NOTHING RETURNING id,due_on", [r.church, encrypt("Acompanhar pedido de oração", options.key), result.assigned_to, r.actor.id, prayerId]);
          if (task) await notifyTaskAssignee(q, r.church, task.id, result.assigned_to, "Acompanhar pedido de oração", String(task.due_on), r.actor.id);
          else await q("UPDATE operational_tasks SET assigned_to=$2,version=version+1 WHERE church_id=$1 AND source_type='prayer_request' AND source_id=$3 AND status IN ('open','in_progress')", [r.church, result.assigned_to, prayerId]);
        }
      });
      s.json(result);
    }),
  );
  app.post(
    "/api/credentials/:id/revoke",
    route(async (r, s) => {
      await admin(r);
      const id = z.uuid().parse(r.params.id);
      await scoped(r, async (q) => {
        const rows = await q(
          "UPDATE credentials SET revoked_at=now() WHERE id=$1 RETURNING id",
          [id],
        );
        requireThat(rows.length, 404, "Credencial não encontrada.");
        await audit(q, r.actor.id, r.church, "credential.revoked", id);
      });
      s.json({ ok: true });
    }),
  );
  const seatAdmin = async (r: R) => {
    const [v] = await scoped(r, (q) => q("SELECT * FROM current_church_unit()"));
    const [allowed] = await scoped(r, (q) => q("SELECT local_role()='admin' AS allowed", []));
    requireThat(r.actor.mfa && v?.unit_type === "sede" && allowed.allowed, 403, "Apenas a administração da igreja sede pode gerenciar congregações.");
    return v;
  };
  app.get("/api/churches/children", route(async (r, s) => {
    await seatAdmin(r);
    s.json(await scoped(r, (q) => q("SELECT * FROM list_congregations()")));
  }));
  app.post("/api/churches/children", route(async (r, s) => {
    await seatAdmin(r);
    const b = z.object({ name: z.string().trim().min(2).max(180), regionId: z.uuid().nullable().default(null), administratorUserId: z.uuid().nullable().default(null) }).parse(r.body);
    const result = await scoped(r, async (q) => {
      const [child] = await q("SELECT * FROM create_congregation($1,$2,$3)", [b.name,b.regionId,b.administratorUserId]);
      requireThat(child, 404, "Igreja sede não encontrada.");
      await audit(q, r.actor.id, r.church, "church.congregation-created", child.id);
      return child;
    });
    s.status(201).json(result);
  }));
  app.patch("/api/churches/children/:id", route(async (r, s) => {
    await seatAdmin(r);
    const id = z.uuid().parse(r.params.id);
    const b = z.object({ name: z.string().trim().min(2).max(180).optional(), active: z.boolean().optional() }).refine((v) => v.name !== undefined || v.active !== undefined).parse(r.body);
    const result = await scoped(r, async (q) => {
      const [v] = await q("SELECT * FROM update_congregation($1,$2,$3)", [id,b.name ?? null,b.active ?? null]);
      requireThat(v, 404, "Congregação não encontrada.");
      await audit(q, r.actor.id, r.church, "church.congregation-updated", id);
      return v;
    });
    s.json(result);
  }));
  app.get("/api/network/indicators", route(async (r, s) => {
    const networkId = await networkForChurch(r);
    await networkAdmin(r, networkId);
    s.json(await db.transaction((q) => q("SELECT c.id,c.name,c.unit_type,c.parent_church_id,(SELECT count(*)::int FROM people p WHERE p.church_id=c.id AND p.status<>'inactive') AS people_count,(SELECT count(*)::int FROM education_classes e WHERE e.church_id=c.id AND e.status='open') AS open_classes FROM churches c WHERE c.network_id=$1 ORDER BY c.name", [networkId])));
  }));
  app.get("/api/network/billing", route(async (r, s) => {
    const networkId = await networkForChurch(r);
    await networkAdmin(r, networkId);
    s.json(await db.transaction((q) => q("SELECT c.id,c.name,c.unit_type,b.name AS billing_account,co.plan,co.status,co.monthly_cents,co.renews_on,COALESCE(i.overdue,0)::int AS overdue_invoices FROM churches c LEFT JOIN billing_accounts b ON b.id=c.billing_account_id LEFT JOIN LATERAL (SELECT plan,status,monthly_cents,renews_on FROM saas_contracts WHERE billing_account_id=c.billing_account_id OR church_id=c.id ORDER BY updated_at DESC LIMIT 1) co ON true LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE status='overdue' OR (status='issued' AND due_on<CURRENT_DATE)) AS overdue FROM saas_invoices WHERE billing_account_id=c.billing_account_id OR church_id=c.id) i ON true WHERE c.network_id=$1 ORDER BY c.name", [networkId])));
  }));
  app.post(
    "/api/demo/refund/:id",
    route(async (r, s) => {
      requireThat(options.mode === "demo", 404, "Rota indisponível.");
      await admin(r);
      const id = z.uuid().parse(r.params.id);
      s.json(
        await db.transaction(async (q) => {
          const [c] = await q(
            "SELECT * FROM pix_charges WHERE id=$1 AND church_id=$2 AND provider='demo' FOR UPDATE",
            [id, r.church],
          );
          requireThat(
            c && c.status === "settled",
            409,
            "Selecione um Pix demonstrativo conciliado.",
          );
          const lines = await q(
            "SELECT account_id,amount_cents FROM journal_lines WHERE entry_id=$1",
            [c.entry_id],
          );
          const reversal = await postEntry(
            q,
            r.church,
            "Devolução Pix fictícia",
            lines.map((l) => ({
              account: l.account_id,
              amount: -Number(l.amount_cents),
            })),
            { reversal: c.entry_id, fund: c.fund_id },
          );
          await q("UPDATE pix_charges SET status='refunded' WHERE id=$1", [id]);
          const [registration] = await q("SELECT id FROM event_registrations WHERE pix_charge_id=$1 FOR UPDATE", [id]);
          if (registration) {
            await q("UPDATE event_registrations SET payment_status='refunded' WHERE id=$1", [registration.id]);
            await q("UPDATE operational_tasks SET status='done',version=version+1,completed_at=COALESCE(completed_at,now()) WHERE church_id=$1 AND source_type='event_refund' AND source_id=$2 AND status IN ('open','in_progress')", [r.church, registration.id]);
            await audit(q, r.actor.id, r.church, "event-registration.refunded", registration.id);
          }
          await audit(q, r.actor.id, r.church, "pix.demo-refunded", id);
          return { refunded: true, entryId: reversal.id };
        }),
      );
    }),
  );
}



