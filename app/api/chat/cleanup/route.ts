import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { adminClient, requireSession } from "../../admin/auth";

const retentionDays = 90;

function cleanupSecretMatches(request: Request) {
  const configuredSecret = process.env.CHAT_CLEANUP_SECRET || process.env.CRON_SECRET;
  if (!configuredSecret) return false;

  const headerSecret = request.headers.get("x-chat-cleanup-secret") ?? "";
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  return headerSecret === configuredSecret || bearerSecret === configuredSecret;
}

async function assertCleanupAccess(request: Request) {
  const client = adminClient();
  if (!client) return { response: NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 }) };

  if (cleanupSecretMatches(request)) return { client };

  const session = await requireSession(request, ["ADMIN"]);
  if (session.response || !session.user) return { response: session.response };

  return { client };
}

async function cleanupOldMessages(client: SupabaseClient) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffIso = cutoff.toISOString();

  const { data, error } = await client
    .from("chat_messages")
    .delete()
    .lt("created_at", cutoffIso)
    .select("id,room_id,congregation");

  if (error) return { error };

  const removedRows = data ?? [];
  const removedByCongregation = removedRows.reduce<Record<string, number>>((totals, row) => {
    const congregation = String(row.congregation ?? "Sem congregação");
    totals[congregation] = (totals[congregation] ?? 0) + 1;
    return totals;
  }, {});

  await client.from("chat_moderation").insert({
    action: "cleanup",
    note: `Limpeza automática removeu ${removedRows.length} mensagem(ns) com mais de ${retentionDays} dias.`,
    metadata: {
      retentionDays,
      cutoff: cutoffIso,
      removedCount: removedRows.length,
      removedByCongregation,
    },
  });

  return {
    removedCount: removedRows.length,
    removedByCongregation,
    cutoff: cutoffIso,
  };
}

export async function GET(request: Request) {
  const access = await assertCleanupAccess(request);
  if ("response" in access && access.response) return access.response;

  const result = await cleanupOldMessages(access.client);
  if ("error" in result && result.error) {
    return NextResponse.json({ error: "Não foi possível limpar mensagens antigas do chat." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, retentionDays, ...result });
}

export async function POST(request: Request) {
  return GET(request);
}
