import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminClient, administrativeRoles, churchRoleFromLabel, requireSession, type ChurchRole } from "../auth";

const stateId = "main";

type JsonRecord = Record<string, unknown>;

type AppStatePayload = {
  payload?: unknown;
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

function normalizeText(value: unknown) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function comparablePhone(value: unknown) {
  return textValue(value).replace(/\D/g, "");
}

function userEmail(user: User) {
  return user.email?.trim().toLowerCase() ?? "";
}

function memberBelongsToUser(member: JsonRecord, user: User) {
  const authUserId = textValue(member.authUserId);
  const memberEmail = textValue(member.email).toLowerCase();

  return Boolean((authUserId && authUserId === user.id) || (memberEmail && memberEmail === userEmail(user)));
}

function findCurrentMember(payload: JsonRecord, user: User) {
  return recordsFrom(payload.members).find((member) => memberBelongsToUser(member, user));
}

function roleFromPayload(payload: unknown, user: User): ChurchRole {
  if (!isRecord(payload)) return "MEMBER";

  const accessUser = recordsFrom(payload.users).find((item) => textValue(item.email).toLowerCase() === userEmail(user));
  return accessUser ? churchRoleFromLabel(accessUser.role) : "MEMBER";
}

function careBelongsToMember(request: JsonRecord, member: JsonRecord | undefined, user: User) {
  const memberPhone = comparablePhone(member?.phone);
  const requestPhone = comparablePhone(request.phone);
  const memberName = normalizeText(member?.fullName);
  const requestMember = normalizeText(request.member);
  const emailMatches = userEmail(user) && textValue(member?.email).toLowerCase() === userEmail(user);

  return Boolean(
    emailMatches ||
      (memberPhone && requestPhone && memberPhone === requestPhone) ||
      (memberName && requestMember && memberName === requestMember),
  );
}

function kidBelongsToMember(kid: JsonRecord, member: JsonRecord | undefined, user: User) {
  const memberPhone = comparablePhone(member?.phone);
  const guardianPhone = comparablePhone(kid.guardianPhone);
  const guardianEmail = textValue(kid.guardianEmail).toLowerCase();

  return Boolean((guardianEmail && guardianEmail === userEmail(user)) || (memberPhone && guardianPhone && memberPhone === guardianPhone));
}

function filterAttendanceForMember(sessions: JsonRecord[], member: JsonRecord | undefined) {
  const memberId = textValue(member?.id);
  const schoolClassId = textValue(member?.schoolClassId);
  const discipleshipClassId = textValue(member?.discipleshipClassId);

  if (!memberId) return [];

  return sessions
    .filter((session) => {
      const area = textValue(session.area);
      const classId = textValue(session.classId);
      return (area === "school" && classId === schoolClassId) || (area === "discipleship" && classId === discipleshipClassId);
    })
    .map((session) => ({
      ...session,
      records: recordsFrom(session.records).filter((record) => textValue(record.memberId) === memberId),
    }));
}

function filteredPayloadForMember(payload: unknown, user: User) {
  if (!isRecord(payload)) return payload;

  const currentMember = findCurrentMember(payload, user);

  return {
    ...payload,
    users: [],
    members: currentMember ? [currentMember] : [],
    kids: recordsFrom(payload.kids).filter((kid) => kidBelongsToMember(kid, currentMember, user)),
    careRequests: recordsFrom(payload.careRequests).filter((request) => careBelongsToMember(request, currentMember, user)),
    attendanceSessions: filterAttendanceForMember(recordsFrom(payload.attendanceSessions), currentMember),
    audit: [],
  };
}

function mergeMemberRecord(existingMember: JsonRecord, incomingMember: JsonRecord) {
  const allowedFields = [
    "fullName",
    "fatherName",
    "motherName",
    "cpf",
    "phone",
    "email",
    "schoolClassId",
    "discipleshipClassId",
    "photoDataUrl",
    "birthDate",
    "maritalStatus",
    "address",
    "congregation",
    "previousChurch",
    "waterBaptized",
    "holySpiritBaptized",
    "notes",
  ];

  return allowedFields.reduce<JsonRecord>(
    (member, field) => (field in incomingMember ? { ...member, [field]: incomingMember[field] } : member),
    { ...existingMember },
  );
}

function mergeCareRequest(existingRequest: JsonRecord | undefined, incomingRequest: JsonRecord) {
  if (!existingRequest) {
    return {
      ...incomingRequest,
      status: "Pendente",
      responsible: "",
      scheduleDate: "",
      scheduleTime: "",
      returnNote: "",
    };
  }

  return {
    ...existingRequest,
    member: incomingRequest.member ?? existingRequest.member,
    phone: incomingRequest.phone ?? existingRequest.phone,
    category: incomingRequest.category ?? existingRequest.category,
    summary: incomingRequest.summary ?? existingRequest.summary,
    updatedAt: incomingRequest.updatedAt ?? new Date().toISOString(),
  };
}

function mergeMemberPayload(existingPayload: JsonRecord, incomingPayload: JsonRecord, user: User) {
  const currentMember = findCurrentMember(existingPayload, user);
  if (!currentMember) {
    return { response: NextResponse.json({ error: "Cadastro do membro nao localizado para este login." }, { status: 403 }) };
  }

  const currentMemberId = textValue(currentMember.id);
  const incomingMember = recordsFrom(incomingPayload.members).find((member) => textValue(member.id) === currentMemberId);
  const existingCareRequests = recordsFrom(existingPayload.careRequests);
  const incomingCareRequests = recordsFrom(incomingPayload.careRequests).filter((request) =>
    careBelongsToMember(request, currentMember, user),
  );
  const careById = new Map(existingCareRequests.map((request) => [textValue(request.id), request]));

  incomingCareRequests.forEach((request) => {
    const requestId = textValue(request.id);
    if (!requestId) return;
    careById.set(requestId, mergeCareRequest(careById.get(requestId), request));
  });

  return {
    payload: {
      ...existingPayload,
      members: recordsFrom(existingPayload.members).map((member) =>
        textValue(member.id) === currentMemberId && incomingMember ? mergeMemberRecord(member, incomingMember) : member,
      ),
      careRequests: Array.from(careById.values()),
    },
  };
}

async function readStoredPayload() {
  const client = adminClient();
  if (!client) return { response: NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 }) };

  const { data, error } = await client.from("church_app_state").select("payload,updated_at").eq("id", stateId).maybeSingle();

  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 400 }) };
  }

  return { client, payload: data?.payload ?? null, updatedAt: data?.updated_at ?? null };
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const stored = await readStoredPayload();
  if (stored.response || !stored.client) return stored.response;

  const effectiveRole = administrativeRoles.has(session.role) ? session.role : roleFromPayload(stored.payload, session.user);
  const payload = administrativeRoles.has(effectiveRole) ? stored.payload : filteredPayloadForMember(stored.payload, session.user);

  return NextResponse.json({ payload, updatedAt: stored.updatedAt });
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const { payload } = (await request.json()) as AppStatePayload;

  if (!payload || !isRecord(payload)) {
    return NextResponse.json({ error: "Estado invalido para salvar na base." }, { status: 400 });
  }

  const stored = await readStoredPayload();
  if (stored.response || !stored.client) return stored.response;

  const effectiveRole = administrativeRoles.has(session.role) ? session.role : roleFromPayload(stored.payload, session.user);
  const mergedPayload = administrativeRoles.has(effectiveRole)
    ? { payload }
    : mergeMemberPayload(isRecord(stored.payload) ? stored.payload : {}, payload, session.user);

  if ("response" in mergedPayload) return mergedPayload.response;

  const { data, error } = await stored.client
    .from("church_app_state")
    .upsert({
      id: stateId,
      payload: mergedPayload.payload,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, updatedAt: data.updated_at });
}
