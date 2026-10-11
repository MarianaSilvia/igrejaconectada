import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncMembersTable } from "../../../../member-table-sync";
import { adminClient, churchRoleFromLabel, requireSession } from "../../auth";

const stateId = "main";
const pageSize = 1000;

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

function userEmail(user: User) {
  return user.email?.trim().toLowerCase() ?? "";
}

function roleFromPayload(payload: unknown, user: User) {
  if (!isRecord(payload)) return "MEMBER";
  const accessUser = recordsFrom(payload.users).find((item) => textValue(item.email).toLowerCase() === userEmail(user));
  return accessUser ? churchRoleFromLabel(accessUser.role) : "MEMBER";
}

function memberRecordFromTableRow(row: JsonRecord): JsonRecord | null {
  const appPayload = isRecord(row.app_payload) ? row.app_payload : {};
  const id = textValue(appPayload.id) || textValue(row.id);
  const fullName = textValue(appPayload.fullName) || textValue(row.full_name);

  if (!id || !fullName) return null;

  return {
    ...appPayload,
    id,
    fullName,
    memberCode: textValue(appPayload.memberCode) || textValue(row.registration_number),
    status: textValue(appPayload.status) || textValue(row.status),
    congregation: textValue(appPayload.congregation) || textValue(row.congregation),
    ministerialFunction: textValue(appPayload.ministerialFunction) || textValue(row.ministerial_role),
    birthDate: textValue(appPayload.birthDate) || textValue(row.birth_date),
    phone: textValue(appPayload.phone) || textValue(row.phone),
    email: textValue(appPayload.email) || textValue(row.email),
    address: textValue(appPayload.address) || textValue(row.address),
    photoUrl: textValue(appPayload.photoUrl) || textValue(row.photo_url),
    photoDataUrl: "",
  };
}

async function readStoredPayload(client: SupabaseClient) {
  const { data, error } = await client.from("church_app_state").select("payload").eq("id", stateId).maybeSingle();

  if (error) return { error: error.message };
  return { payload: isRecord(data?.payload) ? data.payload : {} };
}

async function readMembersFromTable(client: SupabaseClient) {
  const members: JsonRecord[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("members")
      .select("id,registration_number,full_name,photo_url,status,congregation,ministerial_role,birth_date,phone,email,address,app_payload")
      .order("full_name", { ascending: true })
      .range(from, to);

    if (error) return { error: error.message };

    const pageMembers = recordsFrom(data)
      .map(memberRecordFromTableRow)
      .filter((member): member is JsonRecord => Boolean(member));

    members.push(...pageMembers);
    if (!data || data.length < pageSize) break;
  }

  return { members };
}

async function assertAdmin(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });
  }

  const stored = await readStoredPayload(client);
  if ("error" in stored) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  const effectiveRole = session.role === "ADMIN" ? "ADMIN" : roleFromPayload(stored.payload, session.user);
  if (effectiveRole !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administrador pode restaurar o JSON de membros." }, { status: 403 });
  }

  return { client, payload: stored.payload, user: session.user };
}

export async function POST(request: Request) {
  const authorized = await assertAdmin(request);
  if (authorized instanceof NextResponse) return authorized;

  const tableResult = await readMembersFromTable(authorized.client);
  if ("error" in tableResult) {
    return NextResponse.json({ error: tableResult.error }, { status: 400 });
  }

  const previousMembers = recordsFrom(authorized.payload.members);
  const restoredMembers = tableResult.members;

  if (restoredMembers.length <= previousMembers.length) {
    return NextResponse.json({
      ok: true,
      changed: false,
      previousTotal: previousMembers.length,
      restoredTotal: restoredMembers.length,
      message: "O JSON principal já tem a mesma quantidade ou mais membros que a tabela members.",
    });
  }

  const restoredPayload = {
    ...authorized.payload,
    members: restoredMembers,
    audit: [
      {
        id: `audit-${Date.now()}-restore-members-json`,
        action: `JSON principal de membros restaurado a partir da tabela members por ${userEmail(authorized.user) || "administrador"}`,
        when: new Date().toISOString(),
      },
      ...recordsFrom(authorized.payload.audit),
    ].slice(0, 80),
  };

  const { data, error } = await authorized.client
    .from("church_app_state")
    .upsert({
      id: stateId,
      payload: restoredPayload,
      updated_by: authorized.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const syncResult = await syncMembersTable(authorized.client, restoredPayload);

  return NextResponse.json({
    ok: true,
    changed: true,
    previousTotal: previousMembers.length,
    restoredTotal: restoredMembers.length,
    updatedAt: data.updated_at,
    memberSyncWarning: "error" in syncResult ? syncResult.error : undefined,
    message: `JSON principal restaurado com ${restoredMembers.length} membro(s) a partir da tabela members.`,
  });
}
