import { NextResponse } from "next/server";

import { adminClient, requireSession } from "../../admin/auth";
import { isPushConfigured, sendPushToUser } from "../../../push-service";

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Notificacoes ainda nao configuradas no servidor." }, { status: 503 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const result = await sendPushToUser(client, session.user.id, {
    title: "Igreja Conectada",
    body: "Teste de notificacao ativado com sucesso neste aparelho.",
    module: "overview",
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
