import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { ChurchRole } from "../../../permissions";
import { sendPushToRolesByCongregation, sendPushToUser } from "../../../push-service";
import { adminClient, requireSession } from "../../admin/auth";
import { auditContact, isRecord, textValue } from "../contact-server";

const retentionDays = 90;
const reminderHours = 24;

function maintenanceSecretMatches(request: Request) {
  const configuredSecret = process.env.CONTACT_MAINTENANCE_SECRET || process.env.CRON_SECRET;
  if (!configuredSecret) return false;
  const headerSecret = request.headers.get("x-contact-maintenance-secret") ?? "";
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return headerSecret === configuredSecret || bearerSecret === configuredSecret;
}

async function assertMaintenanceAccess(request: Request) {
  const client = adminClient();
  if (!client) return { response: NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 }) };
  if (maintenanceSecretMatches(request)) return { client };
  const session = await requireSession(request, ["ADMIN"]);
  if (session.response || !session.user) return { response: session.response };
  return { client };
}

async function removeClosedThreads(client: SupabaseClient) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("contact_threads")
    .delete()
    .eq("status", "closed")
    .lt("closed_at", cutoff)
    .select("id,congregation");
  if (error) return { error };
  const removedRows = data ?? [];
  const removedByCongregation = removedRows.reduce<Record<string, number>>((totals, row) => {
    const congregation = String(row.congregation ?? "Sem congregação");
    totals[congregation] = (totals[congregation] ?? 0) + 1;
    return totals;
  }, {});
  await auditContact(client, null, "retention_cleanup", null, {
    retentionDays,
    cutoff,
    removedCount: removedRows.length,
    removedByCongregation,
  });
  return { removedCount: removedRows.length, removedByCongregation, cutoff };
}

async function sendPendingReminders(client: SupabaseClient) {
  const waitingSince = new Date(Date.now() - reminderHours * 60 * 60 * 1000).toISOString();
  const reminderBefore = new Date(Date.now() - reminderHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("contact_threads")
    .select("id,congregation,sender_name,destination_label,eligible_role,assigned_user_id,last_message_at,last_reminder_at,status")
    .in("status", ["unassigned", "waiting_leadership"])
    .lt("last_message_at", waitingSince)
    .order("last_message_at", { ascending: true })
    .limit(100);
  if (error) return { error };

  let reminded = 0;
  for (const rawThread of data ?? []) {
    if (!isRecord(rawThread)) continue;
    const lastReminderAt = textValue(rawThread.last_reminder_at, 80);
    if (lastReminderAt && lastReminderAt > reminderBefore) continue;
    const payload = {
      title: "Mensagem aguardando resposta",
      body: `Você recebeu uma mensagem de ${textValue(rawThread.sender_name, 180)}. Ela está aguardando sua resposta.`,
      module: "contact" as const,
    };
    const assignedUserId = textValue(rawThread.assigned_user_id, 120);
    if (assignedUserId) {
      await sendPushToUser(client, assignedUserId, payload);
    } else {
      const eligibleRole = textValue(rawThread.eligible_role, 40) as ChurchRole;
      const roles = Array.from(new Set<ChurchRole>([eligibleRole, "SECRETARY"].filter(Boolean) as ChurchRole[]));
      await sendPushToRolesByCongregation(client, roles, textValue(rawThread.congregation, 120), payload);
    }
    await client.from("contact_threads").update({ last_reminder_at: new Date().toISOString() }).eq("id", textValue(rawThread.id, 120));
    reminded += 1;
  }
  return { reminded };
}

async function runMaintenance(client: SupabaseClient) {
  const cleanup = await removeClosedThreads(client);
  if ("error" in cleanup) return cleanup;
  const reminders = await sendPendingReminders(client);
  if ("error" in reminders) return reminders;
  return { ...cleanup, ...reminders };
}

export async function GET(request: Request) {
  const access = await assertMaintenanceAccess(request);
  if ("response" in access && access.response) return access.response;
  const result = await runMaintenance(access.client);
  if ("error" in result) return NextResponse.json({ error: "Não foi possível executar a manutenção das conversas." }, { status: 400 });
  return NextResponse.json({ ok: true, retentionDays, reminderHours, ...result });
}

export async function POST(request: Request) {
  return GET(request);
}
