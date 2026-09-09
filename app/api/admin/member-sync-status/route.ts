import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncMembersTable } from "../../../member-table-sync";
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

async function readStoredPayload(client: NonNullable<ReturnType<typeof adminClient>>) {
  const { data: stored, error } = await client.from("church_app_state").select("payload").eq("id", stateId).maybeSingle();

  if (error) return { error: error.message };
  return { payload: isRecord(stored?.payload) ? stored.payload : {} };
}

function unavailableStatus(jsonMembers: JsonRecord[], message: string) {
  return {
    status: "Indisponivel",
    jsonTotal: jsonMembers.length,
    tableTotal: 0,
    missingCodeCount: jsonMembers.filter((member) => !textValue(member.memberCode)).length,
    duplicateCpfCount: duplicateGroupCount(jsonMembers.map((member) => digitsOnly(member.cpf))),
    duplicatePhoneCount: duplicateGroupCount(jsonMembers.map((member) => digitsOnly(member.phone))),
    missingInTableCount: 0,
    extraInTableCount: 0,
    checkedAt: new Date().toISOString(),
    message,
  };
}

async function assertAdmin(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  }

  const stored = await readStoredPayload(client);

  if ("error" in stored) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  const payload = stored.payload;
  const effectiveRole = session.role === "ADMIN" ? "ADMIN" : roleFromPayload(payload, session.user);

  if (effectiveRole !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administrador pode conferir a sincronizacao de membros." }, { status: 403 });
  }

  return { client, payload };
}

async function memberSyncStatus(client: NonNullable<ReturnType<typeof adminClient>>, payload: JsonRecord, messageOverride?: string) {
  const jsonMembers = recordsFrom(payload.members);
  const tableResult = await readAllMemberRows(client);

  if ("error" in tableResult) {
    return unavailableStatus(jsonMembers, tableResult.error ?? "Tabela members indisponivel.");
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

  return {
    status: hasAttention ? "Atencao" : "Sincronizado",
    jsonTotal: jsonMembers.length,
    tableTotal: tableRows.length,
    missingCodeCount,
    duplicateCpfCount,
    duplicatePhoneCount,
    missingInTableCount,
    extraInTableCount,
    checkedAt: new Date().toISOString(),
    message: messageOverride ?? (hasAttention
      ? "Confira diferencas antes de trocar a fonte principal dos membros."
      : "JSON principal e tabela members estao alinhados."),
  };
}

export async function GET(request: Request) {
  const authorized = await assertAdmin(request);
  if (authorized instanceof NextResponse) return authorized;

  return NextResponse.json(await memberSyncStatus(authorized.client, authorized.payload));
}

export async function POST(request: Request) {
  const authorized = await assertAdmin(request);
  if (authorized instanceof NextResponse) return authorized;

  const jsonMembers = recordsFrom(authorized.payload.members);
  const syncResult = await syncMembersTable(authorized.client, authorized.payload);

  if ("error" in syncResult) {
    return NextResponse.json(unavailableStatus(jsonMembers, syncResult.error ?? "Nao foi possivel atualizar o espelho de membros."), { status: 400 });
  }

  return NextResponse.json(
    await memberSyncStatus(
      authorized.client,
      authorized.payload,
      `Espelho de membros atualizado com ${syncResult.count} cadastro(s) a partir do JSON principal.`,
    ),
  );
}
