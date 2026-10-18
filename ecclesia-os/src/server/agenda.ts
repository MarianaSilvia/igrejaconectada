import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { requireThat, encrypt, decrypt } from "./security.js";
import { audit } from "./seed.js";
type R = Request & { actor: Row; church: string };
export async function notifyTaskAssignee(q: Query, church: string, taskId: string, assignedTo: string | null | undefined, title: string, dueOn: string, actorId: string) {
  if (!assignedTo) return;
  const [person] = await q("SELECT p.id,COALESCE(cp.portal_opt_in,true) AS portal_opt_in FROM people p LEFT JOIN communication_preferences cp ON cp.church_id=p.church_id AND cp.person_id=p.id WHERE p.church_id=$1 AND p.user_id=$2", [church, assignedTo]);
  if (!person?.portal_opt_in) return;
  const [message] = await q("INSERT INTO communication_messages(church_id,channel,subject,body,status,audience_filter,created_by,queued_at,sent_at) VALUES($1,'portal',$2,$3,'sent',$4::jsonb,$5,now(),now()) RETURNING id", [church, "Nova tarefa atribuída", `${title}\nPrazo: ${dueOn}`, JSON.stringify({ type: "task-assignment", taskId }), actorId]);
  await q("INSERT INTO communication_deliveries(church_id,message_id,person_id,channel,status,consent_snapshot,created_at,sent_at) VALUES($1,$2,$3,'portal','sent',true,now(),now())", [church, message.id, person.id]);
}
const interval = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (b) => Date.parse(b.endsAt) > Date.parse(b.startsAt),
    "O fim precisa ocorrer depois do início.",
  );
const registrationField = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Chave de campo inválida."),
  label: z.string().trim().min(2).max(120),
  type: z.enum(["text", "email", "phone", "number", "textarea", "select"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
export function agendaRoutes(app: Express, db: Database, key: Buffer) {
  const route =
    (fn: (r: R, s: Response) => Promise<unknown>) =>
    (r: Request, s: Response, n: NextFunction) =>
      Promise.resolve(fn(r as R, s)).catch(n);
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(fn, { actor: r.actor.id, church: r.church });
  };
  const can = async (r: R, scope: string, writing = false) => {
    const [p] = await scoped(r, (q) =>
      q("SELECT can_access($1,$2) AS allowed", [scope, writing]),
    );
    requireThat(
      p.allowed && (!writing || r.actor.mfa),
      403,
      "Operação fora do seu escopo.",
    );
  };
  const manage = async (r: R) => {
    requireThat(r.actor.mfa, 403, "Confirme MFA.");
    const [p] = await scoped(r, (q) =>
      q("SELECT local_role() IN ('admin','secretary') AS allowed"),
    );
    requireThat(p.allowed, 403, "Secretaria ou administração obrigatória.");
  };
  app.get(
    "/api/agenda",
    route(async (r, s) => {
      const params = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        eventPage: z.coerce.number().int().min(1).default(1),
        eventPageSize: z.coerce.number().int().min(1).max(100).default(25),
        status: z.enum(["all", "open", "in_progress", "done", "cancelled"]).default("all"),
        scope: z.enum(["all", "people", "cells", "pastoral", "finance"]).default("all"),
        assignedTo: z.union([z.literal("all"), z.uuid()]).default("all"),
        due: z.enum(["all", "overdue"]).default("all"),
      }).parse(r.query);
      const result: any = await scoped(r, async (q) => {
          const [p] = await q(
            "SELECT local_role() IS NOT NULL AS allowed,local_role() IN ('admin','secretary') AS manage",
          );
          requireThat(p.allowed, 403, "Vínculo local obrigatório.");
          const filters: string[] = [];
          const values: unknown[] = [];
          if (params.status !== "all") {
            values.push(params.status);
            filters.push(`status=$${values.length}`);
          }
          if (params.scope !== "all") {
            values.push(params.scope);
            filters.push(`scope=$${values.length}`);
          }
          if (params.assignedTo !== "all") {
            values.push(params.assignedTo);
            filters.push(`assigned_to=$${values.length}`);
          }
          if (params.due === "overdue") filters.push("due_on<CURRENT_DATE AND status IN ('open','in_progress')");
          const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
          const [taskTotal] = await q(`SELECT count(*)::int AS total FROM operational_tasks ${where}`, values);
          const limitParam = values.length + 1;
          const offsetParam = values.length + 2;
          const taskValues = [...values, params.pageSize, (params.page - 1) * params.pageSize];
          const tasks: Row[] = (
            await q(`SELECT * FROM operational_tasks ${where} ORDER BY due_on NULLS LAST,id LIMIT $${limitParam} OFFSET $${offsetParam}`, taskValues)
          ).map((t): Row => ({
            ...t,
            title: decrypt(t.encrypted_title, key),
            encrypted_title: undefined,
          }));
          const queue = [
            ...tasks
              .filter((t) => ["open", "in_progress"].includes(t.status))
              .map((t) => ({
                id: t.id,
                kind: t.workflow_instance_id ? "workflow" : "task",
                title: t.title,
                due_on: t.due_on,
                status: t.status,
                assigned_to: t.assigned_to,
                scope: t.scope,
              })),
          ].sort((a, b) => String(a.due_on ?? "9999-12-31").localeCompare(String(b.due_on ?? "9999-12-31")));
          const [eventTotal] = await q("SELECT count(*)::int AS total FROM church_events");
          const events = await q(
            "SELECT * FROM church_events ORDER BY starts_at DESC,id DESC LIMIT $1 OFFSET $2",
            [params.eventPageSize, (params.eventPage - 1) * params.eventPageSize],
          );
          return {
            resources: await q("SELECT * FROM resources ORDER BY name"),
            events,
            eventPagination: {
              total: Number(eventTotal.total),
              page: params.eventPage,
              pageSize: params.eventPageSize,
              pages: Math.max(1, Math.ceil(Number(eventTotal.total) / params.eventPageSize)),
            },
            bookings: await q("SELECT * FROM resource_bookings"),
            teams: await q("SELECT * FROM ministry_teams ORDER BY name"),
            members: await q("SELECT * FROM ministry_members"),
            schedules: await q("SELECT * FROM schedules ORDER BY starts_at"),
            unavailability: await q(
              "SELECT * FROM volunteer_unavailability ORDER BY starts_at",
            ),
            training: await q(
              "SELECT t.*,mt.name AS team_name FROM ministry_training t LEFT JOIN ministry_teams mt ON mt.id=t.team_id WHERE t.church_id=$1 ORDER BY t.expires_at NULLS LAST,t.completed_at DESC",
              [r.church],
            ),
            trainingRequirements: await q(
              "SELECT r.*,t.name AS team_name FROM ministry_training_requirements r JOIN ministry_teams t ON t.id=r.team_id WHERE r.church_id=$1 ORDER BY t.name,r.name",
              [r.church],
            ),
            substitutions: await q(
              "SELECT s.* FROM schedule_substitutions s WHERE s.church_id=$1 ORDER BY s.created_at DESC",
              [r.church],
            ),
            tasks,
            queue,
            taskPagination: {
              total: taskTotal.total,
              page: params.page,
              pageSize: params.pageSize,
              pages: Math.max(1, Math.ceil(Number(taskTotal.total) / params.pageSize)),
              status: params.status,
              scope: params.scope,
            },
            canManage: p.manage,
          };
        });
      const people = await scoped(r, (q) => q("SELECT p.user_id AS id,p.name FROM people p WHERE p.church_id=$1 AND p.user_id IS NOT NULL ORDER BY p.name", [r.church]));
      result.training = result.training.map((t: Row) => ({ ...t, volunteer_name: people.find((p: Row) => p.id === t.user_id)?.name ?? null }));
      result.substitutions = result.substitutions.map((v: Row) => ({ ...v, original_name: people.find((p: Row) => p.id === v.original_user_id)?.name ?? null, substitute_name: people.find((p: Row) => p.id === v.substitute_user_id)?.name ?? null }));
      s.json(result);
    }),
  );
  app.post(
    "/api/agenda/resources",
    route(async (r, s) => {
      await manage(r);
      const b = z
        .object({
          name: z.string().trim().min(2).max(120),
          kind: z.enum(["room", "vehicle", "equipment"]),
        })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [v] = await q(
            "INSERT INTO resources(church_id,name,kind) VALUES($1,$2,$3) RETURNING *",
            [r.church, b.name, b.kind],
          );
          await audit(q, r.actor.id, r.church, "resource.created", v.id);
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/agenda/events",
    route(async (r, s) => {
      await manage(r);
      const b = z
        .object({
          title: z.string().trim().min(3).max(150),
          kind: z.enum(["meeting", "service", "event", "class"]),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
          resourceIds: z.array(z.uuid()).max(20).default([]),
          weeklyCount: z.number().int().min(1).max(26).default(1),
          capacity: z
            .number()
            .int()
            .positive()
            .max(100000)
            .nullable()
            .default(null),
          publicRegistration: z.boolean().default(false),
          waitlistEnabled: z.boolean().default(true),
          registrationDeadline: z.iso.datetime({ offset: true }).nullable().default(null),
          certificateEnabled: z.boolean().default(false),
          priceCents: z.number().int().min(0).max(100000000).default(0),
          registrationFields: z.array(registrationField).max(20).default([]),
        })
        .parse(r.body);
      requireThat(
        new Set(b.registrationFields.map((field) => field.key)).size === b.registrationFields.length,
        400,
        "As chaves dos campos do formulário devem ser únicas.",
      );
      interval.parse(b);
      s.status(201).json(
        await db.transaction(async (q) => {
          const resources = [...new Set(b.resourceIds)].sort();
          for (const id of resources) {
            await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
              id,
            ]);
            requireThat(
              (
                await q(
                  "SELECT 1 FROM resources WHERE id=$1 AND church_id=$2",
                  [id, r.church],
                )
              ).length,
              400,
              "Recurso de outra igreja.",
            );
          }
          const rows = [];
          for (let i = 0; i < b.weeklyCount; i++) {
            const [v] = await q(
              "INSERT INTO church_events(church_id,title,kind,starts_at,ends_at,created_by,capacity,public_registration,waitlist_enabled,registration_deadline,certificate_enabled,price_cents,registration_fields) VALUES($1,$2,$3,$4::timestamptz+($7::int*interval '7 days'),$5::timestamptz+($7::int*interval '7 days'),$6,$8,$9,$10,$11,$12,$13,$14) RETURNING *",
              [
                r.church,
                b.title,
                b.kind,
                b.startsAt,
                b.endsAt,
                r.actor.id,
                i,
                b.capacity,
                b.publicRegistration,
                b.waitlistEnabled,
                b.registrationDeadline,
                b.certificateEnabled,
                b.priceCents,
                JSON.stringify(b.registrationFields),
              ],
            );
            for (const id of resources)
              await q("INSERT INTO resource_bookings VALUES($1,$2,$3)", [
                r.church,
                v.id,
                id,
              ]);
            await audit(q, r.actor.id, r.church, "event.scheduled", v.id);
            rows.push(v);
          }
          return rows;
        }),
      );
    }),
  );
  app.patch(
    "/api/agenda/events/:id",
    route(async (r, s) => {
      await manage(r);
      const b = z
        .object({
          title: z.string().trim().min(3).max(150).optional(),
          capacity: z.number().int().positive().max(100000).nullable().optional(),
          publicRegistration: z.boolean().optional(),
          waitlistEnabled: z.boolean().optional(),
          registrationDeadline: z.iso.datetime({ offset: true }).nullable().optional(),
          certificateEnabled: z.boolean().optional(),
          priceCents: z.number().int().min(0).max(100000000).optional(),
          registrationFields: z.array(registrationField).max(20).optional(),
        })
        .refine((value) => Object.keys(value).length > 0, "Informe uma alteração.")
        .parse(r.body);
      if (b.registrationFields)
        requireThat(
          new Set(b.registrationFields.map((field) => field.key)).size === b.registrationFields.length,
          400,
          "As chaves dos campos do formulário devem ser únicas.",
        );
      const id = z.uuid().parse(r.params.id);
      const updated = await db.transaction(async (q) => {
        const [event] = await q(
          "SELECT * FROM church_events WHERE id=$1 AND church_id=$2 AND status='scheduled' FOR UPDATE",
          [id, r.church],
        );
        requireThat(event, 404, "Evento não encontrado.");
        if (b.capacity !== undefined && b.capacity !== null) {
          const [count] = await q(
            "SELECT count(*) FILTER(WHERE status IN ('registered','attended'))::int AS registered FROM event_registrations WHERE event_id=$1",
            [id],
          );
          requireThat(Number(b.capacity) >= Number(count.registered), 409, "A capacidade não pode ficar abaixo das inscrições confirmadas.");
        }
        const fields: string[] = [];
        const values: unknown[] = [id, r.church];
        const add = (column: string, value: unknown) => {
          values.push(value);
          fields.push(`${column}=$${values.length}`);
        };
        if (b.title !== undefined) add("title", b.title);
        if (b.capacity !== undefined) add("capacity", b.capacity);
        if (b.publicRegistration !== undefined) add("public_registration", b.publicRegistration);
        if (b.waitlistEnabled !== undefined) add("waitlist_enabled", b.waitlistEnabled);
        if (b.registrationDeadline !== undefined) add("registration_deadline", b.registrationDeadline);
        if (b.certificateEnabled !== undefined) add("certificate_enabled", b.certificateEnabled);
        if (b.priceCents !== undefined) add("price_cents", b.priceCents);
        if (b.registrationFields !== undefined) add("registration_fields", JSON.stringify(b.registrationFields));
        const [row] = await q(
          `UPDATE church_events SET ${fields.join(",")} WHERE id=$1 AND church_id=$2 RETURNING *`,
          values,
        );
        const columnNames: Record<string, string> = {
          title: "title",
          capacity: "capacity",
          publicRegistration: "public_registration",
          waitlistEnabled: "waitlist_enabled",
          registrationDeadline: "registration_deadline",
          certificateEnabled: "certificate_enabled",
          priceCents: "price_cents",
          registrationFields: "registration_fields",
        };
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const [input, column] of Object.entries(columnNames)) {
          if (!(input in b)) continue;
          const from = event[column];
          const to = input === "registrationFields" ? b.registrationFields : (b as Record<string, unknown>)[input];
          if (JSON.stringify(from) !== JSON.stringify(to)) changes[input] = { from, to };
        }
        if (Object.keys(changes).length)
          await q(
            "INSERT INTO event_change_log(church_id,event_id,actor_id,actor_name,changes) VALUES($1,$2,$3,$4,$5)",
            [r.church, id, r.actor.id, r.actor.name, JSON.stringify(changes)],
          );
        await audit(q, r.actor.id, r.church, "event.updated", id);
        return row;
      });
      s.json(updated);
    }),
  );
  app.get(
    "/api/agenda/events/:id/history",
    route(async (r, s) => {
      await manage(r);
      const id = z.uuid().parse(r.params.id);
      const params = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [count] = await q("SELECT count(*)::int AS total FROM event_change_log WHERE event_id=$1 AND church_id=$2", [id, r.church]);
          const items = await q(
            "SELECT h.id,h.changes,h.changed_at,h.actor_name FROM event_change_log h WHERE h.event_id=$1 AND h.church_id=$2 ORDER BY h.changed_at DESC LIMIT $3 OFFSET $4",
            [id, r.church, params.pageSize, (params.page - 1) * params.pageSize],
          );
          return { items, total: Number(count.total), page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)) };
        }),
      );
    }),
  );
  app.post(
    "/api/agenda/events/:id/cancel",
    route(async (r, s) => {
      await manage(r);
      await db.transaction(async (q) => {
        const [v] = await q(
          "UPDATE church_events SET status='cancelled' WHERE id=$1 AND church_id=$2 RETURNING id",
          [z.uuid().parse(r.params.id), r.church],
        );
        requireThat(v, 404, "Evento não encontrado.");
        await q("DELETE FROM schedules WHERE church_id=$1 AND event_id=$2", [
          r.church,
          v.id,
        ]);
        await audit(q, r.actor.id, r.church, "event.cancelled", v.id);
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/agenda/teams",
    route(async (r, s) => {
      await manage(r);
      const b = z
        .object({ name: z.string().trim().min(2).max(120) })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          const [v] = await q(
            "INSERT INTO ministry_teams(church_id,name) VALUES($1,$2) RETURNING *",
            [r.church, b.name],
          );
          await audit(q, r.actor.id, r.church, "ministry.created", v.id);
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/agenda/teams/:id/members",
    route(async (r, s) => {
      await manage(r);
      const id = z.uuid().parse(r.params.id),
        b = z
          .object({ userId: z.uuid(), role: z.string().trim().min(2).max(80) })
          .parse(r.body);
      await db.transaction(async (q) => {
        await q(
          "INSERT INTO ministry_members(church_id,team_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role",
          [r.church, id, b.userId, b.role],
        );
        await audit(q, r.actor.id, r.church, "ministry.member-added", id);
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/agenda/volunteers",
    route(async (r, s) => {
      await manage(r);
      s.json(
        await db.transaction((q) =>
          q(
            "SELECT u.id,u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.church_id=$1 ORDER BY u.name",
            [r.church],
          ),
        ),
      );
    }),
  );
  app.post(
    "/api/agenda/schedules",
    route(async (r, s) => {
      await manage(r);
      const b = z
        .object({ userId: z.uuid(), teamId: z.uuid(), eventId: z.uuid(), overrideReason: z.string().trim().max(500).default("") })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `volunteer:${b.userId}`,
          ]);
          const [event] = await q(
            "SELECT * FROM church_events WHERE id=$1 AND church_id=$2 AND status='scheduled' FOR UPDATE",
            [b.eventId, r.church],
          );
          requireThat(event, 400, "Evento inválido.");
          const [team] = await q(
            "SELECT t.name FROM ministry_teams t JOIN ministry_members m ON m.team_id=t.id WHERE t.id=$1 AND t.church_id=$2 AND m.user_id=$3",
            [b.teamId, r.church, b.userId],
          );
          requireThat(team, 400, "Pessoa não está vinculada à equipe.");
          const requirements = await q("SELECT name FROM ministry_training_requirements WHERE church_id=$1 AND team_id=$2 AND active", [r.church, b.teamId]);
          for (const requirement of requirements) {
            const [valid] = await q("SELECT 1 FROM ministry_training WHERE church_id=$1 AND user_id=$2 AND (team_id=$3 OR team_id IS NULL) AND name=$4 AND completed_at<=CURRENT_DATE AND (expires_at IS NULL OR expires_at>=CURRENT_DATE) ORDER BY completed_at DESC LIMIT 1", [r.church,b.userId,b.teamId,requirement.name]);
            if (!valid) {
              requireThat(b.overrideReason.length >= 10, 409, `Treinamento obrigatório pendente: ${requirement.name}. Informe uma justificativa de exceção autorizada.`);
              await audit(q, r.actor.id, r.church, "schedule.training-override", b.teamId);
            }
          }
          requireThat(
            !(
              await q(
                "SELECT 1 FROM volunteer_unavailability WHERE church_id=$1 AND user_id=$2 AND starts_at<$4 AND ends_at>$3",
                [r.church, b.userId, event.starts_at, event.ends_at],
              )
            ).length,
            409,
            "Pessoa indisponível nesse horário.",
          );
          requireThat(
            !(
              await q(
                "SELECT 1 FROM schedules WHERE church_id=$1 AND user_id=$2 AND response<>'declined' AND starts_at<$4 AND ends_at>$3",
                [r.church, b.userId, event.starts_at, event.ends_at],
              )
            ).length,
            409,
            "Pessoa já escalada nesse horário.",
          );
          const [v] = await q(
            "INSERT INTO schedules(church_id,user_id,ministry,starts_at,ends_at,event_id,team_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [
              r.church,
              b.userId,
              team.name,
              event.starts_at,
              event.ends_at,
              b.eventId,
              b.teamId,
            ],
          );
          await audit(q, r.actor.id, r.church, "schedule.created", v.id);
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/agenda/training",
    route(async (r, s) => {
      await manage(r);
      const b = z
        .object({
          userId: z.uuid(),
          teamId: z.uuid().nullable().default(null),
          name: z.string().trim().min(2).max(160),
          completedAt: z.iso.date(),
          expiresAt: z.iso.date().nullable().default(null),
        })
        .parse(r.body);
      s.status(201).json(
        await db.transaction(async (q) => {
          if (b.teamId)
            requireThat(
              (
                await q(
                  "SELECT 1 FROM ministry_members WHERE church_id=$1 AND team_id=$2 AND user_id=$3",
                  [r.church, b.teamId, b.userId],
                )
              ).length,
              400,
              "Pessoa não está vinculada à equipe.",
            );
          const [v] = await q(
            "INSERT INTO ministry_training(church_id,user_id,team_id,name,completed_at,expires_at,verified_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [r.church, b.userId, b.teamId, b.name, b.completedAt, b.expiresAt, r.actor.id],
          );
          await audit(q, r.actor.id, r.church, "ministry.training-recorded", v.id);
          return v;
        }),
      );
    }),
  );
  app.post("/api/agenda/training-requirements", route(async (r, s) => {
    await manage(r);
    const b = z.object({ teamId: z.uuid(), name: z.string().trim().min(2).max(160) }).parse(r.body);
    s.status(201).json(await db.transaction(async (q) => {
      const [team] = await q("SELECT id FROM ministry_teams WHERE id=$1 AND church_id=$2", [b.teamId, r.church]);
      requireThat(team, 404, "Equipe não encontrada.");
      const [v] = await q("INSERT INTO ministry_training_requirements(church_id,team_id,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(team_id,name) DO UPDATE SET active=true RETURNING *", [r.church,b.teamId,b.name,r.actor.id]);
      await audit(q,r.actor.id,r.church,"ministry.training-requirement-created",v.id); return v;
    }));
  }));
  app.post(
    "/api/agenda/schedules/:id/substitutions",
    route(async (r, s) => {
      const id = z.uuid().parse(r.params.id);
      const b = z.object({ substituteUserId: z.uuid(), reason: z.string().trim().max(500).default("") }).parse(r.body);
      const [schedule] = await scoped(r, (q) => q("SELECT * FROM schedules WHERE id=$1", [id]));
      requireThat(schedule, 404, "Escala não encontrada.");
      requireThat(schedule.user_id === r.actor.id || (await scoped(r, (q) => q("SELECT local_role() IN ('admin','secretary') AS allowed")))[0].allowed, 403, "Somente o responsável ou a secretaria pode solicitar substituição.");
      requireThat(b.substituteUserId !== schedule.user_id, 400, "Escolha outro voluntário.");
      requireThat((await scoped(r, (q) => q("SELECT 1 FROM ministry_members WHERE church_id=$1 AND team_id=$2 AND user_id=$3", [r.church, schedule.team_id, b.substituteUserId]))).length, 400, "O substituto precisa pertencer à equipe.");
      s.status(201).json(await db.transaction(async (q) => {
        const [v] = await q("INSERT INTO schedule_substitutions(church_id,schedule_id,original_user_id,substitute_user_id,requested_by,reason) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(schedule_id,substitute_user_id) DO UPDATE SET status='pending',reason=excluded.reason,requested_by=excluded.requested_by,responded_at=NULL RETURNING *", [r.church,id,schedule.user_id,b.substituteUserId,r.actor.id,b.reason]);
        await audit(q,r.actor.id,r.church,"schedule.substitution-requested",v.id); return v;
      }));
    }),
  );
  app.patch(
    "/api/agenda/substitutions/:id",
    route(async (r, s) => {
      const id = z.uuid().parse(r.params.id), b = z.object({ status: z.enum(["accepted", "declined", "cancelled"]) }).parse(r.body);
      const [sub] = await scoped(r, (q) => q("SELECT * FROM schedule_substitutions WHERE id=$1", [id]));
      requireThat(sub, 404, "Solicitação não encontrada.");
      const [manager] = await scoped(r, (q) => q("SELECT local_role() IN ('admin','secretary') AS allowed"));
      requireThat(sub.substitute_user_id === r.actor.id || sub.requested_by === r.actor.id || manager.allowed, 403, "Sem permissão para responder esta solicitação.");
      s.json(await db.transaction(async (q) => {
        if (b.status === "accepted") {
          await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`volunteer:${sub.substitute_user_id}`]);
          const [schedule] = await q("SELECT * FROM schedules WHERE id=$1 FOR UPDATE", [sub.schedule_id]);
          requireThat(schedule && schedule.response !== "declined", 409, "Escala indisponível.");
          requireThat(!(await q("SELECT 1 FROM volunteer_unavailability WHERE church_id=$1 AND user_id=$2 AND starts_at<$4 AND ends_at>$3", [r.church,sub.substitute_user_id,schedule.starts_at,schedule.ends_at])).length, 409, "Substituto indisponível nesse horário.");
          requireThat(!(await q("SELECT 1 FROM schedules WHERE church_id=$1 AND user_id=$2 AND id<>$3 AND response<>'declined' AND starts_at<$5 AND ends_at>$4", [r.church,sub.substitute_user_id,schedule.id,schedule.starts_at,schedule.ends_at])).length, 409, "Substituto já está escalado nesse horário.");
          await q("UPDATE schedules SET user_id=$2,response='accepted' WHERE id=$1", [schedule.id,sub.substitute_user_id]);
        }
        const [v] = await q("UPDATE schedule_substitutions SET status=$2,responded_at=now() WHERE id=$1 RETURNING *", [id,b.status]);
        await audit(q,r.actor.id,r.church,`schedule.substitution-${b.status}`,id); return v;
      }));
    }),
  );
  app.post(
    "/api/agenda/unavailability",
    route(async (r, s) => {
      const b = interval.parse(r.body);
      const [member] = await scoped(r, (q) =>
        q("SELECT local_role() IS NOT NULL AS allowed"),
      );
      requireThat(member.allowed, 403, "Vínculo local obrigatório.");
      s.status(201).json(
        await db.transaction(async (q) => {
          await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `volunteer:${r.actor.id}`,
          ]);
          requireThat(
            !(
              await q(
                "SELECT 1 FROM schedules WHERE church_id=$1 AND user_id=$2 AND response='accepted' AND starts_at<$4 AND ends_at>$3",
                [r.church, r.actor.id, b.startsAt, b.endsAt],
              )
            ).length,
            409,
            "Recuse a escala confirmada antes de marcar indisponibilidade.",
          );
          const [v] = await q(
            "INSERT INTO volunteer_unavailability(church_id,user_id,starts_at,ends_at) VALUES($1,$2,$3,$4) RETURNING id",
            [r.church, r.actor.id, b.startsAt, b.endsAt],
          );
          await audit(q, r.actor.id, r.church, "volunteer.unavailable", v.id);
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/tasks",
    route(async (r, s) => {
      const b = z
        .object({
          title: z.string().trim().min(3).max(300),
          scope: z.enum(["people", "cells", "finance", "pastoral"]),
          dueOn: z.iso.date(),
          personId: z.uuid().optional(),
          assignedTo: z.uuid().optional(),
        })
        .parse(r.body);
      await can(r, b.scope, true);
      if (b.personId)
        requireThat(
          (
            await scoped(r, (q) =>
              q("SELECT 1 FROM people WHERE id=$1", [b.personId]),
            )
          ).length,
          403,
          "Pessoa fora do escopo.",
        );
      if (b.assignedTo) {
        const [p] = await db.transaction(
          (q) => q("SELECT can_access($1) AS allowed", [b.scope]),
          { actor: b.assignedTo, church: r.church },
        );
        requireThat(
          p.allowed,
          400,
          "Responsável sem permissão para essa área.",
        );
        if (b.personId)
          requireThat(
            (
              await db.transaction(
                (q) => q("SELECT id FROM people WHERE id=$1", [b.personId]),
                { actor: b.assignedTo, church: r.church },
              )
            ).length,
            400,
            "Responsável sem acesso à pessoa vinculada.",
          );
      }
      s.status(201).json(
        await db.transaction(async (q) => {
          const [v] = await q(
            "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [
              r.church,
              b.scope,
              encrypt(b.title, key),
              b.dueOn,
              b.personId ?? null,
              b.assignedTo ?? r.actor.id,
              r.actor.id,
            ],
          );
          await audit(q, r.actor.id, r.church, "task.created", v.id);
          await notifyTaskAssignee(q, r.church, v.id, b.assignedTo ?? r.actor.id, b.title, b.dueOn, r.actor.id);
          return v;
        }),
      );
    }),
  );
  app.patch(
    "/api/tasks/:id",
    route(async (r, s) => {
      const id = z.uuid().parse(r.params.id),
        b = z
          .object({
            status: z.enum(["open", "in_progress", "done", "cancelled"]),
            version: z.number().int().positive(),
            assignedTo: z.uuid().nullable().optional(),
          })
          .parse(r.body),
        [task] = await scoped(r, (q) =>
          q("SELECT id,scope,person_id,assigned_to,encrypted_title,due_on FROM operational_tasks WHERE id=$1", [id]),
        );
      requireThat(task, 404, "Tarefa não encontrada.");
      await can(r, task.scope, true);
      if (b.assignedTo) {
        const [assignee] = await db.transaction((q) => q("SELECT can_access($1) AS allowed", [task.scope]), { actor: b.assignedTo, church: r.church });
        requireThat(assignee?.allowed, 400, "Responsável sem permissão para essa área.");
        if (task.person_id) requireThat((await db.transaction((q) => q("SELECT id FROM people WHERE id=$1", [task.person_id]), { actor: b.assignedTo, church: r.church })).length, 400, "Responsável sem acesso à pessoa vinculada.");
      }
      await db.transaction(async (q) => {
        const rows = b.assignedTo === undefined
          ? await q("UPDATE operational_tasks SET status=$3,completed_at=CASE WHEN $3='done' THEN COALESCE(completed_at,now()) WHEN $3 IN ('open','in_progress') THEN NULL ELSE completed_at END,version=version+1 WHERE id=$1 AND church_id=$2 AND version=$4 RETURNING id", [id, r.church, b.status, b.version])
          : await q("UPDATE operational_tasks SET status=$3,assigned_to=$4,completed_at=CASE WHEN $3='done' THEN COALESCE(completed_at,now()) WHEN $3 IN ('open','in_progress') THEN NULL ELSE completed_at END,version=version+1 WHERE id=$1 AND church_id=$2 AND version=$5 RETURNING id", [id, r.church, b.status, b.assignedTo, b.version]);
        requireThat(rows.length, 409, "Tarefa alterada. Atualize a tela.");
        await audit(q, r.actor.id, r.church, b.assignedTo === undefined ? `task.${b.status}` : "task.reassigned", id);
        if (b.assignedTo !== undefined && b.assignedTo !== task.assigned_to) await notifyTaskAssignee(q, r.church, id, b.assignedTo, decrypt(task.encrypted_title, key), String(task.due_on), r.actor.id);
      });
      s.json({ ok: true });
    }),
  );
  app.post(
    "/api/tasks/:id/claim",
    route(async (r, s) => {
      const id = z.uuid().parse(r.params.id),
        b = z.object({ version: z.number().int().positive() }).parse(r.body);
      const [task] = await scoped(r, (q) =>
        q("SELECT id,scope FROM operational_tasks WHERE id=$1", [id]),
      );
      requireThat(task, 404, "Tarefa não encontrada.");
      await can(r, task.scope, true);
      await db.transaction(async (q) => {
        const rows = await q(
          "UPDATE operational_tasks SET assigned_to=$3,version=version+1 WHERE id=$1 AND church_id=$2 AND assigned_to IS NULL AND version=$4 AND status IN ('open','in_progress') RETURNING id",
          [id, r.church, r.actor.id, b.version],
        );
        requireThat(
          rows.length,
          409,
          "Tarefa já atribuída ou alterada. Atualize a tela.",
        );
        await audit(q, r.actor.id, r.church, "task.claimed", id);
      });
      s.json({ ok: true });
    }),
  );
}
