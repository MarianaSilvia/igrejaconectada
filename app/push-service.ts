import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { congregationMatchesScope, globalCongregationScope } from "./congregation-scope";
import type { ChurchRole, ModuleKey } from "./permissions";

type JsonRecord = Record<string, unknown>;

type PushNotificationPayload = {
  title: string;
  body: string;
  module?: ModuleKey;
  url?: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: webpush.PushSubscription;
  failure_count: number;
  congregation_scope?: string;
};

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:secretaria@igrejaconectada.app";

let webPushConfigured = false;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function notificationUrl(module?: ModuleKey) {
  return module ? `/?module=${encodeURIComponent(module)}` : "/";
}

export function isPushConfigured() {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

function configureWebPush() {
  if (webPushConfigured || !isPushConfigured()) return;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  webPushConfigured = true;
}

async function markSubscriptionSent(client: SupabaseClient, id: string) {
  await client
    .from("push_subscriptions")
    .update({ last_sent_at: new Date().toISOString(), failure_count: 0, failed_at: null, enabled: true })
    .eq("id", id);
}

async function markSubscriptionFailed(client: SupabaseClient, row: PushSubscriptionRow, shouldDisable: boolean) {
  await client
    .from("push_subscriptions")
    .update({
      enabled: shouldDisable ? false : true,
      failed_at: new Date().toISOString(),
      failure_count: Number(row.failure_count ?? 0) + 1,
    })
    .eq("id", row.id);
}

async function sendRows(client: SupabaseClient, rows: PushSubscriptionRow[], payload: PushNotificationPayload) {
  if (!rows.length || !isPushConfigured()) return { sent: 0, failed: 0, configured: isPushConfigured() };
  configureWebPush();

  let sent = 0;
  let failed = 0;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? notificationUrl(payload.module),
    module: payload.module ?? "overview",
  });

  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, body);
      sent += 1;
      await markSubscriptionSent(client, row.id);
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      await markSubscriptionFailed(client, row, statusCode === 404 || statusCode === 410);
    }
  }

  return { sent, failed, configured: true };
}

export async function sendPushToUser(client: SupabaseClient, userId: string, payload: PushNotificationPayload) {
  const { data, error } = await client
    .from("push_subscriptions")
    .select("id,user_id,endpoint,subscription,failure_count")
    .eq("user_id", userId)
    .eq("enabled", true)
    .limit(20);

  if (error) return { sent: 0, failed: 0, configured: isPushConfigured(), error: error.message };
  return sendRows(client, (data ?? []) as PushSubscriptionRow[], payload);
}

export async function sendPushToRoles(client: SupabaseClient, roles: ChurchRole[], payload: PushNotificationPayload) {
  return sendPushToRolesByCongregation(client, roles, globalCongregationScope, payload);
}

export async function sendPushToRolesByCongregation(
  client: SupabaseClient,
  roles: ChurchRole[],
  congregationScope: string,
  payload: PushNotificationPayload,
) {
  const { data, error } = await client
    .from("push_subscriptions")
    .select("id,user_id,endpoint,subscription,failure_count,congregation_scope")
    .in("church_role", roles)
    .eq("enabled", true)
    .limit(500);

  if (!error) {
    const rows = ((data ?? []) as PushSubscriptionRow[]).filter((row) =>
      congregationMatchesScope(row.congregation_scope, congregationScope),
    );
    return sendRows(client, rows, payload);
  }

  if (!/congregation_scope|schema cache|column/i.test(error.message)) {
    return { sent: 0, failed: 0, configured: isPushConfigured(), error: error.message };
  }

  const legacyResult = await client
    .from("push_subscriptions")
    .select("id,user_id,endpoint,subscription,failure_count")
    .in("church_role", roles)
    .eq("enabled", true)
    .limit(500);

  if (legacyResult.error) return { sent: 0, failed: 0, configured: isPushConfigured(), error: legacyResult.error.message };
  return sendRows(client, (legacyResult.data ?? []) as PushSubscriptionRow[], payload);
}

function recordIds(records: JsonRecord[]) {
  return new Set(records.map((record) => textValue(record.id)).filter(Boolean));
}

function createdRecords(previous: JsonRecord, next: JsonRecord, key: string) {
  const existingIds = recordIds(recordsFrom(previous[key]));
  return recordsFrom(next[key]).filter((record) => {
    const id = textValue(record.id);
    return id && !existingIds.has(id);
  });
}

function becamePublished(previous: JsonRecord, next: JsonRecord, key: string, statusKey: "published" | "status") {
  const previousById = new Map(recordsFrom(previous[key]).map((record) => [textValue(record.id), record]));
  return recordsFrom(next[key]).filter((record) => {
    const id = textValue(record.id);
    const previousRecord = previousById.get(id);
    if (!id || !previousRecord) return false;
    return statusKey === "published"
      ? previousRecord.published !== true && record.published === true
      : textValue(previousRecord.status) !== "Publicado" && textValue(record.status) === "Publicado";
  });
}

function classNotices(payload: JsonRecord, key: "schoolClasses" | "discipleshipClasses"): JsonRecord[] {
  return recordsFrom(payload[key]).flatMap((schoolClass) =>
    recordsFrom(schoolClass.notices).map((notice) => ({
      ...notice,
      className: textValue(schoolClass.name),
    })),
  );
}

function createdClassNotices(previous: JsonRecord, next: JsonRecord, key: "schoolClasses" | "discipleshipClasses") {
  const existingIds = recordIds(classNotices(previous, key));
  return classNotices(next, key).filter((notice) => {
    const id = textValue(notice.id);
    return id && !existingIds.has(id) && textValue(notice.status) === "Publicado";
  });
}

function isTodayOrTomorrow(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const eventDate = new Date(`${value}T12:00:00`);
  eventDate.setHours(0, 0, 0, 0);
  return eventDate.getTime() === today.getTime() || eventDate.getTime() === tomorrow.getTime();
}

export async function notifyImportantStateChanges(client: SupabaseClient, previous: JsonRecord, next: JsonRecord) {
  const allRoles: ChurchRole[] = ["ADMIN", "SECRETARY", "LEADER", "PROFESSOR", "TREASURER", "MEMBER"];
  const createdCareRequests = createdRecords(previous, next, "careRequests");
  const publishedMural = [
    ...createdRecords(previous, next, "mural").filter((item) => item.published === true),
    ...becamePublished(previous, next, "mural", "published"),
  ];
  const publishedNotices = [
    ...createdRecords(previous, next, "notices").filter((item) => textValue(item.status) === "Publicado"),
    ...becamePublished(previous, next, "notices", "status"),
  ];
  const importantEvents = createdRecords(previous, next, "events").filter((event) => isTodayOrTomorrow(textValue(event.date)));
  const schoolNotices = createdClassNotices(previous, next, "schoolClasses");
  const discipleshipNotices = createdClassNotices(previous, next, "discipleshipClasses");

  for (const request of createdCareRequests) {
    await sendPushToRolesByCongregation(client, ["ADMIN", "LEADER"], textValue(request.congregation), {
      title: "Novo pedido recebido",
      body: `${textValue(request.category) || "Atendimento"} aguardando acompanhamento.`,
      module: "pastoral",
    });
  }

  for (const item of publishedMural.slice(0, 3)) {
    await sendPushToRolesByCongregation(client, allRoles, textValue(item.congregation), {
      title: "Novo aviso no mural",
      body: textValue(item.title) || "A igreja publicou um novo aviso.",
      module: "mural",
    });
  }

  for (const notice of publishedNotices.slice(0, 3)) {
    await sendPushToRolesByCongregation(client, allRoles, textValue(notice.congregation), {
      title: "Novo comunicado",
      body: textValue(notice.title) || "A igreja publicou um comunicado.",
      module: "notices",
    });
  }

  for (const event of importantEvents.slice(0, 3)) {
    await sendPushToRolesByCongregation(client, allRoles, textValue(event.congregation), {
      title: "Agenda da igreja",
      body: `${textValue(event.title) || "Evento"} - ${textValue(event.time) || "horario a confirmar"}`,
      module: "events",
    });
  }

  for (const notice of schoolNotices.slice(0, 3)) {
    await sendPushToRoles(client, ["PROFESSOR"], {
      title: "Aviso da EBD",
      body: `${textValue(notice.className) || "Classe"}: ${textValue(notice.title) || "novo aviso"}`,
      module: "school",
    });
  }

  for (const notice of discipleshipNotices.slice(0, 3)) {
    await sendPushToRoles(client, ["PROFESSOR"], {
      title: "Aviso do Discipulado",
      body: `${textValue(notice.className) || "Classe"}: ${textValue(notice.title) || "novo aviso"}`,
      module: "discipleship",
    });
  }
}
