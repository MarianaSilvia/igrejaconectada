import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import QRCode from "qrcode";
import { z } from "zod";
import type { Database, Query, Row } from "./db.js";
import {
  hash,
  token,
  passwordMatches,
  verifyTotp,
  totpStep,
  HttpError,
  requireThat,
  encrypt,
  decrypt,
  totp,
  passwordHash,
} from "./security.js";
import { audit, DEMO_SECRET } from "./seed.js";
import { cents, decimal, postEntry, newTxid, settle } from "./finance.js";
import { Efi } from "./efi.js";
import { operations } from "./operations.js";
import { todayInChurch } from "../shared/dates.js";
import { processIntegrationJob, reconcileCharge } from "./integration-jobs.js";
import { accessRoutes, openTotp, securityLimit } from "./access.js";
import { treasuryRoutes } from "./treasury.js";
import { agendaRoutes } from "./agenda.js";
import { participationRoutes } from "./participation.js";
import {
  processWorkflowTriggerJobs,
  startTriggeredWorkflows,
} from "./participation.js";
import { savedViewRoutes } from "./saved-views.js";
import { communicationRoutes } from "./communication.js";
import { searchRoutes } from "./search.js";
import { educationRoutes } from "./education.js";
import { worshipRoutes } from "./worship.js";
import { kidsRoutes } from "./kids.js";
import { kidsPrintRoutes } from "./kids-print.js";
import { institutionalRoutes } from "./institutional.js";
import { assemblyRoutes } from "./assemblies.js";
import { groupRoutes } from "./groups.js";
import { assetRoutes } from "./assets.js";
import { libraryRoutes } from "./library.js";
import { assistanceRoutes } from "./assistance.js";
import { mediaRoutes } from "./media.js";
import {
  registrationPublicRoutes,
  registrationAdminRoutes,
  syncLegacyMemberProfile,
} from "./member-registration.js";
type AuthRequest = Request & { actor: Row; church: string };
const uuid = z.uuid();
const text = z.string().trim().min(1).max(200);
const date = z.iso.date();
const personSchema = z.object({
  name: text,
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().max(30).optional(),
  status: z.enum(["visitor", "member", "worker", "inactive"]).default("member"),
  householdId: uuid.optional(),
  campusId: uuid.optional(),
});
const asyncRoute =
  (fn: (r: any, s: Response) => Promise<any>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r, s)).catch(n);
export function createApp(
  db: Database,
  options: {
    mode: "demo" | "homologation";
    key: Buffer;
    mfaKey?: Buffer;
    efi: Efi;
    origin: string;
    communicationCallbackToken?: string;
  },
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "5mb" }));
  app.use("/api", (_r, s, n) => {
    s.set("Cache-Control", "no-store");
    n();
  });
  app.use("/api", (r, s, n) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(r.method) &&
      r.headers.origin &&
      r.headers.origin !== options.origin
    )
      return s.status(403).json({ error: "Origem não autorizada." });
    n();
  });
  const cookie = (s: Response, value: string, maxAge: number) =>
    s.cookie("ecclesia_session", value, {
      httpOnly: true,
      sameSite: "strict",
      secure: options.origin.startsWith("https:"),
      maxAge,
      path: "/",
    });
  const sessionToken = (r: Request) =>
    (r.headers.cookie ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("ecclesia_session="))
      ?.split("=")[1];
  registrationPublicRoutes(app, db, options);
  // Middleware wrapper keeps async authentication failures in Express's error pipeline.
  app.use("/api", (r, s, n) => {
    if (
      r.path.startsWith("/auth/") ||
      r.path.startsWith("/public/") ||
      r.path === "/demo-info" ||
      r.path.startsWith("/webhooks/") ||
      r.path === "/health" ||
      r.path === "/health/ready"
    )
      return n();
    Promise.resolve(
      (async () => {
        const raw = sessionToken(r);
        requireThat(raw, 401, "Entre para continuar.");
        const [u] = await db.transaction((q) =>
          q(
            "SELECT u.id,u.name,u.email,s.mfa FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL",
            [hash(raw)],
          ),
        );
        requireThat(u, 401, "Sessão expirada.");
        (r as AuthRequest).actor = u;
        if (r.headers["x-church-id"])
          (r as AuthRequest).church = uuid.parse(r.headers["x-church-id"]);
      })(),
    ).then(() => n(), n);
  });
  const scoped = <T>(r: AuthRequest, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(
      async (q) => {
        const result = await fn(q);
        if (r.method === "GET") {
          const [local] = await q("SELECT local_role() AS role");
          if (!local.role)
            await audit(
              q,
              r.actor.id,
              r.church,
              `grant.read:${r.route?.path ?? "resource"}`,
            );
        }
        return result;
      },
      { actor: r.actor.id, church: r.church },
    );
  };
  const permit = async (q: Query, scope: string, write = false) => {
    const [p] = await q("SELECT can_access($1,$2) AS allowed", [scope, write]);
    requireThat(p.allowed, 403, "Seu perfil não possui esta permissão.");
  };
  app.use("/api", (r, s, n) => {
    const scope =
      /^\/(people|directory|households|terms|import|documents|transfers|credentials|registration)(\/|$)/.test(
        r.path,
      )
        ? "people"
        : /^\/(cells|workflows)(\/|$)/.test(r.path)
          ? "cells"
          : /^\/(finance|pix|demo)(\/|$)/.test(r.path)
            ? "finance"
            : null;
    const church = (r as AuthRequest).church;
    if (!scope || !church) return n();
    db.transaction((q) =>
      q("SELECT modules FROM churches WHERE id=$1", [church]),
    ).then((rows) => {
      if (!rows[0]?.modules.includes(scope))
        return s
          .status(403)
          .json({ error: "Este módulo está desabilitado para a igreja." });
      n();
    }, n);
  });
  const admin = async (r: AuthRequest) => {
    requireThat(r.actor.mfa, 403, "Confirme MFA para esta operação.");
    const rows = await db.transaction((q) =>
      q(
        "SELECT 1 FROM memberships WHERE user_id=$1 AND church_id=$2 AND role='admin'",
        [r.actor.id, r.church],
      ),
    );
    requireThat(
      rows.length,
      403,
      "Apenas a administração local pode autorizar.",
    );
  };
  const issue = async (s: Response, user: string, mfa: boolean) => {
    const t = token();
    await db.transaction((q) =>
      q(
        "INSERT INTO sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '8 hours',$3)",
        [hash(t), user, mfa],
      ),
    );
    cookie(s, t, 8 * 3600000);
  };
  app.get(
    "/api/health",
    asyncRoute(async (_r, s) => {
      await db.transaction((q) => q("SELECT 1"));
      s.json({ ok: true, mode: options.mode });
    }),
  );
  app.get(
    "/api/health/ready",
    asyncRoute(async (_r, s) => {
      const checks: Record<string, boolean> = {
        database: false,
        serviceDatabase:
          options.mode === "demo" || Boolean(process.env.SERVICE_DATABASE_URL),
        migrationDatabase:
          options.mode === "demo" ||
          Boolean(process.env.MIGRATION_DATABASE_URL),
        dataKey: options.key.length === 32,
        origin:
          options.mode === "demo" || options.origin.startsWith("https://"),
        efiTls:
          options.mode === "demo" ||
          Boolean(
            process.env.EFI_TLS_CERT_PATH &&
            process.env.EFI_TLS_KEY_PATH &&
            process.env.EFI_WEBHOOK_CA_PATH,
          ),
        communication:
          options.mode === "demo" ||
          process.env.COMMUNICATION_TRANSPORT !== "webhook" ||
          Boolean(
            process.env.COMMUNICATION_EMAIL_WEBHOOK?.startsWith("https://") &&
            process.env.COMMUNICATION_SMS_WEBHOOK?.startsWith("https://") &&
            process.env.COMMUNICATION_WEBHOOK_TOKEN &&
            process.env.COMMUNICATION_CALLBACK_TOKEN &&
            process.env.COMMUNICATION_WEBHOOK_TOKEN !==
              process.env.COMMUNICATION_CALLBACK_TOKEN,
          ),
      };
      try {
        await db.transaction((q) => q("SELECT 1"));
        checks.database = true;
      } catch {
        checks.database = false;
      }
      checks.mfaKey = (options.mfaKey ?? options.key).length === 32;
      checks.efi = options.mode === "demo" || options.efi.accounts.length > 0;
      const ready = Object.values(checks).every(Boolean);
      s.status(ready ? 200 : 503).json({
        ok: ready,
        mode: options.mode,
        checks,
      });
    }),
  );
  app.get("/api/demo-info", (_r, s) => {
    if (options.mode !== "demo") return s.sendStatus(404);
    s.json({
      password: "Demo@Ecclesia2026",
      code: totp(DEMO_SECRET),
      accounts: [
        { email: "admin@esperanca.demo", label: "Administração local" },
        { email: "central@rede.demo", label: "Supervisão da rede" },
        { email: "membro@esperanca.demo", label: "Portal do membro" },
        { email: "admin@caminho.demo", label: "Segunda igreja" },
      ],
    });
  });
  app.post(
    "/api/auth/login",
    asyncRoute(async (r, s) => {
      const b = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(r.body);
      await securityLimit(db, `login-ip:${r.ip}`, 60);
      await securityLimit(db, `login:${r.ip}:${b.email.toLowerCase()}`, 8);
      const [u] = await db.transaction((q) =>
        q("SELECT * FROM users WHERE email=$1", [b.email.toLowerCase()]),
      );
      requireThat(
        u && !u.disabled_at && passwordMatches(b.password, u.password_hash),
        401,
        "E-mail ou senha inválidos.",
      );
      if (u.totp_secret) {
        const t = token();
        await db.transaction((q) =>
          q(
            "INSERT INTO login_challenges(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
            [hash(t), u.id],
          ),
        );
        return s.json({ mfaRequired: true, challenge: t });
      }
      const privileged = await db.transaction((q) =>
        q(
          "SELECT 1 FROM memberships WHERE user_id=$1 AND role<>'member' UNION ALL SELECT 1 FROM network_members WHERE user_id=$1",
          [u.id],
        ),
      );
      requireThat(
        !privileged.length,
        403,
        "MFA precisa ser provisionado para este perfil.",
      );
      await issue(s, u.id, false);
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/mfa",
    asyncRoute(async (r, s) => {
      const b = z
        .object({
          challenge: z.string().min(30).max(100),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(r.body);
      const u = await db.transaction(async (q) => {
        const [c] = await q(
          "SELECT c.*,u.totp_secret,u.last_totp_step FROM login_challenges c JOIN users u ON u.id=c.user_id WHERE c.token_hash=$1 AND c.expires_at>now() AND u.disabled_at IS NULL FOR UPDATE",
          [hash(b.challenge)],
        );
        requireThat(
          c && c.attempts < 5,
          401,
          "Desafio expirado. Entre novamente.",
        );
        await q(
          "UPDATE login_challenges SET attempts=attempts+1 WHERE token_hash=$1",
          [hash(b.challenge)],
        );
        const step = totpStep(
          openTotp(c.totp_secret, options.mfaKey ?? options.key),
          b.code,
        );
        if (
          step === null ||
          (c.last_totp_step !== null && step <= Number(c.last_totp_step))
        )
          return null;
        await q("UPDATE users SET last_totp_step=$1 WHERE id=$2", [
          step,
          c.user_id,
        ]);
        await q("DELETE FROM login_challenges WHERE token_hash=$1", [
          hash(b.challenge),
        ]);
        return c;
      });
      requireThat(u, 401, "Código inválido.");
      await issue(s, u.user_id, true);
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/logout",
    asyncRoute(async (r, s) => {
      const t = sessionToken(r);
      if (t)
        await db.transaction((q) =>
          q("DELETE FROM sessions WHERE token_hash=$1", [hash(t)]),
        );
      cookie(s, "", 0);
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/context",
    asyncRoute(async (r: AuthRequest, s) => {
      const data = await db.transaction(async (q) => {
        const churches = await q(
          "SELECT c.*,m.role FROM churches c LEFT JOIN memberships m ON m.church_id=c.id AND m.user_id=$1 WHERE m.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM network_members n WHERE n.network_id=c.network_id AND n.user_id=$1) ORDER BY c.name",
          [r.actor.id],
        );
        const networks = await q(
          "SELECT n.id,n.name FROM networks n JOIN network_members m ON m.network_id=n.id WHERE m.user_id=$1",
          [r.actor.id],
        );
        const [platform] = await q("SELECT role FROM platform_memberships WHERE user_id=$1", [r.actor.id]);
        return { churches, networks, platformRole: platform?.role ?? null };
      });
      const churches = await Promise.all(
        data.churches.map(async (c) => ({
          ...c,
          permissions: await db.transaction(
            async (q) => {
              const [p] = await q(
                "SELECT can_access('people') AS \"peopleRead\",can_access('people',true) AS \"peopleWrite\",can_access('cells') AS \"cellsRead\",can_access('cells',true) AS \"cellsWrite\",can_access('finance') AS \"financeRead\",can_access('finance',true) AS \"financeWrite\",can_access('pastoral') AS \"pastoralRead\",can_access('pastoral',true) AS \"pastoralWrite\"",
              );
              return p;
            },
            { actor: r.actor.id, church: c.id },
          ),
        })),
      );
      s.json({ ...data, churches, user: r.actor, mode: options.mode });
    }),
  );
  app.get(
    "/api/network",
    asyncRoute(async (r: AuthRequest, s) => {
      const rows = await db.transaction((q) =>
        q(
          `SELECT c.id,c.name,r.name AS region,
 (SELECT count(*)::int FROM people p WHERE p.church_id=c.id AND status<>'inactive') AS people,
 (SELECT count(*)::int FROM cells x WHERE x.church_id=c.id) AS cells,
 (SELECT COALESCE(-sum(l.amount_cents),0)::text FROM journal_lines l JOIN accounts a ON a.id=l.account_id JOIN journal_entries e ON e.id=l.entry_id WHERE l.church_id=c.id AND a.kind='income' AND date_trunc('month',e.occurred_on)=date_trunc('month',CURRENT_DATE)) AS income_cents
 FROM churches c LEFT JOIN regions r ON r.id=c.region_id WHERE EXISTS(SELECT 1 FROM network_members nm WHERE nm.network_id=c.network_id AND nm.user_id=$1) ORDER BY c.name`,
          [r.actor.id],
        ),
      );
      s.json(rows);
    }),
  );
  app.get(
    "/api/network/subscriptions",
    asyncRoute(async (r: AuthRequest, s) => {
      const rows = await db.transaction((q) =>
        q(
          `SELECT c.id,c.name,co.plan,co.status,co.monthly_cents,co.renews_on,COALESCE(inv.total,0)::int AS invoice_count,COALESCE(inv.overdue,0)::int AS overdue_invoices FROM churches c LEFT JOIN LATERAL (SELECT plan,status,monthly_cents,renews_on FROM saas_contracts WHERE church_id=c.id ORDER BY updated_at DESC LIMIT 1) co ON true LEFT JOIN LATERAL (SELECT count(*) AS total,count(*) FILTER(WHERE status='overdue' OR (status='issued' AND due_on<CURRENT_DATE)) AS overdue FROM saas_invoices WHERE church_id=c.id) inv ON true WHERE EXISTS(SELECT 1 FROM network_members nm WHERE nm.network_id=c.network_id AND nm.user_id=$1) ORDER BY c.name`,
          [r.actor.id],
        ),
      );
      s.json(rows);
    }),
  );
  app.get(
    "/api/dashboard",
    asyncRoute(async (r: AuthRequest, s) => {
      s.json(
        await scoped(r, async (q) => {
          const [people, cells, monthly, alerts, cards, health] =
            await Promise.all([
              q(
                "SELECT count(*)::int AS total FROM people WHERE status<>'inactive'",
              ),
              q("SELECT count(*)::int AS total FROM cells"),
              q(
                "SELECT to_char(e.occurred_on,'YYYY-MM') AS month,COALESCE(-sum(l.amount_cents),0)::text AS cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id WHERE a.kind='income' AND e.occurred_on>=date_trunc('month',CURRENT_DATE)-interval '5 months' GROUP BY 1 ORDER BY 1",
              ),
              q(
                "SELECT p.id,p.name,count(*)::int AS absences FROM people p JOIN attendance a ON a.person_id=p.id JOIN meetings m ON m.id=a.meeting_id WHERE NOT a.present AND m.held_on>=CURRENT_DATE-30 AND can_access('people') GROUP BY p.id,p.name HAVING count(*)>=3 ORDER BY p.name",
              ),
              q(
                "SELECT w.*,p.name FROM workflow_cards w JOIN people p ON p.id=w.person_id ORDER BY p.name",
              ),
              q(
                "SELECT (SELECT count(*)::int FROM registration_submissions WHERE church_id=tenant_id() AND status='pending') AS pending_registrations,(SELECT count(*)::int FROM operational_tasks WHERE church_id=tenant_id() AND status IN ('open','in_progress') AND due_on<CURRENT_DATE) AS overdue_tasks,(SELECT count(*)::int FROM church_events WHERE church_id=tenant_id() AND status='scheduled' AND starts_at>=now() AND starts_at<now()+interval '14 days') AS upcoming_events,(SELECT count(*)::int FROM privacy_requests WHERE church_id=tenant_id() AND status NOT IN ('completed','closed')) AS open_privacy,(SELECT count(*)::int FROM schedules WHERE church_id=tenant_id() AND response='pending' AND starts_at>=now() AND starts_at<now()+interval '14 days') AS pending_scales,(SELECT count(*)::int FROM integration_jobs WHERE church_id=tenant_id() AND status='failed') AS failed_integrations,(SELECT count(*)::int FROM communication_deliveries WHERE church_id=tenant_id() AND status='failed') AS failed_communications,(SELECT count(*)::int FROM kids_print_jobs WHERE church_id=tenant_id() AND status='failed') AS failed_kids_prints,(SELECT count(*)::int FROM prayer_requests WHERE church_id=tenant_id() AND status IN ('open','in_progress')) AS open_prayers,(SELECT count(*)::int FROM education_interest_requests WHERE church_id=tenant_id() AND status IN ('pending','contacted')) AS open_education_interests",
              ),
            ]);
          return {
            people: people[0].total,
            cells: cells[0].total,
            monthly,
            alerts,
            cards,
            health: health[0],
          };
        }),
      );
    }),
  );
  app.get(
    "/api/people",
    asyncRoute(async (r: AuthRequest, s) =>
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "people");
          return q(
            "SELECT p.*,h.name AS household,EXISTS(SELECT 1 FROM member_photos photo WHERE photo.person_id=p.id) AS has_photo FROM people p LEFT JOIN households h ON h.id=p.household_id ORDER BY p.name",
          );
        }),
      ),
    ),
  );
  app.get(
    "/api/people/paged",
    asyncRoute(async (r: AuthRequest, s) => {
      const page = Math.max(1, Number(r.query.page ?? 1) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, Number(r.query.pageSize ?? 50) || 50),
      );
      const search = String(r.query.q ?? "").trim();
      const status = String(r.query.status ?? "all");
      requireThat(
        ["all", "visitor", "member", "worker", "inactive"].includes(status),
        400,
        "Filtro de vínculo inválido.",
      );
      const campusId = r.query.campusId
        ? z.uuid().parse(String(r.query.campusId))
        : null;
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "people");
          const where = ["1=1"];
          const params: unknown[] = [];
          if (search) {
            params.push(`%${search}%`);
            where.push(
              `(p.name ILIKE $${params.length} OR COALESCE(p.email,'') ILIKE $${params.length} OR COALESCE(p.phone,'') ILIKE $${params.length})`,
            );
          }
          if (status !== "all") {
            params.push(status);
            where.push(`p.status=$${params.length}`);
          }
          if (campusId) {
            params.push(campusId);
            where.push(`p.campus_id=$${params.length}`);
          }
          const [total] = await q(
            `SELECT count(*)::int AS total FROM people p WHERE ${where.join(" AND ")}`,
            params,
          );
          const offset = (page - 1) * pageSize;
          const rows = await q(
            `SELECT p.*,h.name AS household,EXISTS(SELECT 1 FROM member_photos photo WHERE photo.person_id=p.id) AS has_photo FROM people p LEFT JOIN households h ON h.id=p.household_id WHERE ${where.join(" AND ")} ORDER BY p.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, pageSize, offset],
          );
          return {
            items: rows,
            total: total.total,
            page,
            pageSize,
            pages: Math.max(1, Math.ceil(Number(total.total) / pageSize)),
          };
        }),
      );
    }),
  );
  app.post(
    "/api/people",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = personSchema.parse(r.body);
      const person = await scoped(r, async (q) => {
        await permit(q, "people", true);
        const [p] = await q(
          "INSERT INTO people(church_id,name,email,phone,status,household_id,campus_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            r.church,
            b.name,
            b.email || null,
            b.phone || null,
            b.status,
            b.householdId ?? null,
            b.campusId ?? null,
          ],
        );
        await audit(q, r.actor.id, r.church, "person.created", p.id);
        if (b.status === "visitor")
          await q(
            "INSERT INTO workflow_cards(church_id,person_id,stage) VALUES($1,$2,0)",
            [r.church, p.id],
          );
        if (b.status === "visitor")
          await startTriggeredWorkflows(
            q,
            r.church,
            "visitor",
            p.id,
            r.actor.id,
          );
        return p;
      });
      await processWorkflowTriggerJobs(db, 10, options.key);
      s.status(201).json(person);
    }),
  );
  app.patch(
    "/api/people/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      const b = personSchema.parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "people", true);
          const [p] = await q(
            "UPDATE people SET name=$1,email=$2,phone=$3,status=$4 WHERE id=$5 RETURNING *",
            [b.name, b.email || null, b.phone || null, b.status, id],
          );
          requireThat(p, 404, "Pessoa não encontrada.");
          await syncLegacyMemberProfile(q, p, options.key);
          await audit(q, r.actor.id, r.church, "person.updated", id);
          return p;
        }),
      );
    }),
  );
  app.get(
    "/api/directory",
    asyncRoute(async (r: AuthRequest, s) => {
      const campuses = await db.transaction((q) =>
        q(
          "SELECT id,name FROM campuses WHERE church_id=$1 AND EXISTS(SELECT 1 FROM memberships WHERE user_id=$2 AND church_id=$1)",
          [r.church, r.actor.id],
        ),
      );
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "people");
          return {
            households: await q("SELECT * FROM households ORDER BY name"),
            terms: await q(
              "SELECT t.*,p.name FROM leadership_terms t JOIN people p ON p.id=t.person_id ORDER BY ends_on",
            ),
            campuses,
          };
        }),
      );
    }),
  );
  app.post(
    "/api/households",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z.object({ name: text }).parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "people", true);
          return (
            await q(
              "INSERT INTO households(church_id,name) VALUES($1,$2) RETURNING *",
              [r.church, b.name],
            )
          )[0];
        }),
      );
    }),
  );
  app.post(
    "/api/terms",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z
        .object({ personId: uuid, title: text, startsOn: date, endsOn: date })
        .parse(r.body);
      requireThat(b.endsOn >= b.startsOn, 400, "Mandato com datas inválidas.");
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "people", true);
          return (
            await q(
              "INSERT INTO leadership_terms(church_id,person_id,title,starts_on,ends_on) VALUES($1,$2,$3,$4,$5) RETURNING *",
              [r.church, b.personId, b.title, b.startsOn, b.endsOn],
            )
          )[0];
        }),
      );
    }),
  );
  const previews = new Map<
    string,
    { actor: string; church: string; expires: number; valid: Row[] }
  >();
  app.post(
    "/api/import/preview",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z.object({ csv: z.string().max(400000) }).parse(r.body);
      const existing = await scoped(r, async (q) => {
        await permit(q, "people", true);
        return q("SELECT name,email FROM people");
      });
      let rows: Row[];
      try {
        rows = parse(b.csv, {
          columns: true,
          skip_empty_lines: true,
          bom: true,
          trim: true,
        });
      } catch {
        throw new HttpError(
          400,
          "CSV inválido. Use as colunas name,email,phone,status.",
        );
      }
      requireThat(
        rows.length <= 1000,
        400,
        "Máximo de 1.000 linhas por importação.",
      );
      const seen = new Set(
        existing.map((p) => p.name.toLocaleLowerCase("pt-BR")),
      );
      const emails = new Set(
        existing.filter((p) => p.email).map((p) => p.email.toLowerCase()),
      );
      const valid: Row[] = [];
      const issues: Row[] = [];
      for (const [i, row] of rows.entries()) {
        const parsed = personSchema.safeParse(row);
        if (!parsed.success) {
          issues.push({
            line: i + 2,
            error: parsed.error.issues.map((i) => i.message).join("; "),
          });
          continue;
        }
        const p = parsed.data;
        if (
          seen.has(p.name.toLocaleLowerCase("pt-BR")) ||
          (p.email && emails.has(p.email.toLowerCase()))
        ) {
          issues.push({
            line: i + 2,
            error: "Possível duplicidade: revise antes de importar.",
          });
          continue;
        }
        seen.add(p.name.toLocaleLowerCase("pt-BR"));
        if (p.email) emails.add(p.email.toLowerCase());
        valid.push(p);
      }
      const id = token();
      previews.set(id, {
        actor: r.actor.id,
        church: r.church,
        expires: Date.now() + 600000,
        valid,
      });
      s.json({ previewId: id, valid, issues });
    }),
  );
  app.post(
    "/api/import/confirm",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z.object({ previewId: z.string() }).parse(r.body);
      const p = previews.get(b.previewId);
      requireThat(
        p &&
          p.actor === r.actor.id &&
          p.church === r.church &&
          p.expires > Date.now(),
        400,
        "Prévia expirada ou inválida.",
      );
      const result = await scoped(r, async (q) => {
        await permit(q, "people", true);
        for (const v of p.valid) {
          const matches = await q(
            "SELECT 1 FROM people WHERE lower(name)=lower($1) OR ($2::text IS NOT NULL AND lower(email)=lower($2))",
            [v.name, v.email || null],
          );
          requireThat(
            !matches.length,
            409,
            "Os dados mudaram. Gere uma nova prévia.",
          );
          await q(
            "INSERT INTO people(church_id,name,email,phone,status) VALUES($1,$2,$3,$4,$5)",
            [r.church, v.name, v.email || null, v.phone || null, v.status],
          );
        }
        await audit(
          q,
          r.actor.id,
          r.church,
          "people.imported",
          String(p.valid.length),
        );
        return { imported: p.valid.length };
      });
      previews.delete(b.previewId);
      s.json(result);
    }),
  );
  app.get(
    "/api/people/export",
    asyncRoute(async (r: AuthRequest, s) => {
      const rows = await scoped(r, async (q) => {
        await permit(q, "people");
        await audit(q, r.actor.id, r.church, "people.exported");
        return q("SELECT name,email,phone,status FROM people ORDER BY name");
      });
      const escape = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@\-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      s.type("text/csv")
        .attachment("membros.csv")
        .send(
          "\ufeffname,email,phone,status\r\n" +
            rows
              .map((p) =>
                [p.name, p.email, p.phone, p.status].map(escape).join(","),
              )
              .join("\r\n"),
        );
    }),
  );
  app.get(
    "/api/cells",
    asyncRoute(async (r: AuthRequest, s) => {
      const page = Math.max(1, Number(r.query.page ?? 1) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, Number(r.query.pageSize ?? 25) || 25),
      );
      const search = String(r.query.q ?? "").trim();
      const legacyArray =
        r.query.page === undefined &&
        r.query.pageSize === undefined &&
        r.query.q === undefined;
      const result = await scoped(r, async (q) => {
        await permit(q, "cells");
        const where = ["1=1"];
        const params: unknown[] = [];
        if (search) {
          params.push(`%${search}%`);
          where.push(
            `(c.name ILIKE $${params.length} OR c.leader_name ILIKE $${params.length})`,
          );
        }
        const [count] = await q(
          `SELECT count(*)::int AS total FROM cells c WHERE ${where.join(" AND ")}`,
          params,
        );
        const rows = await q(
          `SELECT c.*,(SELECT count(*)::int FROM cell_members m WHERE m.cell_id=c.id) AS members FROM cells c WHERE ${where.join(" AND ")} ORDER BY c.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, (page - 1) * pageSize],
        );
        return {
          items: rows,
          total: Number(count.total),
          page,
          pageSize,
          pages: Math.max(1, Math.ceil(Number(count.total) / pageSize)),
        };
      });
      s.json(legacyArray ? result.items : result);
    }),
  );
  app.post(
    "/api/cells",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z
        .object({
          name: text,
          leaderName: text,
          parentId: uuid.optional(),
          publicDirectory: z.boolean().default(false),
          publicDescription: z.string().max(500).default(""),
          publicContact: z.string().max(300).default(""),
        })
        .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "cells", true);
          return (
            await q(
              "INSERT INTO cells(church_id,name,leader_name,parent_id,public_directory,public_description,public_contact) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [
                r.church,
                b.name,
                b.leaderName,
                b.parentId ?? null,
                b.publicDirectory,
                b.publicDescription,
                b.publicContact,
              ],
            )
          )[0];
        }),
      );
    }),
  );
  app.get(
    "/api/cells/:id/members",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "cells");
          return q(
            "SELECT p.id,p.name FROM cell_members cm JOIN people p ON p.id=cm.person_id WHERE cm.cell_id=$1 ORDER BY p.name",
            [id],
          );
        }),
      );
    }),
  );
  app.patch(
    "/api/cells/:id/public",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id),
        b = z
          .object({
            publicDirectory: z.boolean(),
            publicDescription: z.string().max(500).default(""),
            publicContact: z.string().max(300).default(""),
          })
          .parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "cells", true);
          const [v] = await q(
            "UPDATE cells SET public_directory=$2,public_description=$3,public_contact=$4 WHERE id=$1 AND church_id=$5 RETURNING *",
            [
              id,
              b.publicDirectory,
              b.publicDescription,
              b.publicContact,
              r.church,
            ],
          );
          requireThat(v, 404, "Célula não encontrada.");
          await audit(
            q,
            r.actor.id,
            r.church,
            "cell.public-directory-updated",
            id,
          );
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/cells/:id/members",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id),
        b = z.object({ personId: uuid }).parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "cells", true);
          return q(
            "INSERT INTO cell_members(church_id,cell_id,person_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *",
            [r.church, id, b.personId],
          );
        }),
      );
    }),
  );
  app.post(
    "/api/cells/:id/meetings",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      const b = z
        .object({
          heldOn: date,
          visitors: z.number().int().min(0).max(10000),
          attendance: z
            .array(z.object({ personId: uuid, present: z.boolean() }))
            .max(1000),
        })
        .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "cells", true);
          const members = await q(
            "SELECT person_id FROM cell_members WHERE cell_id=$1",
            [id],
          );
          requireThat(
            b.attendance.every((a) =>
              members.some((m) => m.person_id === a.personId),
            ) &&
              new Set(b.attendance.map((a) => a.personId)).size ===
                b.attendance.length,
            400,
            "Lista de presença inválida.",
          );
          const [m] = await q(
            "INSERT INTO meetings(church_id,cell_id,held_on,visitors) VALUES($1,$2,$3,$4) RETURNING *",
            [r.church, id, b.heldOn, b.visitors],
          );
          for (const a of b.attendance)
            await q("INSERT INTO attendance VALUES($1,$2,$3,$4)", [
              r.church,
              m.id,
              a.personId,
              a.present,
            ]);
          await audit(q, r.actor.id, r.church, "meeting.recorded", m.id);
          return m;
        }),
      );
    }),
  );
  app.patch(
    "/api/workflows/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      if (typeof r.body?.active === "boolean") {
        s.json(
          await scoped(r, async (q) => {
            await permit(q, "people", true);
            const [definition] = await q(
              "UPDATE workflow_definitions SET active=$2 WHERE id=$1 RETURNING *",
              [id, r.body.active],
            );
            requireThat(definition, 404, "Workflow não encontrado.");
            await audit(
              q,
              r.actor.id,
              r.church,
              r.body.active ? "workflow.activated" : "workflow.deactivated",
              id,
            );
            return definition;
          }),
        );
        return;
      }
      const b = z
        .object({ stage: z.number().int().min(0).max(3) })
        .parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "cells", true);
          const [card] = await q(
            "UPDATE workflow_cards SET stage=$1 WHERE id=$2 RETURNING *",
            [b.stage, id],
          );
          requireThat(card, 404, "Registro não encontrado.");
          return card;
        }),
      );
    }),
  );
  app.get(
    "/api/finance",
    asyncRoute(async (r: AuthRequest, s) =>
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "finance");
          return {
            accounts: await q("SELECT * FROM accounts ORDER BY code"),
            funds: await q("SELECT * FROM funds ORDER BY name"),
            costCenters: await q("SELECT * FROM cost_centers ORDER BY name"),
            entries: await q(
              "SELECT e.*,COALESCE(sum(CASE WHEN a.kind='asset' THEN l.amount_cents ELSE 0 END),0)::text AS cash_cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id GROUP BY e.id ORDER BY occurred_on DESC,created_at DESC",
            ),
            closings: await q(
              "SELECT * FROM financial_closings ORDER BY through_date DESC",
            ),
            charges: await q(
              "SELECT id,church_id,fund_id,txid,provider,amount_cents,fee_cents,status,expires_at,entry_id,created_at FROM pix_charges ORDER BY created_at DESC",
            ),
          };
        }),
      ),
    ),
  );
  app.post(
    "/api/finance/entries",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z
        .object({
          description: text,
          amount: z.string(),
          kind: z.enum(["income", "expense"]),
          fundId: uuid.optional(),
          costCenterId: uuid.optional(),
          date: date.optional(),
        })
        .parse(r.body);
      const amount = cents(b.amount);
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "finance", true);
          requireThat(
            options.mode === "demo" || b.kind !== "expense",
            409,
            "Despesas exigem solicitação e aprovação independente em Contas e aprovações.",
          );
          const ac = await q("SELECT id,code FROM accounts");
          const bank = ac.find((a) => a.code === "bank")!.id;
          const opposite = ac.find(
            (a) => a.code === (b.kind === "income" ? "giving" : "operations"),
          )!.id;
          const n = b.kind === "income" ? amount : -amount;
          const e = await postEntry(
            q,
            r.church,
            b.description,
            [
              { account: bank, amount: n },
              { account: opposite, amount: -n },
            ],
            { fund: b.fundId, costCenter: b.costCenterId, date: b.date },
          );
          await audit(q, r.actor.id, r.church, "journal.posted", e.id);
          return e;
        }),
      );
    }),
  );
  app.post(
    "/api/finance/entries/:id/reverse",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      s.status(201).json(
        await scoped(r, async (q) => {
          await permit(q, "finance", true);
          const [e] = await q("SELECT * FROM journal_entries WHERE id=$1", [
            id,
          ]);
          requireThat(
            e && !e.reversal_of,
            404,
            "Lançamento não encontrado ou já é uma reversão.",
          );
          const [charge] = await q(
            "SELECT 1 FROM pix_charges WHERE entry_id=$1",
            [id],
          );
          requireThat(
            !charge,
            409,
            "Pix exige confirmação de devolução pelo provedor.",
          );
          requireThat(
            !(
              await q("SELECT 1 FROM treasury_payments WHERE entry_id=$1", [id])
            ).length,
            409,
            "Use o estorno da baixa para preservar o saldo da conta a pagar/receber.",
          );
          const lines = await q(
            "SELECT account_id,amount_cents FROM journal_lines WHERE entry_id=$1",
            [id],
          );
          const reversal = await postEntry(
            q,
            r.church,
            `Estorno: ${e.description}`,
            lines.map((l) => ({
              account: l.account_id,
              amount: -Number(l.amount_cents),
            })),
            { reversal: id, fund: e.fund_id, costCenter: e.cost_center_id },
          );
          await audit(q, r.actor.id, r.church, "journal.reversed", id);
          return reversal;
        }),
      );
    }),
  );
  app.post(
    "/api/finance/close",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z.object({ throughDate: date }).parse(r.body);
      requireThat(
        b.throughDate <= todayInChurch(),
        400,
        "Não é possível fechar um período futuro.",
      );
      s.json(
        await scoped(r, async (q) => {
          await permit(q, "finance", true);
          await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            r.church,
          ]);
          const [e] = await q(
            "INSERT INTO financial_closings(church_id,through_date) VALUES($1,$2) RETURNING *",
            [r.church, b.throughDate],
          );
          await audit(q, r.actor.id, r.church, "finance.closed", b.throughDate);
          return e;
        }),
      );
    }),
  );
  app.post(
    "/api/pix/charges",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z
        .object({
          amount: z.string(),
          fundId: uuid,
          requestKey: uuid.optional(),
        })
        .parse(r.body);
      const amount = cents(b.amount);
      await scoped(r, async (q) => {
        const [m] = await q("SELECT local_role() AS role");
        requireThat(
          m.role,
          403,
          "Apenas membros locais podem criar cobranças.",
        );
        const [f] = await q("SELECT 1 FROM funds WHERE id=$1", [b.fundId]);
        requireThat(f, 400, "Fundo inválido.");
      });
      const provider = options.mode === "demo" ? "demo" : "efi";
      const account =
        provider === "efi"
          ? options.efi.account(r.church).accountId
          : `demo:${r.church}`;
      const requestKey = b.requestKey ?? randomUUID();
      const intent = await scoped(r, async (q) => {
        await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${r.church}:${r.actor.id}:${requestKey}`,
        ]);
        const [prior] = await q(
          "SELECT * FROM pix_charges WHERE user_id=$1 AND request_key=$2",
          [r.actor.id, requestKey],
        );
        if (prior) {
          requireThat(
            Number(prior.amount_cents) === amount && prior.fund_id === b.fundId,
            409,
            "Esta tentativa já foi usada para outra cobrança.",
          );
          return prior;
        }
        const [c] = await q(
          "INSERT INTO pix_charges(church_id,user_id,fund_id,txid,provider,provider_account,amount_cents,status,request_key,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'creating',$8,now()+interval '1 hour') RETURNING *",
          [
            r.church,
            r.actor.id,
            b.fundId,
            newTxid(),
            provider,
            account,
            amount,
            requestKey,
          ],
        );
        return c;
      });
      if (intent.status === "creating")
        await processIntegrationJob(db, options.efi, intent.id);
      const [c] = await scoped(r, (q) =>
        q("SELECT * FROM pix_charges WHERE id=$1", [intent.id]),
      );
      const {
        provider_account: privateAccount,
        user_id: privateUser,
        ...visible
      } = c;
      s.status(c.status === "creating" ? 202 : 201).json({
        ...visible,
        qrDataUrl: c.copy_paste
          ? await QRCode.toDataURL(c.copy_paste, { width: 240, margin: 2 })
          : null,
      });
    }),
  );
  app.get(
    "/api/pix/charges/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      const [c] = await scoped(r, (q) =>
        q("SELECT * FROM pix_charges WHERE id=$1", [id]),
      );
      requireThat(c, 404, "Cobrança não encontrada.");
      const {
        user_id: privateUser,
        provider_account: privateAccount,
        ...publicCharge
      } = c;
      s.json({
        ...publicCharge,
        qrDataUrl: c.copy_paste
          ? await QRCode.toDataURL(c.copy_paste, { width: 240, margin: 2 })
          : null,
        status:
          c.status === "active" && new Date(c.expires_at) < new Date()
            ? "expired"
            : c.status,
      });
    }),
  );
  app.post(
    "/api/demo/settle/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      requireThat(options.mode === "demo", 404, "Rota indisponível.");
      await admin(r);
      const id = uuid.parse(r.params.id);
      const [c] = await scoped(r, (q) =>
        q("SELECT * FROM pix_charges WHERE id=$1", [id]),
      );
      requireThat(
        c && c.provider === "demo",
        404,
        "Cobrança de demonstração não encontrada.",
      );
      s.json(
        await settle(db, {
          provider: "demo",
          account: c.provider_account,
          txid: c.txid,
          endToEndId: `DEMO${c.txid}`,
          amount: Number(c.amount_cents),
        }),
      );
    }),
  );
  app.post(
    "/api/pix/reconcile/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      await scoped(r, (q) => permit(q, "finance", true));
      const [c] = await scoped(r, (q) =>
        q("SELECT * FROM pix_charges WHERE id=$1", [id]),
      );
      requireThat(
        c && c.provider === "efi",
        400,
        "Selecione uma cobrança Efí.",
      );
      if (c.status === "creating") {
        await db.transaction((q) =>
          q(
            "UPDATE integration_jobs SET status='pending',available_at=now() WHERE resource_id=$1 AND kind='pix.create' AND status IN ('failed','pending')",
            [id],
          ),
        );
        await processIntegrationJob(db, options.efi, id);
        return s.json({ checked: true, status: "CREATION_CHECKED" });
      }
      s.json({
        checked: true,
        status: await reconcileCharge(db, options.efi, c),
      });
    }),
  );
  app.post(
    "/api/webhooks/efi/:account/pix",
    asyncRoute(async (r: Request, s) => {
      requireThat(options.mode === "homologation", 404, "Rota indisponível.");
      const socket = r.socket as import("node:tls").TLSSocket;
      requireThat(
        socket.encrypted && socket.authorized,
        401,
        "Certificado cliente Efí obrigatório.",
      );
      const account = options.efi.accounts.find(
        (a) => a.accountId === r.params.account,
      );
      requireThat(account, 404, "Conta não encontrada.");
      const b = z
        .object({
          pix: z
            .array(
              z.object({
                txid: z.string().regex(/^[a-zA-Z0-9]{26,35}$/),
                endToEndId: z.string().min(20).max(64),
                valor: z.string(),
              }),
            )
            .max(100),
        })
        .parse(r.body);
      for (const p of b.pix) {
        const canonical = await options.efi.query(account.churchId, p.txid);
        const match = canonical.pix?.find(
          (v: any) =>
            v.endToEndId === p.endToEndId &&
            v.txid === p.txid &&
            v.valor === p.valor,
        );
        requireThat(match, 409, "Recebimento não confirmado pelo provedor.");
        await settle(db, {
          provider: "efi",
          account: account.accountId,
          txid: p.txid,
          endToEndId: p.endToEndId,
          amount: cents(p.valor),
        });
      }
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/grants",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      s.json(
        await db.transaction((q) =>
          q(
            "SELECT g.*,u.name,u.email FROM access_grants g JOIN users u ON u.id=g.user_id WHERE g.church_id=$1 ORDER BY expires_at DESC",
            [r.church],
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/grant-candidates",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      s.json(
        await db.transaction((q) =>
          q(
            "SELECT u.id,u.name,u.email FROM users u JOIN network_members n ON n.user_id=u.id JOIN churches c ON c.network_id=n.network_id WHERE c.id=$1",
            [r.church],
          ),
        ),
      );
    }),
  );
  app.post(
    "/api/grants",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const b = z
        .object({
          userId: uuid,
          scope: z.enum(["people", "finance", "cells"]),
          days: z.number().int().min(1).max(90),
        })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [m] = await q(
            "SELECT 1 FROM network_members n JOIN churches c ON c.network_id=n.network_id WHERE n.user_id=$1 AND c.id=$2",
            [b.userId, r.church],
          );
          requireThat(m, 400, "Destinatário fora da rede.");
          const [g] = await q(
            "INSERT INTO access_grants(church_id,user_id,scope,expires_at,granted_by) VALUES($1,$2,$3,now()+($4::int*interval '1 day'),$5) RETURNING *",
            [r.church, b.userId, b.scope, b.days, r.actor.id],
          );
          await audit(q, r.actor.id, r.church, "grant.created", g.id);
          return g;
        }),
      );
    }),
  );
  app.delete(
    "/api/grants/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const id = uuid.parse(r.params.id);
      await db.transaction(async (q) => {
        const rows = await q(
          "UPDATE access_grants SET revoked_at=now() WHERE id=$1 AND church_id=$2 RETURNING id",
          [id, r.church],
        );
        requireThat(rows.length, 404, "Concessão não encontrada.");
        await audit(q, r.actor.id, r.church, "grant.revoked", id);
      });
      s.json({ ok: true });
    }),
  );
  app.patch(
    "/api/branding",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const b = z
        .object({
          name: text,
          primaryColor: z.enum(["#7062db", "#317b68", "#386fa4"]),
        })
        .parse(r.body);
      await db.transaction(async (q) => {
        await q("UPDATE churches SET name=$1,primary_color=$2 WHERE id=$3", [
          b.name,
          b.primaryColor,
          r.church,
        ]);
        await audit(q, r.actor.id, r.church, "branding.updated");
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/audit",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          action: z.string().trim().max(120).default(""),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [count] = await q(
            "SELECT count(*)::int AS total FROM audit_events WHERE ($1='' OR action=$1)",
            [params.action],
          );
          const items = await q(
            "SELECT * FROM audit_events WHERE ($1='' OR action=$1) ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
            [
              params.action,
              params.pageSize,
              (params.page - 1) * params.pageSize,
            ],
          );
          return {
            items,
            total: count.total,
            page: params.page,
            pageSize: params.pageSize,
            pages: Math.max(
              1,
              Math.ceil(Number(count.total) / params.pageSize),
            ),
            action: params.action,
          };
        }),
      );
    }),
  );
  app.get(
    "/api/portal",
    asyncRoute(async (r: AuthRequest, s) => {
      const params = z
        .object({
          taskPage: z.coerce.number().int().min(1).default(1),
          taskPageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      return s.json(
        await scoped(r, async (q) => {
          const [taskCount] = await q(
            "SELECT count(*)::int AS total FROM operational_tasks WHERE assigned_to=$1 AND status IN ('open','in_progress')",
            [r.actor.id],
          );
          const tasks = (
            await q(
              "SELECT id,scope,status,due_on,assigned_to,version,encrypted_title,completed_at FROM operational_tasks WHERE assigned_to=$1 AND status IN ('open','in_progress') ORDER BY due_on NULLS LAST,created_at DESC LIMIT $2 OFFSET $3",
              [
                r.actor.id,
                params.taskPageSize,
                (params.taskPage - 1) * params.taskPageSize,
              ],
            )
          ).map((task) => ({
            ...task,
            title: decrypt(task.encrypted_title, options.key),
            encrypted_title: undefined,
          }));
          return {
            person:
              (
                await q(
                  "SELECT id,name,email,phone,status,created_at FROM people WHERE user_id=$1",
                  [r.actor.id],
                )
              )[0] ?? null,
            funds: await q("SELECT * FROM funds ORDER BY name"),
            charges: await q(
              "SELECT id,txid,amount_cents,status,created_at FROM pix_charges WHERE user_id=$1 ORDER BY created_at DESC",
              [r.actor.id],
            ),
            schedules: await q(
              "SELECT * FROM schedules WHERE user_id=$1 ORDER BY starts_at",
              [r.actor.id],
            ),
            privacy: await q(
              "SELECT * FROM privacy_requests WHERE user_id=$1 ORDER BY created_at DESC",
              [r.actor.id],
            ),
            workflows: await q(
              "SELECT wi.id,wi.status,wi.due_on,wi.current_step,d.name AS workflow_name,s.title AS step_title,(SELECT count(*)::int FROM workflow_steps all_steps WHERE all_steps.definition_id=wi.definition_id) AS step_total FROM workflow_instances wi JOIN people p ON p.id=wi.person_id JOIN workflow_definitions d ON d.id=wi.definition_id LEFT JOIN workflow_steps s ON s.definition_id=wi.definition_id AND s.position=wi.current_step WHERE p.user_id=$1 ORDER BY wi.status,wi.due_on NULLS LAST,wi.created_at DESC",
              [r.actor.id],
            ),
            tasks,
            taskPagination: {
              total: taskCount.total,
              page: params.taskPage,
              pageSize: params.taskPageSize,
              pages: Math.max(
                1,
                Math.ceil(Number(taskCount.total) / params.taskPageSize),
              ),
            },
          };
        }),
      );
    }),
  );
  app.patch(
    "/api/portal/tasks/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id);
      const b = z
        .object({
          status: z.enum(["in_progress", "done"]),
          version: z.number().int().positive(),
        })
        .parse(r.body);
      const [task] = await scoped(r, (q) =>
        q(
          "SELECT id FROM operational_tasks WHERE id=$1 AND assigned_to=$2 AND status IN ('open','in_progress')",
          [id, r.actor.id],
        ),
      );
      requireThat(task, 404, "Tarefa não encontrada ou não atribuída a você.");
      const updated = await db.transaction(async (q) => {
        const [row] = await q(
          "UPDATE operational_tasks SET status=$2,completed_at=CASE WHEN $2='done' THEN COALESCE(completed_at,now()) ELSE NULL END,version=version+1 WHERE id=$1 AND assigned_to=$3 AND version=$4 RETURNING id,status,version,completed_at",
          [id, b.status, r.actor.id, b.version],
        );
        requireThat(row, 409, "Tarefa alterada. Atualize o portal.");
        await audit(q, r.actor.id, r.church, "task.portal-status-updated", id);
        return row;
      });
      s.json(updated);
    }),
  );
  app.patch(
    "/api/schedules/:id",
    asyncRoute(async (r: AuthRequest, s) => {
      const id = uuid.parse(r.params.id),
        b = z
          .object({ response: z.enum(["accepted", "declined"]) })
          .parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          if (b.response === "accepted") {
            await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
              `volunteer:${r.actor.id}`,
            ]);
            requireThat(
              !(
                await q(
                  "SELECT 1 FROM schedules s JOIN volunteer_unavailability v ON v.user_id=s.user_id AND v.church_id=s.church_id WHERE s.id=$1 AND s.user_id=$2 AND v.starts_at<s.ends_at AND v.ends_at>s.starts_at",
                  [id, r.actor.id],
                )
              ).length,
              409,
              "Você marcou indisponibilidade nesse horário.",
            );
          }
          const [v] = await q(
            "UPDATE schedules SET response=$1 WHERE id=$2 AND user_id=$3 RETURNING *",
            [b.response, id, r.actor.id],
          );
          requireThat(v, 404, "Escala não encontrada.");
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/privacy",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z
        .object({
          kind: z.enum(["access", "correction", "deletion"]),
          detail: z.string().trim().min(5).max(2000),
        })
        .parse(r.body);
      const [request] = await scoped(r, (q) =>
        q(
          "INSERT INTO privacy_requests(church_id,user_id,kind,detail) VALUES($1,$2,$3,$4) RETURNING *",
          [r.church, r.actor.id, b.kind, b.detail],
        ),
      );
      await db.transaction((q) =>
        q(
          "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+7,$3,$3,'privacy',$4) ON CONFLICT DO NOTHING",
          [
            r.church,
            encrypt(`Privacidade · ${b.kind}`, options.key),
            r.actor.id,
            request.id,
          ],
        ),
      );
      s.status(201).json(request);
    }),
  );
  app.post(
    "/api/portal/profile-change",
    asyncRoute(async (r: AuthRequest, s: Response) => {
      const b = z
        .object({
          name: z.string().trim().min(2).max(160),
          email: z.email().or(z.literal("")),
          phone: z.string().trim().max(30),
        })
        .parse(r.body);
      const [person] = await scoped(r, (q) =>
        q("SELECT id FROM people WHERE church_id=$1 AND user_id=$2", [
          r.church,
          r.actor.id,
        ]),
      );
      requireThat(
        person,
        404,
        "Seu cadastro de membro ainda não está vinculado.",
      );
      const detail = JSON.stringify({
        type: "profile-change",
        personId: person.id,
        changes: b,
      });
      const [request] = await scoped(r, (q) =>
        q(
          "INSERT INTO privacy_requests(church_id,user_id,kind,detail) VALUES($1,$2,'correction',$3) RETURNING id,status,created_at",
          [r.church, r.actor.id, detail],
        ),
      );
      await db.transaction((q) =>
        q(
          "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+7,$3,$3,'privacy',$4) ON CONFLICT DO NOTHING",
          [
            r.church,
            encrypt("Atualização cadastral", options.key),
            r.actor.id,
            request.id,
          ],
        ),
      );
      s.status(201).json(request);
    }),
  );
  app.post(
    "/api/prayers",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z
        .object({
          text: z.string().trim().min(5).max(4000),
          confidential: z.boolean(),
        })
        .parse(r.body);
      await scoped(r, (q) =>
        q(
          "INSERT INTO prayer_requests(church_id,user_id,confidential,ciphertext) VALUES($1,$2,$3,$4)",
          [r.church, r.actor.id, b.confidential, encrypt(b.text, options.key)],
        ),
      );
      s.status(201).json({ ok: true });
    }),
  );
  app.post(
    "/api/pastoral-notes",
    asyncRoute(async (r: AuthRequest, s) => {
      await scoped(r, (q) => permit(q, "pastoral", true));
      const b = z
        .object({ personId: uuid, text: z.string().trim().min(5).max(10000) })
        .parse(r.body);
      await scoped(r, async (q) => {
        await q(
          "INSERT INTO pastoral_notes(church_id,person_id,author_id,ciphertext) VALUES($1,$2,$3,$4)",
          [r.church, b.personId, r.actor.id, encrypt(b.text, options.key)],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "pastoral-note.created",
          b.personId,
        );
      });
      s.status(201).json({ ok: true });
    }),
  );
  app.get(
    "/api/pastoral-notes/:person",
    asyncRoute(async (r: AuthRequest, s) => {
      await scoped(r, (q) => permit(q, "pastoral"));
      const id = uuid.parse(r.params.person);
      const rows = await scoped(r, (q) =>
        q("SELECT id,ciphertext FROM pastoral_notes WHERE person_id=$1", [id]),
      );
      s.json(
        rows.map((v) => ({
          id: v.id,
          text: decrypt(v.ciphertext, options.key),
        })),
      );
    }),
  );
  app.post(
    "/api/credentials",
    asyncRoute(async (r: AuthRequest, s) => {
      const b = z.object({ personId: uuid }).parse(r.body),
        raw = token();
      const result = await scoped(r, async (q) => {
        const [p] = await q("SELECT * FROM people WHERE id=$1", [b.personId]);
        requireThat(
          p &&
            (p.user_id === r.actor.id ||
              (await q("SELECT can_access('people',true) AS a"))[0].a),
          403,
          "Credencial não autorizada.",
        );
        return p;
      });
      await db.transaction(async (q) => {
        await q(
          "INSERT INTO credentials(church_id,person_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",
          [r.church, b.personId, hash(raw)],
        );
        await audit(q, r.actor.id, r.church, "credential.issued", b.personId);
      });
      const payload = `${options.origin}/?credential=${raw}`;
      s.json({
        name: result.name,
        token: raw,
        qrDataUrl: await QRCode.toDataURL(payload),
        expiresIn: "24 horas",
      });
    }),
  );
  app.get(
    "/api/credentials/:token",
    asyncRoute(async (r: AuthRequest, s) => {
      const raw = z.string().min(30).max(100).parse(r.params.token);
      const [c] = await db.transaction((q) =>
        q(
          "SELECT c.church_id,c.expires_at,p.status FROM credentials c JOIN people p ON p.id=c.person_id WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
          [hash(raw)],
        ),
      );
      requireThat(c, 404, "Credencial inválida ou expirada.");
      requireThat(
        c.church_id === r.church,
        403,
        "Selecione a igreja da credencial.",
      );
      await scoped(r, (q) => permit(q, "people"));
      s.json({ valid: true, status: c.status, expiresAt: c.expires_at });
    }),
  );
  app.get(
    "/api/transfer-destinations",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      s.json(
        await db.transaction((q) =>
          q(
            "SELECT c.id,c.name FROM churches c JOIN churches origin ON origin.network_id=c.network_id WHERE origin.id=$1 AND c.id<>origin.id ORDER BY c.name",
            [r.church],
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/transfers",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      s.json(
        await db.transaction((q) =>
          q(
            "SELECT t.id,t.source_church_id,t.target_church_id,t.status,CASE WHEN t.source_church_id=$1 THEN p.name END AS person_name FROM transfers t JOIN people p ON p.id=t.person_id WHERE source_church_id=$1 OR target_church_id=$1",
            [r.church],
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/transfers/:id/history",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const id = uuid.parse(r.params.id);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [count] = await q(
            "SELECT count(*)::int AS total FROM transfer_change_log WHERE transfer_id=$1 AND church_id=$2",
            [id, r.church],
          );
          const items = await q(
            "SELECT id,status,note,actor_name,changed_at FROM transfer_change_log WHERE transfer_id=$1 AND church_id=$2 ORDER BY changed_at DESC LIMIT $3 OFFSET $4",
            [
              id,
              r.church,
              params.pageSize,
              (params.page - 1) * params.pageSize,
            ],
          );
          return {
            items,
            total: Number(count.total),
            page: params.page,
            pageSize: params.pageSize,
            pages: Math.max(
              1,
              Math.ceil(Number(count.total) / params.pageSize),
            ),
          };
        }),
      );
    }),
  );
  app.post(
    "/api/transfers",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const b = z
        .object({ personId: uuid, targetChurchId: uuid })
        .parse(r.body);
      await scoped(r, async (q) => {
        requireThat(
          (await q("SELECT 1 FROM people WHERE id=$1", [b.personId])).length,
          404,
          "Pessoa não encontrada.",
        );
      });
      s.status(201).json(
        await db.transaction(async (q) => {
          const match = await q(
            "SELECT 1 FROM churches a JOIN churches b ON a.network_id=b.network_id WHERE a.id=$1 AND b.id=$2 AND a.id<>b.id",
            [r.church, b.targetChurchId],
          );
          requireThat(match.length, 400, "Igreja de destino inválida.");
          const [t] = await q(
            "INSERT INTO transfers(source_church_id,target_church_id,person_id,requested_by) VALUES($1,$2,$3,$4) RETURNING id",
            [r.church, b.targetChurchId, b.personId, r.actor.id],
          );
          await q(
            "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+7,$3,$4,$4,'transfer',$5) ON CONFLICT DO NOTHING",
            [
              r.church,
              encrypt("Transferência · aceitar ou acompanhar", options.key),
              b.personId,
              r.actor.id,
              t.id,
            ],
          );
          await q(
            "INSERT INTO transfer_change_log(church_id,transfer_id,actor_id,actor_name,status,note) VALUES($1,$2,$3,$4,'pending',$5)",
            [
              r.church,
              t.id,
              r.actor.id,
              r.actor.name,
              "Transferência solicitada pela igreja de origem.",
            ],
          );
          await audit(q, r.actor.id, r.church, "transfer.requested", t.id);
          return t;
        }),
      );
    }),
  );
  app.post(
    "/api/transfers/:id/accept",
    asyncRoute(async (r: AuthRequest, s) => {
      await admin(r);
      const id = uuid.parse(r.params.id);
      await db.transaction(async (q) => {
        const [t] = await q(
          "SELECT * FROM transfers WHERE id=$1 AND target_church_id=$2 AND status='pending' FOR UPDATE",
          [id, r.church],
        );
        requireThat(t, 404, "Transferência pendente não encontrada.");
        const [p] = await q(
          "SELECT name,email,phone,status FROM people WHERE id=$1 AND church_id=$2",
          [t.person_id, t.source_church_id],
        );
        await q(
          "INSERT INTO people(church_id,name,email,phone,status) VALUES($1,$2,$3,$4,$5)",
          [r.church, p.name, p.email, p.phone, p.status],
        );
        await q("UPDATE people SET status='inactive' WHERE id=$1", [
          t.person_id,
        ]);
        await q(
          "UPDATE transfers SET status='accepted',accepted_by=$1 WHERE id=$2",
          [r.actor.id, id],
        );
        await q(
          "UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='transfer' AND source_id=$1 AND status IN ('open','in_progress')",
          [id],
        );
        await q(
          "INSERT INTO transfer_change_log(church_id,transfer_id,actor_id,actor_name,status,note) VALUES($1,$2,$3,$4,'accepted',$5),($6,$2,$3,$4,'accepted',$5)",
          [
            r.church,
            id,
            r.actor.id,
            r.actor.name,
            "Transferência aceita pela igreja de destino.",
            t.source_church_id,
          ],
        );
        await audit(q, r.actor.id, t.source_church_id, "transfer.accepted", id);
        await audit(q, r.actor.id, r.church, "transfer.accepted", id);
      });
      s.json({ ok: true });
    }),
  );
  const platformQuery = <T>(r: AuthRequest, fn: (q: Query) => Promise<T>) => db.transaction(fn, { actor: r.actor.id, church: r.church });
  const requirePlatform = async (r: AuthRequest, billing = false) => {
    const [role] = await platformQuery(r, (q) => q("SELECT role FROM platform_memberships WHERE user_id=$1", [r.actor.id]));
    requireThat(role?.role === "platform_admin" || (billing && role?.role === "platform_billing"), 403, "Acesso exclusivo da operação da plataforma.");
    return role.role as string;
  };
  app.get("/api/platform/billing/accounts", asyncRoute(async (r: AuthRequest, s) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_billing_accounts_view()", []));
    s.json(rows);
  }));
  app.get("/api/platform/billing/sales", asyncRoute(async (r: AuthRequest, s) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_billing_sales_view()", []));
    s.json(rows);
  }));
  app.get("/api/platform/billing/revenue", asyncRoute(async (r: AuthRequest, s) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT b.id AS billing_account_id,b.name,COALESCE(SUM(p.gross_cents) FILTER(WHERE p.status='confirmed'),SUM(i.amount_cents) FILTER(WHERE i.status='paid'),0)::bigint AS gross_cents,COALESCE(SUM(p.fee_cents) FILTER(WHERE p.status='confirmed'),0)::bigint AS fee_cents FROM billing_accounts b LEFT JOIN saas_invoices i ON i.billing_account_id=b.id LEFT JOIN saas_payments p ON p.billing_account_id=b.id GROUP BY b.id ORDER BY b.name", []));
    s.json(rows[0] ?? { gross_cents: 0, fee_cents: 0 });
  }));
  app.get("/api/platform/billing/invoices", asyncRoute(async (r: AuthRequest, s) => {
    const filters = z.object({ status: z.enum(["all","issued","paid","overdue","void"]).default("all"), from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(r.query);
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT i.id,i.billing_account_id,b.name AS billing_account,i.contract_id,i.period_start,i.period_end,i.due_on,i.amount_cents,i.status,i.paid_at,i.notes FROM saas_invoices i JOIN billing_accounts b ON b.id=i.billing_account_id WHERE ($1='all' OR i.status=$1) AND ($2::date IS NULL OR i.period_end >= $2::date) AND ($3::date IS NULL OR i.period_start <= $3::date) ORDER BY i.due_on DESC,i.created_at DESC LIMIT 500", [filters.status, filters.from ?? null, filters.to ?? null]));
    s.json(rows);
  }));
  app.get("/api/platform/billing/accounts.csv", asyncRoute(async (r: AuthRequest, s: Response) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_billing_accounts_view()", []));
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll(`"`, `""`)}"`;
    const csv = ["account,owner_church,network,plan,status,children_count", ...rows.map((v) => [v.name,v.owner_church,v.network_name,v.plan,v.status,v.children_count].map(esc).join(","))].join("\\r\\n") + "\\r\\n";
    s.type("text/csv; charset=utf-8").attachment("contas-comerciais.csv").send("\\ufeff" + csv);
  }));
  app.get("/api/platform/billing/export.csv", asyncRoute(async (r: AuthRequest, s: Response) => {
    await requirePlatform(r, true);
    const status = z.object({ status: z.enum(["all","issued","paid","overdue","void"]).default("all") }).parse(r.query).status;
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_invoice_export_view($1)", [status]));
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll(`"`, `""`)}"`;
    const csv = ["billing_account,period_start,period_end,due_on,amount_cents,status,paid_at", ...rows.map((v) => [v.billing_account,v.period_start,v.period_end,v.due_on,v.amount_cents,v.status,v.paid_at].map(esc).join(","))].join("\\r\\n") + "\\r\\n";
    s.type("text/csv; charset=utf-8").attachment("faturas-plataforma.csv").send("\\ufeff" + csv);
  }));
  app.patch("/api/platform/billing/invoices/:id", asyncRoute(async (r: AuthRequest, s) => {
    await requirePlatform(r, true);
    const id = uuid.parse(r.params.id);
    const b = z.object({ status: z.enum(["issued","paid","overdue","void"]), notes: z.string().max(2000).default("") }).parse(r.body);
    const [row] = await platformQuery(r, (q) => q("UPDATE saas_invoices SET status=$2,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,now()) ELSE NULL END,notes=$3,updated_at=now() WHERE id=$1 RETURNING id,billing_account_id,status,paid_at,notes", [id,b.status,b.notes]));
    requireThat(row, 404, "Fatura não encontrada.");
    s.json(row);
  }));
  app.get("/api/platform/billing/history", asyncRoute(async (r: AuthRequest, s: Response) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_contract_history_view()", []));
    s.json(rows);
  }));
  app.get("/api/platform/usage", asyncRoute(async (r: AuthRequest, s) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_usage_view()", []));
    s.json(rows);
  }));
  app.get("/api/platform/usage/alerts", asyncRoute(async (r: AuthRequest, s: Response) => {
    await requirePlatform(r, true);
    const rows = await platformQuery(r, (q) => q("SELECT * FROM platform_usage_view() WHERE churches_count >= max_churches*0.8 OR users_count >= max_users*0.8 OR members_count >= max_members*0.8", []));
    s.json(rows);
  }));
  operations(app, db, options);
  accessRoutes(app, db, { ...options, key: options.mfaKey ?? options.key });
  treasuryRoutes(app, db, { key: options.key });
  agendaRoutes(app, db, options.key);
  participationRoutes(app, db, options.key);
  savedViewRoutes(app, db, options.key);
  communicationRoutes(app, db, options.communicationCallbackToken);
  searchRoutes(app, db);
  educationRoutes(app, db, options.key);
  worshipRoutes(app, db);
  kidsRoutes(app, db, options.key);
  kidsPrintRoutes(app, db, options.key);
  institutionalRoutes(app, db, options.key);
  assemblyRoutes(app, db);
  groupRoutes(app, db, options.key);
  assetRoutes(app, db);
  libraryRoutes(app, db);
  assistanceRoutes(app, db, options.key);
  mediaRoutes(app, db, options.key);
  registrationAdminRoutes(app, db, options);
  app.use("/api", (_r, s) =>
    s.status(404).json({ error: "Rota não encontrada." }),
  );
  app.use((e: any, _r: Request, s: Response, _n: NextFunction) => {
    if (e.type === "entity.too.large")
      return s.status(413).json({
        error: "O arquivo é muito grande. Envie uma foto de até 3 MB.",
      });
    if (e.type === "entity.parse.failed")
      return s
        .status(400)
        .json({ error: "Não foi possível ler os dados enviados." });
    if (e instanceof z.ZodError)
      return s.status(400).json({
        error: "Dados inválidos.",
        details: e.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    if (e instanceof HttpError) {
      return s.status(e.status).json({ error: e.message });
    }
    if (["23503", "23505", "23514", "42501"].includes(e.code)) {
      return s
        .status(e.code === "42501" ? 403 : 409)
        .json({ error: "Operação não permitida ou dados em conflito." });
    }
    if (e.message?.includes("Closed financial period"))
      return s.status(409).json({
        error:
          "Período financeiro fechado. Use uma reversão no período aberto.",
      });
    if (e.message?.includes("Resource booking conflict"))
      return s.status(409).json({
        error:
          "Recurso já reservado nesse horário. Escolha outro recurso ou período.",
      });
    console.error("Request failed:", e.code ?? e.name);
    s.status(500).json({ error: "Não foi possível concluir a operação." });
  });
  return app;
}






