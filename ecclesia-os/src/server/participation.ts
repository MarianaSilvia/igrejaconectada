import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { z } from "zod";
import { audit } from "./seed.js";
import { requireThat, encrypt } from "./security.js";
import { randomUUID } from "node:crypto";
import { newTxid } from "./finance.js";
import { todayInChurch } from "../shared/dates.js";
import { notifyTaskAssignee } from "./agenda.js";

type R = Request & { actor: Row; church: string };
const route =
  (fn: (r: R, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as R, s)).catch(n);
const uuid = z.uuid();
const eventBody = z
  .object({
    eventId: uuid,
    personId: uuid.optional(),
    guestName: z.string().trim().min(2).max(160).optional(),
    guestEmail: z.email().optional(),
    guestPhone: z.string().trim().max(30).optional(),
    couponCode: z.string().trim().max(40).optional(),
    formData: z.record(z.string(), z.string().max(1000)).default({}),
  })
  .refine(
    (v) => v.personId || (v.guestName && v.guestEmail),
    "Informe a pessoa ou os dados do visitante.",
  );

function validateRegistrationData(
  fields: unknown,
  input: Record<string, string>,
) {
  const list = Array.isArray(fields) ? fields : [];
  const byKey = new Map(list.map((field) => [String(field.key), field]));
  for (const key of Object.keys(input))
    requireThat(byKey.has(key), 400, "Campo de inscrição não reconhecido.");
  const output: Record<string, string> = {};
  for (const field of list) {
    const key = String(field.key);
    const value = String(input[key] ?? "").trim();
    requireThat(
      !field.required || value.length > 0,
      400,
      `Preencha o campo ${field.label}.`,
    );
    if (!value) continue;
    if (field.type === "email")
      requireThat(
        z.email().safeParse(value).success,
        400,
        `Informe um e-mail válido em ${field.label}.`,
      );
    if (field.type === "number")
      requireThat(
        Number.isFinite(Number(value)),
        400,
        `Informe um número válido em ${field.label}.`,
      );
    if (field.type === "select")
      requireThat(
        Array.isArray(field.options) && field.options.includes(value),
        400,
        `Escolha uma opção válida em ${field.label}.`,
      );
    output[key] = value;
  }
  return output;
}

async function resolveCoupon(
  q: Query,
  church: string,
  eventId: string,
  code: string | undefined,
  priceCents: number,
) {
  if (!code || priceCents <= 0)
    return { coupon: null, discountCents: 0, amountCents: priceCents };
  const [coupon] = await q(
    "SELECT * FROM event_coupons WHERE church_id=$1 AND event_id=$2 AND code=upper($3) AND active FOR UPDATE",
    [church, eventId, code],
  );
  requireThat(coupon, 400, "Cupom inválido ou indisponível.");
  requireThat(
    !coupon.expires_on || String(coupon.expires_on) >= todayInChurch(),
    400,
    "Este cupom expirou.",
  );
  requireThat(
    coupon.max_uses === null ||
      Number(coupon.used_count) < Number(coupon.max_uses),
    400,
    "Este cupom atingiu o limite de usos.",
  );
  const discountCents = Math.min(
    priceCents,
    coupon.discount_kind === "percent"
      ? Math.floor((priceCents * Number(coupon.value_cents)) / 100)
      : Number(coupon.value_cents),
  );
  return { coupon, discountCents, amountCents: priceCents - discountCents };
}

async function promoteWaitlisted(
  q: Query,
  church: string,
  eventId: string,
  actorId: string,
) {
  const [event] = await q(
    "SELECT capacity FROM church_events WHERE id=$1 AND church_id=$2",
    [eventId, church],
  );
  if (!event || event.capacity === null) return;
  const [active] = await q(
    "SELECT count(*)::int AS total FROM event_registrations WHERE event_id=$1 AND status IN ('registered','attended')",
    [eventId],
  );
  const spots = Math.max(0, Number(event.capacity) - Number(active.total));
  for (let index = 0; index < spots; index++) {
    const [next] = await q(
      "SELECT id FROM event_registrations WHERE event_id=$1 AND status='waitlisted' ORDER BY created_at,id FOR UPDATE LIMIT 1",
      [eventId],
    );
    if (!next) break;
    await q("UPDATE event_registrations SET status='registered' WHERE id=$1", [
      next.id,
    ]);
    await audit(
      q,
      actorId,
      church,
      "event-registration.waitlist-promoted",
      next.id,
    );
  }
}

async function queueEventRefund(
  q: Query,
  church: string,
  registrationId: string,
  eventTitle: string,
  personId: string | null,
  assignee: string,
  actorId: string,
  key: Buffer,
) {
  const [task] = await q(
    "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,source_type,source_id) VALUES($1,'finance',$2,CURRENT_DATE+2,$3,$4,$5,'event_refund',$6) ON CONFLICT DO NOTHING RETURNING id,due_on",
    [
      church,
      encrypt(`Solicitar devolução · ${eventTitle}`, key),
      personId,
      assignee,
      actorId,
      registrationId,
    ],
  );
  if (task) {
    await notifyTaskAssignee(
      q,
      church,
      task.id,
      assignee,
      `Solicitar devolução · ${eventTitle}`,
      String(task.due_on),
      actorId,
    );
    await audit(
      q,
      actorId,
      church,
      "event-registration.refund-requested",
      registrationId,
    );
  }
  return Boolean(task);
}

export async function startTriggeredWorkflows(
  q: Query,
  church: string,
  trigger: string,
  personId: string,
  actorId: string,
  sourceKey = personId,
) {
  await q(
    "INSERT INTO workflow_trigger_jobs(church_id,trigger,person_id,source_key,actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(church_id,trigger,person_id,source_key) DO NOTHING",
    [church, trigger, personId, sourceKey, actorId],
  );
}

export async function processWorkflowTriggerJobs(
  db: Database,
  limit = 10,
  key?: Buffer,
) {
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const lease = randomUUID();
    const job = await db.transaction(async (q) => {
      const [row] = await q(
        "SELECT * FROM workflow_trigger_jobs WHERE (status='pending' AND available_at<=now()) OR (status='running' AND locked_until<now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
      );
      if (!row) return null;
      const [claimed] = await q(
        "UPDATE workflow_trigger_jobs SET status='running',attempts=attempts+1,locked_until=now()+interval '2 minutes',lease_token=$2 WHERE id=$1 RETURNING *",
        [row.id, lease],
      );
      return claimed;
    });
    if (!job) break;
    try {
      await db.transaction(async (q) => {
        const definitions = await q(
          "SELECT d.* FROM workflow_definitions d WHERE d.church_id=$1 AND d.trigger=$2 AND d.active",
          [job.church_id, job.trigger],
        );
        for (const definition of definitions) {
          const [step] = await q(
            "SELECT due_days,title FROM workflow_steps WHERE definition_id=$1 AND position=0",
            [definition.id],
          );
          const [instance] = await q(
            "INSERT INTO workflow_instances(church_id,definition_id,person_id,owner_id,due_on,created_by) VALUES($1,$2,$3,$4,CURRENT_DATE+($5::int),$6) RETURNING id",
            [
              job.church_id,
              definition.id,
              job.person_id,
              job.actor_id,
              step?.due_days ?? 0,
              job.actor_id,
            ],
          );
          if (key)
            await q(
              "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,workflow_instance_id) VALUES($1,'people',$2,CURRENT_DATE+($3::int),$4,$5,$6,$7)",
              [
                job.church_id,
                encrypt(
                  `${definition.name} · ${step?.title ?? "Acompanhar processo"}`,
                  key,
                ),
                step?.due_days ?? 0,
                job.person_id,
                job.actor_id,
                job.actor_id,
                instance.id,
              ],
            );
          await q(
            "INSERT INTO workflow_instance_events(church_id,instance_id,actor_id,to_step,note) VALUES($1,$2,$3,0,$4)",
            [
              job.church_id,
              instance.id,
              job.actor_id,
              `Iniciado automaticamente por ${job.trigger}`,
            ],
          );
          await audit(
            q,
            job.actor_id,
            job.church_id,
            "workflow.triggered",
            instance.id,
          );
        }
        await q(
          "UPDATE workflow_trigger_jobs SET status='done',completed_at=now(),locked_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2",
          [job.id, lease],
        );
      });
      processed++;
    } catch {
      await db.transaction((q) =>
        q(
          "UPDATE workflow_trigger_jobs SET status=CASE WHEN attempts>=12 THEN 'failed' ELSE 'pending' END,available_at=now()+interval '30 seconds',locked_until=NULL,last_error='Falha ao iniciar o workflow.' WHERE id=$1 AND lease_token=$2",
          [job.id, lease],
        ),
      );
    }
  }
  return processed;
}

async function createWorkflowTask(
  db: Database,
  key: Buffer | undefined,
  church: string,
  instanceId: string,
  actorId: string,
) {
  if (!key) return;
  await db.transaction(async (q) => {
    const [instance] = await q(
      "SELECT wi.*,d.name AS workflow_name,s.title AS step_title,s.due_days FROM workflow_instances wi JOIN workflow_definitions d ON d.id=wi.definition_id LEFT JOIN workflow_steps s ON s.definition_id=wi.definition_id AND s.position=wi.current_step WHERE wi.id=$1 AND wi.church_id=$2",
      [instanceId, church],
    );
    if (!instance) return;
    const [task] = await q(
      "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,workflow_instance_id) VALUES($1,'people',$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id",
      [
        church,
        encrypt(
          `${instance.workflow_name} · ${instance.step_title ?? "Acompanhar processo"}`,
          key,
        ),
        instance.due_on,
        instance.person_id,
        instance.owner_id ?? actorId,
        actorId,
        instance.id,
      ],
    );
    if (task)
      await notifyTaskAssignee(
        q,
        church,
        task.id,
        instance.owner_id ?? actorId,
        `${instance.workflow_name} · ${instance.step_title ?? "Acompanhar processo"}`,
        String(instance.due_on),
        actorId,
      );
  });
}

export function startWorkflowWorker(db: Database, key?: Buffer) {
  let running: Promise<unknown> | null = null;
  const tick = () => {
    if (!running)
      running = processWorkflowTriggerJobs(db, 10, key)
        .catch(() => {})
        .finally(() => {
          running = null;
        });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
  };
}

export function participationRoutes(app: Express, db: Database, key?: Buffer) {
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) =>
    db.transaction(fn, { actor: r.actor.id, church: r.church });
  const people = async (r: R, write = false) => {
    const [p] = await scoped(r, (q) =>
      q("SELECT can_access('people',$1) AS allowed", [write]),
    );
    requireThat(p.allowed, 403, "Permissão da secretaria necessária.");
  };
  app.get(
    "/api/public/events/:id",
    route(async (r, s) => {
      const id = uuid.parse(r.params.id);
      const result = await db.transaction(async (q) => {
        const [event] = await q(
          "SELECT id,title,kind,starts_at,ends_at,capacity,waitlist_enabled,registration_deadline,certificate_enabled,price_cents,registration_fields FROM church_events WHERE id=$1 AND status='scheduled' AND public_registration=true",
          [id],
        );
        requireThat(event, 404, "Inscrição pública indisponível.");
        requireThat(
          !event.registration_deadline ||
            new Date(event.registration_deadline).getTime() > Date.now(),
          409,
          "As inscrições para este evento foram encerradas.",
        );
        const [count] = await q(
          "SELECT count(*) FILTER(WHERE status IN ('registered','attended'))::int AS registered,count(*) FILTER(WHERE status='waitlisted')::int AS waitlisted FROM event_registrations WHERE event_id=$1",
          [id],
        );
        return {
          ...event,
          registeredCount: count.registered,
          waitlistedCount: count.waitlisted,
        };
      });
      s.json(result);
    }),
  );
  app.get(
    "/api/participation",
    route(async (r, s) => {
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      const events = await scoped(r, async (q) => {
        const [count] = await q(
          "SELECT count(*)::int AS total FROM church_events WHERE status='scheduled'",
        );
        const items = await q(
          "SELECT e.*,count(er.id) FILTER(WHERE er.status IN ('registered','attended'))::int AS registered_count,count(er.id) FILTER(WHERE er.status='waitlisted')::int AS waitlisted_count FROM church_events e LEFT JOIN event_registrations er ON er.event_id=e.id WHERE e.status='scheduled' GROUP BY e.id ORDER BY e.starts_at LIMIT $1 OFFSET $2",
          [params.pageSize, (params.page - 1) * params.pageSize],
        );
        return {
          items,
          total: count.total,
          page: params.page,
          pageSize: params.pageSize,
          pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)),
        };
      });
      const [p] = await scoped(r, (q) =>
        q("SELECT can_access('people') AS can_manage", []),
      );
      s.json({ events, canManage: Boolean(p.can_manage) });
    }),
  );
  app.get(
    "/api/participation/reports",
    route(async (r, s) => {
      await people(r);
      const today = todayInChurch();
      const from = z.iso
        .date()
        .parse(String(r.query.from ?? `${today.slice(0, 4)}-01-01`));
      const to = z.iso.date().parse(String(r.query.to ?? today));
      requireThat(
        from <= to,
        400,
        "O início do relatório deve preceder o fim.",
      );
      s.json(
        await scoped(r, async (q) => {
          const [peopleSummary] = await q(
            "SELECT count(*) FILTER(WHERE status<>'inactive')::int AS active_people,count(*) FILTER(WHERE status='visitor')::int AS visitors FROM people WHERE church_id=$1",
            [r.church],
          );
          const [cellSummary] = await q(
            "SELECT count(DISTINCT m.id)::int AS meetings,count(a.person_id)::int AS attendance_records,count(a.person_id) FILTER(WHERE a.present)::int AS present_records,COALESCE(sum(m.visitors),0)::int AS visitors FROM meetings m LEFT JOIN attendance a ON a.meeting_id=m.id WHERE m.church_id=$1 AND m.held_on BETWEEN $2::date AND $3::date",
            [r.church, from, to],
          );
          const [eventSummary] = await q(
            "SELECT count(DISTINCT e.id)::int AS events,count(er.id)::int AS registrations,count(er.id) FILTER(WHERE er.status='attended')::int AS attended,count(er.id) FILTER(WHERE er.status='waitlisted')::int AS waitlisted FROM church_events e LEFT JOIN event_registrations er ON er.event_id=e.id WHERE e.church_id=$1 AND e.starts_at::date BETWEEN $2::date AND $3::date",
            [r.church, from, to],
          );
          const [educationSummary] = await q(
            "SELECT count(DISTINCT c.id)::int AS classes,count(DISTINCT en.id)::int AS enrollments,count(ea.enrollment_id)::int AS attendance_records,count(ea.enrollment_id) FILTER(WHERE ea.present)::int AS present_records FROM education_classes c LEFT JOIN education_enrollments en ON en.class_id=c.id AND en.status<>'cancelled' LEFT JOIN education_sessions es ON es.class_id=c.id AND es.held_on BETWEEN $2::date AND $3::date LEFT JOIN education_attendance ea ON ea.session_id=es.id AND ea.enrollment_id=en.id WHERE c.church_id=$1 AND c.starts_on<=$3::date AND (c.ends_on IS NULL OR c.ends_on>=$2::date)",
            [r.church, from, to],
          );
          const [ministrySummary] = await q(
            "SELECT count(*)::int AS schedules,count(*) FILTER(WHERE response='accepted')::int AS accepted,count(*) FILTER(WHERE response='pending')::int AS pending,count(*) FILTER(WHERE response='declined')::int AS declined FROM schedules WHERE church_id=$1 AND starts_at::date BETWEEN $2::date AND $3::date",
            [r.church, from, to],
          );
          const [workflowSummary] = await q(
            "SELECT count(*) FILTER(WHERE status IN ('open','in_progress'))::int AS open_tasks,count(*) FILTER(WHERE status IN ('open','in_progress') AND due_on<CURRENT_DATE)::int AS overdue_tasks FROM operational_tasks WHERE church_id=$1 AND scope IN ('people','cells')",
            [r.church],
          );
          const meetingsByMonth = await q(
            "SELECT to_char(date_trunc('month',held_on),'YYYY-MM') AS month,count(*)::int AS meetings,COALESCE(sum(visitors),0)::int AS visitors FROM meetings WHERE church_id=$1 AND held_on BETWEEN $2::date AND $3::date GROUP BY 1 ORDER BY 1",
            [r.church, from, to],
          );
          const eventsByMonth = await q(
            "SELECT to_char(date_trunc('month',starts_at),'YYYY-MM') AS month,count(*)::int AS events FROM church_events WHERE church_id=$1 AND starts_at::date BETWEEN $2::date AND $3::date GROUP BY 1 ORDER BY 1",
            [r.church, from, to],
          );
          const attendanceRate = (present: unknown, total: unknown) =>
            Number(total)
              ? Math.round((Number(present) * 1000) / Number(total)) / 10
              : null;
          return {
            from,
            to,
            people: peopleSummary,
            cells: {
              ...cellSummary,
              attendance_rate: attendanceRate(
                cellSummary.present_records,
                cellSummary.attendance_records,
              ),
            },
            events: eventSummary,
            education: {
              ...educationSummary,
              attendance_rate: attendanceRate(
                educationSummary.present_records,
                educationSummary.attendance_records,
              ),
            },
            ministry: ministrySummary,
            workflows: workflowSummary,
            meetingsByMonth,
            eventsByMonth,
          };
        }),
      );
    }),
  );
  app.get(
    "/api/participation/reports.csv",
    route(async (r, s) => {
      await people(r);
      const today = todayInChurch();
      const from = z.iso
        .date()
        .parse(String(r.query.from ?? `${today.slice(0, 4)}-01-01`));
      const to = z.iso.date().parse(String(r.query.to ?? today));
      requireThat(
        from <= to,
        400,
        "O início do relatório deve preceder o fim.",
      );
      const csv = await scoped(r, async (q) => {
        const [peopleSummary] = await q(
          "SELECT count(*) FILTER(WHERE status<>'inactive')::int AS active_people,count(*) FILTER(WHERE status='visitor')::int AS visitors FROM people WHERE church_id=$1",
          [r.church],
        );
        const [cellSummary] = await q(
          "SELECT count(DISTINCT m.id)::int AS meetings,count(a.person_id)::int AS attendance_records,count(a.person_id) FILTER(WHERE a.present)::int AS present_records,COALESCE(sum(m.visitors),0)::int AS visitors FROM meetings m LEFT JOIN attendance a ON a.meeting_id=m.id WHERE m.church_id=$1 AND m.held_on BETWEEN $2::date AND $3::date",
          [r.church, from, to],
        );
        const [eventSummary] = await q(
          "SELECT count(DISTINCT e.id)::int AS events,count(er.id)::int AS registrations,count(er.id) FILTER(WHERE er.status='attended')::int AS attended,count(er.id) FILTER(WHERE er.status='waitlisted')::int AS waitlisted FROM church_events e LEFT JOIN event_registrations er ON er.event_id=e.id WHERE e.church_id=$1 AND e.starts_at::date BETWEEN $2::date AND $3::date",
          [r.church, from, to],
        );
        const [educationSummary] = await q(
          "SELECT count(DISTINCT c.id)::int AS classes,count(DISTINCT en.id)::int AS enrollments,count(ea.enrollment_id)::int AS attendance_records,count(ea.enrollment_id) FILTER(WHERE ea.present)::int AS present_records FROM education_classes c LEFT JOIN education_enrollments en ON en.class_id=c.id AND en.status<>'cancelled' LEFT JOIN education_sessions es ON es.class_id=c.id AND es.held_on BETWEEN $2::date AND $3::date LEFT JOIN education_attendance ea ON ea.session_id=es.id AND ea.enrollment_id=en.id WHERE c.church_id=$1 AND c.starts_on<=$3::date AND (c.ends_on IS NULL OR c.ends_on>=$2::date)",
          [r.church, from, to],
        );
        const [ministrySummary] = await q(
          "SELECT count(*)::int AS schedules,count(*) FILTER(WHERE response='accepted')::int AS accepted,count(*) FILTER(WHERE response='pending')::int AS pending,count(*) FILTER(WHERE response='declined')::int AS declined FROM schedules WHERE church_id=$1 AND starts_at::date BETWEEN $2::date AND $3::date",
          [r.church, from, to],
        );
        const [workflowSummary] = await q(
          "SELECT count(*) FILTER(WHERE status IN ('open','in_progress'))::int AS open_tasks,count(*) FILTER(WHERE status IN ('open','in_progress') AND due_on<CURRENT_DATE)::int AS overdue_tasks FROM operational_tasks WHERE church_id=$1 AND scope IN ('people','cells')",
          [r.church],
        );
        const rows: Array<[string, string | number]> = [
          ["from", from],
          ["to", to],
          ["active_people", peopleSummary.active_people],
          ["visitors", peopleSummary.visitors],
          ["cell_meetings", cellSummary.meetings],
          ["cell_attendance_records", cellSummary.attendance_records],
          ["cell_present_records", cellSummary.present_records],
          ["cell_visitors", cellSummary.visitors],
          ["events", eventSummary.events],
          ["event_registrations", eventSummary.registrations],
          ["event_attended", eventSummary.attended],
          ["event_waitlisted", eventSummary.waitlisted],
          ["education_classes", educationSummary.classes],
          ["education_enrollments", educationSummary.enrollments],
          ["education_attendance_records", educationSummary.attendance_records],
          ["education_present_records", educationSummary.present_records],
          ["ministry_schedules", ministrySummary.schedules],
          ["ministry_accepted", ministrySummary.accepted],
          ["ministry_pending", ministrySummary.pending],
          ["ministry_declined", ministrySummary.declined],
          ["workflow_open_tasks", workflowSummary.open_tasks],
          ["workflow_overdue_tasks", workflowSummary.overdue_tasks],
        ];
        rows.push(
          [
            "cell_attendance_rate",
            Number(cellSummary.attendance_records)
              ? Math.round(
                  (Number(cellSummary.present_records) * 1000) /
                    Number(cellSummary.attendance_records),
                ) / 10
              : "",
          ],
          [
            "education_attendance_rate",
            Number(educationSummary.attendance_records)
              ? Math.round(
                  (Number(educationSummary.present_records) * 1000) /
                    Number(educationSummary.attendance_records),
                ) / 10
              : "",
          ],
        );
        const escape = (value: string | number) =>
          `"${String(value).replaceAll('"', '""')}"`;
        return (
          [
            "indicator,value",
            ...rows.map(([name, value]) => `${escape(name)},${escape(value)}`),
          ].join("\n") + "\n"
        );
      });
      s.type("text/csv; charset=utf-8")
        .attachment("inscricoes-evento.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.get(
    "/api/portal/events",
    route(async (r, s) => {
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      const [person] = await db.transaction((q) =>
        q("SELECT id FROM people WHERE church_id=$1 AND user_id=$2", [
          r.church,
          r.actor.id,
        ]),
      );
      s.json(
        await db.transaction(async (q) => {
          const where =
            "e.church_id=$1 AND e.status='scheduled' AND e.public_registration=true AND (e.registration_deadline IS NULL OR e.registration_deadline>now()) AND e.starts_at>now()-interval '1 day'";
          const [total] = await q(
            `SELECT count(*)::int AS total FROM church_events e WHERE ${where}`,
            [r.church],
          );
          const items = await q(
            `SELECT e.id,e.title,e.kind,e.starts_at,e.ends_at,e.capacity,e.registration_deadline,e.price_cents,e.certificate_enabled,e.registration_fields,er.id AS registration_id,er.status AS registration_status,er.payment_status FROM church_events e LEFT JOIN event_registrations er ON er.event_id=e.id AND er.person_id=$2 WHERE ${where} ORDER BY e.starts_at LIMIT $3 OFFSET $4`,
            [
              r.church,
              person?.id ?? null,
              params.pageSize,
              (params.page - 1) * params.pageSize,
            ],
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
          };
        }),
      );
    }),
  );
  app.get(
    "/api/portal/events/history",
    route(async (r, s) => {
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await db.transaction(async (q) => {
          const [person] = await q(
            "SELECT id FROM people WHERE church_id=$1 AND user_id=$2",
            [r.church, r.actor.id],
          );
          requireThat(
            person,
            404,
            "Seu cadastro de membro ainda não está vinculado.",
          );
          const [total] = await q(
            "SELECT count(*)::int AS total FROM event_registrations er JOIN church_events e ON e.id=er.event_id WHERE er.church_id=$1 AND er.person_id=$2 AND e.starts_at < now()",
            [r.church, person.id],
          );
          const items = await q(
            "SELECT er.id AS registration_id,er.event_id,er.status,er.payment_status,er.created_at,e.title,e.kind,e.starts_at,e.ends_at,e.price_cents,EXISTS(SELECT 1 FROM event_certificates c WHERE c.registration_id=er.id) AS certificate_issued FROM event_registrations er JOIN church_events e ON e.id=er.event_id WHERE er.church_id=$1 AND er.person_id=$2 AND e.starts_at < now() ORDER BY e.starts_at DESC,er.id DESC LIMIT $3 OFFSET $4",
            [
              r.church,
              person.id,
              params.pageSize,
              (params.page - 1) * params.pageSize,
            ],
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
          };
        }),
      );
    }),
  );
  app.post(
    "/api/portal/events/:id/register",
    route(async (r, s) => {
      const eventId = uuid.parse(r.params.id);
      const result = await db.transaction(async (q) => {
        const [person] = await q(
          "SELECT id FROM people WHERE church_id=$1 AND user_id=$2 FOR UPDATE",
          [r.church, r.actor.id],
        );
        requireThat(
          person,
          404,
          "Seu cadastro de membro ainda não está vinculado.",
        );
        const [event] = await q(
          "SELECT * FROM church_events WHERE id=$1 AND church_id=$2 AND status='scheduled' AND public_registration=true FOR UPDATE",
          [eventId, r.church],
        );
        requireThat(event, 404, "Evento não encontrado.");
        requireThat(
          !event.registration_deadline ||
            new Date(event.registration_deadline).getTime() > Date.now(),
          409,
          "As inscrições para este evento foram encerradas.",
        );
        const formData = validateRegistrationData(
          event.registration_fields,
          r.body?.formData ?? {},
        );
        const [existing] = await q(
          "SELECT * FROM event_registrations WHERE event_id=$1 AND person_id=$2",
          [eventId, person.id],
        );
        if (existing && existing.status !== "cancelled") return existing;
        const pricing = await resolveCoupon(
          q,
          r.church,
          eventId,
          r.body?.couponCode,
          Number(event.price_cents),
        );
        const [counts] = await q(
          "SELECT count(*) FILTER(WHERE status IN ('registered','attended'))::int AS registered FROM event_registrations WHERE event_id=$1",
          [eventId],
        );
        const full =
          event.capacity !== null &&
          Number(counts.registered) >= Number(event.capacity);
        requireThat(
          !full || event.waitlist_enabled,
          409,
          "Evento sem vagas disponíveis.",
        );
        const [row] = await q(
          existing
            ? "UPDATE event_registrations SET status=$3,form_data=$4,amount_cents=$5,discount_cents=$6,coupon_id=$7,consent_at=now() WHERE id=$1 AND event_id=$2 RETURNING *"
            : "INSERT INTO event_registrations(church_id,event_id,person_id,form_data,status,amount_cents,discount_cents,coupon_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          existing
            ? [
                existing.id,
                eventId,
                full ? "waitlisted" : "registered",
                JSON.stringify(formData),
                pricing.amountCents,
                pricing.discountCents,
                pricing.coupon?.id ?? null,
              ]
            : [
                r.church,
                eventId,
                person.id,
                JSON.stringify(formData),
                full ? "waitlisted" : "registered",
                pricing.amountCents,
                pricing.discountCents,
                pricing.coupon?.id ?? null,
              ],
        );
        let payment = null;
        if (pricing.amountCents > 0) {
          const [fund] = await q(
            "SELECT id FROM funds WHERE church_id=$1 ORDER BY name LIMIT 1",
            [r.church],
          );
          requireThat(
            fund,
            409,
            "Configure um fundo antes de cobrar inscrições.",
          );
          const [charge] = await q(
            "INSERT INTO pix_charges(church_id,user_id,fund_id,txid,provider,provider_account,amount_cents,status,expires_at) VALUES($1,$2,$3,$4,'demo','demo',$5,'creating',now()+interval '1 hour') RETURNING id,txid,amount_cents,status,expires_at",
            [r.church, r.actor.id, fund.id, newTxid(), pricing.amountCents],
          );
          await q(
            "UPDATE event_registrations SET payment_status='pending',pix_charge_id=$1 WHERE id=$2",
            [charge.id, row.id],
          );
          payment = charge;
        }
        if (pricing.coupon)
          await q(
            "UPDATE event_coupons SET used_count=used_count+1 WHERE id=$1",
            [pricing.coupon.id],
          );
        await q(
          "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+1,$3,$4,$4,'event_registration',$5) ON CONFLICT DO NOTHING",
          [
            r.church,
            encrypt(`Inscrição · ${event.title}`, key ?? Buffer.alloc(32)),
            person.id,
            event.created_by,
            row.id,
          ],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          `event-registration.${row.status}`,
          row.id,
        );
        return {
          ...row,
          payment_status: payment ? "pending" : "not_required",
          payment,
        };
      });
      s.status(201).json(result);
    }),
  );
  app.post(
    "/api/portal/events/:id/cancel",
    route(async (r, s) => {
      const registrationId = uuid.parse(r.params.id);
      let refundRequired = false;
      await db.transaction(async (q) => {
        const [row] = await q(
          "SELECT er.id,er.event_id,er.person_id,er.payment_status,e.title,e.created_by FROM event_registrations er JOIN people p ON p.id=er.person_id JOIN church_events e ON e.id=er.event_id WHERE er.id=$1 AND er.church_id=$2 AND p.user_id=$3 FOR UPDATE",
          [registrationId, r.church, r.actor.id],
        );
        requireThat(row, 404, "Inscrição não encontrada.");
        await q(
          "UPDATE event_registrations SET status='cancelled' WHERE id=$1",
          [registrationId],
        );
        await q(
          "UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='event_registration' AND source_id=$1 AND status IN ('open','in_progress')",
          [registrationId],
        );
        if (row.payment_status === "paid")
          refundRequired = await queueEventRefund(
            q,
            r.church,
            registrationId,
            row.title,
            row.person_id,
            row.created_by,
            r.actor.id,
            key ?? Buffer.alloc(32),
          );
        await audit(
          q,
          r.actor.id,
          r.church,
          "event-registration.cancelled",
          registrationId,
        );
        await promoteWaitlisted(q, r.church, row.event_id, r.actor.id);
      });
      s.json({ ok: true, refundRequired });
    }),
  );
  app.get(
    "/api/events/:id/registrations",
    route(async (r, s) => {
      await people(r);
      const id = uuid.parse(r.params.id);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          status: z
            .enum(["all", "registered", "waitlisted", "attended", "cancelled"])
            .default("all"),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const filter = params.status === "all" ? "" : " AND er.status=$2";
          const values = params.status === "all" ? [id] : [id, params.status];
          const [count] = await q(
            `SELECT count(*)::int AS total FROM event_registrations er WHERE er.event_id=$1${filter}`,
            values,
          );
          const limit = values.length + 1,
            offset = values.length + 2;
          const items = await q(
            `SELECT er.*,p.name AS person_name FROM event_registrations er LEFT JOIN people p ON p.id=er.person_id WHERE er.event_id=$1${filter} ORDER BY er.status,er.created_at LIMIT $${limit} OFFSET $${offset}`,
            [...values, params.pageSize, (params.page - 1) * params.pageSize],
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
            status: params.status,
          };
        }),
      );
    }),
  );
  app.get(
    "/api/events/:id/registrations.csv",
    route(async (r, s) => {
      await people(r);
      const id = uuid.parse(r.params.id);
      const params = z
        .object({
          status: z
            .enum(["all", "registered", "waitlisted", "attended", "cancelled"])
            .default("all"),
        })
        .parse(r.query);
      const rows = await scoped(r, async (q) => {
        const [event] = await q("SELECT title FROM church_events WHERE id=$1", [
          id,
        ]);
        requireThat(event, 404, "Evento não encontrado.");
        const filter = params.status === "all" ? "" : " AND er.status=$2";
        const values = params.status === "all" ? [id] : [id, params.status];
        const items = await q(
          `SELECT er.id,COALESCE(p.name,er.guest_name) AS name,COALESCE(p.email,er.guest_email) AS email,COALESCE(p.phone,er.guest_phone) AS phone,er.status,er.payment_status,er.created_at FROM event_registrations er LEFT JOIN people p ON p.id=er.person_id WHERE er.event_id=$1${filter} ORDER BY er.status,er.created_at,er.id`,
          values,
        );
        return { event, items };
      });
      await db.transaction((q) =>
        audit(q, r.actor.id, r.church, "event-registrations.exported", id),
      );
      const escape = (v: unknown) =>
        `"${String(v ?? "").replaceAll('"', '""')}"`;
      const csv =
        [
          "id,name,email,phone,status,payment_status,created_at",
          ...rows.items.map((v: Row) =>
            [
              v.id,
              v.name,
              v.email,
              v.phone,
              v.status,
              v.payment_status,
              v.created_at,
            ]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      s.type("text/csv; charset=utf-8")
        .attachment("inscricoes-evento.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.get(
    "/api/events/:id/coupons",
    route(async (r, s) => {
      await people(r);
      const id = uuid.parse(r.params.id);
      s.json(
        await scoped(r, (q) =>
          q(
            "SELECT id,code,discount_kind,value_cents,max_uses,used_count,expires_on,active,created_at FROM event_coupons WHERE event_id=$1 ORDER BY created_at DESC",
            [id],
          ),
        ),
      );
    }),
  );
  app.post(
    "/api/events/:id/coupons",
    route(async (r, s) => {
      await people(r, true);
      const id = uuid.parse(r.params.id);
      const b = z
        .object({
          code: z
            .string()
            .trim()
            .min(3)
            .max(40)
            .regex(/^[a-z0-9_-]+$/i),
          discountKind: z.enum(["percent", "fixed"]),
          value: z.coerce.number().int().positive().max(100000000),
          maxUses: z.coerce.number().int().positive().nullable().optional(),
          expiresOn: z.string().date().optional(),
        })
        .parse(r.body);
      const row = await db.transaction(async (q) => {
        const [event] = await q(
          "SELECT id FROM church_events WHERE id=$1 AND church_id=$2",
          [id, r.church],
        );
        requireThat(event, 404, "Evento não encontrado.");
        const [coupon] = await q(
          "INSERT INTO event_coupons(church_id,event_id,code,discount_kind,value_cents,max_uses,expires_on,created_by) VALUES($1,$2,upper($3),$4,$5,$6,$7,$8) RETURNING id,code,discount_kind,value_cents,max_uses,used_count,expires_on,active",
          [
            r.church,
            id,
            b.code,
            b.discountKind,
            b.value,
            b.maxUses ?? null,
            b.expiresOn ?? null,
            r.actor.id,
          ],
        );
        await audit(q, r.actor.id, r.church, "event-coupon.created", coupon.id);
        return coupon;
      });
      s.status(201).json(row);
    }),
  );
  app.patch(
    "/api/events/:eventId/coupons/:couponId",
    route(async (r, s) => {
      await people(r, true);
      const eventId = uuid.parse(r.params.eventId),
        couponId = uuid.parse(r.params.couponId);
      const b = z.object({ active: z.boolean() }).parse(r.body);
      const row = await db.transaction(async (q) => {
        const [coupon] = await q(
          "UPDATE event_coupons SET active=$3 WHERE id=$1 AND event_id=$2 AND church_id=$4 RETURNING id,active",
          [couponId, eventId, b.active, r.church],
        );
        requireThat(coupon, 404, "Cupom não encontrado.");
        await audit(q, r.actor.id, r.church, "event-coupon.updated", couponId);
        return coupon;
      });
      s.json(row);
    }),
  );
  app.patch(
    "/api/events/:eventId/registrations/:registrationId/person",
    route(async (r, s) => {
      await people(r, true);
      const eventId = uuid.parse(r.params.eventId);
      const registrationId = uuid.parse(r.params.registrationId);
      const b = z.object({ personId: uuid }).parse(r.body);
      const result = await db.transaction(async (q) => {
        const [registration] = await q(
          "SELECT er.*,e.title FROM event_registrations er JOIN church_events e ON e.id=er.event_id WHERE er.id=$1 AND er.event_id=$2 AND er.church_id=$3 FOR UPDATE",
          [registrationId, eventId, r.church],
        );
        requireThat(registration, 404, "Inscrição não encontrada.");
        requireThat(
          !registration.person_id,
          409,
          "Esta inscrição já está vinculada a uma pessoa.",
        );
        requireThat(
          (
            await q("SELECT 1 FROM people WHERE id=$1 AND church_id=$2", [
              b.personId,
              r.church,
            ])
          ).length,
          400,
          "Pessoa não encontrada nesta igreja.",
        );
        requireThat(
          !(
            await q(
              "SELECT 1 FROM event_registrations WHERE event_id=$1 AND person_id=$2",
              [eventId, b.personId],
            )
          ).length,
          409,
          "Esta pessoa já possui uma inscrição neste evento.",
        );
        const [updated] = await q(
          "UPDATE event_registrations SET person_id=$2 WHERE id=$1 RETURNING *",
          [registrationId, b.personId],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "event-registration.person-linked",
          registrationId,
        );
        return updated;
      });
      await db.transaction((q) =>
        q(
          "UPDATE operational_tasks SET person_id=$2 WHERE source_type='event_registration' AND source_id=$1 AND church_id=$3",
          [registrationId, b.personId, r.church],
        ),
      );
      s.json(result);
    }),
  );
  app.post(
    "/api/events/:id/registrations",
    route(async (r, s) => {
      const b = eventBody.parse({ ...r.body, eventId: r.params.id });
      await people(r, true);
      const result = await db.transaction(async (q) => {
        const [event] = await q(
          "SELECT * FROM church_events WHERE id=$1 AND status='scheduled' FOR UPDATE",
          [b.eventId],
        );
        requireThat(event, 404, "Evento não encontrado.");
        requireThat(
          !event.registration_deadline ||
            new Date(event.registration_deadline).getTime() > Date.now(),
          409,
          "As inscrições para este evento foram encerradas.",
        );
        const formData = validateRegistrationData(
          event.registration_fields,
          b.formData,
        );
        if (b.personId)
          requireThat(
            (await q("SELECT 1 FROM people WHERE id=$1", [b.personId])).length,
            400,
            "Pessoa não encontrada.",
          );
        const duplicate = b.personId
          ? await q(
              "SELECT * FROM event_registrations WHERE event_id=$1 AND person_id=$2",
              [b.eventId, b.personId],
            )
          : await q(
              "SELECT * FROM event_registrations WHERE event_id=$1 AND guest_email=$2",
              [b.eventId, b.guestEmail!.toLowerCase()],
            );
        if (duplicate[0]) return duplicate[0];
        const [counts] = await q(
          "SELECT count(*) FILTER(WHERE status IN ('registered','attended'))::int AS registered FROM event_registrations WHERE event_id=$1",
          [b.eventId],
        );
        const full =
          event.capacity !== null &&
          Number(counts.registered) >= Number(event.capacity);
        requireThat(
          !full || event.waitlist_enabled,
          409,
          "Evento sem vagas disponíveis.",
        );
        const pricing = await resolveCoupon(
          q,
          r.church,
          b.eventId,
          b.couponCode,
          Number(event.price_cents),
        );
        const [row] = await q(
          "INSERT INTO event_registrations(church_id,event_id,person_id,guest_name,guest_email,guest_phone,form_data,status,amount_cents,discount_cents,coupon_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
          [
            r.church,
            b.eventId,
            b.personId ?? null,
            b.guestName ?? null,
            b.guestEmail?.toLowerCase() ?? null,
            b.guestPhone ?? null,
            JSON.stringify(formData),
            full ? "waitlisted" : "registered",
            pricing.amountCents,
            pricing.discountCents,
            pricing.coupon?.id ?? null,
          ],
        );
        let payment = null;
        if (pricing.amountCents > 0) {
          const [fund] = await q(
            "SELECT id FROM funds WHERE church_id=$1 ORDER BY name LIMIT 1",
            [r.church],
          );
          requireThat(
            fund,
            409,
            "Configure um fundo antes de cobrar inscrições.",
          );
          const [charge] = await q(
            "INSERT INTO pix_charges(church_id,user_id,fund_id,txid,provider,provider_account,amount_cents,status,expires_at) VALUES($1,NULL,$2,$3,'demo','demo',$4,'creating',now()+interval '1 hour') RETURNING id,txid,amount_cents,status,expires_at",
            [r.church, fund.id, newTxid(), pricing.amountCents],
          );
          await q(
            "UPDATE event_registrations SET payment_status='pending',pix_charge_id=$1 WHERE id=$2",
            [charge.id, row.id],
          );
          payment = charge;
        }
        if (pricing.coupon)
          await q(
            "UPDATE event_coupons SET used_count=used_count+1 WHERE id=$1",
            [pricing.coupon.id],
          );
        await q(
          "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+1,$3,$4,$4,'event_registration',$5) ON CONFLICT DO NOTHING",
          [
            r.church,
            encrypt(`Inscrição · ${event.title}`, key ?? Buffer.alloc(32)),
            b.personId ?? null,
            event.created_by,
            row.id,
          ],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          `event-registration.${row.status}`,
          row.id,
        );
        if (b.personId)
          await startTriggeredWorkflows(
            q,
            r.church,
            "event_registration",
            b.personId,
            r.actor.id,
          );
        return {
          ...row,
          payment_status: payment ? "pending" : "not_required",
          payment,
        };
      });
      await processWorkflowTriggerJobs(db, 10, key);
      s.status(201).json(result);
    }),
  );
  app.post(
    "/api/registrations/:id/cancel",
    route(async (r, s) => {
      const id = uuid.parse(r.params.id);
      let refundRequired = false;
      let refundRegistration: Row | null = null;
      const [row] = await scoped(r, (q) =>
        q(
          "SELECT er.*,p.user_id FROM event_registrations er LEFT JOIN people p ON p.id=er.person_id WHERE er.id=$1",
          [id],
        ),
      );
      requireThat(row, 404, "Inscrição não encontrada.");
      const [access] = await scoped(r, (q) =>
        q(
          "SELECT can_access('people',true) AS admin, $1::uuid=actor_id() AS owner",
          [row.user_id ?? "00000000-0000-0000-0000-000000000000"],
        ),
      );
      requireThat(
        access.admin || access.owner,
        403,
        "Você não pode cancelar esta inscrição.",
      );
      await scoped(r, async (q) => {
        const [registration] = await q(
          "SELECT event_id,person_id,payment_status FROM event_registrations WHERE id=$1 AND church_id=$2 FOR UPDATE",
          [id, r.church],
        );
        requireThat(registration, 404, "Inscrição não encontrada.");
        await q(
          "UPDATE event_registrations SET status='cancelled' WHERE id=$1",
          [id],
        );
        if (registration.payment_status === "paid")
          refundRegistration = registration;
        await audit(
          q,
          r.actor.id,
          r.church,
          "event-registration.cancelled",
          id,
        );
        await promoteWaitlisted(q, r.church, registration.event_id, r.actor.id);
      });
      await db.transaction(async (q) => {
        if (refundRegistration) {
          const [event] = await q(
            "SELECT title,created_by FROM church_events WHERE id=$1 AND church_id=$2",
            [refundRegistration.event_id, r.church],
          );
          requireThat(event, 404, "Evento não encontrado.");
          refundRequired = await queueEventRefund(
            q,
            r.church,
            id,
            event.title,
            refundRegistration.person_id,
            event.created_by,
            r.actor.id,
            key ?? Buffer.alloc(32),
          );
        }
        await q(
          "UPDATE operational_tasks SET status='done',version=version+1 WHERE church_id=$1 AND source_type='event_registration' AND source_id=$2 AND status IN ('open','in_progress')",
          [r.church, id],
        );
      });
      s.json({ ok: true, refundRequired });
    }),
  );
  app.post(
    "/api/public/events/:id/register",
    route(async (r, s) => {
      const b = eventBody.parse({ ...r.body, eventId: r.params.id });
      requireThat(
        !b.personId,
        400,
        "Inscrição pública deve usar os dados do participante.",
      );
      const result = await db.transaction(async (q) => {
        const [event] = await q(
          "SELECT * FROM church_events WHERE id=$1 AND status='scheduled' AND public_registration=true FOR UPDATE",
          [b.eventId],
        );
        requireThat(event, 404, "Inscrição pública indisponível.");
        requireThat(
          !event.registration_deadline ||
            new Date(event.registration_deadline).getTime() > Date.now(),
          409,
          "As inscrições para este evento foram encerradas.",
        );
        const existing = await q(
          "SELECT * FROM event_registrations WHERE event_id=$1 AND guest_email=$2",
          [b.eventId, b.guestEmail!.toLowerCase()],
        );
        if (existing[0]) return existing[0];
        const [count] = await q(
          "SELECT count(*) FILTER(WHERE status IN ('registered','attended'))::int AS registered FROM event_registrations WHERE event_id=$1",
          [b.eventId],
        );
        const full =
          event.capacity !== null &&
          Number(count.registered) >= Number(event.capacity);
        requireThat(
          !full || event.waitlist_enabled,
          409,
          "Evento sem vagas disponíveis.",
        );
        const pricing = await resolveCoupon(
          q,
          event.church_id,
          b.eventId,
          b.couponCode,
          Number(event.price_cents),
        );
        const [row] = await q(
          "INSERT INTO event_registrations(church_id,event_id,guest_name,guest_email,guest_phone,form_data,status,amount_cents,discount_cents,coupon_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status,amount_cents,discount_cents",
          [
            event.church_id,
            b.eventId,
            b.guestName,
            b.guestEmail!.toLowerCase(),
            b.guestPhone ?? null,
            JSON.stringify(
              validateRegistrationData(event.registration_fields, b.formData),
            ),
            full ? "waitlisted" : "registered",
            pricing.amountCents,
            pricing.discountCents,
            pricing.coupon?.id ?? null,
          ],
        );
        let payment = null;
        if (pricing.amountCents > 0) {
          const [fund] = await q(
            "SELECT id FROM funds WHERE church_id=$1 ORDER BY name LIMIT 1",
            [event.church_id],
          );
          requireThat(
            fund,
            409,
            "Configure um fundo antes de cobrar inscrições.",
          );
          const [charge] = await q(
            "INSERT INTO pix_charges(church_id,user_id,fund_id,txid,provider,provider_account,amount_cents,status,expires_at) VALUES($1,NULL,$2,$3,'demo','demo',$4,'creating',now()+interval '1 hour') RETURNING id,txid,amount_cents,status,expires_at",
            [event.church_id, fund.id, newTxid(), pricing.amountCents],
          );
          await q(
            "UPDATE event_registrations SET payment_status='pending',pix_charge_id=$1 WHERE id=$2",
            [charge.id, row.id],
          );
          payment = charge;
        }
        if (pricing.coupon)
          await q(
            "UPDATE event_coupons SET used_count=used_count+1 WHERE id=$1",
            [pricing.coupon.id],
          );
        await q(
          "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+1,$3,$3,'event_registration',$4) ON CONFLICT DO NOTHING",
          [
            event.church_id,
            encrypt(`Inscrição · ${event.title}`, key ?? Buffer.alloc(32)),
            event.created_by,
            row.id,
          ],
        );
        return {
          ...row,
          payment_status: payment ? "pending" : "not_required",
          payment,
        };
      });
      s.status(201).json(result);
    }),
  );
  app.post(
    "/api/events/:eventId/registrations/:registrationId/attendance",
    route(async (r, s) => {
      await people(r, true);
      const eventId = uuid.parse(r.params.eventId),
        registrationId = uuid.parse(r.params.registrationId);
      const b = z
        .object({ attended: z.boolean().default(true) })
        .parse(r.body ?? {});
      const result = await db.transaction(async (q) => {
        const [row] = await q(
          "SELECT er.*,e.title,e.certificate_enabled,e.church_id FROM event_registrations er JOIN church_events e ON e.id=er.event_id WHERE er.id=$1 AND er.event_id=$2 AND er.church_id=$3 FOR UPDATE",
          [registrationId, eventId, r.church],
        );
        requireThat(row, 404, "Inscrição não encontrada.");
        const status = b.attended ? "attended" : "registered";
        const [updated] = await q(
          "UPDATE event_registrations SET status=$2 WHERE id=$1 RETURNING *",
          [registrationId, status],
        );
        if (b.attended)
          await q(
            "UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='event_registration' AND source_id=$1 AND status IN ('open','in_progress')",
            [registrationId],
          );
        let certificate = null;
        if (b.attended && row.certificate_enabled && row.person_id) {
          const [person] = await q(
            "SELECT name FROM people WHERE id=$1 AND church_id=$2",
            [row.person_id, r.church],
          );
          if (person) {
            [certificate] = await q(
              "INSERT INTO event_certificates(church_id,event_id,registration_id,person_id,code,recipient_name,event_title) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(registration_id) DO UPDATE SET recipient_name=excluded.recipient_name RETURNING *",
              [
                r.church,
                eventId,
                registrationId,
                row.person_id,
                `ECL-EVT-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
                person.name,
                row.title,
              ],
            );
          }
        }
        await audit(
          q,
          r.actor.id,
          r.church,
          b.attended
            ? "event-registration.attended"
            : "event-registration.attendance-reverted",
          registrationId,
        );
        return { registration: updated, certificate };
      });
      s.json(result);
    }),
  );
  app.get(
    "/api/events/:eventId/certificates",
    route(async (r, s) => {
      await people(r);
      const eventId = uuid.parse(r.params.eventId);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await db.transaction(async (q) => {
          const [total] = await q(
            "SELECT count(*)::int AS total FROM event_certificates WHERE event_id=$1 AND church_id=$2",
            [eventId, r.church],
          );
          const items = await q(
            "SELECT * FROM event_certificates WHERE event_id=$1 AND church_id=$2 ORDER BY issued_at DESC,id DESC LIMIT $3 OFFSET $4",
            [
              eventId,
              r.church,
              params.pageSize,
              (params.page - 1) * params.pageSize,
            ],
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
          };
        }),
      );
    }),
  );
  app.get(
    "/api/portal/events/certificates",
    route(async (r, s) => {
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await db.transaction(async (q) => {
          const [person] = await q(
            "SELECT id FROM people WHERE church_id=$1 AND user_id=$2",
            [r.church, r.actor.id],
          );
          requireThat(
            person,
            404,
            "Seu cadastro de membro ainda não está vinculado.",
          );
          const [total] = await q(
            "SELECT count(*)::int AS total FROM event_certificates WHERE church_id=$1 AND person_id=$2",
            [r.church, person.id],
          );
          const items = await q(
            "SELECT id,event_id,code,recipient_name,event_title,issued_at FROM event_certificates WHERE church_id=$1 AND person_id=$2 ORDER BY issued_at DESC,id DESC LIMIT $3 OFFSET $4",
            [
              r.church,
              person.id,
              params.pageSize,
              (params.page - 1) * params.pageSize,
            ],
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
          };
        }),
      );
    }),
  );
  app.get(
    "/api/events/:eventId/certificates.csv",
    route(async (r, s) => {
      await people(r);
      const eventId = uuid.parse(r.params.eventId);
      const rows = await scoped(r, async (q) => {
        const [event] = await q(
          "SELECT title FROM church_events WHERE id=$1 AND church_id=$2",
          [eventId, r.church],
        );
        requireThat(event, 404, "Evento não encontrado.");
        const items = await q(
          "SELECT id,code,recipient_name,event_title,issued_at FROM event_certificates WHERE event_id=$1 AND church_id=$2 ORDER BY issued_at DESC,id DESC",
          [eventId, r.church],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "event-certificates.exported",
          eventId,
        );
        return { event, items };
      });
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv =
        [
          "id,code,recipient_name,event_title,issued_at",
          ...rows.items.map((v: Row) =>
            [v.id, v.code, v.recipient_name, v.event_title, v.issued_at]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      s.type("text/csv; charset=utf-8")
        .attachment("certificados-evento.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.get(
    "/api/workflows",
    route(async (r, s) => {
      await people(r);
      const params = z
        .object({
          status: z
            .enum(["all", "open", "completed", "cancelled"])
            .default("all"),
          due: z.enum(["all", "overdue"]).default("all"),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      const data = await scoped(r, async (q) => ({
        definitions: await q(
          "SELECT * FROM workflow_definitions ORDER BY name",
        ),
        steps: await q(
          "SELECT * FROM workflow_steps ORDER BY definition_id,position",
        ),
        instances: await (async () => {
          const where = ["1=1"];
          const values: unknown[] = [];
          if (params.status !== "all") {
            values.push(params.status);
            where.push(`wi.status=$${values.length}`);
          }
          if (params.due === "overdue")
            where.push("wi.status='open' AND wi.due_on<CURRENT_DATE");
          const [count] = await q(
            `SELECT count(*)::int AS total FROM workflow_instances wi WHERE ${where.join(" AND ")}`,
            values,
          );
          const limit = values.length + 1,
            offset = values.length + 2;
          const items = await q(
            `SELECT wi.*,p.name AS person_name,d.name AS workflow_name,owner_person.name AS owner_name FROM workflow_instances wi JOIN people p ON p.id=wi.person_id JOIN workflow_definitions d ON d.id=wi.definition_id LEFT JOIN LATERAL (SELECT name FROM people WHERE church_id=wi.church_id AND user_id=wi.owner_id ORDER BY id LIMIT 1) owner_person ON true WHERE ${where.join(" AND ")} ORDER BY wi.status,wi.due_on NULLS LAST,wi.created_at DESC LIMIT $${limit} OFFSET $${offset}`,
            [...values, params.pageSize, (params.page - 1) * params.pageSize],
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
          };
        })(),
      }));
      s.json(data);
    }),
  );
  app.post(
    "/api/workflows",
    route(async (r, s) => {
      await people(r, true);
      const b = z
        .object({
          name: z.string().trim().min(2).max(120),
          trigger: z.enum([
            "manual",
            "visitor",
            "event_registration",
            "volunteer",
            "baptism",
            "transfer",
          ]),
          steps: z
            .array(
              z.object({
                title: z.string().trim().min(2).max(160),
                dueDays: z.number().int().min(0).max(3650),
              }),
            )
            .min(1)
            .max(20),
        })
        .parse(r.body);
      const out = await scoped(r, async (q) => {
        const [d] = await q(
          "INSERT INTO workflow_definitions(church_id,name,trigger,created_by) VALUES($1,$2,$3,$4) RETURNING *",
          [r.church, b.name, b.trigger, r.actor.id],
        );
        for (const [i, step] of b.steps.entries())
          await q(
            "INSERT INTO workflow_steps(church_id,definition_id,position,title,due_days) VALUES($1,$2,$3,$4,$5)",
            [r.church, d.id, i, step.title, step.dueDays],
          );
        await audit(q, r.actor.id, r.church, "workflow.created", d.id);
        return d;
      });
      s.status(201).json(out);
    }),
  );
  app.put(
    "/api/workflows/:id",
    route(async (r, s) => {
      await people(r, true);
      const id = uuid.parse(r.params.id);
      const b = z
        .object({
          name: z.string().trim().min(2).max(120),
          trigger: z.enum([
            "manual",
            "visitor",
            "event_registration",
            "volunteer",
            "baptism",
            "transfer",
          ]),
          steps: z
            .array(
              z.object({
                title: z.string().trim().min(2).max(160),
                dueDays: z.number().int().min(0).max(3650),
              }),
            )
            .min(1)
            .max(20),
        })
        .parse(r.body);
      const out = await scoped(r, async (q) => {
        const [definition] = await q(
          "SELECT * FROM workflow_definitions WHERE id=$1 FOR UPDATE",
          [id],
        );
        requireThat(definition, 404, "Workflow não encontrado.");
        const [active] = await q(
          "SELECT count(*)::int AS total FROM workflow_instances WHERE definition_id=$1 AND status='open'",
          [id],
        );
        const existing = await q(
          "SELECT position FROM workflow_steps WHERE definition_id=$1 ORDER BY position",
          [id],
        );
        requireThat(
          Number(active.total) === 0 || existing.length === b.steps.length,
          409,
          "Conclua ou cancele os acompanhamentos abertos antes de alterar a quantidade de etapas.",
        );
        const [updated] = await q(
          "UPDATE workflow_definitions SET name=$2,trigger=$3 WHERE id=$1 RETURNING *",
          [id, b.name, b.trigger],
        );
        for (const [position, step] of b.steps.entries()) {
          await q(
            "INSERT INTO workflow_steps(church_id,definition_id,position,title,due_days) VALUES($1,$2,$3,$4,$5) ON CONFLICT(definition_id,position) DO UPDATE SET title=excluded.title,due_days=excluded.due_days",
            [r.church, id, position, step.title, step.dueDays],
          );
        }
        await q(
          "DELETE FROM workflow_steps WHERE definition_id=$1 AND position >= $2",
          [id, b.steps.length],
        );
        await audit(q, r.actor.id, r.church, "workflow.updated", id);
        return updated;
      });
      s.json(out);
    }),
  );
  app.post(
    "/api/workflows/:id/start",
    route(async (r, s) => {
      await people(r, true);
      const id = uuid.parse(r.params.id);
      const b = z
        .object({ personId: uuid, ownerId: uuid.optional() })
        .parse(r.body);
      const out = await scoped(r, async (q) => {
        const [d] = await q(
          "SELECT * FROM workflow_definitions WHERE id=$1 AND active=true",
          [id],
        );
        requireThat(d, 404, "Workflow não encontrado.");
        const [step] = await q(
          "SELECT * FROM workflow_steps WHERE definition_id=$1 AND position=0",
          [id],
        );
        const [v] = await q(
          "INSERT INTO workflow_instances(church_id,definition_id,person_id,owner_id,due_on,created_by) VALUES($1,$2,$3,$4,CURRENT_DATE+($5::int),$6) RETURNING *",
          [
            r.church,
            id,
            b.personId,
            b.ownerId ?? r.actor.id,
            step?.due_days ?? 0,
            r.actor.id,
          ],
        );
        await q(
          "INSERT INTO workflow_instance_events(church_id,instance_id,actor_id,to_step,note) VALUES($1,$2,$3,0,'Iniciado')",
          [r.church, v.id, r.actor.id],
        );
        await audit(q, r.actor.id, r.church, "workflow.started", v.id);
        return v;
      });
      await createWorkflowTask(db, key, r.church, out.id, r.actor.id);
      s.status(201).json(out);
    }),
  );
  app.get(
    "/api/workflow-instances/:id/history",
    route(async (r, s) => {
      await people(r);
      const id = uuid.parse(r.params.id);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      const rows = await scoped(r, async (q) => {
        const [instance] = await q(
          "SELECT id FROM workflow_instances WHERE id=$1 AND church_id=$2",
          [id, r.church],
        );
        requireThat(instance, 404, "Processo não encontrado.");
        const [count] = await q(
          "SELECT count(*)::int AS total FROM workflow_instance_events WHERE instance_id=$1 AND church_id=$2",
          [id, r.church],
        );
        const items = await q(
          "SELECT e.id,e.from_step,e.to_step,e.note,e.created_at,e.actor_id FROM workflow_instance_events e WHERE e.instance_id=$1 AND e.church_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT $3 OFFSET $4",
          [id, r.church, params.pageSize, (params.page - 1) * params.pageSize],
        );
        return {
          items,
          total: Number(count.total),
          page: params.page,
          pageSize: params.pageSize,
          pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)),
        };
      });
      s.json(rows);
    }),
  );
  app.patch(
    "/api/workflow-instances/:id",
    route(async (r, s) => {
      await people(r, true);
      const id = uuid.parse(r.params.id);
      const b = z
        .object({
          currentStep: z.number().int().min(0).max(19),
          status: z.enum(["open", "completed", "cancelled"]),
          version: z.number().int().positive(),
          note: z.string().trim().max(500).optional(),
          ownerId: uuid.nullable().optional(),
        })
        .parse(r.body);
      if (b.ownerId) {
        const [owner] = await db.transaction((q) =>
          q(
            "SELECT user_id FROM memberships WHERE church_id=$1 AND user_id=$2",
            [r.church, b.ownerId],
          ),
        );
        requireThat(
          owner,
          403,
          "O responsável precisa estar vinculado a esta igreja.",
        );
      }
      const out = await scoped(r, async (q) => {
        const [old] = await q(
          "SELECT * FROM workflow_instances WHERE id=$1 FOR UPDATE",
          [id],
        );
        requireThat(old, 404, "Processo não encontrado.");
        const [step] = await q(
          "SELECT * FROM workflow_steps WHERE definition_id=$1 AND position=$2",
          [old.definition_id, b.currentStep],
        );
        const due = step ? `CURRENT_DATE + ${Number(step.due_days)}` : "NULL";
        const rows = await q(
          `UPDATE workflow_instances SET current_step=$2,status=$3,version=version+1,owner_id=CASE WHEN $5::uuid IS NULL THEN owner_id ELSE $5::uuid END,due_on=${b.status === "open" ? due : "NULL"},completed_at=${b.status === "completed" ? "now()" : "NULL"} WHERE id=$1 AND version=$4 RETURNING *`,
          [id, b.currentStep, b.status, b.version, b.ownerId ?? null],
        );
        requireThat(rows.length, 409, "Processo alterado. Atualize a tela.");
        await q(
          "INSERT INTO workflow_instance_events(church_id,instance_id,actor_id,from_step,to_step,note) VALUES($1,$2,$3,$4,$5,$6)",
          [
            r.church,
            id,
            r.actor.id,
            old.current_step,
            b.currentStep,
            b.note ?? null,
          ],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          b.ownerId && b.ownerId !== old.owner_id
            ? "workflow.reassigned"
            : "workflow.updated",
          id,
        );
        return rows[0];
      });
      await db.transaction(async (q) => {
        const [task] = await q(
          "SELECT id FROM operational_tasks WHERE workflow_instance_id=$1 AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 1",
          [id],
        );
        if (task)
          await q(
            "UPDATE operational_tasks SET status=$2,assigned_to=COALESCE($3::uuid,assigned_to),version=version+1 WHERE id=$1",
            [
              task.id,
              b.status === "completed"
                ? "done"
                : b.status === "cancelled"
                  ? "cancelled"
                  : "done",
              b.ownerId ?? null,
            ],
          );
        if (b.ownerId && b.ownerId !== out.owner_id) {
          const [instance] = await q(
            "SELECT d.name AS workflow_name,s.title AS step_title,wi.due_on FROM workflow_instances wi JOIN workflow_definitions d ON d.id=wi.definition_id LEFT JOIN workflow_steps s ON s.definition_id=wi.definition_id AND s.position=wi.current_step WHERE wi.id=$1",
            [id],
          );
          if (instance)
            await notifyTaskAssignee(
              q,
              r.church,
              task?.id ?? id,
              b.ownerId,
              `${instance.workflow_name} · ${instance.step_title ?? "Acompanhar processo"}`,
              String(instance.due_on ?? ""),
              r.actor.id,
            );
        }
      });
      if (b.status === "open")
        await createWorkflowTask(db, key, r.church, id, r.actor.id);
      s.json(out);
    }),
  );
}
