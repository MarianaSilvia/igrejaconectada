import { NextResponse } from "next/server";
import { adminClient, requireSession } from "../auth";

type RegistrationRequestRow = {
  id: string;
  full_name: string;
  father_name: string;
  mother_name: string;
  cpf: string;
  phone: string;
  email: string;
  birth_date: string;
  gender: string;
  address: string;
  zip_code: string;
  city: string;
  neighborhood: string;
  marital_status: string;
  education: string;
  spouse_name: string;
  requested_status: "Visitante" | "Novo convertido" | "Membro ativo";
  registration_source: string;
  notes: string;
  status: "Aguardando aprovacao" | "Em analise" | "Aprovado" | "Recusado";
  created_at: string;
  reviewed_at: string;
  review_note: string;
};

function toRegistrationRequest(row: RegistrationRequestRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    fatherName: row.father_name,
    motherName: row.mother_name,
    cpf: row.cpf,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date,
    gender: row.gender,
    address: row.address,
    zipCode: row.zip_code,
    city: row.city,
    neighborhood: row.neighborhood,
    maritalStatus: row.marital_status,
    education: row.education,
    spouseName: row.spouse_name,
    requestedStatus: row.requested_status,
    registrationSource: row.registration_source,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

export async function GET(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const { data, error } = await client
    .from("registration_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel carregar os pre-cadastros." }, { status: 400 });
  }

  return NextResponse.json({ requests: (data as RegistrationRequestRow[]).map(toRegistrationRequest) });
}

export async function PATCH(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { id?: string; status?: string; reviewNote?: string } | null;
  const id = body?.id?.trim();
  const status = body?.status?.trim();

  if (!id || !status || !["Aprovado", "Recusado", "Em analise"].includes(status)) {
    return NextResponse.json({ error: "Acao invalida para o pre-cadastro." }, { status: 400 });
  }

  const { data, error } = await client
    .from("registration_requests")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      review_note: body?.reviewNote?.trim().slice(0, 240) ?? "",
      reviewed_by: session.user.id,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel atualizar o pre-cadastro." }, { status: 400 });
  }

  return NextResponse.json({ request: toRegistrationRequest(data as RegistrationRequestRow) });
}
