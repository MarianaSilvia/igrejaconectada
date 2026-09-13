import { NextResponse } from "next/server";
import { congregationMatchesScope, isGlobalCongregationScope, normalizeCongregationScope } from "../../../congregation-scope";
import { adminClient, requireSession } from "../auth";

type RegistrationRequestRow = {
  id: string;
  congregation?: string;
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

const registrationRequestColumns = [
  "id",
  "congregation",
  "full_name",
  "father_name",
  "mother_name",
  "cpf",
  "phone",
  "email",
  "birth_date",
  "gender",
  "address",
  "zip_code",
  "city",
  "neighborhood",
  "marital_status",
  "education",
  "spouse_name",
  "requested_status",
  "registration_source",
  "notes",
  "status",
  "created_at",
  "reviewed_at",
  "review_note",
].join(",");

const legacyRegistrationRequestColumns = registrationRequestColumns
  .split(",")
  .filter((column) => column !== "congregation")
  .join(",");

function toRegistrationRequest(row: RegistrationRequestRow) {
  return {
    id: row.id,
    congregation: row.congregation ?? "",
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

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function accessCongregationScope(client: NonNullable<ReturnType<typeof adminClient>>, email: string, metadataScope: unknown) {
  const { data } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = isRecord(data?.payload) ? data.payload : {};
  const accessUser = recordsFrom(payload.users).find((user) => textValue(user.email).toLowerCase() === email.toLowerCase());
  return normalizeCongregationScope(accessUser?.congregationScope ?? metadataScope);
}

function filterByScope(requests: RegistrationRequestRow[], scope: string) {
  if (isGlobalCongregationScope(scope)) return requests;
  return requests.filter((request) => congregationMatchesScope(request.congregation, scope));
}

export async function GET(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const scope = await accessCongregationScope(client, session.user?.email ?? "", session.user?.app_metadata?.church_gp_congregation_scope);

  let { data, error } = await client
    .from("registration_requests")
    .select(registrationRequestColumns)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error && /congregation|schema cache|column/i.test(error.message)) {
    const legacyResult = await client
      .from("registration_requests")
      .select(legacyRegistrationRequestColumns)
      .order("created_at", { ascending: false })
      .limit(200);
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel carregar os pre-cadastros." }, { status: 400 });
  }

  return NextResponse.json({ requests: filterByScope(data as unknown as RegistrationRequestRow[], scope).map(toRegistrationRequest) });
}

export async function PATCH(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const scope = await accessCongregationScope(client, session.user.email ?? "", session.user.app_metadata?.church_gp_congregation_scope);

  const body = (await request.json().catch(() => null)) as { id?: string; status?: string; reviewNote?: string } | null;
  const id = body?.id?.trim();
  const status = body?.status?.trim();

  if (!id || !status || !["Aprovado", "Recusado", "Em analise"].includes(status)) {
    return NextResponse.json({ error: "Acao invalida para o pre-cadastro." }, { status: 400 });
  }

  let existingResult = await client
    .from("registration_requests")
    .select(registrationRequestColumns)
    .eq("id", id)
    .maybeSingle();

  if (existingResult.error && /congregation|schema cache|column/i.test(existingResult.error.message)) {
    existingResult = await client
      .from("registration_requests")
      .select(legacyRegistrationRequestColumns)
      .eq("id", id)
      .maybeSingle();
  }

  if (existingResult.error) {
    return NextResponse.json({ error: "Nao foi possivel conferir o pre-cadastro." }, { status: 400 });
  }

  if (existingResult.data && !congregationMatchesScope((existingResult.data as unknown as RegistrationRequestRow).congregation, scope)) {
    return NextResponse.json({ error: "Voce nao pode alterar pre-cadastro de outra congregacao." }, { status: 403 });
  }

  let { data, error } = await client
    .from("registration_requests")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      review_note: body?.reviewNote?.trim().slice(0, 240) ?? "",
      reviewed_by: session.user.id,
    })
    .eq("id", id)
    .select(registrationRequestColumns)
    .single();

  if (error && /congregation|schema cache|column/i.test(error.message)) {
    const legacyResult = await client
      .from("registration_requests")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        review_note: body?.reviewNote?.trim().slice(0, 240) ?? "",
        reviewed_by: session.user.id,
      })
      .eq("id", id)
      .select(legacyRegistrationRequestColumns)
      .single();
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel atualizar o pre-cadastro." }, { status: 400 });
  }

  return NextResponse.json({ request: toRegistrationRequest(data as unknown as RegistrationRequestRow) });
}
