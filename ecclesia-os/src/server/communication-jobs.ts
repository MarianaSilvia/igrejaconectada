import { randomUUID } from "node:crypto";
import type { Database, Row } from "./db.js";
import { audit } from "./seed.js";
import { encrypt } from "./security.js";

export type CommunicationTransport = "disabled" | "demo" | "webhook";
export type CommunicationWebhookConfig = {
  emailUrl?: string;
  smsUrl?: string;
  token?: string;
};

export async function processCommunicationDeliveryJobs(
  db: Database,
  transport: CommunicationTransport = "disabled",
  limit = 20,
  config: CommunicationWebhookConfig = {},
  key?: Buffer,
) {
  if (transport === "disabled") return 0;
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const lease = randomUUID();
    const delivery: Row | null = await db.transaction(async (q) => {
      const [row] = await q("SELECT d.* FROM communication_deliveries d JOIN communication_messages m ON m.id=d.message_id WHERE d.status='queued' AND d.channel IN ('email','sms') AND d.available_at<=now() AND (m.send_at IS NULL OR m.send_at<=now()) AND (d.locked_until IS NULL OR d.locked_until<now()) ORDER BY d.available_at,d.id FOR UPDATE SKIP LOCKED LIMIT 1");
      if (!row) return null;
      const [claimed] = await q("UPDATE communication_deliveries SET attempts=attempts+1,locked_until=now()+interval '2 minutes',lease_token=$2 WHERE id=$1 RETURNING *", [row.id, lease]);
      return claimed;
    });
    if (!delivery) break;
    try {
      let providerId = `demo-${delivery.id}`;
      if (transport === "webhook") {
        const [message] = await db.transaction((q) => q("SELECT subject,body FROM communication_messages WHERE id=$1", [delivery.message_id]));
        const url = delivery.channel === "email" ? config.emailUrl : config.smsUrl;
        if (!url) throw new Error("Provedor de comunicação não configurado.");
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) },
          body: JSON.stringify({ deliveryId: delivery.id, messageId: delivery.message_id, channel: delivery.channel, to: delivery.address_snapshot, subject: message?.subject, body: message?.body }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`Provedor respondeu ${response.status}.`);
        providerId = response.headers.get("x-provider-message-id") || `webhook-${delivery.id}`;
      }
      await db.transaction(async (q) => {
        await q("UPDATE communication_deliveries SET status='sent',sent_at=now(),provider_message_id=$2,locked_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 AND lease_token=$3", [delivery.id, providerId, lease]);
        await q("UPDATE communication_messages SET status=CASE WHEN EXISTS(SELECT 1 FROM communication_deliveries WHERE message_id=$1 AND status='queued') THEN 'queued' WHEN EXISTS(SELECT 1 FROM communication_deliveries WHERE message_id=$1 AND status='failed') THEN 'failed' ELSE 'sent' END,sent_at=CASE WHEN NOT EXISTS(SELECT 1 FROM communication_deliveries WHERE message_id=$1 AND status IN ('queued','failed')) THEN now() ELSE sent_at END WHERE id=$1", [delivery.message_id]);
        await audit(q, null, delivery.church_id, "communication-delivery.sent", delivery.id);
      });
      processed++;
    } catch {
      await db.transaction((q) => q("UPDATE communication_deliveries SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,available_at=now()+($3::int*interval '1 second'),locked_until=NULL,lease_token=NULL,last_error='Falha no provedor de comunicação.' WHERE id=$1 AND lease_token=$2", [delivery.id, lease, Math.min(3600, 30 * 2 ** Math.min(delivery.attempts, 6))]));
      if (key && delivery.attempts >= 5)
        await db.transaction(async (q) => {
          const [message] = await q("SELECT created_by,subject FROM communication_messages WHERE id=$1", [delivery.message_id]);
          if (message) await q("INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,person_id,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+1,$3,$4,$4,'communication_delivery',$5) ON CONFLICT DO NOTHING", [delivery.church_id, encrypt(`Falha de comunicação · ${message.subject}`, key), delivery.person_id, message.created_by, delivery.id]);
        });
    }
  }
  return processed;
}

export function startCommunicationWorker(db: Database, transport: CommunicationTransport, config: CommunicationWebhookConfig = {}, key?: Buffer) {
  let running: Promise<unknown> | null = null;
  const tick = () => {
    if (!running) running = processCommunicationDeliveryJobs(db, transport, 20, config, key).catch(() => {}).finally(() => { running = null; });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await running; };
}
