import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { z } from "zod";
import { audit } from "./seed.js";
import { requireThat, encrypt } from "./security.js";
import { randomUUID } from "node:crypto";
type R = Request & { actor: Row; church: string };
const route =
  (fn: (r: R, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as R, s)).catch(n);
const uuid = z.uuid();
export function educationRoutes(app: Express, db: Database, key?: Buffer) {
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) =>
    db.transaction(fn, { actor: r.actor.id, church: r.church });
  const permit = async (r: R, write = false) => {
    const [v] = await scoped(r, (q) =>
      q("SELECT (local_role() IN ('admin','secretary')) AS allowed"),
    );
    requireThat(v.allowed, 403, "Permissão para ensino necessária.");
  };
  const promoteWaitlisted = async (
    q: Query,
    church: string,
    classId: string,
    actorId: string,
  ) => {
    const [cl] = await q(
      "SELECT capacity FROM education_classes WHERE id=$1 AND church_id=$2",
      [classId, church],
    );
    if (!cl || cl.capacity === null) return;
    const [active] = await q(
      "SELECT count(*)::int AS total FROM education_enrollments WHERE class_id=$1 AND status='active'",
      [classId],
    );
    const spots = Math.max(0, Number(cl.capacity) - Number(active.total));
    for (let index = 0; index < spots; index++) {
      const [next] = await q(
        "SELECT id FROM education_enrollments WHERE class_id=$1 AND status='waitlisted' ORDER BY enrolled_at,id FOR UPDATE LIMIT 1",
        [classId],
      );
      if (!next) break;
      await q("UPDATE education_enrollments SET status='active' WHERE id=$1", [
        next.id,
      ]);
      await audit(q, actorId, church, "education.waitlist-promoted", next.id);
    }
  };
  app.get(
    "/api/portal/education",
    route(async (r, s) => {
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      const result = await db.transaction(async (q) => {
        const [total] = await q(
          "SELECT count(*)::int AS total FROM education_classes WHERE church_id=$1 AND status='open'",
          [r.church],
        );
        const classes = await q(
          "SELECT cl.id,cl.name,cl.starts_on,cl.ends_on,cl.capacity,c.name AS course_name,c.description,c.completion_percent,CASE WHEN e.status='cancelled' THEN NULL ELSE e.id END AS enrollment_id,e.status AS enrollment_status,COALESCE((SELECT count(*)::int FROM education_attendance a WHERE a.enrollment_id=e.id),0) AS attendance_total,COALESCE((SELECT count(*)::int FROM education_attendance a WHERE a.enrollment_id=e.id AND a.present),0) AS attendance_present,(SELECT cert.code FROM education_certificates cert WHERE cert.class_id=cl.id AND cert.person_id=e.person_id) AS certificate_code,CASE WHEN e.id IS NOT NULL AND e.status IN ('active','completed') THEN COALESCE((SELECT json_agg(json_build_object('id',m.id,'title',m.title,'kind',m.kind,'location',m.location) ORDER BY m.position,m.title) FROM education_materials m WHERE m.class_id=cl.id OR m.course_id=cl.course_id),'[]'::json) ELSE '[]'::json END AS materials FROM education_classes cl JOIN education_courses c ON c.id=cl.course_id LEFT JOIN education_enrollments e ON e.class_id=cl.id AND e.person_id=(SELECT id FROM people WHERE church_id=$1 AND user_id=$2) WHERE cl.church_id=$1 AND cl.status='open' ORDER BY cl.starts_on,c.name LIMIT $3 OFFSET $4",
          [
            r.church,
            r.actor.id,
            params.pageSize,
            (params.page - 1) * params.pageSize,
          ],
        );
        return {
          classes,
          page: params.page,
          pageSize: params.pageSize,
          total: Number(total.total),
          pages: Math.max(1, Math.ceil(Number(total.total) / params.pageSize)),
        };
      });
      s.json(result);
    }),
  );
  app.get(
    "/api/portal/education/certificates",
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
            "SELECT count(*)::int AS total FROM education_certificates WHERE church_id=$1 AND person_id=$2",
            [r.church, person.id],
          );
          const items = await q(
            "SELECT c.id,c.code,c.issued_at,cl.name AS class_name,co.name AS course_name FROM education_certificates c JOIN education_classes cl ON cl.id=c.class_id JOIN education_courses co ON co.id=cl.course_id WHERE c.church_id=$1 AND c.person_id=$2 ORDER BY c.issued_at DESC,c.id DESC LIMIT $3 OFFSET $4",
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
    "/api/portal/education/results",
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
            "SELECT count(*)::int AS total FROM education_assessment_results r JOIN education_assessments a ON a.id=r.assessment_id JOIN education_enrollments e ON e.id=r.enrollment_id WHERE r.church_id=$1 AND e.person_id=$2 AND a.published=true AND e.status IN ('active','completed')",
            [r.church, person.id],
          );
          const items = await q(
            "SELECT r.id,r.score,r.feedback,r.graded_at,a.title AS assessment_title,cl.name AS class_name FROM education_assessment_results r JOIN education_assessments a ON a.id=r.assessment_id JOIN education_classes cl ON cl.id=a.class_id JOIN education_enrollments e ON e.id=r.enrollment_id WHERE r.church_id=$1 AND e.person_id=$2 AND a.published=true AND e.status IN ('active','completed') ORDER BY r.graded_at DESC,r.id DESC LIMIT $3 OFFSET $4",
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
    "/api/public/education/classes/:id/interest",
    route(async (r, s) => {
      const classId = uuid.parse(r.params.id);
      const b = z
        .object({
          name: z.string().trim().min(2).max(160),
          email: z.email(),
          phone: z.string().trim().max(30).default(""),
          message: z.string().trim().max(500).default(""),
          consent: z.literal(true),
        })
        .parse(r.body);
      const result = await db.transaction(async (q) => {
        const [clazz] = await q(
          "SELECT id,church_id FROM education_classes WHERE id=$1 AND status='open' AND public_catalog=true",
          [classId],
        );
        requireThat(clazz, 404, "Curso não disponível para interesse.");
        const [existing] = await q(
          "SELECT id,status FROM education_interest_requests WHERE class_id=$1 AND lower(email)=lower($2) AND status<>'closed' ORDER BY created_at DESC LIMIT 1",
          [classId, b.email],
        );
        if (existing) return existing;
        const [request] = await q(
          "INSERT INTO education_interest_requests(church_id,class_id,name,email,phone,message,consent_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING id,status,created_at",
          [
            clazz.church_id,
            classId,
            b.name,
            b.email.toLowerCase(),
            b.phone,
            b.message,
          ],
        );
        if (key) {
          const [owner] = await q(
            "SELECT user_id FROM memberships WHERE church_id=$1 ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END LIMIT 1",
            [clazz.church_id],
          );
          if (owner)
            await q(
              "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+2,$3,$3,'education_interest',$4) ON CONFLICT DO NOTHING",
              [
                clazz.church_id,
                encrypt(`Contato · ${b.name}`, key),
                owner.user_id,
                request.id,
              ],
            );
        }
        return request;
      });
      s.status(201).json(result);
    }),
  );
  app.post(
    "/api/portal/education/classes/:id/enroll",
    route(async (r, s) => {
      const classId = uuid.parse(r.params.id);
      const enrollment = await db.transaction(async (q) => {
        const [person] = await q(
          "SELECT id FROM people WHERE church_id=$1 AND user_id=$2",
          [r.church, r.actor.id],
        );
        requireThat(
          person,
          404,
          "Seu cadastro de membro ainda não está vinculado.",
        );
        const [cl] = await q(
          "SELECT * FROM education_classes WHERE id=$1 AND church_id=$2 AND status='open' FOR UPDATE",
          [classId, r.church],
        );
        requireThat(cl, 404, "Turma não encontrada.");
        let status = "active";
        if (cl.capacity !== null) {
          const [count] = await q(
            "SELECT count(*)::int AS total FROM education_enrollments WHERE class_id=$1 AND status='active'",
            [classId],
          );
          if (Number(count.total) >= Number(cl.capacity)) status = "waitlisted";
        }
        const [v] = await q(
          "INSERT INTO education_enrollments(church_id,class_id,person_id,status) VALUES($1,$2,$3,$4) ON CONFLICT(class_id,person_id) DO UPDATE SET status=excluded.status RETURNING *",
          [r.church, classId, person.id, status],
        );
        await audit(q, r.actor.id, r.church, "education.self-enrolled", v.id);
        return v;
      });
      s.status(201).json(enrollment);
    }),
  );
  app.post(
    "/api/portal/education/enrollments/:id/cancel",
    route(async (r, s) => {
      const enrollmentId = uuid.parse(r.params.id);
      const result = await db.transaction(async (q) => {
        const [v] = await q(
          "UPDATE education_enrollments SET status='cancelled' WHERE id=$1 AND church_id=$2 AND person_id=(SELECT id FROM people WHERE church_id=$2 AND user_id=$3) AND status IN ('active','waitlisted') RETURNING *",
          [enrollmentId, r.church, r.actor.id],
        );
        requireThat(v, 404, "Matrícula não encontrada.");
        await promoteWaitlisted(q, r.church, v.class_id, r.actor.id);
        await audit(q, r.actor.id, r.church, "education.self-cancelled", v.id);
        return v;
      });
      s.json(result);
    }),
  );
  app.get(
    "/api/education",
    route(async (r, s) => {
      await permit(r);
      const hasPaging = Object.keys(r.query).length > 0;
      const params = z
        .object({
          coursePage: z.coerce.number().int().min(1).default(1),
          coursePageSize: z.coerce.number().int().min(1).max(100).default(25),
          classPage: z.coerce.number().int().min(1).default(1),
          classPageSize: z.coerce.number().int().min(1).max(100).default(25),
          materialPage: z.coerce.number().int().min(1).default(1),
          materialPageSize: z.coerce.number().int().min(1).max(100).default(25),
          assessmentPage: z.coerce.number().int().min(1).default(1),
          assessmentPageSize: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(25),
        })
        .parse(r.query);
      const result: any = await scoped(r, async (q) => {
        const [
          courses,
          classes,
          materials,
          assessments,
          courseCount,
          classCount,
          materialCount,
          assessmentCount,
        ] = await Promise.all([
          q(
            "SELECT * FROM education_courses ORDER BY name LIMIT $1 OFFSET $2",
            [
              params.coursePageSize,
              (params.coursePage - 1) * params.coursePageSize,
            ],
          ),
          q(
            "SELECT cl.*,c.name AS course_name,count(e.id) FILTER(WHERE e.status='active')::int AS enrolled FROM education_classes cl JOIN education_courses c ON c.id=cl.course_id LEFT JOIN education_enrollments e ON e.class_id=cl.id GROUP BY cl.id,c.name ORDER BY cl.starts_on DESC LIMIT $1 OFFSET $2",
            [
              params.classPageSize,
              (params.classPage - 1) * params.classPageSize,
            ],
          ),
          q(
            "SELECT m.*,c.name AS course_name,cl.name AS class_name FROM education_materials m LEFT JOIN education_courses c ON c.id=m.course_id LEFT JOIN education_classes cl ON cl.id=m.class_id ORDER BY m.position,m.title LIMIT $1 OFFSET $2",
            [
              params.materialPageSize,
              (params.materialPage - 1) * params.materialPageSize,
            ],
          ),
          q(
            "SELECT a.*,cl.name AS class_name FROM education_assessments a JOIN education_classes cl ON cl.id=a.class_id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2",
            [
              params.assessmentPageSize,
              (params.assessmentPage - 1) * params.assessmentPageSize,
            ],
          ),
          q("SELECT count(*)::int AS total FROM education_courses"),
          q("SELECT count(*)::int AS total FROM education_classes"),
          q("SELECT count(*)::int AS total FROM education_materials"),
          q("SELECT count(*)::int AS total FROM education_assessments"),
        ]);
        return {
          courses,
          classes,
          sessions: await q(
            "SELECT * FROM education_sessions ORDER BY held_on DESC LIMIT 200",
          ),
          enrollments: await q(
            "SELECT e.*,p.name AS person_name,cl.name AS class_name FROM education_enrollments e JOIN people p ON p.id=e.person_id JOIN education_classes cl ON cl.id=e.class_id ORDER BY e.enrolled_at DESC LIMIT 500",
          ),
          materials,
          assessments,
          results: await q(
            "SELECT r.*,a.title AS assessment_title,e.person_id,p.name AS person_name FROM education_assessment_results r JOIN education_assessments a ON a.id=r.assessment_id JOIN education_enrollments e ON e.id=r.enrollment_id JOIN people p ON p.id=e.person_id ORDER BY r.graded_at DESC LIMIT 500",
          ),
          coursesPagination: {
            total: courseCount[0].total,
            page: params.coursePage,
            pageSize: params.coursePageSize,
            pages: Math.max(
              1,
              Math.ceil(Number(courseCount[0].total) / params.coursePageSize),
            ),
          },
          classesPagination: {
            total: classCount[0].total,
            page: params.classPage,
            pageSize: params.classPageSize,
            pages: Math.max(
              1,
              Math.ceil(Number(classCount[0].total) / params.classPageSize),
            ),
          },
          materialsPagination: {
            total: materialCount[0].total,
            page: params.materialPage,
            pageSize: params.materialPageSize,
            pages: Math.max(
              1,
              Math.ceil(
                Number(materialCount[0].total) / params.materialPageSize,
              ),
            ),
          },
          assessmentsPagination: {
            total: assessmentCount[0].total,
            page: params.assessmentPage,
            pageSize: params.assessmentPageSize,
            pages: Math.max(
              1,
              Math.ceil(
                Number(assessmentCount[0].total) / params.assessmentPageSize,
              ),
            ),
          },
        };
      });
      if (!hasPaging) {
        delete result.coursesPagination;
        delete result.classesPagination;
        delete result.materialsPagination;
        delete result.assessmentsPagination;
      }
      s.json(result);
    }),
  );
  app.get(
    "/api/education/interests",
    route(async (r, s) => {
      await permit(r);
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
        await scoped(r, async (q) => {
          const filter = params.status === "all" ? "" : " AND i.status=$2";
          const values =
            params.status === "all" ? [r.church] : [r.church, params.status];
          const [count] = await q(
            "SELECT count(*)::int AS total FROM education_interest_requests i WHERE i.church_id=$1" +
              filter,
            values,
          );
          const items = await q(
            "SELECT i.*,cl.name AS class_name,c.name AS course_name FROM education_interest_requests i JOIN education_classes cl ON cl.id=i.class_id JOIN education_courses c ON c.id=cl.course_id WHERE i.church_id=$1" +
              filter +
              " ORDER BY i.status,i.created_at DESC LIMIT $" +
              (values.length + 1) +
              " OFFSET $" +
              (values.length + 2),
            [...values, params.pageSize, (params.page - 1) * params.pageSize],
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
            status: params.status,
          };
        }),
      );
    }),
  );
  app.get(
    "/api/education/interests/export.csv",
    route(async (r, s) => {
      await permit(r);
      const status = z
        .enum(["all", "pending", "contacted", "closed"])
        .parse(String(r.query.status ?? "all"));
      const rows = await scoped(r, (q) =>
        q(
          "SELECT i.name,i.email,i.phone,c.name AS course_name,cl.name AS class_name,i.status,i.created_at FROM education_interest_requests i JOIN education_classes cl ON cl.id=i.class_id JOIN education_courses c ON c.id=cl.course_id WHERE i.church_id=$1 AND ($2='all' OR i.status=$2) ORDER BY i.status,i.created_at DESC",
          [r.church, status],
        ),
      );
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv =
        [
          "name,email,phone,course_name,class_name,status,created_at",
          ...rows.map((v) =>
            [
              v.name,
              v.email,
              v.phone,
              v.course_name,
              v.class_name,
              v.status,
              v.created_at,
            ]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      s.type("text/csv; charset=utf-8")
        .attachment("interesses-cursos.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.patch(
    "/api/education/interests/:id",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({ status: z.enum(["pending", "contacted", "closed"]) })
        .parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          const [v] = await q(
            "UPDATE education_interest_requests SET status=$2,updated_at=now() WHERE id=$1 AND church_id=$3 RETURNING *",
            [uuid.parse(r.params.id), b.status, r.church],
          );
          requireThat(v, 404, "Interesse em curso não encontrado.");
          await audit(
            q,
            r.actor.id,
            r.church,
            "education-interest.updated",
            v.id,
          );
          return v;
        }),
      );
      if (b.status === "closed")
        await db.transaction((q) =>
          q(
            "UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='education_interest' AND source_id=$1 AND status IN ('open','in_progress')",
            [r.params.id],
          ),
        );
    }),
  );
  app.get(
    "/api/education/instructors",
    route(async (r, s) => {
      await permit(r);
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
  app.get(
    "/api/education/enrollments",
    route(async (r, s) => {
      await permit(r);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [count] = await q(
            "SELECT count(*)::int AS total FROM education_enrollments",
            [],
          );
          const items = await q(
            "SELECT e.*,p.name AS person_name,cl.name AS class_name FROM education_enrollments e JOIN people p ON p.id=e.person_id JOIN education_classes cl ON cl.id=e.class_id ORDER BY e.enrolled_at DESC,e.id DESC LIMIT $1 OFFSET $2",
            [params.pageSize, (params.page - 1) * params.pageSize],
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
  app.get(
    "/api/education/classes/:id/enrollments",
    route(async (r, s) => {
      await permit(r);
      const classId = uuid.parse(r.params.id);
      s.json(
        await scoped(r, async (q) =>
          q(
            "SELECT e.id,e.person_id,e.status,p.name AS person_name FROM education_enrollments e JOIN people p ON p.id=e.person_id WHERE e.class_id=$1 AND e.status='active' ORDER BY p.name,e.id",
            [classId],
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/education/assessments/:id/enrollments",
    route(async (r, s) => {
      await permit(r);
      const assessmentId = uuid.parse(r.params.id);
      s.json(
        await scoped(r, async (q) =>
          q(
            "SELECT e.id,e.person_id,e.status,p.name AS person_name FROM education_enrollments e JOIN people p ON p.id=e.person_id WHERE e.class_id=(SELECT class_id FROM education_assessments WHERE id=$1 AND church_id=$2) AND e.status IN ('active','completed') ORDER BY p.name,e.id",
            [assessmentId, r.church],
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/education/sessions",
    route(async (r, s) => {
      await permit(r);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          classId: z.uuid().optional(),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const values: unknown[] = [];
          const filter = params.classId ? " WHERE s.class_id=$1" : "";
          if (params.classId) values.push(params.classId);
          const [count] = await q(
            `SELECT count(*)::int AS total FROM education_sessions s${filter}`,
            values,
          );
          const limit = values.length + 1,
            offset = values.length + 2;
          const items = await q(
            `SELECT s.*,cl.name AS class_name,COUNT(a.enrollment_id)::int AS attendance_total,COUNT(a.enrollment_id) FILTER(WHERE a.present)::int AS attendance_present FROM education_sessions s JOIN education_classes cl ON cl.id=s.class_id LEFT JOIN education_attendance a ON a.session_id=s.id${filter} GROUP BY s.id,cl.name ORDER BY s.held_on DESC,s.id DESC LIMIT $${limit} OFFSET $${offset}`,
            [...values, params.pageSize, (params.page - 1) * params.pageSize],
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
            classId: params.classId ?? null,
          };
        }),
      );
    }),
  );
  app.get(
    "/api/education/results",
    route(async (r, s) => {
      await permit(r);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [count] = await q(
            "SELECT count(*)::int AS total FROM education_assessment_results",
          );
          const items = await q(
            "SELECT r.*,a.title AS assessment_title,cl.name AS class_name,e.person_id,p.name AS person_name FROM education_assessment_results r JOIN education_assessments a ON a.id=r.assessment_id JOIN education_classes cl ON cl.id=a.class_id JOIN education_enrollments e ON e.id=r.enrollment_id JOIN people p ON p.id=e.person_id ORDER BY r.graded_at DESC,r.id DESC LIMIT $1 OFFSET $2",
            [params.pageSize, (params.page - 1) * params.pageSize],
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
  app.get(
    "/api/education/certificates",
    route(async (r, s) => {
      await permit(r);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await scoped(r, async (q) => {
          const [count] = await q(
            "SELECT count(*)::int AS total FROM education_certificates",
          );
          const items = await q(
            "SELECT c.id,c.code,c.issued_at,c.class_id,cl.name AS class_name,c.person_id,p.name AS person_name FROM education_certificates c JOIN education_classes cl ON cl.id=c.class_id JOIN people p ON p.id=c.person_id ORDER BY c.issued_at DESC,c.id DESC LIMIT $1 OFFSET $2",
            [params.pageSize, (params.page - 1) * params.pageSize],
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
    "/api/education/courses",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({
          name: z.string().trim().min(2).max(160),
          description: z.string().max(2000).default(""),
          completionPercent: z.number().int().min(1).max(100).default(75),
          track: z.enum(["ebd","discipulado","curso","formacao","treinamento"]).default("curso"),
          level: z.string().trim().max(80).nullable().default(null),
          certificateEnabled: z.boolean().default(true),
          publicCatalog: z.boolean().default(false),
        })
        .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          const [v] = await q(
            "INSERT INTO education_courses(church_id,name,description,completion_percent,track,level,certificate_enabled,public_catalog,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
            [r.church, b.name, b.description, b.completionPercent, b.track, b.level, b.certificateEnabled, b.publicCatalog, r.actor.id],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "education.course-created",
            v.id,
          );
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/education/classes",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({
          courseId: uuid,
          name: z.string().trim().min(2).max(160),
          startsOn: z.iso.date(),
          endsOn: z.iso.date().nullable().default(null),
          instructorId: uuid.nullable().default(null),
          capacity: z.number().int().positive().nullable().default(null),
          publicCatalog: z.boolean().default(false),
          disciplerId: uuid.nullable().default(null),
          assistantId: uuid.nullable().default(null),
          meetingFrequency: z.string().trim().max(40).default("weekly"),
          location: z.string().trim().max(180).default(""),
          deliveryMode: z.enum(["presencial","online","hibrido"]).default("presencial"),
        })
        .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          if (b.instructorId || b.disciplerId || b.assistantId)
            requireThat(
              (
                await q(
                  "SELECT membership_in_current_church($1) AS allowed",
                  [b.instructorId || b.disciplerId || b.assistantId],
                ))[0]?.allowed,
              400,
              "Responsável não está vinculado a esta igreja.",
            );
          const [v] = await q(
            "INSERT INTO education_classes(church_id,course_id,name,starts_on,ends_on,instructor_id,capacity,public_catalog,discipler_id,assistant_id,meeting_frequency,location,delivery_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
            [
              r.church, b.courseId, b.name, b.startsOn, b.endsOn, b.instructorId,
              b.capacity, b.publicCatalog, b.disciplerId, b.assistantId,
              b.meetingFrequency, b.location, b.deliveryMode,
            ],
          );
          await audit(q, r.actor.id, r.church, "education.class-created", v.id);
          return v;
        }),
      );
    }),
  );
  app.patch(
    "/api/education/classes/:id",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({
          publicCatalog: z.boolean().optional(),
          status: z.enum(["open", "closed", "finished"]).optional(),
          completionStatus: z.enum(["open","in_progress","completed","cancelled"]).optional(),
          disciplerId: uuid.nullable().optional(),
          assistantId: uuid.nullable().optional(),
          meetingFrequency: z.string().trim().max(40).optional(),
          location: z.string().trim().max(180).optional(),
          deliveryMode: z.enum(["presencial","online","hibrido"]).optional(),
        })
        .parse(r.body);
      const result = await scoped(r, async (q) => {
        const [v] = await q(
          "UPDATE education_classes SET public_catalog=COALESCE($2,public_catalog),status=COALESCE($3,status),completion_status=COALESCE($4,completion_status),discipler_id=COALESCE($5,discipler_id),assistant_id=COALESCE($6,assistant_id),meeting_frequency=COALESCE($7,meeting_frequency),location=COALESCE($8,location),delivery_mode=COALESCE($9,delivery_mode) WHERE id=$1 AND church_id=$10 RETURNING *",
          [
            uuid.parse(r.params.id), b.publicCatalog ?? null, b.status ?? null,
            b.completionStatus ?? null, b.disciplerId ?? null, b.assistantId ?? null,
            b.meetingFrequency ?? null, b.location ?? null, b.deliveryMode ?? null, r.church,
          ],
        );
        requireThat(v, 404, "Turma não encontrada.");
        await audit(
          q,
          r.actor.id,
          r.church,
          "education.class-publication-updated",
          v.id,
        );
        return v;
      });
      s.json(result);
    }),
  );
  app.post(
    "/api/education/classes/:id/enroll",
    route(async (r, s) => {
      await permit(r, true);
      const classId = uuid.parse(r.params.id),
        b = z.object({ personId: uuid }).parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          const [cl] = await q(
            "SELECT * FROM education_classes WHERE id=$1 AND status='open' FOR UPDATE",
            [classId],
          );
          requireThat(cl, 404, "Turma não encontrada.");
          let status = "active";
          if (cl.capacity !== null) {
            const [c] = await q(
              "SELECT count(*)::int AS total FROM education_enrollments WHERE class_id=$1 AND status='active'",
              [classId],
            );
            if (Number(c.total) >= Number(cl.capacity)) status = "waitlisted";
          }
          const [v] = await q(
            "INSERT INTO education_enrollments(church_id,class_id,person_id,status) VALUES($1,$2,$3,$4) ON CONFLICT(class_id,person_id) DO UPDATE SET status=excluded.status RETURNING *",
            [r.church, classId, b.personId, status],
          );
          await audit(q, r.actor.id, r.church, "education.enrolled", v.id);
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/education/classes/:id/sessions",
    route(async (r, s) => {
      await permit(r, true);
      const classId = uuid.parse(r.params.id),
        b = z
          .object({
            heldOn: z.iso.date(),
            topic: z.string().max(300).default(""),
            attendance: z
              .array(z.object({ enrollmentId: uuid, present: z.boolean() }))
              .max(1000),
          })
          .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          const ids = new Set<string>();
          for (const a of b.attendance) {
            requireThat(
              !ids.has(a.enrollmentId),
              400,
              "A matrícula aparece mais de uma vez.",
            );
            ids.add(a.enrollmentId);
            const [enrollment] = await q(
              "SELECT id FROM education_enrollments WHERE id=$1 AND class_id=$2 AND status='active'",
              [a.enrollmentId, classId],
            );
            requireThat(
              enrollment,
              400,
              "Somente matrículas ativas podem receber presença.",
            );
          }
          const [session] = await q(
            "INSERT INTO education_sessions(church_id,class_id,held_on,topic) VALUES($1,$2,$3,$4) RETURNING *",
            [r.church, classId, b.heldOn, b.topic],
          );
          for (const a of b.attendance)
            await q(
              "INSERT INTO education_attendance(church_id,session_id,enrollment_id,present) VALUES($1,$2,$3,$4)",
              [r.church, session.id, a.enrollmentId, a.present],
            );
          const [course] = await q(
            "SELECT c.completion_percent FROM education_courses c JOIN education_classes cl ON cl.course_id=c.id WHERE cl.id=$1",
            [classId],
          );
          const enrollments = await q(
            "SELECT id,person_id FROM education_enrollments WHERE class_id=$1 AND status='active'",
            [classId],
          );
          for (const e of enrollments) {
            const [stats] = await q(
              "SELECT count(*)::int AS total,count(*) FILTER(WHERE a.present)::int AS present FROM education_attendance a JOIN education_sessions s ON s.id=a.session_id WHERE a.enrollment_id=$1 AND s.class_id=$2",
              [e.id, classId],
            );
            if (
              stats.total &&
              (Number(stats.present) * 100) / Number(stats.total) >=
                Number(course.completion_percent)
            ) {
              await q(
                "UPDATE education_enrollments SET status='completed' WHERE id=$1",
                [e.id],
              );
              await q(
                "INSERT INTO education_certificates(church_id,class_id,person_id,code) VALUES($1,$2,$3,$4) ON CONFLICT(class_id,person_id) DO NOTHING",
                [
                  r.church,
                  classId,
                  e.person_id,
                  `ECL-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
                ],
              );
            }
          }
          await audit(
            q,
            r.actor.id,
            r.church,
            "education.session-recorded",
            session.id,
          );
          return session;
        }),
      );
    }),
  );
  app.post(
    "/api/education/courses/:id/materials",
    route(async (r, s) => {
      await permit(r, true);
      const courseId = uuid.parse(r.params.id),
        b = z
          .object({
            title: z.string().trim().min(2).max(180),
            kind: z.enum(["file", "link", "text"]),
            location: z.string().max(2000).default(""),
            description: z.string().max(2000).default(""),
            position: z.number().int().min(0).max(10000).default(0),
          })
          .parse(r.body);
      if (b.kind === "link") {
        let parsed: URL | null = null;
        try {
          parsed = new URL(b.location);
        } catch {
          parsed = null;
        }
        requireThat(
          Boolean(parsed),
          400,
          "O material precisa de uma URL válida.",
        );
        requireThat(
          ["http:", "https:"].includes(parsed!.protocol),
          400,
          "Materiais de link aceitam somente HTTP ou HTTPS.",
        );
      }
      s.status(201).json(
        await scoped(r, async (q) => {
          const [course] = await q(
            "SELECT id FROM education_courses WHERE id=$1",
            [courseId],
          );
          requireThat(course, 404, "Curso não encontrado.");
          const [v] = await q(
            "INSERT INTO education_materials(church_id,course_id,title,kind,location,description,position,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
            [
              r.church,
              courseId,
              b.title,
              b.kind,
              b.location,
              b.description,
              b.position,
              r.actor.id,
            ],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "education.material-created",
            v.id,
          );
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/education/classes/:id/assessments",
    route(async (r, s) => {
      await permit(r, true);
      const classId = uuid.parse(r.params.id),
        b = z
          .object({
            title: z.string().trim().min(2).max(180),
            maxScore: z.number().positive().max(100000),
            published: z.boolean().default(false),
          })
          .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          const [cl] = await q("SELECT id FROM education_classes WHERE id=$1", [
            classId,
          ]);
          requireThat(cl, 404, "Turma não encontrada.");
          const [v] = await q(
            "INSERT INTO education_assessments(church_id,class_id,title,max_score,published,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [r.church, classId, b.title, b.maxScore, b.published, r.actor.id],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "education.assessment-created",
            v.id,
          );
          return v;
        }),
      );
    }),
  );
  app.patch(
    "/api/education/assessments/:id",
    route(async (r, s) => {
      await permit(r, true);
      const id = uuid.parse(r.params.id),
        b = z
          .object({
            title: z.string().trim().min(2).max(180).optional(),
            published: z.boolean().optional(),
          })
          .refine(
            (v) => v.title !== undefined || v.published !== undefined,
            "Informe uma alteração.",
          )
          .parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          const [old] = await q(
            "SELECT id FROM education_assessments WHERE id=$1 AND church_id=$2 FOR UPDATE",
            [id, r.church],
          );
          requireThat(old, 404, "Avaliação não encontrada.");
          const [v] = await q(
            "UPDATE education_assessments SET title=COALESCE($2,title),published=COALESCE($3,published) WHERE id=$1 AND church_id=$4 RETURNING *",
            [id, b.title ?? null, b.published ?? null, r.church],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "education.assessment-updated",
            id,
          );
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/education/assessments/:id/results",
    route(async (r, s) => {
      await permit(r, true);
      const assessmentId = uuid.parse(r.params.id),
        b = z
          .object({
            enrollmentId: uuid,
            score: z.number().nonnegative(),
            feedback: z.string().max(2000).default(""),
          })
          .parse(r.body);
      s.status(201).json(
        await scoped(r, async (q) => {
          const [a] = await q(
            "SELECT * FROM education_assessments WHERE id=$1",
            [assessmentId],
          );
          requireThat(a, 404, "Avaliação não encontrada.");
          requireThat(
            Number(b.score) <= Number(a.max_score),
            400,
            "Nota acima do valor máximo.",
          );
          const [enrollment] = await q(
            "SELECT id FROM education_enrollments WHERE id=$1 AND class_id=$2",
            [b.enrollmentId, a.class_id],
          );
          requireThat(enrollment, 400, "Matrícula não pertence à turma.");
          const [v] = await q(
            "INSERT INTO education_assessment_results(church_id,assessment_id,enrollment_id,score,feedback,graded_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(assessment_id,enrollment_id) DO UPDATE SET score=excluded.score,feedback=excluded.feedback,graded_by=excluded.graded_by,graded_at=now() RETURNING *",
            [
              r.church,
              assessmentId,
              b.enrollmentId,
              b.score,
              b.feedback,
              r.actor.id,
            ],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "education.assessment-graded",
            v.id,
          );
          return v;
        }),
      );
    }),
  );
}



