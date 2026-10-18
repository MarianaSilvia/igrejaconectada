import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Row } from "./db.js";
import { audit } from "./seed.js";
import { requireThat, encrypt } from "./security.js";

type R = Request & { actor: Row; church: string };
const route =
  (fn: (r: R, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as R, s)).catch(n);
const id = z.uuid();
export function groupRoutes(app: Express, db: Database, key?: Buffer) {
  app.get(
    "/api/public/catalog/:churchId",
    route(async (r, s) => {
      const churchId = id.parse(r.params.churchId);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          kind: z.enum(["all", "events", "groups", "courses"]).default("all"),
        })
        .parse(r.query);
      const result = await db.transaction(async (q) => {
        const [church] = await q("SELECT id,name FROM churches WHERE id=$1", [
          churchId,
        ]);
        requireThat(church, 404, "Igreja não encontrada.");
        const offset = (params.page - 1) * params.pageSize;
        const include = (name: "events" | "groups" | "courses") =>
          params.kind === "all" || params.kind === name;
        const [events, groups, courses, eventCount, groupCount, courseCount] =
          await Promise.all([
            include("events")
              ? q(
                  "SELECT id,title,kind,starts_at,ends_at,capacity,registration_deadline,price_cents,certificate_enabled FROM church_events WHERE church_id=$1 AND status='scheduled' AND public_registration=true AND (registration_deadline IS NULL OR registration_deadline>now()) ORDER BY starts_at LIMIT $2 OFFSET $3",
                  [churchId, params.pageSize, offset],
                )
              : Promise.resolve([]),
            include("groups")
              ? q(
                  "SELECT id,name,weekday,public_description,public_contact FROM cells WHERE church_id=$1 AND public_directory=true ORDER BY name LIMIT $2 OFFSET $3",
                  [churchId, params.pageSize, offset],
                )
              : Promise.resolve([]),
            include("courses")
              ? q(
                  "SELECT cl.id,cl.name,cl.starts_on,cl.ends_on,cl.capacity,c.name AS course_name,c.description,c.completion_percent FROM education_classes cl JOIN education_courses c ON c.id=cl.course_id WHERE cl.church_id=$1 AND cl.status='open' AND cl.public_catalog=true ORDER BY cl.starts_on,c.name LIMIT $2 OFFSET $3",
                  [churchId, params.pageSize, offset],
                )
              : Promise.resolve([]),
            include("events")
              ? q(
                  "SELECT count(*)::int AS total FROM church_events WHERE church_id=$1 AND status='scheduled' AND public_registration=true AND (registration_deadline IS NULL OR registration_deadline>now())",
                  [churchId],
                )
              : Promise.resolve([{ total: 0 }]),
            include("groups")
              ? q(
                  "SELECT count(*)::int AS total FROM cells WHERE church_id=$1 AND public_directory=true",
                  [churchId],
                )
              : Promise.resolve([{ total: 0 }]),
            include("courses")
              ? q(
                  "SELECT count(*)::int AS total FROM education_classes WHERE church_id=$1 AND status='open' AND public_catalog=true",
                  [churchId],
                )
              : Promise.resolve([{ total: 0 }]),
          ]);
        const pagination = (total: number) => ({
          total,
          page: params.page,
          pageSize: params.pageSize,
          pages: Math.max(1, Math.ceil(total / params.pageSize)),
        });
        return {
          church,
          events,
          groups,
          courses,
          eventPagination: pagination(Number(eventCount[0].total)),
          groupPagination: pagination(Number(groupCount[0].total)),
          coursePagination: pagination(Number(courseCount[0].total)),
          kind: params.kind,
        };
      });
      s.json(result);
    }),
  );
  app.get(
    "/api/public/groups/:churchId",
    route(async (r, s) => {
      const churchId = id.parse(r.params.churchId);
      const data = await db.transaction(async (q) => {
        const [church] = await q("SELECT id,name FROM churches WHERE id=$1", [
          churchId,
        ]);
        requireThat(church, 404, "Igreja não encontrada.");
        const groups = await q(
          "SELECT id,name,weekday,public_description,public_contact FROM cells WHERE church_id=$1 AND public_directory=true ORDER BY name",
          [churchId],
        );
        return { church, groups };
      });
      s.json(data);
    }),
  );
  app.post(
    "/api/public/groups/:cellId/interest",
    route(async (r, s) => {
      const cellId = id.parse(r.params.cellId);
      const b = z
        .object({
          name: z.string().trim().min(2).max(160),
          email: z.email(),
          phone: z.string().trim().max(30).default(""),
          message: z.string().trim().max(500).default(""),
          consent: z.literal(true),
        })
        .parse(r.body);
      const out = await db.transaction(async (q) => {
        const [cell] = await q(
          "SELECT id,church_id FROM cells WHERE id=$1 AND public_directory=true",
          [cellId],
        );
        requireThat(cell, 404, "Grupo não disponível para inscrição.");
        const [existing] = await q(
          "SELECT id,status FROM cell_interest_requests WHERE cell_id=$1 AND lower(email)=lower($2) AND status<>'closed' ORDER BY created_at DESC LIMIT 1",
          [cellId, b.email],
        );
        if (existing) return existing;
        const [request] = await q(
          "INSERT INTO cell_interest_requests(church_id,cell_id,name,email,phone,message,consent_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING id,status,created_at",
          [
            cell.church_id,
            cellId,
            b.name,
            b.email.toLowerCase(),
            b.phone,
            b.message,
          ],
        );
        if (key) {
          const [owner] = await q(
            "SELECT user_id FROM memberships WHERE church_id=$1 ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END LIMIT 1",
            [cell.church_id],
          );
          if (owner)
            await q(
              "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+2,$3,$3,'group_interest',$4) ON CONFLICT DO NOTHING",
              [
                cell.church_id,
                encrypt(`Contato · ${b.name}`, key),
                owner.user_id,
                request.id,
              ],
            );
        }
        return request;
      });
      s.status(201).json(out);
    }),
  );
  app.get(
    "/api/group-interests",
    route(async (r, s) => {
      const [allowed] = await db.transaction(
        (q) => q("SELECT can_access('people') AS allowed"),
        { actor: r.actor.id, church: r.church },
      );
      requireThat(allowed.allowed, 403, "Permissão da secretaria necessária.");
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          status: z
            .enum(["all", "pending", "contacted", "closed"])
            .default("all"),
        })
        .parse(r.query);
      s.json(
        await db.transaction(
          async (q) => {
            const filter = params.status === "all" ? "" : " AND status=$2";
            const values =
              params.status === "all" ? [r.church] : [r.church, params.status];
            const [total] = await q(
              `SELECT count(*)::int AS total FROM cell_interest_requests WHERE church_id=$1${filter}`,
              values,
            );
            const limitIndex = values.length + 1,
              offsetIndex = values.length + 2;
            const items = await q(
              `SELECT i.*,c.name AS cell_name FROM cell_interest_requests i JOIN cells c ON c.id=i.cell_id WHERE i.church_id=$1${filter} ORDER BY i.status,i.created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
              [...values, params.pageSize, (params.page - 1) * params.pageSize],
            );
            return {
              items,
              total: Number(total.total),
              page: params.page,
              pageSize: params.pageSize,
              pages: Math.max(
                1,
                Math.ceil(Number(total.total) / params.pageSize),
              ),
              status: params.status,
            };
          },
          { actor: r.actor.id, church: r.church },
        ),
      );
    }),
  );
  app.get(
    "/api/group-interests/export.csv",
    route(async (r, s) => {
      const [allowed] = await db.transaction(
        (q) => q("SELECT can_access('people') AS allowed"),
        { actor: r.actor.id, church: r.church },
      );
      requireThat(allowed.allowed, 403, "Permissão da secretaria necessária.");
      const status = z
        .enum(["all", "pending", "contacted", "closed"])
        .parse(String(r.query.status ?? "all"));
      const rows = await db.transaction(
        (q) =>
          q(
            "SELECT i.name,i.email,i.phone,c.name AS cell_name,i.status,i.created_at FROM cell_interest_requests i JOIN cells c ON c.id=i.cell_id WHERE i.church_id=$1 AND ($2='all' OR i.status=$2) ORDER BY i.status,i.created_at DESC",
            [r.church, status],
          ),
        { actor: r.actor.id, church: r.church },
      );
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv =
        [
          "name,email,phone,cell_name,status,created_at",
          ...rows.map((v) =>
            [v.name, v.email, v.phone, v.cell_name, v.status, v.created_at]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      s.type("text/csv; charset=utf-8")
        .attachment("interesses-grupos.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.patch(
    "/api/group-interests/:id",
    route(async (r, s) => {
      const b = z
        .object({ status: z.enum(["pending", "contacted", "closed"]) })
        .parse(r.body);
      const out = await db.transaction(
        async (q) => {
          const [allowed] = await q(
            "SELECT can_access('people',true) AS allowed",
          );
          requireThat(
            allowed.allowed,
            403,
            "Permissão da secretaria necessária.",
          );
          const [v] = await q(
            "UPDATE cell_interest_requests SET status=$2 WHERE id=$1 RETURNING *",
            [id.parse(r.params.id), b.status],
          );
          requireThat(v, 404, "Solicitação não encontrada.");
          await audit(q, r.actor.id, r.church, "cell-interest.updated", v.id);
          return v;
        },
        { actor: r.actor.id, church: r.church },
      );
      if (b.status === "closed")
        await db.transaction((q) =>
          q(
            "UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='group_interest' AND source_id=$1 AND status IN ('open','in_progress')",
            [out.id],
          ),
        );
      s.json(out);
    }),
  );
}
