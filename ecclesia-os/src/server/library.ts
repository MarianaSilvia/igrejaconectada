import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { audit } from "./seed.js";
import { requireThat } from "./security.js";
type R = Request & { actor: Row; church: string };

export function libraryRoutes(app: Express, db: Database) {
  const route = (fn: (r: R, s: Response) => Promise<unknown>) =>
    (r: Request, s: Response, n: NextFunction) => Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => db.transaction(fn, { actor: r.actor.id, church: r.church });
  const manage = async (r: R, write = false) => {
    const [p] = await scoped(r, q => q("SELECT local_role() IN ('admin','secretary') AS allowed"));
    const [c] = await db.transaction(q => q("SELECT 'library'=ANY(modules) AS entitled FROM churches WHERE id=$1", [r.church]));
    requireThat(c?.entitled, 403, "Módulo de biblioteca não habilitado.");
    requireThat(p.allowed, 403, "Secretaria ou administração obrigatória.");
    if (write) requireThat(r.actor.mfa, 403, "Confirme MFA.");
  };

  app.get("/api/library", route(async (r, s) => {
    await manage(r);
    const hasPaging = Object.keys(r.query).length > 0;
    const params = z.object({
      itemPage: z.coerce.number().int().min(1).default(1),
      itemPageSize: z.coerce.number().int().min(1).max(100).default(25),
      loanPage: z.coerce.number().int().min(1).default(1),
      loanPageSize: z.coerce.number().int().min(1).max(100).default(25),
      q: z.string().trim().max(120).default(""),
      loanStatus: z.enum(["all", "open", "overdue", "returned", "cancelled"]).default("all"),
    }).parse(r.query);
    const result = await scoped(r, async q => {
      const itemWhere: string[] = [];
      const itemArgs: unknown[] = [];
      if (params.q) {
        itemWhere.push("(i.title ILIKE $1 OR i.item_code ILIKE $1 OR i.author ILIKE $1 OR i.category ILIKE $1)");
        itemArgs.push("%" + params.q + "%");
      }
      const itemWhereSql = itemWhere.length ? "WHERE " + itemWhere.join(" AND ") : "";
      const loanWhere = params.loanStatus !== "all" ? "WHERE l.status=$1" : "";
      const loanArgs = params.loanStatus !== "all" ? [params.loanStatus] : [];
      const itemSql = "SELECT i.* FROM library_items i " + itemWhereSql + " ORDER BY i.active DESC,i.title LIMIT $" + (itemArgs.length + 1) + " OFFSET $" + (itemArgs.length + 2);
      const loanSql = "SELECT l.*,i.title,i.item_code,p.name AS person_name FROM library_loans l JOIN library_items i ON i.id=l.item_id JOIN people p ON p.id=l.person_id " + loanWhere + " ORDER BY l.status,l.due_on LIMIT $" + (loanArgs.length + 1) + " OFFSET $" + (loanArgs.length + 2);
      const [items, loans, itemCount, loanCount, loanableItems] = await Promise.all([
        q(itemSql, [...itemArgs, params.itemPageSize, (params.itemPage - 1) * params.itemPageSize]),
        q(loanSql, [...loanArgs, params.loanPageSize, (params.loanPage - 1) * params.loanPageSize]),
        q("SELECT count(*)::int AS total FROM library_items i " + itemWhereSql, itemArgs),
        q("SELECT count(*)::int AS total FROM library_loans l " + loanWhere, loanArgs),
        q("SELECT * FROM library_items WHERE active=true AND available_copies>0 ORDER BY title"),
      ]);
      return {
        items,
        loans,
        loanableItems,
        itemPagination: { total: itemCount[0].total, page: params.itemPage, pageSize: params.itemPageSize, pages: Math.max(1, Math.ceil(Number(itemCount[0].total) / params.itemPageSize)) },
        loanPagination: { total: loanCount[0].total, page: params.loanPage, pageSize: params.loanPageSize, pages: Math.max(1, Math.ceil(Number(loanCount[0].total) / params.loanPageSize)) },
      };
    });
    s.json(hasPaging ? result : { items: result.items, loans: result.loans });
  }));

  app.post("/api/library/items", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ itemCode: z.string().trim().min(1).max(60), title: z.string().trim().min(2).max(200), author: z.string().max(160).default(""), category: z.string().max(100).default(""), totalCopies: z.number().int().min(1).max(10000).default(1), location: z.string().max(160).default(""), notes: z.string().max(1000).default("") }).parse(r.body);
    s.status(201).json(await scoped(r, async q => { const [v] = await q("INSERT INTO library_items(church_id,item_code,title,author,category,total_copies,available_copies,location,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9) RETURNING *", [r.church, b.itemCode, b.title, b.author, b.category, b.totalCopies, b.location, b.notes, r.actor.id]); await audit(q, r.actor.id, r.church, "library.item-created", v.id); return v; }));
  }));

  app.post("/api/library/loans", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ itemId: z.uuid(), personId: z.uuid(), dueOn: z.iso.date(), notes: z.string().max(500).default("") }).parse(r.body);
    s.status(201).json(await scoped(r, async q => { const [item] = await q("SELECT * FROM library_items WHERE id=$1 AND active=true FOR UPDATE", [b.itemId]); requireThat(item, 404, "Item de biblioteca não encontrado."); requireThat(Number(item.available_copies) > 0, 409, "Não há exemplares disponíveis."); const [person] = await q("SELECT id FROM people WHERE id=$1", [b.personId]); requireThat(person, 404, "Pessoa não encontrada."); const [v] = await q("INSERT INTO library_loans(church_id,item_id,person_id,due_on,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [r.church, b.itemId, b.personId, b.dueOn, b.notes, r.actor.id]); await q("UPDATE library_items SET available_copies=available_copies-1 WHERE id=$1", [b.itemId]); await audit(q, r.actor.id, r.church, "library.loan-created", v.id); return v; }));
  }));

  app.patch("/api/library/loans/:id", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ status: z.enum(["returned", "overdue", "cancelled"]), returnedOn: z.iso.date().nullable().default(null) }).parse(r.body);
    s.json(await scoped(r, async q => { const [loan] = await q("SELECT * FROM library_loans WHERE id=$1 FOR UPDATE", [r.params.id]); requireThat(loan, 404, "Empréstimo não encontrado."); if ((b.status === "returned" || b.status === "cancelled") && loan.status === "open") await q("UPDATE library_items SET available_copies=available_copies+1 WHERE id=$1", [loan.item_id]); const [v] = await q("UPDATE library_loans SET status=$2,returned_on=$3 WHERE id=$1 RETURNING *", [r.params.id, b.status, b.returnedOn]); await audit(q, r.actor.id, r.church, "library.loan-updated", v.id); return v; }));
  }));
}

