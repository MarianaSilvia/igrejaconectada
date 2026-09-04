import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type AccessUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  status?: string;
};

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Sessao obrigatoria para criar usuarios." }, { status: 401 });
  }

  const sessionClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: sessionData, error: sessionError } = await sessionClient.auth.getUser(token);

  if (sessionError || !sessionData.user) {
    return NextResponse.json({ error: "Sessao invalida ou expirada." }, { status: 401 });
  }

  const payload = (await request.json()) as AccessUserPayload;
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();

  if (!name || !email || !password || password.length < 6) {
    return NextResponse.json({ error: "Informe nome, e-mail e senha com pelo menos 6 caracteres." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role: payload.role ?? "Lider",
      status: payload.status ?? "Ativo",
      created_by: sessionData.user.id,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.user.id, email: data.user.email });
}
