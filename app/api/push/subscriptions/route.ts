import { NextResponse } from "next/server";

import { normalizeCongregationScope } from "../../../congregation-scope";
import { adminClient, requireSession } from "../../admin/auth";
import { isPushConfigured } from "../../../push-service";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validSubscription(value: unknown) {
  if (!isRecord(value)) return false;
  if (!textValue(value.endpoint, 2048)) return false;
  if (!isRecord(value.keys)) return false;
  return Boolean(textValue(value.keys.p256dh, 512) && textValue(value.keys.auth, 512));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

async function subscriptionCongregationScope(client: NonNullable<ReturnType<typeof adminClient>>, email: string, metadataScope: unknown) {
  const fallback = normalizeCongregationScope(metadataScope);
  if (!email) return fallback;

  const { data } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = isRecord(data?.payload) ? data.payload : {};
  const accessUser = recordsFrom(payload.users).find((user) => textValue(user.email, 180).toLowerCase() === email.toLowerCase());

  return normalizeCongregationScope(accessUser?.congregationScope ?? metadataScope);
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const { count, error } = await client
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({
      configured: isPushConfigured(),
      enabled: false,
      error: "Tabela de notificacoes indisponivel.",
    });
  }

  return NextResponse.json({ configured: isPushConfigured(), enabled: Boolean(count), count: count ?? 0 });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Notificacoes ainda nao configuradas no servidor." }, { status: 503 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const subscription = body?.subscription;

  if (!validSubscription(subscription)) {
    return NextResponse.json({ error: "Inscricao de notificacao invalida." }, { status: 400 });
  }

  const record = subscription as JsonRecord;
  const congregationScope = await subscriptionCongregationScope(
    client,
    session.user.email ?? "",
    session.user.app_metadata?.church_gp_congregation_scope,
  );
  const subscriptionRow = {
    user_id: session.user.id,
    user_email: session.user.email ?? "",
    church_role: session.role,
    congregation_scope: congregationScope,
    endpoint: textValue(record.endpoint, 2048),
    subscription,
    user_agent: textValue(body?.userAgent, 500),
    enabled: true,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let { error } = await client.from("push_subscriptions").upsert(subscriptionRow, { onConflict: "endpoint" });

  if (error && /congregation_scope|schema cache|column/i.test(error.message)) {
    const legacySubscriptionRow = { ...subscriptionRow } as Omit<typeof subscriptionRow, "congregation_scope"> & {
      congregation_scope?: string;
    };
    delete legacySubscriptionRow.congregation_scope;
    const legacyResult = await client.from("push_subscriptions").upsert(legacySubscriptionRow, { onConflict: "endpoint" });
    error = legacyResult.error;
  }

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel ativar notificacoes neste aparelho." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const endpoint = textValue(body?.endpoint, 2048);
  let query = client.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", session.user.id);
  if (endpoint) query = query.eq("endpoint", endpoint);

  const { error } = await query;
  if (error) return NextResponse.json({ error: "Nao foi possivel desativar notificacoes." }, { status: 400 });

  return NextResponse.json({ ok: true });
}
