import { NextResponse } from "next/server";

import { adminClient, requireSession } from "../auth";
import { isPushConfigured } from "../../../push-service";

export async function GET(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const { count, error } = await client
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);

  if (error) {
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
