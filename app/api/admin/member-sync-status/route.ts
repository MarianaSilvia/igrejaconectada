import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminClient, churchRoleFromLabel, requireSession } from "../auth";

const stateId = "main";
const pageSize = 1000;

type JsonRecord = Record<string, unknown>;
type MemberTableRow = {
  id: string;
  registration_number: string | null;
  cpf_digits: string | null;
  phone_digits: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digitsOnly(value: unknown) {
  return textValue(value).replace(/\D/g, "");
}

function userEmail(user: User) {
  return user.email?.trim().toLowerCase() ?? "";
}

function roleFromPayload(payload: unknown, user: User) {
  if (!isRecord(payload)) return "MEMBER";
  const accessUser = recordsFrom(payload.users).find((item) => textValue(item.email).toLowerCase() === userEmail(user));
  return accessUser ? churchRoleFromLabel(accessUser.role) : "MEMBER";
}

function duplicateGroupCount(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

async function readAllMemberRows(client: NonNullable<ReturnType<typeof adminClient>>) {
  const rows: MemberTableRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("members")
      .select("id,registration_number,cpf_digits,phone_digits")
      .range(from, to);

    if (error) return { error: error.message };
    rows.push(...((data ?? []) as MemberTableRow[]));
    if (!data || data.length < pageSize) break;
  }

  return { rows };
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  }

  const { data: stored, error: stateError } = await client.from("church_app_state").select("payload").eq("id", stateId).maybeSingle();

  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 400 });
  }

  const payload = isRecord(stored?.payload) ? stored.payload : {};
  const effectiveRole = session.role === "ADMIN" ? "ADMIN" : roleFromPayload(payload, session.user);

  if (effectiveRole !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administrador pode conferir a sincronizacao de membros." }, { status: 403 });
  }

  const jsonMembers = recordsFrom(payload.members);
  const tableResult = await readAllMemberRows(client);

  if ("error" in tableResult) {
    return NextResponse.json({
      status: "Indisponivel",
      jsonTotal: jsonMembers.length,
      tableTotal: 0,
      missingCodeCount: jsonMembers.filter((member) => !textValue(member.memberCode)).length,
      duplicateCpfCount: duplicateGroupCount(jsonMembers.map((member) => digitsOnly(member.cpf))),
      duplicatePhoneCount: duplicateGroupCount(jsonMembers.map((member) => digitsOnly(member.phone))),
      missingInTableCount: 0,
      extraInTableCount: 0,
      checkedAt: new Date().toISOString(),
      message: tableResult.error,
    });
  }

  const tableRows = tableResult.rows;
  const jsonIds = new Set(jsonMembers.map((member) => textValue(member.id)).filter(Boolean));
  const tableIds = new Set(tableRows.map((member) => textValue(member.id)).filter(Boolean));
  const missingInTableCount = Array.from(jsonIds).filter((id) => !tableIds.has(id)).length;
  const extraInTableCount = Array.from(tableIds).filter((id) => !jsonIds.has(id)).length;
  const missingCodeCount = jsonMembers.filter((member) => !textValue(member.memberCode)).length;
  const duplicateCpfCount = duplicateGroupCount(jsonMembers.map((member) => digitsOnly(member.cpf)));
  const duplicatePhoneCount = duplicateGroupCount(jsonMembers.map((member) => digitsOnly(member.phone)));
  const hasAttention = Boolean(
    jsonMembers.length !== tableRows.length ||
      missingInTableCount ||
      extraInTableCount ||
      missingCodeCount ||
      duplicateCpfCount ||
      duplicatePhoneCount,
  );

  return NextResponse.json({
    status: hasAttention ? "Atencao" : "Sincronizado",
    jsonTotal: jsonMembers.length,
    tableTotal: tableRows.length,
    missingCodeCount,
    duplicateCpfCount,
    duplicatePhoneCount,
    missingInTableCount,
    extraInTableCount,
    checkedAt: new Date().toISOString(),
    message: hasAttention
      ? "Confira diferencas antes de trocar a fonte principal dos membros."
      : "JSON principal e tabela members estao alinhados.",
  });
}
