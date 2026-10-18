import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { audit } from "./seed.js";
import { requireThat } from "./security.js";

type R = Request & { actor: Row; church: string };
export function worshipRoutes(app: Express, db: Database) {
  const route = (fn: (r: R, s: Response) => Promise<unknown>) =>
    (r: Request, s: Response, n: NextFunction) => Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => db.transaction(fn, { actor: r.actor.id, church: r.church });
  const manage = async (r: R) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    const [v] = await scoped(r, (q) => q("SELECT local_role() IN ('admin','secretary') AND can_access('people',true) AS allowed"));
    requireThat(v.allowed && r.actor.mfa, 403, "Secretaria ou administração com MFA obrigatória.");
  };
  const id = z.uuid();
  app.get("/api/worship", route(async (r, s) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    const params = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).parse(r.query);
    const result: any = await scoped(r, async (q) => {
      const [role] = await q("SELECT local_role() IS NOT NULL AS allowed,local_role() IN ('admin','secretary') AS manage");
      requireThat(role.allowed, 403, "Vínculo local obrigatório.");
      const [serviceTotal] = await q("SELECT count(*)::int AS total FROM worship_services");
      const result = {
        services: await q("SELECT * FROM worship_services ORDER BY scheduled_on DESC,starts_at NULLS LAST,id DESC LIMIT $1 OFFSET $2", [params.pageSize, (params.page - 1) * params.pageSize]),
        servicePagination: { total: Number(serviceTotal.total), page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(serviceTotal.total) / params.pageSize)) },
        items: await q("SELECT i.* FROM worship_items i ORDER BY i.service_id,i.position"),
        rehearsals: await q("SELECT * FROM worship_rehearsals ORDER BY starts_at"),
        files: await q("SELECT * FROM worship_files ORDER BY created_at DESC"),
        schedules: await q("SELECT * FROM schedules WHERE church_id=$1 ORDER BY starts_at", [r.church]),
        volunteers: [],
        canManage: role.manage,
      };
      return result;
    });
    const people = await scoped(r, (q) => q("SELECT p.user_id AS id,p.name FROM people p WHERE p.church_id=$1 AND p.user_id IS NOT NULL ORDER BY p.name", [r.church]));
    result.items = result.items.map((item: Row) => ({ ...item, leader_name: people.find((person: Row) => person.id === item.leader_id)?.name ?? null }));
    result.schedules = result.schedules.map((schedule: Row) => ({ ...schedule, volunteer_name: people.find((person: Row) => person.id === schedule.user_id)?.name ?? null }));
    if (result.canManage) result.volunteers = people;
    s.json(result);
  }));
  app.post("/api/worship/services", route(async (r, s) => {
    await manage(r);
    const b = z.object({ title: z.string().trim().min(3).max(180), scheduledOn: z.iso.date(), startsAt: z.iso.datetime({ offset: true }).nullable().default(null), endsAt: z.iso.datetime({ offset: true }).nullable().default(null), eventId: id.nullable().default(null) }).parse(r.body);
    if (b.startsAt && b.endsAt) requireThat(Date.parse(b.endsAt) > Date.parse(b.startsAt), 400, "O fim precisa ocorrer depois do início.");
    s.status(201).json(await scoped(r, async (q) => { const [v] = await q("INSERT INTO worship_services(church_id,event_id,title,scheduled_on,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [r.church,b.eventId,b.title,b.scheduledOn,b.startsAt,b.endsAt,r.actor.id]); await audit(q,r.actor.id,r.church,"worship.service-created",v.id); return v; }));
  }));
  app.post("/api/worship/services/:id/items", route(async (r, s) => {
    await manage(r);
    const serviceId = id.parse(r.params.id); const b = z.object({ position: z.number().int().positive(), kind: z.enum(["song","reading","prayer","message","offering","announcement","other"]), title: z.string().trim().min(1).max(180), leaderId: id.nullable().default(null), durationMinutes: z.number().int().min(1).max(240).nullable().default(null), notes: z.string().max(2000).default("") }).parse(r.body);
    if (b.leaderId) requireThat((await db.transaction((q) => q("SELECT 1 FROM memberships WHERE church_id=$1 AND user_id=$2", [r.church,b.leaderId]))).length, 400, "Responsável fora da igreja.");
    s.status(201).json(await scoped(r, async (q) => { const [service] = await q("SELECT id,event_id FROM worship_services WHERE id=$1",[serviceId]); requireThat(service,404,"Celebração não encontrada."); if (service.event_id && b.leaderId) requireThat((await q("SELECT 1 FROM schedules WHERE church_id=$1 AND event_id=$2 AND user_id=$3 AND response<>'declined'",[r.church,service.event_id,b.leaderId])).length,409,"O responsável precisa estar escalado no evento vinculado."); const [v] = await q("INSERT INTO worship_items(church_id,service_id,position,kind,title,leader_id,duration_minutes,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[r.church,serviceId,b.position,b.kind,b.title,b.leaderId,b.durationMinutes,b.notes]); await audit(q,r.actor.id,r.church,"worship.item-created",v.id); return v; }));
  }));
  app.patch("/api/worship/items/:id", route(async (r, s) => {
    await manage(r); const itemId = id.parse(r.params.id); const b = z.object({ position: z.number().int().positive(), title: z.string().trim().min(1).max(180).optional(), notes: z.string().max(2000).optional() }).parse(r.body);
    s.json(await scoped(r, async (q) => { const [v] = await q("UPDATE worship_items SET position=COALESCE($3,position),title=COALESCE($4,title),notes=COALESCE($5,notes) WHERE id=$1 AND church_id=$2 RETURNING *",[itemId,r.church,b.position,b.title,b.notes]); requireThat(v,404,"Item não encontrado."); await audit(q,r.actor.id,r.church,"worship.item-updated",itemId); return v; }));
  }));
  app.post("/api/worship/services/:id/rehearsals", route(async (r, s) => {
    await manage(r); const serviceId = id.parse(r.params.id); const b = z.object({ startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), location: z.string().max(180).default(""), notes: z.string().max(2000).default("") }).parse(r.body); requireThat(Date.parse(b.endsAt)>Date.parse(b.startsAt),400,"O fim precisa ocorrer depois do início.");
    s.status(201).json(await scoped(r, async(q)=>{ const [v]=await q("INSERT INTO worship_rehearsals(church_id,service_id,starts_at,ends_at,location,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[r.church,serviceId,b.startsAt,b.endsAt,b.location,b.notes]); await audit(q,r.actor.id,r.church,"worship.rehearsal-created",v.id); return v; }));
  }));
  app.post("/api/worship/services/:id/files", route(async (r, s) => {
    await manage(r); const serviceId=id.parse(r.params.id); const b=z.object({name:z.string().trim().min(1).max(180),url:z.string().trim().min(1).max(1000),kind:z.enum(["repertoire","slide","lyric","material","other"]).default("material")}).parse(r.body);
    s.status(201).json(await scoped(r,async(q)=>{const [v]=await q("INSERT INTO worship_files(church_id,service_id,name,url,kind,added_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[r.church,serviceId,b.name,b.url,b.kind,r.actor.id]); await audit(q,r.actor.id,r.church,"worship.file-added",v.id); return v;}));
  }));
}
