import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Database, Row, Query } from "./db.js";
import { audit } from "./seed.js";
import { requireThat } from "./security.js";

type R = Request & { actor: Row; church: string };
const route = (fn: (r: R, s: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as R, res)).catch(next);
const id = z.uuid();
const eventSchema = z.object({
  subjectType: z.enum(["person", "church", "network"]),
  subjectId: id,
  eventDate: z.iso.date(),
  eventType: z.enum(["foundation", "leadership", "membership", "discipleship", "education", "family", "ministry", "department", "campaign", "festival", "visit", "transfer", "other"]).default("other"),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(4000).default(""),
  visibility: z.enum(["administrative", "leadership", "private"]).default("administrative"),
  sourceType: z.string().trim().max(60).nullable().optional(),
  sourceId: id.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export function historyRoutes(app: Express, db: Database) {
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(fn, { actor: r.actor.id, church: r.church });
  };
  const manage = async (r: R) => {
    requireThat(r.actor?.mfa, 403, "Confirme MFA.");
    const [p] = await scoped(r, (q) => q("SELECT can_access('people',true) AS allowed"));
    requireThat(p?.allowed, 403, "Secretaria ou administração obrigatória.");
  };
  const subjectCheck = async (q: Query, r: R, type: string, subjectId: string) => {
    if (type === "person") requireThat((await q("SELECT 1 FROM people WHERE id=$1 AND church_id=$2", [subjectId, r.church])).length > 0, 404, "Pessoa não encontrada.");
    else if (type === "church") requireThat(subjectId === r.church, 403, "Unidade fora do escopo.");
  };

  app.get("/api/history", route(async (r, s) => {
    const query = z.object({
      subjectType: z.enum(["person", "church", "network"]).default("church"),
      subjectId: id.optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      eventType: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(r.query);
    const subjectId = query.subjectId ?? r.church;
    s.json(await scoped(r, async (q) => {
      await subjectCheck(q, r, query.subjectType, subjectId);
      const where = ["church_id=$1", "subject_type=$2", "subject_id=$3"];
      const params: unknown[] = [r.church, query.subjectType, subjectId];
      if (query.from) { params.push(query.from); where.push("event_date >= $" + params.length); }
      if (query.to) { params.push(query.to); where.push("event_date <= $" + params.length); }
      if (query.eventType) { params.push(query.eventType); where.push("event_type = $" + params.length); }
      const offset = (query.page - 1) * query.pageSize;
      params.push(query.pageSize, offset);
      const [items, count] = await Promise.all([
        q("SELECT id,subject_type,subject_id,event_date,event_type,title,description,visibility,source_type,source_id,metadata,created_by,created_at,updated_at FROM historical_events WHERE " + where.join(" AND ") + " ORDER BY event_date DESC,created_at DESC LIMIT $" + (params.length - 1) + " OFFSET $" + params.length, params),
        q("SELECT count(*)::int AS total FROM historical_events WHERE " + where.join(" AND "), params.slice(0, -2)),
      ]);
      const total = Number(count[0]?.total ?? 0);
      return { items, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
    }));
  }));

  app.get("/api/history/report", route(async (r, s) => {
    const query = z.object({ subjectType: z.enum(["person", "church"]).default("church"), subjectId: id.optional(), from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(r.query);
    const subjectId = query.subjectId ?? r.church;
    s.json(await scoped(r, async (q) => {
      await subjectCheck(q, r, query.subjectType, subjectId);
      const filter = query.subjectType === "person" ? " AND he.subject_id=$2" : "";
      const params: unknown[] = query.subjectType === "person" ? [r.church, subjectId] : [r.church];
      const dateParts: string[] = [];
      if (query.from) { params.push(query.from); dateParts.push("he.event_date >= $" + params.length); }
      if (query.to) { params.push(query.to); dateParts.push("he.event_date <= $" + params.length); }
      const dateFilter = dateParts.length ? " AND " + dateParts.join(" AND ") : "";
      let events = await q("SELECT he.id,he.event_date,he.event_type,he.title,he.description,he.visibility,he.source_type,he.source_id FROM historical_events he WHERE he.church_id=$1" + (query.subjectType === "person" ? " AND he.subject_type='person' AND he.subject_id=$2" : " AND he.subject_type='church' AND he.subject_id=$1") + dateFilter + " ORDER BY he.event_date ASC,he.created_at ASC", params);
      const inPeriod = (value: unknown) => {
        const date = String(value ?? "").slice(0, 10);
        return (!query.from || date >= query.from) && (!query.to || date <= query.to);
      };
      if (query.subjectType === "person") {
        const [person] = await q("SELECT id,name,status,created_at FROM people WHERE id=$1 AND church_id=$2", [subjectId, r.church]);
        const [education] = await q("SELECT count(*)::int AS total, count(*) FILTER (WHERE ee.status='completed')::int AS completed FROM education_enrollments ee WHERE ee.church_id=$1 AND ee.person_id=$2", [r.church, subjectId]);
        const educationRows = await q("SELECT ee.id,ee.enrolled_at,ee.status,cl.name AS class_name,c.name AS course_name,c.track FROM education_enrollments ee JOIN education_classes cl ON cl.id=ee.class_id JOIN education_courses c ON c.id=cl.course_id WHERE ee.church_id=$1 AND ee.person_id=$2", [r.church, subjectId]);
        const derived = educationRows.flatMap((row) => {
          const values = [{ date: String(row.enrolled_at).slice(0, 10), suffix: "Matrícula" }];
          if (row.status === "completed") values.push({ date: String(row.enrolled_at).slice(0, 10), suffix: "Conclusão" });
          return values.filter((value) => inPeriod(value.date)).map((value) => ({
            id: `education-${row.id}-${value.suffix}`,
            event_date: value.date,
            event_type: row.track === "discipulado" ? "discipleship" : "education",
            title: `${value.suffix} · ${row.course_name} · ${row.class_name}`,
            description: `Modalidade: ${row.track ?? "curso"}`,
            visibility: "administrative",
            source_type: "education_enrollment",
            source_id: row.id,
          }));
        });
        const attendanceRows = await q("SELECT a.id,m.held_on FROM attendance a JOIN meetings m ON m.id=a.meeting_id WHERE a.church_id=$1 AND a.person_id=$2 AND a.present=true", [r.church, subjectId]);
        const attendanceEvents = attendanceRows.filter((row) => inPeriod(row.held_on)).map((row) => ({
          id: `attendance-${row.id}`,
          event_date: String(row.held_on).slice(0, 10),
          event_type: "other",
          title: "Presença em reunião",
          description: "Presença confirmada em reunião da igreja.",
          visibility: "administrative",
          source_type: "attendance",
          source_id: row.id,
        }));
        events = [...events, ...derived, ...attendanceEvents].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
        return { subject: person, events, metrics: { educationEnrollments: Number(education?.total ?? 0), educationCompleted: Number(education?.completed ?? 0), confirmedMeetings: attendanceEvents.length } };
      }
      const [church] = await q("SELECT id,name,affiliated_on FROM churches WHERE id=$1", [r.church]);
      const [people] = await q("SELECT count(*)::int AS total, count(*) FILTER (WHERE status='member')::int AS members, count(*) FILTER (WHERE status='visitor')::int AS visitors, count(*) FILTER (WHERE status='worker')::int AS workers FROM people WHERE church_id=$1", [r.church]);
      const [meetings] = await q("SELECT COALESCE(sum(visitors),0)::int AS visitors, count(*)::int AS meetings FROM meetings WHERE church_id=$1", [r.church]);
      const [classes] = await q("SELECT count(*)::int AS classes FROM education_classes WHERE church_id=$1", [r.church]);
      const agendaRows = await q("SELECT id,starts_at,title,kind,status FROM church_events WHERE church_id=$1 ORDER BY starts_at", [r.church]);
      const meetingRows = await q("SELECT id,held_on FROM meetings WHERE church_id=$1 ORDER BY held_on", [r.church]);
      const derivedChurchEvents = [
        ...agendaRows.filter((row) => inPeriod(row.starts_at)).map((row) => ({
          id: `agenda-${row.id}`,
          event_date: String(row.starts_at).slice(0, 10),
          event_type: row.kind === "class" ? "education" : "other",
          title: row.title,
          description: row.status === "cancelled" ? "Atividade cancelada." : "Atividade registrada na agenda.",
          visibility: "administrative",
          source_type: "church_event",
          source_id: row.id,
        })),
        ...meetingRows.filter((row) => inPeriod(row.held_on)).map((row) => ({
          id: `meeting-${row.id}`,
          event_date: String(row.held_on).slice(0, 10),
          event_type: "other",
          title: "Reunião de grupo",
          description: "Reunião registrada nos grupos.",
          visibility: "administrative",
          source_type: "meeting",
          source_id: row.id,
        })),
      ];
      events = [...events, ...derivedChurchEvents].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
      return { subject: church, events, metrics: { people: Number(people?.total ?? 0), members: Number(people?.members ?? 0), visitors: Number(people?.visitors ?? 0), workers: Number(people?.workers ?? 0), meetingVisitors: Number(meetings?.visitors ?? 0), meetings: Number(meetings?.meetings ?? 0), classes: Number(classes?.classes ?? 0), agendaActivities: agendaRows.length } };
    }));
  }));

  app.get("/api/history/export.csv", route(async (r, s) => {
    const query = z.object({
      subjectType: z.enum(["person", "church"]).default("church"),
      subjectId: id.optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    }).parse(r.query);
    const subjectId = query.subjectId ?? r.church;
    const rows = await scoped(r, async (q) => {
      await subjectCheck(q, r, query.subjectType, subjectId);
      const where = ["church_id=$1", "subject_type=$2", "subject_id=$3"];
      const params: unknown[] = [r.church, query.subjectType, subjectId];
      if (query.from) { params.push(query.from); where.push("event_date >= $" + params.length); }
      if (query.to) { params.push(query.to); where.push("event_date <= $" + params.length); }
      return q("SELECT event_date,event_type,title,description,visibility FROM historical_events WHERE " + where.join(" AND ") + " ORDER BY event_date ASC,created_at ASC", params);
    });
    const escape = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const csv = ["date,type,title,description,visibility", ...rows.map((row) => [row.event_date, row.event_type, row.title, row.description, row.visibility].map(escape).join(","))].join("\r\n") + "\r\n";
    s.type("text/csv; charset=utf-8").attachment("linha-do-tempo.csv").send("\ufeff" + csv);
  }));

  app.post("/api/history", route(async (r, s) => {
    await manage(r);
    const body = eventSchema.parse(r.body);
    s.status(201).json(await scoped(r, async (q) => {
      await subjectCheck(q, r, body.subjectType, body.subjectId);
      const [event] = await q("INSERT INTO historical_events(church_id,subject_type,subject_id,event_date,event_type,title,description,visibility,source_type,source_id,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *", [r.church, body.subjectType, body.subjectId, body.eventDate, body.eventType, body.title, body.description, body.visibility, body.sourceType ?? null, body.sourceId ?? null, JSON.stringify(body.metadata), r.actor.id]);
      await audit(q, r.actor.id, r.church, "history.created", event.id);
      return event;
    }));
  }));

  app.patch("/api/history/:id", route(async (r, s) => {
    await manage(r);
    const eventId = id.parse(r.params.id);
    const body = eventSchema.partial().parse(r.body);
    s.json(await scoped(r, async (q) => {
      const [event] = await q("UPDATE historical_events SET event_date=COALESCE($2,event_date),event_type=COALESCE($3,event_type),title=COALESCE($4,title),description=COALESCE($5,description),visibility=COALESCE($6,visibility),metadata=COALESCE($7,metadata),updated_at=now() WHERE id=$1 AND church_id=$8 RETURNING *", [eventId, body.eventDate ?? null, body.eventType ?? null, body.title ?? null, body.description ?? null, body.visibility ?? null, body.metadata ? JSON.stringify(body.metadata) : null, r.church]);
      requireThat(event, 404, "Registro histórico não encontrado.");
      await audit(q, r.actor.id, r.church, "history.updated", eventId);
      return event;
    }));
  }));

  app.delete("/api/history/:id", route(async (r, s) => {
    await manage(r);
    const eventId = id.parse(r.params.id);
    await scoped(r, async (q) => {
      const [event] = await q("DELETE FROM historical_events WHERE id=$1 AND church_id=$2 RETURNING id", [eventId, r.church]);
      requireThat(event, 404, "Registro histórico não encontrado.");
      await audit(q, r.actor.id, r.church, "history.deleted", eventId);
    });
    s.json({ ok: true });
  }));
}