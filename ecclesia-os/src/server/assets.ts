import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { audit } from "./seed.js";
import { requireThat } from "./security.js";

type R = Request & { actor: Row; church: string };

export function assetRoutes(app: Express, db: Database) {
  const route = (fn: (r: R, s: Response) => Promise<unknown>) =>
    (r: Request, s: Response, n: NextFunction) => Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) =>
    db.transaction(fn, { actor: r.actor.id, church: r.church });
  const manage = async (r: R, write = false) => {
    const [p] = await scoped(r, q => q("SELECT local_role() IN ('admin','secretary') AS allowed"));
    const [church] = await db.transaction(q => q("SELECT 'assets'=ANY(modules) AS entitled FROM churches WHERE id=$1", [r.church]));
    requireThat(church?.entitled, 403, "Módulo de patrimônio não habilitado.");
    requireThat(p.allowed, 403, "Secretaria ou administração obrigatória.");
    if (write) requireThat(r.actor.mfa, 403, "Confirme MFA.");
  };

  app.get("/api/assets", route(async (r, s) => {
    await manage(r);
    const hasPaging = Object.keys(r.query).length > 0;
    const params = z.object({
      assetPage: z.coerce.number().int().min(1).default(1),
      assetPageSize: z.coerce.number().int().min(1).max(100).default(25),
      maintenancePage: z.coerce.number().int().min(1).default(1),
      maintenancePageSize: z.coerce.number().int().min(1).max(100).default(25),
      q: z.string().trim().max(120).default(""),
      status: z.enum(["all", "available", "in_use", "maintenance", "disposed"]).default("all"),
      maintenanceStatus: z.enum(["all", "open", "in_progress", "completed", "cancelled"]).default("all"),
    }).parse(r.query);
    const result = await scoped(r, async q => {
      const assetWhere: string[] = [];
      const assetArgs: unknown[] = [];
      if (params.status !== "all") {
        assetWhere.push(`a.status=$${assetArgs.length + 1}`);
        assetArgs.push(params.status);
      }
      if (params.q) {
        const index = assetArgs.length + 1;
        assetWhere.push(`(a.name ILIKE $${index} OR a.asset_tag ILIKE $${index} OR a.kind ILIKE $${index} OR a.location ILIKE $${index})`);
        assetArgs.push(`%${params.q}%`);
      }
      const assetWhereSql = assetWhere.length ? `WHERE ${assetWhere.join(" AND ")}` : "";
      const maintenanceWhere = params.maintenanceStatus !== "all" ? "WHERE m.status=$1" : "";
      const maintenanceArgs = params.maintenanceStatus !== "all" ? [params.maintenanceStatus] : [];
      const [assets, maintenance, assetCount, maintenanceCount] = await Promise.all([
        q(`SELECT a.*,p.name AS responsible_name FROM church_assets a LEFT JOIN people p ON p.id=a.responsible_person_id ${assetWhereSql} ORDER BY a.status,a.name LIMIT $${assetArgs.length + 1} OFFSET $${assetArgs.length + 2}`, [...assetArgs, params.assetPageSize, (params.assetPage - 1) * params.assetPageSize]),
        q(`SELECT m.*,a.name AS asset_name,a.asset_tag FROM asset_maintenance m JOIN church_assets a ON a.id=m.asset_id ${maintenanceWhere} ORDER BY m.status,m.scheduled_on NULLS LAST,m.created_at DESC LIMIT $${maintenanceArgs.length + 1} OFFSET $${maintenanceArgs.length + 2}`, [...maintenanceArgs, params.maintenancePageSize, (params.maintenancePage - 1) * params.maintenancePageSize]),
        q(`SELECT count(*)::int AS total FROM church_assets a ${assetWhereSql}`, assetArgs),
        q(`SELECT count(*)::int AS total FROM asset_maintenance m ${maintenanceWhere}`, maintenanceArgs),
      ]);
      return {
        assets,
        maintenance,
        assetPagination: { total: assetCount[0].total, page: params.assetPage, pageSize: params.assetPageSize, pages: Math.max(1, Math.ceil(Number(assetCount[0].total) / params.assetPageSize)) },
        maintenancePagination: { total: maintenanceCount[0].total, page: params.maintenancePage, pageSize: params.maintenancePageSize, pages: Math.max(1, Math.ceil(Number(maintenanceCount[0].total) / params.maintenancePageSize)) },
      };
    });
    s.json(hasPaging ? result : { assets: result.assets, maintenance: result.maintenance });
  }));

  app.post("/api/assets", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ assetTag: z.string().trim().min(1).max(60), name: z.string().trim().min(2).max(160), kind: z.string().trim().min(2).max(80), location: z.string().max(160).default(""), status: z.enum(["available", "in_use", "maintenance", "disposed"]).default("available"), responsiblePersonId: z.uuid().nullable().default(null), acquiredOn: z.iso.date().nullable().default(null), valueCents: z.number().int().min(0).nullable().default(null), notes: z.string().max(1000).default("") }).parse(r.body);
    s.status(201).json(await scoped(r, async q => { const [v] = await q("INSERT INTO church_assets(church_id,asset_tag,name,kind,location,status,responsible_person_id,acquired_on,value_cents,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [r.church, b.assetTag, b.name, b.kind, b.location, b.status, b.responsiblePersonId, b.acquiredOn, b.valueCents, b.notes, r.actor.id]); await audit(q, r.actor.id, r.church, "asset.created", v.id); return v; }));
  }));

  app.patch("/api/assets/:id", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ status: z.enum(["available", "in_use", "maintenance", "disposed"]).optional(), location: z.string().max(160).optional(), responsiblePersonId: z.uuid().nullable().optional(), notes: z.string().max(1000).optional() }).refine(v => Object.keys(v).length > 0).parse(r.body);
    s.json(await scoped(r, async q => { const [v] = await q("UPDATE church_assets SET status=COALESCE($2,status),location=COALESCE($3,location),responsible_person_id=COALESCE($4,responsible_person_id),notes=COALESCE($5,notes) WHERE id=$1 RETURNING *", [r.params.id, b.status ?? null, b.location ?? null, b.responsiblePersonId ?? null, b.notes ?? null]); requireThat(v, 404, "Patrimônio não encontrado."); await audit(q, r.actor.id, r.church, "asset.updated", v.id); return v; }));
  }));

  app.post("/api/assets/:id/maintenance", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ description: z.string().trim().min(2).max(300), scheduledOn: z.iso.date().nullable().default(null), costCents: z.number().int().min(0).default(0), notes: z.string().max(1000).default("") }).parse(r.body);
    s.status(201).json(await scoped(r, async q => { const [asset] = await q("SELECT id FROM church_assets WHERE id=$1", [r.params.id]); requireThat(asset, 404, "Patrimônio não encontrado."); const [v] = await q("INSERT INTO asset_maintenance(church_id,asset_id,description,scheduled_on,cost_cents,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [r.church, r.params.id, b.description, b.scheduledOn, b.costCents, b.notes, r.actor.id]); await q("UPDATE church_assets SET status='maintenance' WHERE id=$1", [r.params.id]); await audit(q, r.actor.id, r.church, "asset.maintenance-created", v.id); return v; }));
  }));

  app.patch("/api/assets/maintenance/:id", route(async (r, s) => {
    await manage(r, true);
    const b = z.object({ status: z.enum(["open", "in_progress", "completed", "cancelled"]), completedOn: z.iso.date().nullable().default(null) }).parse(r.body);
    s.json(await scoped(r, async q => { const [v] = await q("UPDATE asset_maintenance SET status=$2,completed_on=$3 WHERE id=$1 RETURNING *", [r.params.id, b.status, b.completedOn]); requireThat(v, 404, "Manutenção não encontrada."); if (b.status === "completed" || b.status === "cancelled") await q("UPDATE church_assets SET status='available' WHERE id=$1", [v.asset_id]); await audit(q, r.actor.id, r.church, "asset.maintenance-updated", v.id); return v; }));
  }));
}
