import { NextResponse } from "next/server";
import { adminClient } from "../../admin/auth";

const stateId = "main";

type JsonRecord = Record<string, unknown>;

const allowedStatuses = new Set(["Visitante", "Novo convertido", "Membro ativo"]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function comparablePhone(value: unknown) {
  return textValue(value).replace(/\D/g, "");
}

function comparableCpf(value: unknown) {
  return textValue(value).replace(/\D/g, "");
}

function hasDuplicate(payload: JsonRecord, cpf: string, phone: string) {
  const allRecords = [
    ...recordsFrom(payload.members),
    ...recordsFrom(payload.visitors),
    ...recordsFrom(payload.registrationRequests),
  ];

  return allRecords.some((record) => {
    const recordCpf = comparableCpf(record.cpf);
    const recordPhone = comparablePhone(record.phone);
    return Boolean((cpf && recordCpf && cpf === recordCpf) || (phone && recordPhone && phone === recordPhone));
  });
}

export async function POST(request: Request) {
  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Cadastro online indisponivel no momento." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Dados invalidos para cadastro." }, { status: 400 });
  }

  if (textValue(body.website)) {
    return NextResponse.json({ ok: true });
  }

  const fullName = textValue(body.fullName);
  const phone = textValue(body.phone, 40);
  const cleanPhone = comparablePhone(phone);
  const cleanCpf = comparableCpf(body.cpf);

  if (!fullName || cleanPhone.length < 8) {
    return NextResponse.json({ error: "Informe nome completo e telefone para enviar o cadastro." }, { status: 400 });
  }

  const { data: stored, error: readError } = await client
    .from("church_app_state")
    .select("payload")
    .eq("id", stateId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Nao foi possivel conferir a base antes de cadastrar." }, { status: 400 });
  }

  const payload = isRecord(stored?.payload) ? stored.payload : {};
  if (hasDuplicate(payload, cleanCpf, cleanPhone)) {
    return NextResponse.json(
      { error: "Cadastro ja recebido. Procure a secretaria para atualizar seus dados." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const requestedStatus = allowedStatuses.has(textValue(body.requestedStatus)) ? textValue(body.requestedStatus) : "Visitante";
  const registrationRequest = {
    id: `registration-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fullName,
    fatherName: textValue(body.fatherName),
    motherName: textValue(body.motherName),
    cpf: textValue(body.cpf, 20),
    phone,
    email: textValue(body.email, 140).toLowerCase(),
    birthDate: textValue(body.birthDate, 20),
    gender: textValue(body.gender, 40),
    address: textValue(body.address, 220),
    zipCode: textValue(body.zipCode, 20),
    city: textValue(body.city, 80),
    neighborhood: textValue(body.neighborhood, 80),
    maritalStatus: textValue(body.maritalStatus, 60) || "Solteiro(a)",
    education: textValue(body.education, 80),
    spouseName: textValue(body.spouseName, 140),
    requestedStatus,
    registrationSource: "Cadastro via link WhatsApp",
    notes: textValue(body.notes, 600),
    status: "Aguardando aprovacao",
    createdAt: now,
    reviewedAt: "",
    reviewNote: "",
  };

  const nextPayload = {
    ...payload,
    registrationRequests: [registrationRequest, ...recordsFrom(payload.registrationRequests)],
  };

  const { error: saveError } = await client.from("church_app_state").upsert({
    id: stateId,
    payload: nextPayload,
    updated_at: now,
  });

  if (saveError) {
    return NextResponse.json({ error: "Nao foi possivel salvar o pre-cadastro." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
