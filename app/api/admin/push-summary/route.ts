import { NextResponse } from "next/server";

import { congregationMatchesScope, normalizeCongregationScope } from "../../../congregation-scope";
import { adminClient, requireSession } from "../auth";
import { isPushConfigured } from "../../../push-service";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function accessCongregationScope(client: NonNullable<ReturnType<typeof adminClient>>, email: string, metadataScope: unknown) {
  const fallback = normalizeCongregationScope(metadataScope);
  if (!email) return fallback;

  const { data } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = isRecord(data?.payload) ? data.payload : {};
  const accessUser = recordsFrom(payload.users).find((user) => textValue(user.email).toLowerCase() === email.toLowerCase());

  return normalizeCongregationScope(accessUser?.congregationScope ?? metadataScope);
}

export async function GET(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const scope = await accessCongregationScope(client, session.user.email ?? "", session.user.app_metadata?.church_gp_congregation_scope);
  const { data, error } = await client
    .from("push_subscriptions")
    .select("id,congregation_scope")
    .eq("enabled", true);

  if (!error) {
    return NextResponse.json({
      configured: isPushConfigured(),
      enabledSubscriptions: (data ?? []).filter((row) => congregationMatchesScope(row.congregation_scope, scope)).length,
    });
  }

  const { count, error: legacyError } = await client
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);

  if (legacyError) {
    return NextResponse.json({
      configured: isPushConfigured(),
      enabledSubscriptions: 0,
      error: "Tabela de notificacoes indisponivel.",
    });
  }

  return NextResponse.json({
    configured: isPushConfigured(),
    enabledSubscriptions: count ?? 0,
  });
}
