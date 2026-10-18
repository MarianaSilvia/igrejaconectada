import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { z } from "zod";
import { audit } from "./seed.js";
import { requireThat, encrypt } from "./security.js";
import { notifyTaskAssignee } from "./agenda.js";

type R = Request & { actor: Row; church: string };
const route =
  (fn: (r: R, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as R, s)).catch(n);
const kind = z.enum(["people", "events", "tasks", "communication"]);
const filters = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.string().max(30).default("all"),
  channel: z.enum(["all", "portal", "email", "sms"]).default("all"),
  campusId: z.uuid().nullable().default(null),
  cellId: z.uuid().nullable().default(null),
  teamId: z.uuid().nullable().default(null),
  scope: z.string().max(30).default("all"),
  assignedTo: z.union([z.uuid(), z.null()]).default(null),
  due: z.enum(["all", "overdue"]).default("all"),
});

export function savedViewRoutes(app: Express, db: Database, key: Buffer) {
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) =>
    db.transaction(fn, { actor: r.actor.id, church: r.church });
  const permit = async (r: R, write = false) => {
    const [v] = await scoped(r, (q) =>
      q("SELECT can_access('people',$1) AS allowed", [write]),
    );
    requireThat(v.allowed, 403, "Permissão para listas salvas necessária.");
  };
  app.get(
    "/api/saved-views",
    route(async (r, s) => {
      await permit(r);
      const k = kind.parse(String(r.query.kind ?? "people"));
      s.json(
        await scoped(r, (q) =>
          q(
            "SELECT id,name,kind,filters,shared,created_by,created_at FROM saved_views WHERE kind=$1 AND (shared=true OR created_by=actor_id()) ORDER BY shared DESC,name",
            [k],
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/smart-lists",
    route(async (r, s) => {
      await permit(r);
      const [role] = await scoped(r, (q) => q("SELECT local_role() AS role"));
      requireThat(
        ["admin", "secretary"].includes(role.role),
        403,
        "Lista operacional disponível somente à equipe local.",
      );
      const starts = z.iso.datetime().safeParse(String(r.query.startsAt ?? ""));
      const ends = z.iso.datetime().safeParse(String(r.query.endsAt ?? ""));
      const start = starts.success ? starts.data : new Date().toISOString();
      const end = ends.success
        ? ends.data
        : new Date(Date.now() + 7 * 86400000).toISOString();
      const params = z
        .object({
          visitorPage: z.coerce.number().int().min(1).default(1),
          visitorPageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await db.transaction(async (q) => ({
          visitorsWithoutContact: await q(
            "SELECT id,name,email,phone,status FROM people WHERE church_id=$1 AND status='visitor' AND COALESCE(NULLIF(trim(email),''),'')='' AND COALESCE(NULLIF(trim(phone),''),'')='' ORDER BY name LIMIT $2 OFFSET $3",
            [
              r.church,
              params.visitorPageSize,
              (params.visitorPage - 1) * params.visitorPageSize,
            ],
          ),
          visitorsWithoutContactPagination: await (async () => {
            const [row] = await q(
              "SELECT count(*)::int AS total FROM people WHERE church_id=$1 AND status='visitor' AND COALESCE(NULLIF(trim(email),''),'')='' AND COALESCE(NULLIF(trim(phone),''),'')=''",
              [r.church],
            );
            return {
              total: Number(row.total),
              page: params.visitorPage,
              pageSize: params.visitorPageSize,
              pages: Math.max(
                1,
                Math.ceil(Number(row.total) / params.visitorPageSize),
              ),
            };
          })(),
          overdueTasks: await q(
            "SELECT count(*)::int AS count FROM operational_tasks WHERE church_id=$1 AND status IN ('open','in_progress') AND due_on<CURRENT_DATE",
            [r.church],
          ),
          visitorContactTasks: await q(
            "SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('open','in_progress'))::int AS open,count(*) FILTER(WHERE status='done')::int AS done,count(*) FILTER(WHERE assigned_to IS NULL)::int AS unassigned FROM operational_tasks WHERE church_id=$1 AND source_type='visitor_contact'",
            [r.church],
          ),
          visitorContactPerformance: await q(
            "SELECT t.assigned_to,COALESCE(u.name,'Sem responsável') AS responsible,count(*)::int AS total,count(*) FILTER(WHERE t.status IN ('open','in_progress'))::int AS open,count(*) FILTER(WHERE t.status='done')::int AS done,count(*) FILTER(WHERE t.status IN ('open','in_progress') AND t.due_on<CURRENT_DATE)::int AS overdue,ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.completed_at,completed.at)-t.created_at))/86400.0)::numeric,1) AS average_days FROM operational_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN LATERAL (SELECT MIN(a.created_at) FILTER(WHERE a.action='task.done') AS at FROM audit_events a WHERE a.church_id=t.church_id AND a.resource_id=t.id::text) completed ON true WHERE t.church_id=$1 AND t.source_type='visitor_contact' GROUP BY t.assigned_to,u.name ORDER BY responsible",
            [r.church],
          ),
          availableVolunteers: await q(
            "SELECT DISTINCT p.user_id AS id,p.name FROM people p JOIN ministry_members mm ON mm.user_id=p.user_id AND mm.church_id=$1 JOIN memberships m ON m.user_id=p.user_id AND m.church_id=$1 WHERE p.church_id=$1 AND p.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM volunteer_unavailability v WHERE v.user_id=p.user_id AND v.church_id=$1 AND v.starts_at<$3::timestamptz AND v.ends_at>$2::timestamptz) AND NOT EXISTS(SELECT 1 FROM schedules s2 WHERE s2.user_id=p.user_id AND s2.church_id=$1 AND s2.response='accepted' AND s2.starts_at<$3::timestamptz AND s2.ends_at>$2::timestamptz) ORDER BY p.name",
            [r.church, start, end],
          ),
          interval: { startsAt: start, endsAt: end },
        })),
      );
    }),
  );
  app.get(
    "/api/smart-lists/visitor-contact-performance.csv",
    route(async (r, s) => {
      await permit(r);
      const [role] = await scoped(r, (q) => q("SELECT local_role() AS role"));
      requireThat(
        ["admin", "secretary"].includes(role.role),
        403,
        "Exportação disponível somente à equipe local.",
      );
      const rows = await db.transaction((q) =>
        q(
          "SELECT t.assigned_to,COALESCE(u.name,'Sem responsável') AS responsible,count(*)::int AS total,count(*) FILTER(WHERE t.status IN ('open','in_progress'))::int AS open,count(*) FILTER(WHERE t.status='done')::int AS done,count(*) FILTER(WHERE t.status IN ('open','in_progress') AND t.due_on<CURRENT_DATE)::int AS overdue,ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.completed_at,completed.at)-t.created_at))/86400.0)::numeric,1) AS average_days FROM operational_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN LATERAL (SELECT MIN(a.created_at) FILTER(WHERE a.action='task.done') AS at FROM audit_events a WHERE a.church_id=t.church_id AND a.resource_id=t.id::text) completed ON true WHERE t.church_id=$1 AND t.source_type='visitor_contact' GROUP BY t.assigned_to,u.name ORDER BY responsible",
          [r.church],
        ),
      );
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv =
        [
          "assigned_to,responsible,total,open,overdue,done,average_days",
          ...rows.map((row) =>
            [
              row.assigned_to,
              row.responsible,
              row.total,
              row.open,
              row.overdue,
              row.done,
              row.average_days,
            ]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      s.type("text/csv; charset=utf-8")
        .attachment("desempenho-contatos.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.post(
    "/api/smart-lists/visitors-without-contact/tasks",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({
          personIds: z.array(z.uuid()).min(1).max(200),
          dueOn: z.iso.date(),
          assignedTo: z.uuid().nullable().default(null),
        })
        .parse(r.body);
      if (b.assignedTo) {
        const [allowed] = await db.transaction((q) =>
          q("SELECT role FROM memberships WHERE church_id=$1 AND user_id=$2", [
            r.church,
            b.assignedTo,
          ]),
        );
        requireThat(
          ["admin", "secretary"].includes(String(allowed?.role ?? "")),
          400,
          "Responsável sem permissão para acompanhar pessoas.",
        );
      }
      const people = await scoped(r, (q) =>
        q(
          "SELECT id,name FROM people WHERE church_id=$1 AND id=ANY($2::uuid[]) AND status='visitor' AND COALESCE(NULLIF(trim(email),''),'')='' AND COALESCE(NULLIF(trim(phone),''),'')=''",
          [r.church, b.personIds],
        ),
      );
      requireThat(
        people.length === b.personIds.length,
        400,
        "A lista contém pessoa fora do conjunto de visitantes sem contato.",
      );
      const result = await db.transaction(async (q) => {
        const created: string[] = [];
        for (const person of people) {
          const [task] = await q(
            "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,$3,$4,$5,$6,'visitor_contact',$4::uuid) ON CONFLICT DO NOTHING RETURNING id",
            [
              r.church,
              encrypt(`Contato com visitante · ${person.name}`, key),
              b.dueOn,
              person.id,
              b.assignedTo ?? r.actor.id,
              r.actor.id,
            ],
          );
          if (task) {
            created.push(task.id);
            await audit(
              q,
              r.actor.id,
              r.church,
              "smart-list.visitor-contact-task-created",
              task.id,
            );
            await notifyTaskAssignee(
              q,
              r.church,
              task.id,
              b.assignedTo ?? r.actor.id,
              `Contato com visitante · ${person.name}`,
              b.dueOn,
              r.actor.id,
            );
          }
        }
        return { created, skipped: people.length - created.length };
      });
      s.status(201).json(result);
    }),
  );
  app.post(
    "/api/saved-views",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({
          name: z.string().trim().min(2).max(100),
          kind,
          filters,
          shared: z.boolean().default(false),
        })
        .parse(r.body);
      const row = await scoped(r, async (q) => {
        const [v] = await q(
          "INSERT INTO saved_views(church_id,kind,name,filters,shared,created_by) VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING id,name,kind,filters,shared",
          [
            r.church,
            b.kind,
            b.name,
            JSON.stringify(b.filters),
            b.shared,
            r.actor.id,
          ],
        );
        await audit(q, r.actor.id, r.church, "saved-view.created", v.id);
        return v;
      });
      s.status(201).json(row);
    }),
  );
  app.patch(
    "/api/saved-views/:id",
    route(async (r, s) => {
      await permit(r, true);
      const id = z.uuid().parse(r.params.id);
      const b = z
        .object({
          name: z.string().trim().min(2).max(100),
          filters,
          shared: z.boolean(),
        })
        .parse(r.body);
      const row = await scoped(r, async (q) => {
        const [v] = await q(
          "UPDATE saved_views SET name=$2,filters=$3::jsonb,shared=$4 WHERE id=$1 AND created_by=actor_id() RETURNING id,name,kind,filters,shared",
          [id, b.name, JSON.stringify(b.filters), b.shared],
        );
        requireThat(
          v,
          404,
          "Lista salva não encontrada ou sem autorização para editar.",
        );
        await audit(q, r.actor.id, r.church, "saved-view.updated", id);
        return v;
      });
      s.json(row);
    }),
  );
  app.delete(
    "/api/saved-views/:id",
    route(async (r, s) => {
      await permit(r, true);
      const id = z.uuid().parse(r.params.id);
      await scoped(r, async (q) => {
        const rows = await q(
          "DELETE FROM saved_views WHERE id=$1 AND created_by=actor_id() RETURNING id",
          [id],
        );
        requireThat(rows.length, 404, "Lista salva não encontrada.");
        await audit(q, r.actor.id, r.church, "saved-view.deleted", id);
      });
      s.json({ ok: true });
    }),
  );
}
