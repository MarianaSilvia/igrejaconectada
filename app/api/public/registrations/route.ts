import { NextResponse } from "next/server";
import { congregationOptions, normalizeCongregationScope } from "../../../congregation-scope";
import { adminClient } from "../../admin/auth";
import { sendPushToRolesByCongregation } from "../../../push-service";

type JsonRecord = Record<string, unknown>;

const allowedStatuses = new Set(["Visitante", "Novo convertido", "Membro ativo"]);
const maxBodyBytes = 24_000;
const privacyPolicyVersion = "2026-09-19";
const attempts = new Map<string, { count: number; resetAt: number }>();
const maxDigits = {
  cpf: 11,
  phone: 13,
};

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

function hasValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(address: string) {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  attempts.set(address, current);
  return current.count > 5;
}

async function validTurnstileToken(token: string, address: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: address }),
  });
  const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return result?.success === true;
}

function hasDuplicate(payload: JsonRecord, cpf: string, phone: string) {
  const allRecords = [
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
  const address = requestAddress(request);
  if (isRateLimited(address)) {
    return NextResponse.json({ error: "Muitos cadastros enviados deste aparelho. Aguarde e tente novamente." }, { status: 429 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBodyBytes) {
    return NextResponse.json({ error: "Cadastro muito grande. Revise os campos e tente novamente." }, { status: 413 });
  }

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

  if (body.privacyConsent !== true) {
    return NextResponse.json({ error: "Confirme a Política de Privacidade para enviar o cadastro." }, { status: 400 });
  }

  if (!(await validTurnstileToken(textValue(body.turnstileToken, 3000), address))) {
    return NextResponse.json({ error: "Não foi possível validar a proteção antispam. Atualize a página e tente novamente." }, { status: 400 });
  }

  const fullName = textValue(body.fullName);
  const congregation = normalizeCongregationScope(body.congregation);
  const isOfficialCongregation = congregationOptions.some((option) => option === congregation);
  const phone = textValue(body.phone, 40);
  const email = textValue(body.email, 140).toLowerCase();
  const cleanPhone = comparablePhone(phone);
  const cleanCpf = comparableCpf(body.cpf);

  if (fullName.length < 6 || cleanPhone.length < 8 || cleanPhone.length > maxDigits.phone || !isOfficialCongregation) {
    return NextResponse.json({ error: "Informe nome completo, congregacao e telefone para enviar o cadastro." }, { status: 400 });
  }

  if (cleanCpf && cleanCpf.length !== maxDigits.cpf) {
    return NextResponse.json({ error: "CPF invalido. Informe 11 numeros ou deixe em branco." }, { status: 400 });
  }

  if (!hasValidEmail(email)) {
    return NextResponse.json({ error: "E-mail invalido. Corrija o e-mail ou deixe em branco." }, { status: 400 });
  }

  const { data: memberMatches, error: memberMatchError } = await client
    .from("members")
    .select("id")
    .or(`cpf_digits.eq.${cleanCpf || "__empty__"},phone_digits.eq.${cleanPhone}`)
    .limit(1);

  if (memberMatchError) {
    return NextResponse.json({ error: "Não foi possível conferir membros cadastrados." }, { status: 400 });
  }

  if (memberMatches?.length) {
    return NextResponse.json(
      { error: "Cadastro ja recebido. Procure a secretaria para atualizar seus dados." },
      { status: 409 },
    );
  }

  const { data: stored, error: readError } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Não foi possível conferir a base antes de cadastrar." }, { status: 400 });
  }

  const payload = isRecord(stored?.payload) ? stored.payload : {};
  if (hasDuplicate(payload, cleanCpf, cleanPhone)) {
    return NextResponse.json(
      { error: "Cadastro ja recebido. Procure a secretaria para atualizar seus dados." },
      { status: 409 },
    );
  }

  const { data: pendingMatches, error: matchError } = await client
    .from("registration_requests")
    .select("id")
    .or(`cpf_digits.eq.${cleanCpf || "__empty__"},phone_digits.eq.${cleanPhone}`)
    .in("status", ["Aguardando aprovacao", "Em analise"])
    .limit(1);

  if (matchError) {
    return NextResponse.json({ error: "Não foi possível conferir pré-cadastros pendentes." }, { status: 400 });
  }

  if (pendingMatches?.length) {
    return NextResponse.json(
      { error: "Cadastro ja recebido. Procure a secretaria para atualizar seus dados." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const requestedStatus = allowedStatuses.has(textValue(body.requestedStatus)) ? textValue(body.requestedStatus) : "Visitante";
  const registrationRequest = {
    id: `registration-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    congregation,
    full_name: fullName,
    father_name: textValue(body.fatherName),
    mother_name: textValue(body.motherName),
    cpf: textValue(body.cpf, 20),
    cpf_digits: cleanCpf,
    phone,
    phone_digits: cleanPhone,
    email,
    birth_date: textValue(body.birthDate, 20),
    gender: textValue(body.gender, 40),
    address: textValue(body.address, 220),
    zip_code: textValue(body.zipCode, 20),
    city: textValue(body.city, 80),
    neighborhood: textValue(body.neighborhood, 80),
    marital_status: textValue(body.maritalStatus, 60) || "Solteiro(a)",
    education: textValue(body.education, 80),
    spouse_name: textValue(body.spouseName, 140),
    requested_status: requestedStatus,
    registration_source: "Cadastro via link WhatsApp",
    notes: textValue(body.notes, 600),
    status: "Aguardando aprovacao",
    privacy_consent: true,
    privacy_consent_at: now,
    privacy_policy_version: privacyPolicyVersion,
    created_at: now,
  };

  let { error: saveError } = await client.from("registration_requests").insert(registrationRequest);

  if (saveError && /congregation|schema cache|column/i.test(saveError.message)) {
    const legacyRequest = { ...registrationRequest } as Omit<typeof registrationRequest, "congregation"> & { congregation?: string };
    delete legacyRequest.congregation;
    const legacyResult = await client.from("registration_requests").insert(legacyRequest);
    saveError = legacyResult.error;
  }

  if (saveError) {
    if (saveError.code === "23505") {
      return NextResponse.json(
        { error: "Cadastro ja recebido. Procure a secretaria para atualizar seus dados." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Não foi possível salvar o pré-cadastro." }, { status: 400 });
  }

  await sendPushToRolesByCongregation(client, ["ADMIN", "SECRETARY"], congregation, {
    title: "Novo pré-cadastro",
    body: `${fullName} esta aguardando analise em ${congregation}.`,
    module: "overview",
  });

  return NextResponse.json({ ok: true });
}
