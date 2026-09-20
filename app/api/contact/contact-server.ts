import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  congregationOptions,
  globalCongregationScope,
  normalizeCongregationScope,
} from "../../congregation-scope";
import { churchRoleFromLabel, type ChurchRole } from "../../permissions";
import { adminClient, requireSession } from "../admin/auth";

export type JsonRecord = Record<string, unknown>;

export type ContactContext = {
  client: SupabaseClient;
  user: User;
  role: ChurchRole;
  payload: JsonRecord;
  accessUser?: JsonRecord;
  member?: JsonRecord;
  email: string;
  name: string;
  scope: string;
  isGlobalAdmin: boolean;
  authIdByEmail: Map<string, string>;
};

export type DestinationRow = {
  id?: string;
  congregation: string;
  kind: "secretary" | "leadership" | "group" | "school" | "discipleship";
  scope_record_id: string;
  label: string;
  assignee_user_id: string | null;
  assignee_name: string;
  eligible_role: ChurchRole;
  is_active: boolean;
  updated_at: string;
};

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function textValue(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function validUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(textValue(value, 120));
}

function normalized(value: unknown) {
  return textValue(value, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function userEmail(value: unknown) {
  return textValue(value, 220).toLowerCase();
}

function recordCongregation(value: unknown) {
  const scope = normalizeCongregationScope(value);
  return scope === globalCongregationScope ? congregationOptions[0] : scope;
}

export function setupRequired(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /contact_destinations|contact_threads|contact_messages|contact_thread_reads|contact_audit|schema cache|relation .* does not exist/i.test(message);
}

async function readAppPayload(client: SupabaseClient) {
  const { data, error } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  if (error) return {};
  return isRecord(data?.payload) ? data.payload : {};
}

function findAccessUser(payload: JsonRecord, email: string) {
  return recordsFrom(payload.users).find((user) => userEmail(user.email) === email);
}

function findMemberForUser(payload: JsonRecord, userId: string, email: string) {
  return recordsFrom(payload.members).find((member) => {
    const authUserId = textValue(member.authUserId, 120);
    return (authUserId && authUserId === userId) || userEmail(member.email) === email;
  });
}

function displayName(payload: JsonRecord, accessUser: JsonRecord | undefined, member: JsonRecord | undefined, fallback: string) {
  return textValue(member?.fullName, 180) || textValue(accessUser?.name, 180) || fallback;
}

export async function contactContext(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return { response: session.response };

  const client = adminClient();
  if (!client) return { response: NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 }) };

  const payload = await readAppPayload(client);
  const email = userEmail(session.user.email);
  const accessUser = findAccessUser(payload, email);
  const member = findMemberForUser(payload, session.user.id, email);
  const metadataScope = session.user.app_metadata?.church_gp_congregation_scope ?? session.user.app_metadata?.congregation_scope;
  const accessScope = normalizeCongregationScope(accessUser?.congregationScope ?? metadataScope);
  const memberScope = normalizeCongregationScope(member?.congregation);
  const scope = session.role === "ADMIN"
    ? accessScope
    : accessScope === globalCongregationScope
      ? memberScope
      : accessScope;

  if (session.role !== "ADMIN" && scope === globalCongregationScope) {
    return {
      response: NextResponse.json(
        { error: "Este acesso ainda não tem congregação vinculada para falar com a liderança." },
        { status: 403 },
      ),
    };
  }

  const { data: authData } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authIdByEmail = new Map(
    (authData?.users ?? [])
      .filter((user) => user.email)
      .map((user) => [user.email!.toLowerCase(), user.id]),
  );

  const context: ContactContext = {
    client,
    user: session.user,
    role: session.role,
    payload,
    accessUser,
    member,
    email,
    name: displayName(payload, accessUser, member, session.user.email ?? "Usuário"),
    scope,
    isGlobalAdmin: session.role === "ADMIN" && scope === globalCongregationScope,
    authIdByEmail,
  };

  return context;
}

function accessUserAuthId(context: ContactContext, user: JsonRecord) {
  const id = textValue(user.id, 120);
  if (validUuid(id)) return id;
  return context.authIdByEmail.get(userEmail(user.email)) ?? "";
}

function staffUsers(context: ContactContext, congregation: string, roles: ChurchRole[]) {
  return recordsFrom(context.payload.users)
    .filter((user) => textValue(user.status) === "Ativo")
    .filter((user) => roles.includes(churchRoleFromLabel(user.role)))
    .filter((user) => normalizeCongregationScope(user.congregationScope) === congregation)
    .map((user) => ({
      id: accessUserAuthId(context, user),
      name: textValue(user.name, 180) || userEmail(user.email),
      role: churchRoleFromLabel(user.role),
    }))
    .filter((user) => validUuid(user.id))
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }));
}

function personAuthId(context: ContactContext, name: unknown) {
  const target = normalized(name);
  if (!target) return { id: "", name: "" };

  const accessUser = recordsFrom(context.payload.users).find((user) => normalized(user.name) === target);
  if (accessUser) {
    const id = accessUserAuthId(context, accessUser);
    if (id) return { id, name: textValue(accessUser.name, 180) };
  }

  const member = recordsFrom(context.payload.members).find((item) => normalized(item.fullName) === target);
  if (member) {
    const id = validUuid(member.authUserId)
      ? textValue(member.authUserId, 120)
      : context.authIdByEmail.get(userEmail(member.email)) ?? "";
    if (id) return { id, name: textValue(member.fullName, 180) };
  }

  return { id: "", name: textValue(name, 180) };
}

function destinationKey(row: Pick<DestinationRow, "congregation" | "kind" | "scope_record_id">) {
  return `${row.congregation}|${row.kind}|${row.scope_record_id}`;
}

function genericDestination(
  context: ContactContext,
  congregation: string,
  kind: DestinationRow["kind"],
  label: string,
  role: ChurchRole,
): DestinationRow {
  const candidates = staffUsers(context, congregation, [role]);
  const soleCandidate = candidates.length === 1 ? candidates[0] : undefined;
  return {
    congregation,
    kind,
    scope_record_id: "",
    label,
    assignee_user_id: soleCandidate?.id ?? null,
    assignee_name: soleCandidate?.name ?? "",
    eligible_role: role,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

function destinationRows(context: ContactContext) {
  const congregations = context.scope === globalCongregationScope ? [...congregationOptions] : [context.scope];
  const rows: DestinationRow[] = [];
  const memberGroupNames = new Set(
    (Array.isArray(context.member?.ministries) ? context.member.ministries : [])
      .map((value) => normalized(value))
      .filter(Boolean),
  );
  const legacyGroup = normalized(context.member?.ministry);
  if (legacyGroup) memberGroupNames.add(legacyGroup);

  for (const congregation of congregations) {
    rows.push(genericDestination(context, congregation, "secretary", `Secretaria - ${congregation}`, "SECRETARY"));
    rows.push(genericDestination(context, congregation, "leadership", `Liderança - ${congregation}`, "LEADER"));

    for (const ministry of recordsFrom(context.payload.ministries)) {
      if (recordCongregation(ministry.congregation) !== congregation) continue;
      const ministryName = textValue(ministry.name, 180);
      if (!context.isGlobalAdmin && context.role === "MEMBER" && !memberGroupNames.has(normalized(ministryName))) continue;
      const leader = personAuthId(context, ministry.leader);
      rows.push({
        congregation,
        kind: "group",
        scope_record_id: textValue(ministry.id, 120),
        label: `Grupo ${ministryName}`,
        assignee_user_id: leader.id || null,
        assignee_name: leader.name,
        eligible_role: "LEADER",
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }

    const classAreas = [
      { kind: "school" as const, key: "schoolClasses", memberKey: "schoolClassId", prefix: "EBD" },
      { kind: "discipleship" as const, key: "discipleshipClasses", memberKey: "discipleshipClassId", prefix: "Discipulado" },
    ];

    for (const area of classAreas) {
      const memberClassId = textValue(context.member?.[area.memberKey], 120);
      for (const schoolClass of recordsFrom(context.payload[area.key])) {
        const classId = textValue(schoolClass.id, 120);
        if (!context.isGlobalAdmin && context.role === "MEMBER" && classId !== memberClassId) continue;
        const teacher = personAuthId(context, schoolClass.teacher);
        rows.push({
          congregation,
          kind: area.kind,
          scope_record_id: classId,
          label: `${area.prefix} - ${textValue(schoolClass.name, 180)}`,
          assignee_user_id: teacher.id || null,
          assignee_name: teacher.name,
          eligible_role: "PROFESSOR",
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(new Map(rows.map((row) => [destinationKey(row), row])).values());
}

export async function syncDestinations(context: ContactContext) {
  const rows = destinationRows(context);
  if (!rows.length) return { destinations: [] as DestinationRow[] };

  const { error } = await context.client
    .from("contact_destinations")
    .upsert(rows, { onConflict: "congregation,kind,scope_record_id" });
  if (error) return { error };

  const congregations = [...new Set(rows.map((row) => row.congregation))];
  const { data, error: readError } = await context.client
    .from("contact_destinations")
    .select("id,congregation,kind,scope_record_id,label,assignee_user_id,assignee_name,eligible_role,is_active,updated_at")
    .in("congregation", congregations)
    .eq("is_active", true)
    .order("label", { ascending: true });
  if (readError) return { error: readError };

  const allowedKeys = new Set(rows.map(destinationKey));
  return { destinations: ((data ?? []) as DestinationRow[]).filter((row) => allowedKeys.has(destinationKey(row))) };
}

export function sameCongregation(context: ContactContext, congregation: unknown) {
  return context.scope === globalCongregationScope || context.scope === recordCongregation(congregation);
}

export function canTriageThread(context: ContactContext, thread: JsonRecord) {
  if (!sameCongregation(context, thread.congregation) || textValue(thread.assigned_user_id, 120)) return false;
  if (context.isGlobalAdmin) return true;
  if (context.role === "SECRETARY" || context.role === "ADMIN") return true;

  const eligibleRole = textValue(thread.eligible_role, 40) as ChurchRole;
  return context.role === eligibleRole;
}

export function canViewThread(context: ContactContext, thread: JsonRecord) {
  if (context.isGlobalAdmin) return true;
  if (!sameCongregation(context, thread.congregation)) return false;
  if (textValue(thread.sender_user_id, 120) === context.user.id) return true;
  if (textValue(thread.assigned_user_id, 120) === context.user.id) return true;
  return canTriageThread(context, thread);
}

export function responderOptions(context: ContactContext, thread: JsonRecord) {
  const eligibleRole = textValue(thread.eligible_role, 40) as ChurchRole;
  const roles = eligibleRole ? [eligibleRole] : [];
  const candidates = staffUsers(context, recordCongregation(thread.congregation), roles);
  const currentId = textValue(thread.assigned_user_id, 120);
  const currentName = textValue(thread.assigned_name, 180);
  if (currentId && !candidates.some((candidate) => candidate.id === currentId)) {
    candidates.push({ id: currentId, name: currentName || "Responsável atual", role: eligibleRole });
  }
  return candidates;
}

export function globalAdminIds(context: ContactContext) {
  return recordsFrom(context.payload.users)
    .filter((user) => churchRoleFromLabel(user.role) === "ADMIN")
    .filter((user) => normalizeCongregationScope(user.congregationScope) === globalCongregationScope)
    .map((user) => accessUserAuthId(context, user))
    .filter(validUuid);
}

export async function auditContact(
  client: SupabaseClient,
  thread: JsonRecord | null,
  action: string,
  actor: Pick<ContactContext, "user" | "email"> | null,
  metadata: JsonRecord = {},
) {
  await client.from("contact_audit").insert({
    thread_id: thread ? textValue(thread.id, 120) || null : null,
    congregation: thread ? textValue(thread.congregation, 120) || null : textValue(metadata.congregation, 120) || null,
    action,
    actor_id: actor?.user.id ?? null,
    actor_email: actor?.email ?? null,
    metadata,
  });
}

export function setupResponse(message = "Fale com a liderança ainda precisa das tabelas do Supabase.") {
  return NextResponse.json({ setupRequired: true, error: message }, { status: 503 });
}
