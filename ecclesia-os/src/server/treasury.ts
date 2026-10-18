import { z } from "zod";
import { createHash } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { cents, postEntry } from "./finance.js";
import { requireThat, encrypt, decrypt } from "./security.js";
import { audit } from "./seed.js";
import { todayInChurch } from "../shared/dates.js";
type R = Request & { actor: Row; church: string };
export function treasuryRoutes(app: Express, db: Database, options: { key: Buffer }) {
  const route =
    (fn: (r: R, s: Response) => Promise<unknown>) =>
    (r: Request, s: Response, n: NextFunction) =>
      Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(fn, { actor: r.actor.id, church: r.church });
  };
  const write = async (r: R) => {
    requireThat(r.actor.mfa, 403, "Confirme MFA.");
    const [p] = await scoped(r, (q) =>
      q(
        "SELECT can_access('finance',true) AND finance_scope_allowed() AS allowed",
      ),
    );
    requireThat(p.allowed, 403, "Permissão de tesouraria obrigatória.");
  };
  const admin = async (r: R) => {
    await write(r);
    const [p] = await scoped(r, (q) =>
      q("SELECT local_role()='admin' AS allowed"),
    );
    requireThat(
      p.allowed,
      403,
      "Aprovação por administrador independente obrigatória.",
    );
  };
  app.get(
    "/api/finance/reports",
    route(async (r, s) => {
      const today = todayInChurch(), defaultFrom = `${today.slice(0, 4)}-01-01`;
      const b = z.object({ from: z.iso.date().default(defaultFrom), to: z.iso.date().default(today), fundId: z.uuid().optional(), costCenterId: z.uuid().optional() }).parse(r.query);
      requireThat(b.from <= b.to, 400, "O início do relatório deve preceder o fim.");
      s.json(await scoped(r, async (q) => {
        const [permission] = await q("SELECT can_access('finance') AND finance_scope_allowed() AS allowed");
        requireThat(permission.allowed, 403, "Consulta financeira não autorizada.");
        const filter = "e.church_id=$1 AND e.occurred_on BETWEEN $2::date AND $3::date AND ($4::uuid IS NULL OR e.fund_id=$4) AND ($5::uuid IS NULL OR e.cost_center_id=$5)";
        const params = [r.church, b.from, b.to, b.fundId ?? null, b.costCenterId ?? null];
        const [summary] = await q(`SELECT COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents>0 THEN l.amount_cents ELSE 0 END),0)::text AS income_cents,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents<0 THEN -l.amount_cents ELSE 0 END),0)::text AS expense_cents,COALESCE(sum(CASE WHEN a.kind='asset' THEN l.amount_cents ELSE 0 END),0)::text AS net_cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id WHERE ${filter}`, params);
        const monthly = await q(`SELECT to_char(date_trunc('month',e.occurred_on),'YYYY-MM') AS month,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents>0 THEN l.amount_cents ELSE 0 END),0)::text AS income_cents,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents<0 THEN -l.amount_cents ELSE 0 END),0)::text AS expense_cents,COALESCE(sum(CASE WHEN a.kind='asset' THEN l.amount_cents ELSE 0 END),0)::text AS net_cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id WHERE ${filter} GROUP BY 1 ORDER BY 1`, params);
        const byFund = await q(`SELECT COALESCE(f.name,'Sem fundo') AS name,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents>0 THEN l.amount_cents ELSE 0 END),0)::text AS income_cents,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents<0 THEN -l.amount_cents ELSE 0 END),0)::text AS expense_cents,COALESCE(sum(CASE WHEN a.kind='asset' THEN l.amount_cents ELSE 0 END),0)::text AS net_cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id LEFT JOIN funds f ON f.id=e.fund_id WHERE ${filter} GROUP BY f.name ORDER BY f.name NULLS LAST`, params);
        const byCostCenter = await q(`SELECT COALESCE(c.name,'Sem centro de custo') AS name,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents>0 THEN l.amount_cents ELSE 0 END),0)::text AS income_cents,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents<0 THEN -l.amount_cents ELSE 0 END),0)::text AS expense_cents,COALESCE(sum(CASE WHEN a.kind='asset' THEN l.amount_cents ELSE 0 END),0)::text AS net_cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id LEFT JOIN cost_centers c ON c.id=e.cost_center_id WHERE ${filter} GROUP BY c.name ORDER BY c.name NULLS LAST`, params);
        const [openBills] = await q("SELECT count(*)::int AS count,COALESCE(sum(amount_cents-paid_cents),0)::text AS amount_cents,COALESCE(sum(CASE WHEN due_on<CURRENT_DATE THEN amount_cents-paid_cents ELSE 0 END),0)::text AS overdue_cents FROM treasury_bills WHERE church_id=$1 AND status='approved' AND paid_cents<amount_cents", [r.church]);
        const [pendingStatement] = await q("SELECT count(*)::int AS count,COALESCE(sum(abs(amount_cents)),0)::text AS amount_cents FROM bank_statement_lines WHERE church_id=$1 AND status='unmatched'", [r.church]);
        const pix = await q("SELECT status,count(*)::int AS count,COALESCE(sum(amount_cents),0)::text AS amount_cents,COALESCE(sum(fee_cents),0)::text AS fee_cents FROM pix_charges WHERE church_id=$1 AND created_at::date BETWEEN $2::date AND $3::date GROUP BY status ORDER BY status", [r.church,b.from,b.to]);
        return { from: b.from, to: b.to, summary, monthly, byFund, byCostCenter, openBills, pendingStatement, pix };
      }));
    }),
  );
  const logChange = (q: Query, r: R, resourceType: string, resourceId: string, action: string, reason: string) =>
    q(
      "INSERT INTO treasury_change_log(church_id,resource_type,resource_id,action,reason,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [r.church, resourceType, resourceId, action, reason, r.actor.id, r.actor.name],
    );
  app.get(
    "/api/finance/treasury",
    route(async (r, s) => {
      const params = z.object({
        statementPage: z.coerce.number().int().min(1).default(1),
        statementPageSize: z.coerce.number().int().min(1).max(100).default(50),
        statementStatus: z.enum(["all", "unmatched", "matched", "ignored"]).default("all"),
        importPage: z.coerce.number().int().min(1).default(1),
        importPageSize: z.coerce.number().int().min(1).max(100).default(25),
        integrationPage: z.coerce.number().int().min(1).default(1),
        integrationPageSize: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [p] = await q(
            "SELECT can_access('finance') AND finance_scope_allowed() AS allowed",
          );
          requireThat(p.allowed, 403, "Consulta financeira não autorizada.");
          const statementFilters = params.statementStatus === "all" ? "" : " AND l.status=$2";
          const statementParams = params.statementStatus === "all" ? [r.church] : [r.church, params.statementStatus];
          const statementLimit = statementParams.length + 1;
          const statementOffset = statementParams.length + 2;
          const [statementTotal] = await q(`SELECT count(*)::int AS total FROM bank_statement_lines l WHERE l.church_id=$1${statementFilters}`, statementParams);
          const statementLines = await q(
            `SELECT l.id,l.import_id,l.account_id,l.external_id,l.occurred_on,l.description,l.amount_cents,l.status,l.matched_payment_id,l.matched_at,i.file_name FROM bank_statement_lines l JOIN bank_statement_imports i ON i.id=l.import_id WHERE l.church_id=$1${statementFilters} ORDER BY l.occurred_on DESC,l.id DESC LIMIT $${statementLimit} OFFSET $${statementOffset}`,
            [...statementParams, params.statementPageSize, (params.statementPage - 1) * params.statementPageSize],
          );
          return {
            bills: await q(
              "SELECT b.*,p.name AS party_name FROM treasury_bills b LEFT JOIN financial_parties p ON p.id=b.party_id ORDER BY b.due_on,b.id",
            ),
            payments: await q(
              "SELECT * FROM treasury_payments ORDER BY occurred_on DESC,id DESC",
            ),
            parties: await q("SELECT * FROM financial_parties ORDER BY name"),
            jobs: await q("SELECT id,kind,status,attempts,last_error,available_at,resource_id FROM integration_jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2", [params.integrationPageSize, (params.integrationPage - 1) * params.integrationPageSize]),
            integrationPagination: await (async () => { const [row] = await q("SELECT count(*)::int AS total FROM integration_jobs"); return { total: Number(row.total), page: params.integrationPage, pageSize: params.integrationPageSize, pages: Math.max(1, Math.ceil(Number(row.total) / params.integrationPageSize)) }; })(),
            accounts: await q(
              "SELECT * FROM accounts WHERE kind='asset' ORDER BY name",
            ),
            funds: await q("SELECT * FROM funds ORDER BY name"),
            costCenters: await q("SELECT * FROM cost_centers ORDER BY name"),
            budgets: await q(
              "SELECT b.*,c.name,COALESCE((SELECT sum(l.amount_cents) FROM journal_lines l JOIN accounts a ON a.id=l.account_id JOIN journal_entries e ON e.id=l.entry_id WHERE a.kind='expense' AND e.cost_center_id=b.cost_center_id AND date_trunc('month',e.occurred_on)=b.month),0)::text AS spent_cents FROM treasury_budgets b JOIN cost_centers c ON c.id=b.cost_center_id ORDER BY month DESC",
            ),
            attachments: await q(
              "SELECT id,bill_id,payment_id,name,media_type,bytes,created_by,created_at FROM treasury_attachments ORDER BY created_at DESC",
            ),
            statementImports: await q("SELECT id,account_id,file_name,source_hash,imported_by,created_at FROM bank_statement_imports ORDER BY created_at DESC LIMIT $1 OFFSET $2", [params.importPageSize, (params.importPage - 1) * params.importPageSize]),
            importPagination: await (async () => { const [row] = await q("SELECT count(*)::int AS total FROM bank_statement_imports"); return { total: Number(row.total), page: params.importPage, pageSize: params.importPageSize, pages: Math.max(1, Math.ceil(Number(row.total) / params.importPageSize)) }; })(),
            statementLines,
            statementPagination: {
              total: statementTotal.total,
              page: params.statementPage,
              pageSize: params.statementPageSize,
              pages: Math.max(1, Math.ceil(Number(statementTotal.total) / params.statementPageSize)),
              status: params.statementStatus,
            },
            canApprove: (await q("SELECT local_role()='admin' AS allowed"))[0]
              .allowed,
          };
        }),
      );
    }),
  );
  app.get("/api/finance/reports.csv", route(async (r, s) => {
    const today = todayInChurch(), defaultFrom = `${today.slice(0, 4)}-01-01`;
    const b = z.object({ from: z.iso.date().default(defaultFrom), to: z.iso.date().default(today), costCenterId: z.uuid().optional() }).parse(r.query);
    requireThat(b.from <= b.to, 400, "O início do relatório deve preceder o fim.");
    const rows = await scoped(r, async (q) => {
      const [permission] = await q("SELECT can_access('finance') AND finance_scope_allowed() AS allowed");
      requireThat(permission.allowed, 403, "Consulta financeira não autorizada.");
      const params = [r.church, b.from, b.to, b.costCenterId ?? null];
      return q("SELECT COALESCE(c.name,'Sem centro de custo') AS cost_center,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents>0 THEN l.amount_cents ELSE 0 END),0)::text AS income_cents,COALESCE(sum(CASE WHEN a.kind='asset' AND l.amount_cents<0 THEN -l.amount_cents ELSE 0 END),0)::text AS expense_cents,COALESCE(sum(CASE WHEN a.kind='asset' THEN l.amount_cents ELSE 0 END),0)::text AS net_cents FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id LEFT JOIN cost_centers c ON c.id=e.cost_center_id WHERE e.church_id=$1 AND e.occurred_on BETWEEN $2::date AND $3::date AND ($4::uuid IS NULL OR e.cost_center_id=$4) GROUP BY c.name ORDER BY c.name NULLS LAST", params);
    });
    await db.transaction((q) => audit(q, r.actor.id, r.church, "finance.report-exported"));
    const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = ["cost_center,income_cents,expense_cents,net_cents", ...rows.map((v) => [v.cost_center, v.income_cents, v.expense_cents, v.net_cents].map(escape).join(","))].join("\r\n") + "\r\n";
    s.type("text/csv; charset=utf-8").attachment("relatorio-centros-custo.csv").send("\ufeff" + csv);
  }));
  app.get(
    "/api/finance/history/:resourceType/:id",
    route(async (r, s) => {
      const resourceType = z.enum(["bill", "payment", "integration"]).parse(r.params.resourceType);
      const id = z.uuid().parse(r.params.id);
      const params = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [p] = await q("SELECT can_access('finance') AS allowed");
          requireThat(p.allowed, 403, "Consulta financeira não autorizada.");
          const [count] = await q("SELECT count(*)::int AS total FROM treasury_change_log WHERE church_id=$1 AND resource_type=$2 AND resource_id=$3", [r.church, resourceType, id]);
          const items = await q("SELECT id,action,reason,actor_name,changed_at FROM treasury_change_log WHERE church_id=$1 AND resource_type=$2 AND resource_id=$3 ORDER BY changed_at DESC LIMIT $4 OFFSET $5", [r.church, resourceType, id, params.pageSize, (params.page - 1) * params.pageSize]);
          return { items, total: Number(count.total), page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)) };
        }),
      );
    }),
  );
  app.post(
    "/api/finance/integrations/:id/retry",
    route(async (r, s) => {
      await write(r);
      await db.transaction(async (q) => {
        const rows = await q(
          "UPDATE integration_jobs SET status='pending',available_at=now(),locked_until=NULL WHERE id=$1 AND church_id=$2 AND status IN ('failed','pending') RETURNING id",
          [z.uuid().parse(r.params.id), r.church],
        );
        requireThat(
          rows.length,
          409,
          "Operação não encontrada ou já em execução.",
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "integration.retry-requested",
          String(r.params.id),
        );
        await logChange(q, r, "integration", String(r.params.id), "retry-requested", "Nova tentativa solicitada pela tesouraria.");
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/finance/parties",
    route(async (r, s) => {
      await write(r);
      const b = z
        .object({
          name: z.string().trim().min(2).max(150),
          kind: z.enum(["supplier", "customer", "other"]),
        })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [p] = await q(
            "INSERT INTO financial_parties(church_id,name,kind) VALUES($1,$2,$3) RETURNING *",
            [r.church, b.name, b.kind],
          );
          await audit(q, r.actor.id, r.church, "treasury.party-created", p.id);
          return p;
        }),
      );
    }),
  );
  app.post(
    "/api/finance/bank-accounts",
    route(async (r, s) => {
      await write(r);
      const b = z
        .object({
          name: z.string().trim().min(2).max(120),
          code: z.string().regex(/^[a-z0-9_-]{2,40}$/),
        })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [a] = await q(
            "INSERT INTO accounts(church_id,name,code,kind) VALUES($1,$2,$3,'asset') RETURNING *",
            [r.church, b.name, b.code],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "treasury.account-created",
            a.id,
          );
          return a;
        }),
      );
    }),
  );
  const signedCents = (value: string) => {
    const normalized = value.trim().replace(",", ".");
    requireThat(/^-?\d{1,9}(\.\d{1,2})?$/.test(normalized), 400, "Valor do extrato inválido.");
    const negative = normalized.startsWith("-");
    const absolute = negative ? normalized.slice(1) : normalized;
    const [whole, fraction = ""] = absolute.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    requireThat(Number.isSafeInteger(amount) && amount > 0, 400, "Valor do extrato inválido.");
    return negative ? -amount : amount;
  };
  app.post(
    "/api/finance/bank-accounts/:id/statements/import",
    route(async (r, s) => {
      await write(r);
      const b = z.object({ fileName: z.string().trim().min(1).max(180), csv: z.string().min(1).max(400000) }).parse(r.body);
      const accountId = z.uuid().parse(r.params.id);
      const sourceHash = createHash("sha256").update(b.csv).digest("hex");
      let rows: Record<string, string>[];
      try {
        rows = parseCsv(b.csv, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: false }) as Record<string, string>[];
      } catch {
        rows = [];
      }
      requireThat(rows.length > 0 && rows.length <= 5000, 400, "O extrato deve ter entre 1 e 5.000 linhas.");
      const required = ["external_id", "date", "description", "amount"];
      requireThat(required.every((column) => Object.hasOwn(rows[0], column)), 400, "Use as colunas external_id,date,description,amount.");
      const seen = new Set<string>();
      const parsed = rows.map((row) => {
        const externalId = String(row.external_id ?? "").trim();
        const description = String(row.description ?? "").trim();
        const date = String(row.date ?? "").trim();
        requireThat(/^[^\r\n]{1,180}$/.test(externalId) && !seen.has(externalId), 400, "Identificador externo ausente ou repetido.");
        seen.add(externalId);
        requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date), 400, "Data do extrato deve estar em YYYY-MM-DD.");
        requireThat(description.length >= 1 && description.length <= 240, 400, "Descrição do extrato inválida.");
        return { externalId, description, date, amount: signedCents(String(row.amount ?? "")) };
      });
      const result = await scoped(r, async (q) => {
        requireThat((await q("SELECT 1 FROM accounts WHERE id=$1 AND church_id=$2 AND kind='asset'", [accountId, r.church])).length, 404, "Conta bancária não encontrada.");
        const [existing] = await q("SELECT id,file_name,created_at FROM bank_statement_imports WHERE church_id=$1 AND account_id=$2 AND source_hash=$3", [r.church, accountId, sourceHash]);
        if (existing) return { import: existing, inserted: 0, duplicate: true };
        const [statement] = await q("INSERT INTO bank_statement_imports(church_id,account_id,file_name,source_hash,imported_by) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name,created_at", [r.church, accountId, b.fileName, sourceHash, r.actor.id]);
        for (const row of parsed)
          await q("INSERT INTO bank_statement_lines(church_id,import_id,account_id,external_id,occurred_on,description,amount_cents) VALUES($1,$2,$3,$4,$5,$6,$7)", [r.church, statement.id, accountId, row.externalId, row.date, row.description, row.amount]);
        await audit(q, r.actor.id, r.church, "treasury.statement-imported", statement.id);
        return { import: statement, inserted: parsed.length, duplicate: false };
      });
      s.status(result.duplicate ? 200 : 201).json(result);
    }),
  );
  app.post(
    "/api/finance/statement-lines/:id/match",
    route(async (r, s) => {
      await write(r);
      const lineId = z.uuid().parse(r.params.id), b = z.object({ paymentId: z.uuid() }).parse(r.body);
      await db.transaction(async (q) => {
        const [line] = await q("SELECT l.*,i.account_id AS imported_account_id FROM bank_statement_lines l JOIN bank_statement_imports i ON i.id=l.import_id WHERE l.id=$1 AND l.church_id=$2 FOR UPDATE", [lineId, r.church]);
        requireThat(line, 404, "Linha do extrato não encontrada.");
        requireThat(line.status === "unmatched", 409, "Esta linha já foi conciliada ou ignorada.");
        const [payment] = await q("SELECT p.*,b.description FROM treasury_payments p JOIN treasury_bills b ON b.id=p.bill_id WHERE p.id=$1 AND p.church_id=$2", [b.paymentId, r.church]);
        requireThat(payment, 404, "Baixa não encontrada.");
        requireThat(payment.account_id === line.imported_account_id, 409, "A baixa pertence a outra conta bancária.");
        requireThat(Math.abs(Number(line.amount_cents)) === Number(payment.amount_cents), 409, "Valor do extrato diverge da baixa.");
        const [matched] = await q("UPDATE bank_statement_lines SET status='matched',matched_payment_id=$2,matched_by=$3,matched_at=now() WHERE id=$1 RETURNING *", [lineId, b.paymentId, r.actor.id]);
        await audit(q, r.actor.id, r.church, "treasury.statement-line-matched", lineId);
        await logChange(q, r, "payment", b.paymentId, "statement-matched", `Linha ${line.external_id} conciliada.`);
        return matched;
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/finance/statement-lines/:id/ignore",
    route(async (r, s) => {
      await write(r);
      const lineId = z.uuid().parse(r.params.id), b = z.object({ reason: z.string().trim().min(3).max(300) }).parse(r.body);
      await db.transaction(async (q) => {
        const [line] = await q("SELECT id,status FROM bank_statement_lines WHERE id=$1 AND church_id=$2 FOR UPDATE", [lineId, r.church]);
        requireThat(line, 404, "Linha do extrato não encontrada.");
        requireThat(line.status === "unmatched", 409, "Esta linha já foi conciliada ou ignorada.");
        await q("UPDATE bank_statement_lines SET status='ignored' WHERE id=$1", [lineId]);
        await audit(q, r.actor.id, r.church, "treasury.statement-line-ignored", lineId);
        await logChange(q, r, "integration", lineId, "statement-ignored", b.reason);
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/finance/bills",
    route(async (r, s) => {
      await write(r);
      const b = z
          .object({
            kind: z.enum(["payable", "receivable"]),
            description: z.string().trim().min(3).max(200),
            amount: z.string(),
            dueOn: z.iso.date(),
            partyId: z.uuid().optional(),
            fundId: z.uuid().optional(),
            costCenterId: z.uuid().optional(),
          })
          .parse(r.body),
        amount = cents(b.amount);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [v] = await q(
            "INSERT INTO treasury_bills(church_id,kind,description,amount_cents,due_on,party_id,fund_id,cost_center_id,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
            [
              r.church,
              b.kind,
              b.description,
              amount,
              b.dueOn,
              b.partyId ?? null,
              b.fundId ?? null,
              b.costCenterId ?? null,
              r.actor.id,
            ],
          );
          await logChange(q, r, "bill", v.id, "requested", "Solicitação de conta criada.");
          await audit(q, r.actor.id, r.church, "treasury.bill-requested", v.id);
          return v;
        }),
      );
    }),
  );
  const attachmentSchema = z.object({
    name: z.string().trim().min(1).max(150).regex(/^[^\\/\r\n]+$/),
    content: z.string().max(350000),
    mediaType: z.enum(["application/pdf", "text/plain", "image/png", "image/jpeg"]),
  });
  const validateAttachment = (body: unknown) => {
    const b = attachmentSchema.parse(body);
    const bytes = Buffer.from(b.content, "base64");
    requireThat(bytes.length > 0 && bytes.length <= 250000, 400, "Anexo deve ter até 250 KB.");
    const magic = b.mediaType === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : b.mediaType === "image/png"
        ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
        : b.mediaType === "image/jpeg"
          ? bytes.subarray(0, 3).toString("hex") === "ffd8ff"
          : true;
    requireThat(magic, 400, "Conteúdo incompatível com o tipo do anexo.");
    return { ...b, bytes };
  };
  for (const target of ["bill", "payment"] as const) {
    app.post(
      `/api/finance/${target === "bill" ? "bills" : "payments"}/:id/attachments`,
      route(async (r, s) => {
        await write(r);
        const targetId = z.uuid().parse(r.params.id), b = validateAttachment(r.body);
        s.status(201).json(await scoped(r, async (q) => {
          const table = target === "bill" ? "treasury_bills" : "treasury_payments";
          const [resource] = await q(`SELECT id FROM ${table} WHERE id=$1 AND church_id=$2`, [targetId, r.church]);
          requireThat(resource, 404, target === "bill" ? "Conta não encontrada." : "Baixa não encontrada.");
          const column = target === "bill" ? "bill_id" : "payment_id";
          const [v] = await q(
            `INSERT INTO treasury_attachments(church_id,${column},name,media_type,bytes,encrypted_content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,${column},name,media_type,bytes,created_at`,
            [r.church, targetId, b.name, b.mediaType, b.bytes.length, encrypt(b.content, options.key), r.actor.id],
          );
          await audit(q, r.actor.id, r.church, `treasury.${target}-attachment-added`, v.id);
          await logChange(q, r, target, targetId, "attachment-added", `Anexo ${b.name}`);
          return v;
        }));
      }),
    );
  }
  app.get(
    "/api/finance/attachments/:id",
    route(async (r, s) => {
      const attachmentId = z.uuid().parse(r.params.id);
      const [a] = await scoped(r, async (q) => {
        const [permission] = await q("SELECT can_access('finance') AND finance_scope_allowed() AS allowed");
        requireThat(permission.allowed, 403, "Consulta financeira não autorizada.");
        return q("SELECT * FROM treasury_attachments WHERE id=$1 AND church_id=$2", [attachmentId, r.church]);
      });
      requireThat(a, 404, "Anexo financeiro não encontrado.");
      await db.transaction((q) => audit(q, r.actor.id, r.church, "treasury.attachment-downloaded", attachmentId));
      s.type(a.media_type).attachment(a.name).send(Buffer.from(decrypt(a.encrypted_content, options.key), "base64"));
    }),
  );
  app.post(
    "/api/finance/bills/:id/decision",
    route(async (r, s) => {
      await admin(r);
      const b = z
        .object({
          status: z.enum(["approved", "rejected"]),
          reason: z.string().trim().min(5).max(500),
        })
        .parse(r.body);
      await db.transaction(async (q) => {
        const [v] = await q(
          "SELECT * FROM treasury_bills WHERE id=$1 AND church_id=$2 FOR UPDATE",
          [z.uuid().parse(r.params.id), r.church],
        );
        requireThat(
          v && v.status === "draft",
          409,
          "Solicitação não está aguardando aprovação.",
        );
        requireThat(
          v.requested_by !== r.actor.id,
          403,
          "O solicitante não pode aprovar nem rejeitar sua própria solicitação.",
        );
        await q(
          "UPDATE treasury_bills SET status=$2,approved_by=$3,approval_reason=$4 WHERE id=$1",
          [v.id, b.status, r.actor.id, b.reason],
        );
        await logChange(q, r, "bill", v.id, b.status, b.reason);
        await audit(q, r.actor.id, r.church, `treasury.bill-${b.status}`, v.id);
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/finance/bills/:id/payments",
    route(async (r, s) => {
      await write(r);
      const b = z
          .object({
            amount: z.string(),
            accountId: z.uuid(),
            date: z.iso.date(),
            requestKey: z.uuid(),
          })
          .parse(r.body),
        amount = cents(b.amount),
        id = z.uuid().parse(r.params.id);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [v] = await q(
            "SELECT * FROM treasury_bills WHERE id=$1 AND church_id=$2 FOR UPDATE",
            [id, r.church],
          );
          requireThat(
            v && v.status === "approved",
            409,
            "A conta precisa de aprovação independente.",
          );
          await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `${r.church}:${b.requestKey}`,
          ]);
          const [prior] = await q(
            "SELECT * FROM treasury_payments WHERE church_id=$1 AND request_key=$2",
            [r.church, b.requestKey],
          );
          if (prior) {
            requireThat(
              prior.bill_id === id &&
                Number(prior.amount_cents) === amount &&
                prior.account_id === b.accountId &&
                prior.occurred_on === b.date,
              409,
              "Tentativa já utilizada em outro pagamento.",
            );
            return prior;
          }
          requireThat(
            Number(v.paid_cents) + amount <= Number(v.amount_cents),
            409,
            "O valor supera o saldo da conta.",
          );
          requireThat(
            (
              await q(
                "SELECT 1 FROM accounts WHERE id=$1 AND church_id=$2 AND kind='asset'",
                [b.accountId, r.church],
              )
            ).length,
            400,
            "Conta bancária inválida.",
          );
          const [opposite] = await q(
            "SELECT id FROM accounts WHERE church_id=$1 AND code=$2",
            [r.church, v.kind === "payable" ? "operations" : "giving"],
          );
          requireThat(opposite, 409, "Plano de contas incompleto.");
          const n = v.kind === "payable" ? -amount : amount;
          const entry = await postEntry(
            q,
            r.church,
            v.description,
            [
              { account: b.accountId, amount: n },
              { account: opposite.id, amount: -n },
            ],
            { fund: v.fund_id, costCenter: v.cost_center_id, date: b.date },
          );
          const [p] = await q(
            "INSERT INTO treasury_payments(church_id,bill_id,amount_cents,request_key,occurred_on,entry_id,executed_by,account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
            [
              r.church,
              id,
              amount,
              b.requestKey,
              b.date,
              entry.id,
              r.actor.id,
              b.accountId,
            ],
          );
          await q(
            "UPDATE treasury_bills SET paid_cents=paid_cents+$2 WHERE id=$1",
            [id, amount],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "treasury.payment-recorded",
            p.id,
          );
          await logChange(q, r, "payment", p.id, "recorded", "Baixa financeira registrada.");
          return p;
        }),
      );
    }),
  );
  app.post(
    "/api/finance/payments/:id/reverse",
    route(async (r, s) => {
      await write(r);
      const id = z.uuid().parse(r.params.id);
      await db.transaction(async (q) => {
        const [initial] = await q(
          "SELECT bill_id FROM treasury_payments WHERE id=$1 AND church_id=$2",
          [id, r.church],
        );
        requireThat(initial, 404, "Baixa não encontrada.");
        await q("SELECT id FROM treasury_bills WHERE id=$1 FOR UPDATE", [
          initial.bill_id,
        ]);
        const [p] = await q(
          "SELECT p.*,b.fund_id,b.cost_center_id FROM treasury_payments p JOIN treasury_bills b ON b.id=p.bill_id WHERE p.id=$1 AND p.church_id=$2 FOR UPDATE",
          [id, r.church],
        );
        requireThat(!p.reversal_entry_id, 409, "Baixa já estornada.");
        const lines = await q(
          "SELECT account_id,amount_cents FROM journal_lines WHERE entry_id=$1",
          [p.entry_id],
        );
        const reversal = await postEntry(
          q,
          r.church,
          "Estorno de baixa",
          lines.map((l) => ({
            account: l.account_id,
            amount: -Number(l.amount_cents),
          })),
          {
            reversal: p.entry_id,
            fund: p.fund_id,
            costCenter: p.cost_center_id,
          },
        );
        await q(
          "UPDATE treasury_payments SET reversal_entry_id=$2 WHERE id=$1",
          [id, reversal.id],
        );
        await q(
          "UPDATE treasury_bills SET paid_cents=paid_cents-$2 WHERE id=$1",
          [p.bill_id, p.amount_cents],
        );
        await logChange(q, r, "payment", id, "reversed", "Baixa estornada com lançamento de reversão.");
        await audit(q, r.actor.id, r.church, "treasury.payment-reversed", id);
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/finance/budgets",
    route(async (r, s) => {
      await admin(r);
      const b = z
        .object({
          costCenterId: z.uuid(),
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
          amount: z.string(),
        })
        .parse(r.body);
      await db.transaction(async (q) => {
        await q(
          "INSERT INTO treasury_budgets(church_id,cost_center_id,month,amount_cents) VALUES($1,$2,$3,$4) ON CONFLICT(church_id,cost_center_id,month) DO UPDATE SET amount_cents=excluded.amount_cents",
          [r.church, b.costCenterId, b.month, cents(b.amount)],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "treasury.budget-updated",
          b.month,
        );
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/finance/accountant-export",
    route(async (r, s) => {
      const rows = await scoped(r, (q) =>
        q(
          "SELECT e.id,e.occurred_on,e.description,a.code,a.name,l.amount_cents,e.reversal_of,e.fund_id,e.cost_center_id FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN accounts a ON a.id=l.account_id ORDER BY e.occurred_on,e.id,l.id",
        ),
      );
      const escape = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@\-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const columns = [
        "id",
        "occurred_on",
        "description",
        "code",
        "name",
        "amount_cents",
        "reversal_of",
        "fund_id",
        "cost_center_id",
      ];
      s.type("text/csv")
        .attachment("lancamentos-contador.csv")
        .send(
          "\ufeff" +
            columns.join(";") +
            "\r\n" +
            rows
              .map((r) =>
                columns
                  .map((c) =>
                    c === "amount_cents" ? String(r[c]) : escape(r[c]),
                  )
                  .join(";"),
              )
              .join("\r\n"),
        );
    }),
  );
}
