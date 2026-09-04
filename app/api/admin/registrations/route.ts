import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RegistrationPayload = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  birth_date: string;
  marital_status: string;
  address: string;
  congregation_interest: string;
  registration_type: string;
  previous_church?: string | null;
  is_water_baptized: boolean;
  is_holy_spirit_baptized: boolean;
  interested_ministries: string[];
  ministry_role?: string | null;
  notes_or_prayer?: string | null;
  submitted_at?: string;
  status?: "PENDENTE" | "APROVADO" | "REJEITADO";
};

type ReviewPayload = {
  action: "update" | "approve" | "reject";
  registration: RegistrationPayload;
  createAccess?: boolean;
  password?: string;
};

function createServerClients(token: string) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return null;

  return {
    sessionClient: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    }),
    adminClient: createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    }),
    token,
  };
}

async function requireSession(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 }) };

  const clients = createServerClients(token);
  if (!clients) return { error: NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 }) };

  const { data, error } = await clients.sessionClient.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Sessao invalida ou expirada." }, { status: 401 }) };

  return { ...clients, user: data.user };
}

function mapMemberStatus(type: string) {
  if (type === "VISITANTE_FREQUENTE") return "Visitante";
  if (type === "NOVO_CONVERTIDO") return "Novo convertido";
  if (type === "TRANSFERENCIA") return "Transferencia";
  return "Membro ativo";
}

function mapMemberType(type: string, role?: string | null) {
  if (type === "VISITANTE_FREQUENTE") return "Visitante";
  if (role?.toLowerCase().includes("lider")) return "Lideranca";
  return "Membro";
}

function registrationUpdate(registration: RegistrationPayload) {
  return {
    full_name: registration.full_name,
    phone: registration.phone,
    email: registration.email,
    birth_date: registration.birth_date,
    marital_status: registration.marital_status,
    address: registration.address,
    congregation_interest: registration.congregation_interest,
    registration_type: registration.registration_type,
    previous_church: registration.previous_church ?? null,
    is_water_baptized: registration.is_water_baptized,
    is_holy_spirit_baptized: registration.is_holy_spirit_baptized,
    interested_ministries: registration.interested_ministries ?? [],
    ministry_role: registration.ministry_role ?? null,
    notes_or_prayer: registration.notes_or_prayer ?? null,
  };
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("error" in session) return session.error;

  const { data, error } = await session.adminClient
    .from("online_registrations")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ registrations: data ?? [] });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("error" in session) return session.error;

  const payload = (await request.json()) as ReviewPayload;
  const registration = payload.registration;
  const now = new Date().toISOString();

  if (!registration?.id || !registration.full_name?.trim() || !registration.phone?.trim()) {
    return NextResponse.json({ error: "Cadastro incompleto para revisao." }, { status: 400 });
  }

  if (payload.action === "update") {
    const { error } = await session.adminClient
      .from("online_registrations")
      .update(registrationUpdate(registration))
      .eq("id", registration.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ registration });
  }

  if (payload.action === "reject") {
    const { error } = await session.adminClient
      .from("online_registrations")
      .update({
        ...registrationUpdate(registration),
        status: "REJEITADO",
        reviewed_at: now,
        reviewed_by: session.user.email ?? "Administrador",
        reviewed_by_auth_user_id: session.user.id,
      })
      .eq("id", registration.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ status: "REJEITADO" });
  }

  if (payload.action !== "approve") {
    return NextResponse.json({ error: "Acao de revisao invalida." }, { status: 400 });
  }

  let authUserId: string | null = null;
  if (payload.createAccess && registration.email?.trim()) {
    if (!payload.password?.trim() || payload.password.trim().length < 6) {
      return NextResponse.json({ error: "Informe uma senha inicial com pelo menos 6 caracteres." }, { status: 400 });
    }

    const { data, error } = await session.adminClient.auth.admin.createUser({
      email: registration.email.trim().toLowerCase(),
      password: payload.password.trim(),
      email_confirm: true,
      user_metadata: { name: registration.full_name },
      app_metadata: {
        role: "Membro",
        status: "Ativo",
        created_from: "online_registration",
      },
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    authUserId = data.user.id;
  }

  const memberId = `member-${Date.now()}`;
  const { data: member, error: memberError } = await session.adminClient
    .from("members")
    .insert({
      id: memberId,
      full_name: registration.full_name,
      photo_url: null,
      status: mapMemberStatus(registration.registration_type),
      congregation: registration.congregation_interest,
      ministerial_role: registration.ministry_role ?? "",
      birth_date: registration.birth_date,
      phone: registration.phone,
      email: registration.email,
      address: registration.address,
      marital_status: registration.marital_status,
      assigned_ministries: registration.interested_ministries ?? [],
      notes: registration.notes_or_prayer ?? "",
      created_at: now,
      auth_user_id: authUserId,
      digital_card_enabled: true,
      whatsapp_opt_in: true,
    })
    .select("*")
    .single();

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 400 });

  const { error: reviewError } = await session.adminClient
    .from("online_registrations")
    .update({
      ...registrationUpdate(registration),
      status: "APROVADO",
      reviewed_at: now,
      reviewed_by: session.user.email ?? "Administrador",
      reviewed_by_auth_user_id: session.user.id,
      converted_member_id: memberId,
    })
    .eq("id", registration.id);

  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 400 });

  return NextResponse.json({
    member,
    accessUser: authUserId
      ? {
          id: authUserId,
          name: registration.full_name,
          email: registration.email,
          role: "Membro",
          status: "Ativo",
        }
      : null,
  });
}
