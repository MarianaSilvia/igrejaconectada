import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stateId = "main";

type AppStatePayload = {
  payload?: unknown;
};

function unavailableResponse() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  }

  return null;
}

async function getSessionUser(request: Request) {
  const unavailable = unavailableResponse();
  if (unavailable) return { response: unavailable };

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { response: NextResponse.json({ error: "Sessao obrigatoria para sincronizar cadastros." }, { status: 401 }) };
  }

  const sessionClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: sessionData, error: sessionError } = await sessionClient.auth.getUser(token);

  if (sessionError || !sessionData.user) {
    return { response: NextResponse.json({ error: "Sessao invalida ou expirada." }, { status: 401 }) };
  }

  return { user: sessionData.user };
}

function adminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const { data, error } = await client.from("church_app_state").select("payload,updated_at").eq("id", stateId).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ payload: data?.payload ?? null, updatedAt: data?.updated_at ?? null });
}

export async function PUT(request: Request) {
  const session = await getSessionUser(request);
  if (session.response || !session.user) return session.response;

  const { payload } = (await request.json()) as AppStatePayload;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Estado invalido para salvar na base." }, { status: 400 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const { data, error } = await client
    .from("church_app_state")
    .upsert({
      id: stateId,
      payload,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, updatedAt: data.updated_at });
}
