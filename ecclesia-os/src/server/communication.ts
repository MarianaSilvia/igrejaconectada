import type { Express, Request, Response, NextFunction } from "express";
import type { Database, Query, Row } from "./db.js";
import { z } from "zod";
import { audit } from "./seed.js";
import { requireThat } from "./security.js";
import { timingSafeEqual } from "node:crypto";

type R = Request & { actor: Row; church: string };
const route =
  (fn: (r: R, s: Response) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as R, s)).catch(n);
const uuid = z.uuid();
const filterSchema = z.object({
  status: z
    .enum(["all", "visitor", "member", "worker", "inactive"])
    .default("all"),
  campusId: uuid.nullable().default(null),
  cellId: uuid.nullable().default(null),
  teamId: uuid.nullable().default(null),
});

type CommunicationChannel = "portal" | "email" | "sms";
function recipientScope(
  church: string,
  channel: CommunicationChannel,
  filter: z.infer<typeof filterSchema>,
) {
  const params: unknown[] = [church];
  const predicates = [
    "p.church_id=$1",
    channel === "portal"
      ? "COALESCE(cp.portal_opt_in,true)=true"
      : channel === "email"
        ? "COALESCE(cp.email_opt_in,false)=true AND p.email IS NOT NULL"
        : "COALESCE(cp.sms_opt_in,false)=true AND p.phone IS NOT NULL",
  ];
  if (filter.status !== "all") {
    params.push(filter.status);
    predicates.push(`p.status=$${params.length}`);
  }
  if (filter.campusId) {
    params.push(filter.campusId);
    predicates.push(`p.campus_id=$${params.length}`);
  }
  if (filter.cellId) {
    params.push(filter.cellId);
    predicates.push(
      `EXISTS (SELECT 1 FROM cell_members cm WHERE cm.church_id=p.church_id AND cm.person_id=p.id AND cm.cell_id=$${params.length})`,
    );
  }
  if (filter.teamId) {
    params.push(filter.teamId);
    predicates.push(
      `EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.church_id=p.church_id AND mm.user_id=p.user_id AND mm.team_id=$${params.length})`,
    );
  }
  return {
    where: predicates.join(" AND "),
    params,
  };
}

export function communicationRoutes(
  app: Express,
  db: Database,
  callbackToken = process.env.COMMUNICATION_CALLBACK_TOKEN ?? "",
) {
  const scoped = <T>(r: R, fn: (q: Query) => Promise<T>) =>
    db.transaction(fn, { actor: r.actor.id, church: r.church });
  const permit = async (r: R, write = false) => {
    const [v] = await scoped(r, (q) =>
      q("SELECT can_access('people',$1) AS allowed", [write]),
    );
    requireThat(v.allowed, 403, "Permissão para comunicação necessária.");
  };
  const templateSchema = z.object({
    name: z.string().trim().min(2).max(100),
    channel: z.enum(["portal", "email", "sms"]),
    subject: z.string().trim().min(2).max(180),
    body: z.string().trim().min(2).max(10000),
    audienceFilter: filterSchema.default({
      status: "all",
      campusId: null,
      cellId: null,
      teamId: null,
    }),
  });
  app.post(
    "/api/webhooks/communication",
    route(async (r, s) => {
      requireThat(
        callbackToken.length >= 16,
        503,
        "Webhook de comunicação não configurado.",
      );
      const supplied = String(
        r.headers["x-communication-callback-token"] ?? "",
      );
      const expected = Buffer.from(callbackToken);
      const received = Buffer.from(supplied);
      requireThat(
        received.length === expected.length &&
          timingSafeEqual(received, expected),
        401,
        "Webhook de comunicação não autorizado.",
      );
      const body = z
        .object({
          deliveryId: uuid,
          providerMessageId: z.string().trim().max(180).optional(),
          status: z.enum(["delivered", "failed", "bounced", "unsubscribed"]),
          reason: z.string().trim().max(500).optional(),
        })
        .parse(r.body);
      const result = await db.transaction(async (q) => {
        const [delivery] = await q(
          "SELECT id,church_id,message_id,person_id,channel,status FROM communication_deliveries WHERE id=$1 FOR UPDATE",
          [body.deliveryId],
        );
        requireThat(delivery, 404, "Entrega não encontrada.");
        const failed = ["failed", "bounced", "unsubscribed"].includes(
          body.status,
        );
        const nextStatus = failed ? "failed" : "sent";
        const detail =
          body.reason ??
          (body.status === "bounced"
            ? "Endereço rejeitado pelo provedor."
            : body.status === "unsubscribed"
              ? "Destinatário solicitou descadastro."
              : null);
        const [updated] = await q(
          "UPDATE communication_deliveries SET status=$2,provider_message_id=COALESCE($3,provider_message_id),sent_at=CASE WHEN $2='sent' THEN COALESCE(sent_at,now()) ELSE sent_at END,last_error=$4,locked_until=NULL,lease_token=NULL WHERE id=$1 RETURNING id,status,provider_message_id,last_error",
          [body.deliveryId, nextStatus, body.providerMessageId ?? null, detail],
        );
        if (failed && ["email", "sms"].includes(delivery.channel)) {
          const column =
            delivery.channel === "email" ? "email_opt_in" : "sms_opt_in";
          await q(
            `INSERT INTO communication_preferences(church_id,person_id,${column},updated_at) VALUES($1,$2,false,now()) ON CONFLICT(church_id,person_id) DO UPDATE SET ${column}=false,updated_at=now()`,
            [delivery.church_id, delivery.person_id],
          );
        }
        await q(
          "UPDATE communication_messages SET status=CASE WHEN EXISTS(SELECT 1 FROM communication_deliveries WHERE message_id=$1 AND status='queued') THEN 'queued' WHEN EXISTS(SELECT 1 FROM communication_deliveries WHERE message_id=$1 AND status='failed') THEN 'failed' ELSE 'sent' END,sent_at=CASE WHEN NOT EXISTS(SELECT 1 FROM communication_deliveries WHERE message_id=$1 AND status IN ('queued','failed')) THEN COALESCE(sent_at,now()) ELSE sent_at END WHERE id=$1",
          [delivery.message_id],
        );
        await audit(
          q,
          null,
          delivery.church_id,
          `communication-delivery.provider-${body.status}`,
          body.deliveryId,
        );
        return updated;
      });
      s.json(result);
    }),
  );
  app.get(
    "/api/communication/templates",
    route(async (r, s) => {
      await permit(r);
      s.json(
        await scoped(r, (q) =>
          q(
            "SELECT id,name,channel,subject,body,audience_filter,created_by,created_at,updated_at FROM communication_templates ORDER BY updated_at DESC,name",
          ),
        ),
      );
    }),
  );
  app.post(
    "/api/communication/preview",
    route(async (r, s) => {
      await permit(r);
      const b = z
        .object({
          channel: z.enum(["portal", "email", "sms"]),
          filter: filterSchema,
        })
        .parse(r.body);
      const scope = recipientScope(r.church, b.channel, b.filter);
      s.json(
        await scoped(r, async (q) => {
          const [total] = await q(
            `SELECT count(*)::int AS total FROM people p LEFT JOIN communication_preferences cp ON cp.church_id=p.church_id AND cp.person_id=p.id WHERE ${scope.where}`,
            scope.params,
          );
          const sample = await q(
            `SELECT p.id,p.name FROM people p LEFT JOIN communication_preferences cp ON cp.church_id=p.church_id AND cp.person_id=p.id WHERE ${scope.where} ORDER BY p.name,p.id LIMIT 10`,
            scope.params,
          );
          return {
            recipientCount: Number(total.total),
            sample: sample.map((person) => ({
              id: person.id,
              name: person.name,
            })),
            truncated: Number(total.total) > sample.length,
          };
        }),
      );
    }),
  );
  app.post(
    "/api/communication/templates",
    route(async (r, s) => {
      await permit(r, true);
      const b = templateSchema.parse(r.body);
      const row = await scoped(r, async (q) => {
        const [v] = await q(
          "INSERT INTO communication_templates(church_id,name,channel,subject,body,audience_filter,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id,name,channel,subject,body,audience_filter,created_by,created_at,updated_at",
          [
            r.church,
            b.name,
            b.channel,
            b.subject,
            b.body,
            JSON.stringify(b.audienceFilter),
            r.actor.id,
          ],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "communication-template.created",
          v.id,
        );
        return v;
      });
      s.status(201).json(row);
    }),
  );
  app.patch(
    "/api/communication/templates/:id",
    route(async (r, s) => {
      await permit(r, true);
      const templateId = uuid.parse(r.params.id);
      const b = templateSchema.parse(r.body);
      const row = await scoped(r, async (q) => {
        const [v] = await q(
          "UPDATE communication_templates SET name=$2,channel=$3,subject=$4,body=$5,audience_filter=$6::jsonb,updated_at=now() WHERE id=$1 RETURNING id,name,channel,subject,body,audience_filter,created_by,created_at,updated_at",
          [
            templateId,
            b.name,
            b.channel,
            b.subject,
            b.body,
            JSON.stringify(b.audienceFilter),
          ],
        );
        requireThat(v, 404, "Modelo de comunicação não encontrado.");
        await audit(
          q,
          r.actor.id,
          r.church,
          "communication-template.updated",
          templateId,
        );
        return v;
      });
      s.json(row);
    }),
  );
  app.delete(
    "/api/communication/templates/:id",
    route(async (r, s) => {
      await permit(r, true);
      const templateId = uuid.parse(r.params.id);
      await scoped(r, async (q) => {
        const rows = await q(
          "DELETE FROM communication_templates WHERE id=$1 RETURNING id",
          [templateId],
        );
        requireThat(rows.length, 404, "Modelo de comunicação não encontrado.");
        await audit(
          q,
          r.actor.id,
          r.church,
          "communication-template.deleted",
          templateId,
        );
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/communication",
    route(async (r, s) => {
      await permit(r);
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          failedPage: z.coerce.number().int().min(1).default(1),
          failedPageSize: z.coerce.number().int().min(1).max(100).default(25),
          preferencePage: z.coerce.number().int().min(1).default(1),
          preferencePageSize: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(25),
        })
        .parse(r.query);
      const result = await scoped(r, async (q) => ({
        messages: await q(
          "SELECT m.*,count(d.id)::int AS deliveries,count(d.id) FILTER(WHERE d.status='sent')::int AS sent_count,count(d.id) FILTER(WHERE d.status='queued')::int AS queued_count FROM communication_messages m LEFT JOIN communication_deliveries d ON d.message_id=m.id GROUP BY m.id ORDER BY m.created_at DESC LIMIT $1 OFFSET $2",
          [params.pageSize, (params.page - 1) * params.pageSize],
        ),
        messagePagination: await (async () => {
          const [row] = await q(
            "SELECT count(*)::int AS total FROM communication_messages",
          );
          return {
            total: Number(row.total),
            page: params.page,
            pageSize: params.pageSize,
            pages: Math.max(1, Math.ceil(Number(row.total) / params.pageSize)),
          };
        })(),
        preferences: await q(
          "SELECT p.id AS person_id,COALESCE(cp.email_opt_in,false) AS email_opt_in,COALESCE(cp.portal_opt_in,true) AS portal_opt_in,COALESCE(cp.sms_opt_in,false) AS sms_opt_in,cp.updated_at,p.name,p.email,p.phone FROM people p LEFT JOIN communication_preferences cp ON cp.person_id=p.id AND cp.church_id=p.church_id ORDER BY p.name,p.id LIMIT $1 OFFSET $2",
          [
            params.preferencePageSize,
            (params.preferencePage - 1) * params.preferencePageSize,
          ],
        ),
        preferencePagination: await (async () => {
          const [row] = await q("SELECT count(*)::int AS total FROM people");
          return {
            total: Number(row.total),
            page: params.preferencePage,
            pageSize: params.preferencePageSize,
            pages: Math.max(
              1,
              Math.ceil(Number(row.total) / params.preferencePageSize),
            ),
          };
        })(),
        teams: await q("SELECT id,name FROM ministry_teams ORDER BY name"),
        failedDeliveries: await q(
          "SELECT d.id,d.message_id,d.person_id,d.channel,d.attempts,d.last_error,m.subject,p.name,p.email FROM communication_deliveries d JOIN communication_messages m ON m.id=d.message_id JOIN people p ON p.id=d.person_id WHERE d.status='failed' ORDER BY d.created_at DESC LIMIT $1 OFFSET $2",
          [
            params.failedPageSize,
            (params.failedPage - 1) * params.failedPageSize,
          ],
        ),
        failedDeliveriesPagination: await (async () => {
          const [row] = await q(
            "SELECT count(*)::int AS total FROM communication_deliveries WHERE status='failed'",
          );
          return {
            total: Number(row.total),
            page: params.failedPage,
            pageSize: params.failedPageSize,
            pages: Math.max(
              1,
              Math.ceil(Number(row.total) / params.failedPageSize),
            ),
          };
        })(),
      }));
      s.json(result);
    }),
  );
  app.get(
    "/api/communication/inbox",
    route(async (r, s) => {
      const params = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .parse(r.query);
      s.json(
        await db.transaction(async (q) => {
          const where =
            "d.church_id=$1 AND p.user_id=$2 AND d.channel='portal' AND d.status='sent'";
          const [total] = await q(
            `SELECT count(*)::int AS total FROM communication_deliveries d JOIN people p ON p.id=d.person_id WHERE ${where}`,
            [r.church, r.actor.id],
          );
          const items = await q(
            `SELECT m.id,d.id AS delivery_id,m.subject,m.body,m.created_at,d.sent_at,d.read_at FROM communication_deliveries d JOIN communication_messages m ON m.id=d.message_id JOIN people p ON p.id=d.person_id WHERE ${where} ORDER BY d.sent_at DESC LIMIT $3 OFFSET $4`,
            [
              r.church,
              r.actor.id,
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
    "/api/communication/export.csv",
    route(async (r, s) => {
      await permit(r);
      const rows = await scoped(r, (q) =>
        q(
          "SELECT m.id,m.subject,m.channel,m.status,m.created_at,m.sent_at,count(d.id)::int AS deliveries,count(d.id) FILTER(WHERE d.status='sent')::int AS sent_count,count(d.id) FILTER(WHERE d.status='failed')::int AS failed_count FROM communication_messages m LEFT JOIN communication_deliveries d ON d.message_id=m.id GROUP BY m.id ORDER BY m.created_at DESC",
        ),
      );
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv =
        [
          "id,subject,channel,status,created_at,sent_at,deliveries,sent_count,failed_count",
          ...rows.map((row) =>
            [
              row.id,
              row.subject,
              row.channel,
              row.status,
              row.created_at,
              row.sent_at,
              row.deliveries,
              row.sent_count,
              row.failed_count,
            ]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      s.type("text/csv; charset=utf-8")
        .attachment("comunicacao.csv")
        .send("\ufeff" + csv);
    }),
  );
  app.patch(
    "/api/communication/inbox/:id/read",
    route(async (r, s) => {
      const id = uuid.parse(r.params.id);
      const [delivery] = await db.transaction((q) =>
        q(
          "UPDATE communication_deliveries d SET read_at=COALESCE(read_at,now()) WHERE d.id=$1 AND d.church_id=$2 AND d.channel='portal' AND d.status='sent' AND EXISTS(SELECT 1 FROM people p WHERE p.id=d.person_id AND p.user_id=$3) RETURNING id,read_at",
          [id, r.church, r.actor.id],
        ),
      );
      requireThat(delivery, 404, "Aviso não encontrado.");
      s.json(delivery);
    }),
  );
  app.get(
    "/api/communication/preferences/:personId",
    route(async (r, s) => {
      if (r.params.personId === "me") {
        const [me] = await scoped(r, (q) =>
          q(
            "SELECT p.id,p.name,p.email,p.phone,COALESCE(cp.email_opt_in,false) AS email_opt_in,COALESCE(cp.portal_opt_in,true) AS portal_opt_in,COALESCE(cp.sms_opt_in,false) AS sms_opt_in FROM people p LEFT JOIN communication_preferences cp ON cp.person_id=p.id AND cp.church_id=p.church_id WHERE p.user_id=actor_id() LIMIT 1",
          ),
        );
        requireThat(
          me,
          404,
          "Seu cadastro de membro ainda não está vinculado.",
        );
        return s.json(me);
      }
      const personId = uuid.parse(r.params.personId);
      const [v] = await scoped(r, (q) =>
        q(
          "SELECT cp.*,p.name,p.email,p.phone FROM people p LEFT JOIN communication_preferences cp ON cp.person_id=p.id AND cp.church_id=p.church_id WHERE p.id=$1",
          [personId],
        ),
      );
      requireThat(v, 404, "Pessoa não encontrada.");
      const [allowed] = await scoped(r, (q) =>
        q(
          "SELECT can_access('people') AS staff, EXISTS(SELECT 1 FROM people p WHERE p.id=$1 AND p.user_id=actor_id()) AS owner",
          [personId],
        ),
      );
      requireThat(
        allowed.staff || allowed.owner,
        403,
        "Preferências não autorizadas.",
      );
      s.json({
        ...v,
        email_opt_in: v.email_opt_in ?? false,
        portal_opt_in: v.portal_opt_in ?? true,
        sms_opt_in: v.sms_opt_in ?? false,
      });
    }),
  );
  app.put(
    "/api/communication/preferences/:personId",
    route(async (r, s) => {
      if (r.params.personId === "me") {
        const b = z
          .object({
            emailOptIn: z.boolean(),
            portalOptIn: z.boolean(),
            smsOptIn: z.boolean(),
            confirmReOptIn: z.boolean().default(false),
          })
          .parse(r.body);
        return s.json(
          await scoped(r, async (q) => {
            const [p] = await q(
              "SELECT id FROM people WHERE user_id=actor_id() LIMIT 1",
            );
            requireThat(
              p,
              404,
              "Seu cadastro de membro ainda não está vinculado.",
            );
            const [current] = await q(
              "SELECT COALESCE(email_opt_in,false) AS email_opt_in,COALESCE(sms_opt_in,false) AS sms_opt_in FROM communication_preferences WHERE church_id=$1 AND person_id=$2",
              [r.church, p.id],
            );
            const reactivating =
              (!current?.email_opt_in && b.emailOptIn) ||
              (!current?.sms_opt_in && b.smsOptIn);
            requireThat(
              !reactivating || b.confirmReOptIn,
              400,
              "Confirme novamente o recebimento de e-mail ou SMS para reativar o canal.",
            );
            const [v] = await q(
              "INSERT INTO communication_preferences(church_id,person_id,email_opt_in,portal_opt_in,sms_opt_in,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(church_id,person_id) DO UPDATE SET email_opt_in=excluded.email_opt_in,portal_opt_in=excluded.portal_opt_in,sms_opt_in=excluded.sms_opt_in,updated_by=excluded.updated_by,updated_at=now() RETURNING *",
              [
                r.church,
                p.id,
                b.emailOptIn,
                b.portalOptIn,
                b.smsOptIn,
                r.actor.id,
              ],
            );
            await audit(
              q,
              r.actor.id,
              r.church,
              reactivating
                ? "communication-preferences.reopted-in"
                : "communication-preferences.self-updated",
              p.id,
            );
            return v;
          }),
        );
      }
      const personId = uuid.parse(r.params.personId),
        b = z
          .object({
            emailOptIn: z.boolean(),
            portalOptIn: z.boolean(),
            smsOptIn: z.boolean(),
          })
          .parse(r.body);
      const [allowed] = await scoped(r, (q) =>
        q(
          "SELECT can_access('people',true) AS staff, EXISTS(SELECT 1 FROM people p WHERE p.id=$1 AND p.user_id=actor_id()) AS owner",
          [personId],
        ),
      );
      requireThat(
        allowed.staff || allowed.owner,
        403,
        "Preferências não autorizadas.",
      );
      s.json(
        await scoped(r, async (q) => {
          const [v] = await q(
            "INSERT INTO communication_preferences(church_id,person_id,email_opt_in,portal_opt_in,sms_opt_in,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(church_id,person_id) DO UPDATE SET email_opt_in=excluded.email_opt_in,portal_opt_in=excluded.portal_opt_in,sms_opt_in=excluded.sms_opt_in,updated_by=excluded.updated_by,updated_at=now() RETURNING *",
            [
              r.church,
              personId,
              b.emailOptIn,
              b.portalOptIn,
              b.smsOptIn,
              r.actor.id,
            ],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "communication-preferences.updated",
            personId,
          );
          return v;
        }),
      );
    }),
  );
  app.get(
    "/api/communication/preferences/me",
    route(async (r, s) => {
      const [v] = await scoped(r, (q) =>
        q(
          "SELECT p.id,p.name,p.email,p.phone,COALESCE(cp.email_opt_in,false) AS email_opt_in,COALESCE(cp.portal_opt_in,true) AS portal_opt_in,COALESCE(cp.sms_opt_in,false) AS sms_opt_in FROM people p LEFT JOIN communication_preferences cp ON cp.person_id=p.id AND cp.church_id=p.church_id WHERE p.user_id=actor_id() LIMIT 1",
        ),
      );
      requireThat(v, 404, "Seu cadastro de membro ainda não está vinculado.");
      s.json(v);
    }),
  );
  app.put(
    "/api/communication/preferences/me",
    route(async (r, s) => {
      const b = z
        .object({
          emailOptIn: z.boolean(),
          portalOptIn: z.boolean(),
          smsOptIn: z.boolean(),
          confirmReOptIn: z.boolean().default(false),
        })
        .parse(r.body);
      s.json(
        await scoped(r, async (q) => {
          const [p] = await q(
            "SELECT id FROM people WHERE user_id=actor_id() LIMIT 1",
          );
          requireThat(
            p,
            404,
            "Seu cadastro de membro ainda não está vinculado.",
          );
          const [current] = await q(
            "SELECT COALESCE(email_opt_in,false) AS email_opt_in,COALESCE(sms_opt_in,false) AS sms_opt_in FROM communication_preferences WHERE church_id=$1 AND person_id=$2",
            [r.church, p.id],
          );
          const reactivating =
            (!current?.email_opt_in && b.emailOptIn) ||
            (!current?.sms_opt_in && b.smsOptIn);
          requireThat(
            !reactivating || b.confirmReOptIn,
            400,
            "Confirme novamente o recebimento de e-mail ou SMS para reativar o canal.",
          );
          const [v] = await q(
            "INSERT INTO communication_preferences(church_id,person_id,email_opt_in,portal_opt_in,sms_opt_in,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(church_id,person_id) DO UPDATE SET email_opt_in=excluded.email_opt_in,portal_opt_in=excluded.portal_opt_in,sms_opt_in=excluded.sms_opt_in,updated_by=excluded.updated_by,updated_at=now() RETURNING *",
            [
              r.church,
              p.id,
              b.emailOptIn,
              b.portalOptIn,
              b.smsOptIn,
              r.actor.id,
            ],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            reactivating
              ? "communication-preferences.reopted-in"
              : "communication-preferences.self-updated",
            p.id,
          );
          return v;
        }),
      );
    }),
  );
  app.post(
    "/api/communication/messages",
    route(async (r, s) => {
      await permit(r, true);
      const b = z
        .object({
          channel: z.enum(["portal", "email", "sms"]),
          subject: z.string().trim().min(2).max(180),
          body: z.string().trim().min(2).max(10000),
          filter: filterSchema,
          sendAt: z.iso.datetime({ offset: true }).nullable().optional(),
        })
        .parse(r.body);
      if (b.sendAt) {
        requireThat(
          b.channel !== "portal",
          400,
          "Avisos do portal são publicados imediatamente.",
        );
        requireThat(
          new Date(b.sendAt).getTime() > Date.now(),
          400,
          "Agende o envio para um horário futuro.",
        );
      }
      const result = await scoped(r, async (q) => {
        const [message] = await q(
          "INSERT INTO communication_messages(church_id,channel,subject,body,status,audience_filter,created_by,queued_at,send_at) VALUES($1,$2,$3,$4,'queued',$5::jsonb,$6,now(),$7) RETURNING *",
          [
            r.church,
            b.channel,
            b.subject,
            b.body,
            JSON.stringify(b.filter),
            r.actor.id,
            b.sendAt ?? null,
          ],
        );
        const scope = recipientScope(r.church, b.channel, b.filter);
        const people = await q(
          `SELECT p.id,p.email,p.phone,COALESCE(cp.portal_opt_in,true) AS portal_opt_in,COALESCE(cp.email_opt_in,false) AS email_opt_in,COALESCE(cp.sms_opt_in,false) AS sms_opt_in FROM people p LEFT JOIN communication_preferences cp ON cp.church_id=p.church_id AND cp.person_id=p.id WHERE ${scope.where}`,
          scope.params,
        );
        for (const person of people)
          await q(
            "INSERT INTO communication_deliveries(church_id,message_id,person_id,channel,status,consent_snapshot,address_snapshot,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $5='sent' THEN now() END)",
            [
              r.church,
              message.id,
              person.id,
              b.channel,
              b.channel === "portal" && !b.sendAt ? "sent" : "queued",
              true,
              b.channel === "email"
                ? person.email
                : b.channel === "sms"
                  ? person.phone
                  : null,
            ],
          );
        const [updated] = await q(
          "UPDATE communication_messages SET status=$2,sent_at=CASE WHEN $2='sent' THEN now() END WHERE id=$1 RETURNING *",
          [message.id, b.channel === "portal" && !b.sendAt ? "sent" : "queued"],
        );
        await audit(
          q,
          r.actor.id,
          r.church,
          "communication-message.created",
          message.id,
        );
        return { ...updated, recipientCount: people.length };
      });
      s.status(201).json(result);
    }),
  );
  app.post(
    "/api/communication/deliveries/:id/retry",
    route(async (r, s) => {
      await permit(r, true);
      const id = uuid.parse(r.params.id);
      s.json(
        await scoped(r, async (q) => {
          const [candidate] = await q(
            "SELECT d.id,d.message_id,d.channel,COALESCE(CASE WHEN d.channel='email' THEN cp.email_opt_in WHEN d.channel='sms' THEN cp.sms_opt_in ELSE false END,false) AS opt_in FROM communication_deliveries d LEFT JOIN communication_preferences cp ON cp.church_id=d.church_id AND cp.person_id=d.person_id WHERE d.id=$1 AND d.church_id=$2 AND d.channel IN ('email','sms') AND d.status='failed'",
            [id, r.church],
          );
          requireThat(
            candidate,
            404,
            "Entrega não encontrada ou não pode ser repetida.",
          );
          requireThat(
            candidate.opt_in,
            409,
            "O consentimento deste canal está desativado; confirme o opt-in antes de repetir.",
          );
          const [delivery] = await q(
            "UPDATE communication_deliveries SET status='queued',attempts=0,available_at=now(),locked_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 RETURNING id,message_id,status",
            [id],
          );
          await q(
            "UPDATE communication_messages SET status='queued',sent_at=NULL WHERE id=$1",
            [delivery.message_id],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "communication-delivery.retry",
            id,
          );
          return delivery;
        }),
      );
    }),
  );
  app.post(
    "/api/communication/messages/:id/cancel",
    route(async (r, s) => {
      await permit(r, true);
      const id = uuid.parse(r.params.id);
      s.json(
        await scoped(r, async (q) => {
          const [message] = await q(
            "UPDATE communication_messages SET status='cancelled' WHERE id=$1 AND status='queued' AND send_at IS NOT NULL AND send_at>now() RETURNING id,status",
            [id],
          );
          requireThat(
            message,
            409,
            "Somente avisos agendados ainda não enviados podem ser cancelados.",
          );
          await q(
            "UPDATE communication_deliveries SET status='skipped',last_error='Mensagem cancelada antes do envio.' WHERE message_id=$1 AND status='queued'",
            [id],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "communication-message.cancelled",
            id,
          );
          return message;
        }),
      );
    }),
  );
}
