import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminClient, administrativeRoles, churchRoleFromLabel, requireSession, type ChurchRole } from "../auth";
import { syncMembersTable } from "../../../member-table-sync";
import { payloadKeysByRole, visiblePayloadKeysByRole, visiblePublishedOnlyKeys } from "../../../state-access-policy";

const stateId = "main";

type JsonRecord = Record<string, unknown>;

type AppStatePayload = {
  payload?: unknown;
  baseUpdatedAt?: string | null;
};

const appStateCollectionKeys = [
  "careRequests",
  "events",
  "notices",
  "mural",
  "users",
  "members",
  "registrationRequests",
  "visitors",
  "kids",
  "schoolClasses",
  "discipleshipClasses",
  "ministries",
  "schedules",
  "attendanceSessions",
  "messageTemplates",
  "messageCampaigns",
  "transactions",
  "assets",
  "devotionals",
  "audit",
  "notificationReadIds",
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function emptyPayloadCollections() {
  return appStateCollectionKeys.reduce<JsonRecord>((payload, key) => ({ ...payload, [key]: [] }), {});
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

function findAccessUser(payload: JsonRecord, user: User) {
  return recordsFrom(payload.users).find((item) => textValue(item.email).toLowerCase() === userEmail(user));
}

function roleFromPayload(payload: unknown, user: User): ChurchRole {
  if (!isRecord(payload)) return "MEMBER";

  const accessUser = findAccessUser(payload, user);
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

function sanitizeMemberDirectoryForRole(members: JsonRecord[], role: ChurchRole) {
  if (role !== "PROFESSOR") return members;

  return members.map((member) => ({
    id: textValue(member.id),
    memberCode: textValue(member.memberCode),
    fullName: textValue(member.fullName),
    phone: textValue(member.phone),
    status: textValue(member.status),
    memberType: textValue(member.memberType),
    schoolClassId: textValue(member.schoolClassId),
    discipleshipClassId: textValue(member.discipleshipClassId),
    photoDataUrl: "",
  }));
}

function classBelongsToProfessor(schoolClass: JsonRecord, payload: JsonRecord, user: User) {
  const accessUser = findAccessUser(payload, user);
  const teacherName = normalizeText(schoolClass.teacher);
  const profileName = normalizeText(accessUser?.name);
  const emailName = normalizeText(userEmail(user).split("@")[0]);
  const nameMatches = Boolean(
    teacherName &&
      profileName &&
      (teacherName === profileName || (profileName.length > 3 && teacherName.includes(profileName)) || (teacherName.length > 3 && profileName.includes(teacherName))),
  );

  return Boolean(nameMatches || (teacherName && emailName && teacherName === emailName));
}

function professorClassIds(payload: JsonRecord, user: User) {
  return new Set(
    [...recordsFrom(payload.schoolClasses), ...recordsFrom(payload.discipleshipClasses)]
      .filter((schoolClass) => classBelongsToProfessor(schoolClass, payload, user))
      .map((schoolClass) => textValue(schoolClass.id))
      .filter(Boolean),
  );
}

function filterProfessorOwnedClasses(classes: JsonRecord[], payload: JsonRecord, user: User) {
  return classes.filter((schoolClass) => classBelongsToProfessor(schoolClass, payload, user));
}

function filterSessionsByClassIds(sessions: JsonRecord[], classIds: Set<string>) {
  return sessions.filter((session) => classIds.has(textValue(session.classId)));
}

function mergeRecordsByAllowedIds(existingRecords: JsonRecord[], incomingRecords: JsonRecord[], allowedIds: Set<string>, ownershipKey = "id") {
  if (!allowedIds.size) return existingRecords;

  const incomingAllowed = incomingRecords.filter((record) => allowedIds.has(textValue(record[ownershipKey])));
  const incomingById = new Map(incomingAllowed.map((record) => [textValue(record.id), record]));
  const existingIds = new Set(existingRecords.map((record) => textValue(record.id)));

  return [
    ...existingRecords.map((record) =>
      allowedIds.has(textValue(record[ownershipKey])) && incomingById.has(textValue(record.id)) ? incomingById.get(textValue(record.id)) ?? record : record,
    ),
    ...incomingAllowed.filter((record) => !existingIds.has(textValue(record.id))),
  ];
}

function mergeMembersWithoutAccessFields(existingMembers: JsonRecord[], incomingMembers: JsonRecord[]) {
  const existingById = new Map(existingMembers.map((member) => [textValue(member.id), member]));
  const incomingIds = new Set(incomingMembers.map((member) => textValue(member.id)).filter(Boolean));

  return [
    ...incomingMembers.map((incomingMember) => {
      const existingMember = existingById.get(textValue(incomingMember.id));

      return {
        ...incomingMember,
        authUserId: textValue(existingMember?.authUserId),
        role: textValue(existingMember?.role),
        photoDataUrl: "",
      };
    }),
    ...existingMembers
      .filter((existingMember) => !incomingIds.has(textValue(existingMember.id)))
      .map((existingMember) => ({ ...existingMember, photoDataUrl: "" })),
  ];
}

function payloadWithVisibleKeys(payload: JsonRecord, role: ChurchRole, user: User) {
  const visibleKeys = visiblePayloadKeysByRole[role as Exclude<ChurchRole, "ADMIN" | "MEMBER">] ?? [];
  const professorOwnedClassIds = role === "PROFESSOR" ? professorClassIds(payload, user) : new Set<string>();

  return visibleKeys.reduce<JsonRecord>((nextPayload, key) => {
    if (!(key in payload)) return nextPayload;

    if (key === "members") {
      return { ...nextPayload, members: sanitizeMemberDirectoryForRole(recordsFrom(payload.members), role) };
    }

    if (role === "PROFESSOR" && (key === "schoolClasses" || key === "discipleshipClasses")) {
      return { ...nextPayload, [key]: filterProfessorOwnedClasses(recordsFrom(payload[key]), payload, user) };
    }

    if (role === "PROFESSOR" && key === "attendanceSessions") {
      return { ...nextPayload, attendanceSessions: filterSessionsByClassIds(recordsFrom(payload.attendanceSessions), professorOwnedClassIds) };
    }

    if (role === "PROFESSOR" && key === "notices") {
      return { ...nextPayload, notices: recordsFrom(payload.notices).filter((notice) => textValue(notice.status) === "Publicado") };
    }

    if (role === "PROFESSOR" && key === "mural") {
      return { ...nextPayload, mural: recordsFrom(payload.mural).filter((item) => item.published === true) };
    }

    if (visiblePublishedOnlyKeys(role).includes(key)) {
      return { ...nextPayload, [key]: recordsFrom(payload[key]).filter((item) => textValue(item.status) === "Publicado") };
    }

    return { ...nextPayload, [key]: payload[key] };
  }, emptyPayloadCollections());
}

function sanitizedAdministrativePayloadForRole(payload: JsonRecord, role: ChurchRole, user: User) {
  const strippedPayload = normalizeStatePayloadForStorage(payload);
  if (role === "ADMIN") return strippedPayload;

  return payloadWithVisibleKeys(strippedPayload, role, user);
}

function mergeProfessorPayload(existingPayload: JsonRecord, incomingPayload: JsonRecord, user: User) {
  const existing = normalizeStatePayloadForStorage(existingPayload);
  const incoming = normalizeStatePayloadForStorage(incomingPayload);
  const classIds = professorClassIds(existing, user);

  return {
    ...existing,
    schoolClasses: mergeRecordsByAllowedIds(recordsFrom(existing.schoolClasses), recordsFrom(incoming.schoolClasses), classIds),
    discipleshipClasses: mergeRecordsByAllowedIds(recordsFrom(existing.discipleshipClasses), recordsFrom(incoming.discipleshipClasses), classIds),
    attendanceSessions: mergeRecordsByAllowedIds(recordsFrom(existing.attendanceSessions), recordsFrom(incoming.attendanceSessions), classIds, "classId"),
    schedules: Array.isArray(incoming.schedules) ? incoming.schedules : existing.schedules,
    notificationReadIds: Array.isArray(incoming.notificationReadIds) ? incoming.notificationReadIds : existing.notificationReadIds,
  };
}

function mergeAdministrativePayloadByRole(existingPayload: JsonRecord, incomingPayload: JsonRecord, role: ChurchRole, user: User) {
  const incoming = normalizeStatePayloadForStorage(incomingPayload);
  if (role === "ADMIN") return incoming;
  if (role === "PROFESSOR") return mergeProfessorPayload(existingPayload, incomingPayload, user);

  const allowedKeys = payloadKeysByRole[role as Exclude<ChurchRole, "MEMBER">] ?? [];

  return allowedKeys.reduce<JsonRecord>(
    (nextPayload, key) => {
      if (!(key in incoming)) return nextPayload;

      if (role === "SECRETARY" && key === "members") {
        return {
          ...nextPayload,
          members: mergeMembersWithoutAccessFields(recordsFrom(existingPayload.members), recordsFrom(incoming.members)),
        };
      }

      return { ...nextPayload, [key]: incoming[key] };
    },
    normalizeStatePayloadForStorage(existingPayload),
  );
}

function sanitizeMemberPayloadForResponse(payload: unknown, user: User) {
  if (!isRecord(payload)) return payload;

  const currentMember = findCurrentMember(payload, user);

  return {
    ...emptyPayloadCollections(),
    members: currentMember ? [currentMember] : [],
    events: recordsFrom(payload.events),
    notices: recordsFrom(payload.notices).filter((notice) => textValue(notice.status) === "Publicado"),
    mural: recordsFrom(payload.mural).filter((item) => item.published === true),
    schoolClasses: recordsFrom(payload.schoolClasses),
    discipleshipClasses: recordsFrom(payload.discipleshipClasses),
    ministries: recordsFrom(payload.ministries),
    kids: recordsFrom(payload.kids).filter((kid) => kidBelongsToMember(kid, currentMember, user)),
    careRequests: recordsFrom(payload.careRequests).filter((request) => careBelongsToMember(request, currentMember, user)),
    attendanceSessions: filterAttendanceForMember(recordsFrom(payload.attendanceSessions), currentMember),
    devotionals: recordsFrom(payload.devotionals).filter((devotional) => textValue(devotional.status) === "Publicado"),
    notificationReadIds: Array.isArray(payload.notificationReadIds) ? payload.notificationReadIds : [],
  };
}

function sanitizePayloadForResponse(payload: unknown, effectiveRole: ChurchRole, user: User) {
  if (!isRecord(payload)) return payload;
  return administrativeRoles.has(effectiveRole) ? sanitizedAdministrativePayloadForRole(payload, effectiveRole, user) : sanitizeMemberPayloadForResponse(payload, user);
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
    "birthDate",
    "maritalStatus",
    "address",
    "congregation",
    "previousChurch",
    "conversionDate",
    "baptismDate",
    "waterBaptized",
    "holySpiritBaptized",
  ];

  return allowedFields.reduce<JsonRecord>(
    (member, field) => (field in incomingMember ? { ...member, [field]: incomingMember[field] } : member),
    { ...existingMember, photoDataUrl: "" },
  );
}

function stripMemberPhotos(payload: JsonRecord): JsonRecord {
  return {
    ...payload,
    members: recordsFrom(payload.members).map((member) => ({ ...member, photoDataUrl: "" })),
    registrationRequests: [],
  };
}

function normalizeStatePayloadForStorage(payload: JsonRecord): JsonRecord {
  return {
    ...stripMemberPhotos(payload),
    registrationRequests: [],
  };
}

function toRegistrationRequest(row: JsonRecord) {
  return {
    id: textValue(row.id),
    fullName: textValue(row.full_name),
    fatherName: textValue(row.father_name),
    motherName: textValue(row.mother_name),
    cpf: textValue(row.cpf),
    phone: textValue(row.phone),
    email: textValue(row.email),
    birthDate: textValue(row.birth_date),
    gender: textValue(row.gender),
    address: textValue(row.address),
    zipCode: textValue(row.zip_code),
    city: textValue(row.city),
    neighborhood: textValue(row.neighborhood),
    maritalStatus: textValue(row.marital_status) || "Solteiro(a)",
    education: textValue(row.education),
    spouseName: textValue(row.spouse_name),
    requestedStatus: textValue(row.requested_status) || "Visitante",
    registrationSource: textValue(row.registration_source) || "Cadastro via link WhatsApp",
    notes: textValue(row.notes),
    status: textValue(row.status) || "Aguardando aprovacao",
    createdAt: textValue(row.created_at),
    reviewedAt: textValue(row.reviewed_at),
    reviewNote: textValue(row.review_note),
  };
}

async function readRegistrationRequests(client: NonNullable<ReturnType<typeof adminClient>>, role: ChurchRole) {
  if (role !== "ADMIN" && role !== "SECRETARY") return [];

  const { data, error } = await client
    .from("registration_requests")
    .select(
      "id, full_name, father_name, mother_name, cpf, phone, email, birth_date, gender, address, zip_code, city, neighborhood, marital_status, education, spouse_name, requested_status, registration_source, notes, status, created_at, reviewed_at, review_note",
    )
    .in("status", ["Aguardando aprovacao", "Em analise"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];

  return recordsFrom(data).map(toRegistrationRequest);
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
        textValue(member.id) === currentMemberId && incomingMember ? mergeMemberRecord(member, incomingMember) : { ...member, photoDataUrl: "" },
      ),
      careRequests: Array.from(careById.values()),
    },
  };
}

function sanitizePayloadForSave(existingPayload: JsonRecord, incomingPayload: JsonRecord, effectiveRole: ChurchRole, user: User) {
  return administrativeRoles.has(effectiveRole)
    ? { payload: mergeAdministrativePayloadByRole(existingPayload, incomingPayload, effectiveRole, user) }
    : mergeMemberPayload(existingPayload, incomingPayload, user);
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
  const payload = sanitizePayloadForResponse(stored.payload, effectiveRole, session.user);
  const registrationRequests = await readRegistrationRequests(stored.client, effectiveRole);

  return NextResponse.json({
    payload: isRecord(payload) ? { ...payload, registrationRequests } : payload,
    updatedAt: stored.updatedAt,
  });
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const { payload, baseUpdatedAt } = (await request.json()) as AppStatePayload;

  if (!payload || !isRecord(payload)) {
    return NextResponse.json({ error: "Estado invalido para salvar na base." }, { status: 400 });
  }

  const stored = await readStoredPayload();
  if (stored.response || !stored.client) return stored.response;

  if (baseUpdatedAt && stored.updatedAt && baseUpdatedAt !== stored.updatedAt) {
    return NextResponse.json(
      {
        error:
          "Existe uma versao mais recente salva na base. Suas alteracoes locais nao foram gravadas para evitar perda de dados. Use Recarregar dados da base antes de salvar novamente.",
        updatedAt: stored.updatedAt,
      },
      { status: 409 },
    );
  }

  const effectiveRole = administrativeRoles.has(session.role) ? session.role : roleFromPayload(stored.payload, session.user);
  const mergedPayload = sanitizePayloadForSave(isRecord(stored.payload) ? stored.payload : {}, payload, effectiveRole, session.user);

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

  const memberSync = await syncMembersTable(stored.client, mergedPayload.payload);

  return NextResponse.json({
    ok: true,
    updatedAt: data.updated_at,
    memberSyncWarning: "error" in memberSync ? memberSync.error : undefined,
  });
}
