import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { z } from "zod";
import { requireThat } from "./security.js";
import { audit } from "./seed.js";

type R = Request & { actor: Row; church: string };
const route =
  (fn: (r: R, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as R, s)).catch(n);

export function searchRoutes(app: Express, db: Database) {
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) =>
    db.transaction(fn, { actor: r.actor.id, church: r.church });
  app.get(
    "/api/search",
    route(async (r, s) => {
      const q = z
        .string()
        .trim()
        .min(2)
        .max(160)
        .parse(String(r.query.q ?? ""));
      const limit = Math.min(
        50,
        Math.max(1, Number(r.query.limit ?? 20) || 20),
      );
      const [permission] = await scoped(r, (query) =>
        query("SELECT can_access('people') AS allowed"),
      );
      requireThat(
        permission.allowed,
        403,
        "Permissão de consulta de pessoas necessária.",
      );
      const normalized = q.toLocaleLowerCase("pt-BR");
      let result;
      if (
        normalized.includes("curso") &&
        (normalized.includes("interess") || normalized.includes("inscri"))
      ) {
        result = {
          interpretation: "Interesses abertos em cursos",
          type: "education_interests",
          items: await scoped(r, (query) =>
            query(
              "SELECT i.id,i.name,i.email,i.phone,i.status,i.created_at,cl.name AS class_name,c.name AS course_name FROM education_interest_requests i JOIN education_classes cl ON cl.id=i.class_id JOIN education_courses c ON c.id=cl.course_id WHERE i.church_id=$1 AND i.status IN ('pending','contacted') ORDER BY i.created_at DESC LIMIT $2",
              [r.church, limit],
            ),
          ),
        };
      } else if (
        (normalized.includes("visit") || normalized.includes("novo")) &&
        (normalized.includes("contato") ||
          normalized.includes("telefone") ||
          normalized.includes("email"))
      ) {
        result = {
          interpretation: "Visitantes sem telefone ou e-mail",
          type: "visitors_without_contact",
          items: await scoped(r, (query) =>
            query(
              "SELECT id,name,email,phone,status FROM people WHERE church_id=$1 AND status='visitor' AND COALESCE(NULLIF(trim(email),''),'')='' AND COALESCE(NULLIF(trim(phone),''),'')='' ORDER BY name LIMIT $2",
              [r.church, limit],
            ),
          ),
        };
      } else if (
        normalized.includes("tarefa") &&
        (normalized.includes("venc") || normalized.includes("atras"))
      ) {
        result = {
          interpretation: "Tarefas abertas vencidas",
          type: "overdue_tasks",
          items: await scoped(r, (query) =>
            query(
              "SELECT id,scope,status,due_on,assigned_to FROM operational_tasks WHERE church_id=$1 AND status IN ('open','in_progress') AND due_on<CURRENT_DATE ORDER BY due_on,id LIMIT $2",
              [r.church, limit],
            ),
          ),
        };
      } else if (
        normalized.includes("volunt") &&
        normalized.includes("dispon")
      ) {
        // A disponibilidade dos voluntários é protegida pela permissão de
        // operação de células; sem essa concessão, a busca retorna vazio em
        // vez de tentar contornar a política RLS.
        const [cellPermission] = await scoped(r, (query) =>
          query("SELECT can_access('cells',true) AS allowed"),
        );
        const canReadVolunteerAvailability =
          cellPermission.allowed === true || cellPermission.allowed === "true";
        result = {
          interpretation: "Voluntários disponíveis nos próximos 7 dias",
          type: "available_volunteers",
          items: canReadVolunteerAvailability
            ? await scoped(r, (query) =>
                query(
                  "SELECT DISTINCT p.user_id AS id,p.name FROM people p JOIN ministry_members mm ON mm.user_id=p.user_id AND mm.church_id=$1 JOIN memberships m ON m.user_id=p.user_id AND m.church_id=$1 WHERE p.church_id=$1 AND p.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM volunteer_unavailability v WHERE v.user_id=p.user_id AND v.church_id=$1 AND v.starts_at<now()+interval '7 days' AND v.ends_at>now()) AND NOT EXISTS(SELECT 1 FROM schedules s2 WHERE s2.user_id=p.user_id AND s2.church_id=$1 AND s2.response='accepted' AND s2.starts_at<now()+interval '7 days' AND s2.ends_at>now()) ORDER BY p.name LIMIT $2",
                  [r.church, limit],
                ).catch(() => []),
              )
            : [],
        };
      } else if (
        normalized.includes("evento") &&
        (normalized.includes("próxim") || normalized.includes("proxim"))
      ) {
        result = {
          interpretation: "Eventos programados nos próximos 14 dias",
          type: "upcoming_events",
          items: await scoped(r, (query) =>
            query(
              "SELECT id,title,kind,starts_at,ends_at,capacity FROM church_events WHERE church_id=$1 AND status='scheduled' AND starts_at>=now() AND starts_at<now()+interval '14 days' ORDER BY starts_at LIMIT $2",
              [r.church, limit],
            ),
          ),
        };
      } else {
        const term = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        result = {
          interpretation: `Pessoas correspondentes a “${q}”`,
          type: "people",
          items: await scoped(r, (query) =>
            query(
              "SELECT id,name,email,phone,status,campus_id FROM people WHERE church_id=$1 AND (name ILIKE $2 ESCAPE '\\' OR COALESCE(email,'') ILIKE $2 ESCAPE '\\' OR COALESCE(phone,'') ILIKE $2 ESCAPE '\\') ORDER BY name LIMIT $3",
              [r.church, term, limit],
            ),
          ),
        };
      }
      const suggestions: Record<string,string[]> = {
        education_interests: ["Abrir fila de interesses em Ensino", "Atribuir responsável ao próximo contato"],
        visitors_without_contact: ["Abrir secretaria", "Criar tarefa de primeiro contato"],
        overdue_tasks: ["Abrir fila de tarefas", "Revisar responsáveis e prazos"],
        available_volunteers: ["Abrir escalas", "Convidar voluntários disponíveis"],
        upcoming_events: ["Abrir agenda", "Revisar comunicação do evento"],
        people: ["Abrir cadastro da pessoa", "Criar tarefa de acompanhamento"],
      };
      await scoped(r, async (query) => audit(query, r.actor.id, r.church, "assistant.query"));
      s.json({ query: q, ...result, assistant: true, suggestions: suggestions[result.type] ?? [] });
    }),
  );
}
