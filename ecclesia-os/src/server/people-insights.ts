import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Database, Row } from "./db.js";
import { requireThat } from "./security.js";

type AuthRequest = Request & { actor: Row; church: string };

const asyncRoute =
  (fn: (r: AuthRequest, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as AuthRequest, s)).catch(n);

const isoDate = z.iso.date();

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function fieldsOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : null;
}

function dayKey(date: string) {
  return date.slice(5);
}

function daysBetween(from: string, to: string, monthDay: string) {
  const start = from.slice(5);
  const end = to.slice(5);
  return start <= end
    ? monthDay >= start && monthDay <= end
    : monthDay >= start || monthDay <= end;
}

function labelFor(kind: string) {
  return (
    {
      birth_date: "Aniversário",
      baptism_date: "Aniversário de batismo",
      marriage_date: "Aniversário de casamento",
      church_joined_date: "Aniversário de integração",
    } as Record<string, string>
  )[kind] ?? "Marco cadastral";
}

export function peopleInsightsRoutes(app: Express, db: Database) {
  app.get(
    "/api/people/insights",
    asyncRoute(async (r, s) => {
      requireThat(r.actor?.id && r.church, 401, "Entre para continuar.");
      const query = z
        .object({
          from: isoDate.optional(),
          to: isoDate.optional(),
        })
        .parse(r.query);
      const today = new Date().toISOString().slice(0, 10);
      const from = query.from ?? today;
      const to = query.to ?? from;
      requireThat(from <= to || from.slice(5) > to.slice(5), 400, "Período inválido.");

      const rows = await db.transaction(
        async (q) => {
          const [permission] = await q(
            "SELECT can_access('people') AS allowed",
          );
          requireThat(permission?.allowed, 403, "Permissão de Secretaria obrigatória.");
          return q(
            "SELECT id,name,email,phone,status,custom_fields FROM people WHERE church_id=$1 AND status<>'inactive' ORDER BY name LIMIT 5000",
            [r.church],
          );
        },
        { actor: r.actor.id, church: r.church },
      );

      const anniversaries: Array<Record<string, unknown>> = [];
      const duplicateBuckets = new Map<string, { reason: string; people: Row[] }>();

      for (const person of rows) {
        const fields = fieldsOf(person.custom_fields);
        for (const kind of ["birth_date", "baptism_date", "marriage_date", "church_joined_date"]) {
          const raw = fields[kind] ?? fields[kind.replace("_date", "On")];
          const date = asDate(raw);
          if (date && daysBetween(from, to, dayKey(date))) {
            anniversaries.push({
              personId: person.id,
              name: person.name,
              kind,
              label: labelFor(kind),
              date,
              monthDay: dayKey(date),
            });
          }
        }

        const keys: Array<[string, string, string]> = [
          ["name", normalize(person.name), "Mesmo nome"],
          ["email", normalize(person.email), "Mesmo e-mail"],
          ["phone", normalize(person.phone), "Mesmo telefone"],
        ];
        for (const [field, value, reason] of keys) {
          if (!value || value.length < 5) continue;
          const key = field + ":" + value;
          const bucket = duplicateBuckets.get(key) ?? { reason, people: [] };
          bucket.people.push(person);
          duplicateBuckets.set(key, bucket);
        }
      }

      const duplicates = [...duplicateBuckets.values()]
        .filter((bucket) => bucket.people.length > 1)
        .map((bucket) => ({
          reason: bucket.reason,
          people: bucket.people.map((person) => ({
            id: person.id,
            name: person.name,
            email: person.email,
            phone: person.phone,
            status: person.status,
          })),
        }));

      anniversaries.sort((a, b) =>
        String(a.monthDay).localeCompare(String(b.monthDay)),
      );
      s.json({ from, to, anniversaries, duplicates });
    }),
  );
}
