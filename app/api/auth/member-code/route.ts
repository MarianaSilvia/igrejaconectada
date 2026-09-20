import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { adminClient, hasApprovedAccess } from "../../admin/auth";

type JsonRecord = Record<string, unknown>;

const attempts = new Map<string, { count: number; resetAt: number }>();
const attemptWindowMs = 15 * 60 * 1000;
const maxAttempts = 8;

function textValue(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + attemptWindowMs });
    return false;
  }

  current.count += 1;
  attempts.set(key, current);
  return current.count > maxAttempts;
}

async function emailForMemberCode(code: string) {
  const admin = adminClient();
  if (!admin) return "";

  const { data: memberRow } = await admin
    .from("members")
    .select("email")
    .ilike("registration_number", code)
    .maybeSingle();
  if (memberRow?.email) return textValue(memberRow.email).toLowerCase();

  const { data: stateRow } = await admin.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = isRecord(stateRow?.payload) ? stateRow.payload : {};
  const members = Array.isArray(payload.members) ? payload.members.filter(isRecord) : [];
  const member = members.find((item) => textValue(item.memberCode).toUpperCase() === code);
  return textValue(member?.email).toLowerCase();
}

export async function POST(request: Request) {
  const address = clientAddress(request);
  if (isRateLimited(address)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const memberCode = textValue(body?.memberCode, 30).toUpperCase();
  const password = textValue(body?.password, 200);

  if (!/^CDG\d{4,}$/.test(memberCode) || !password) {
    return NextResponse.json({ error: "Código ou senha inválidos." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Acesso temporariamente indisponível." }, { status: 503 });
  }

  const email = await emailForMemberCode(memberCode);
  if (!email) {
    return NextResponse.json({ error: "Código ou senha inválidos." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user || !hasApprovedAccess(data.user)) {
    return NextResponse.json({ error: "Código ou senha inválidos." }, { status: 401 });
  }

  attempts.delete(address);
  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}
