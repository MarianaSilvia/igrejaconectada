import { NextResponse } from "next/server";

import { adminClient } from "../../admin/auth";

type JsonRecord = Record<string, unknown>;
const attempts = new Map<string, { count: number; resetAt: number }>();

function textValue(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function limited(address: string) {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 3;
}

export async function POST(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(address)) return NextResponse.json({ error: "Aguarde antes de enviar outra solicitação." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  if (textValue(body?.website)) return NextResponse.json({ ok: true, message: "Solicitação recebida." });
  const identifier = textValue(body?.identifier, 180);
  const reason = textValue(body?.reason, 500);
  if (!identifier || body?.confirmation !== true) {
    return NextResponse.json({ error: "Informe seu acesso e confirme a solicitação." }, { status: 400 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Serviço temporariamente indisponível." }, { status: 503 });
  const { error } = await client.from("account_deletion_requests").insert({
    identifier,
    reason,
    status: "pending",
    requested_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "Não foi possível registrar a solicitação. Fale com a secretaria." }, { status: 400 });

  return NextResponse.json({ ok: true, message: "Solicitação registrada. A secretaria confirmará sua identidade antes da exclusão." });
}
