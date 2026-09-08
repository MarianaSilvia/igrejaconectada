import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 400) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function digitsOnly(value: unknown) {
  return textValue(value).replace(/\D/g, "");
}

function booleanValue(value: unknown) {
  return value === true;
}

function uuidOrNull(value: unknown) {
  const text = textValue(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function memberRow(member: JsonRecord) {
  const id = textValue(member.id, 120);
  const fullName = textValue(member.fullName, 240);

  if (!id || !fullName) return null;

  return {
    id,
    registration_number: textValue(member.memberCode, 80),
    full_name: fullName,
    photo_url: null,
    status: textValue(member.status, 80),
    congregation: textValue(member.congregation, 160),
    water_baptism_date: textValue(member.baptismDate, 40),
    ministerial_role: textValue(member.role, 240),
    birth_date: textValue(member.birthDate, 40),
    phone: textValue(member.phone, 60),
    email: textValue(member.email, 180).toLowerCase(),
    address: textValue(member.address, 260),
    assigned_ministries: textValue(member.ministry) ? textValue(member.ministry).split(",").map((item) => item.trim()).filter(Boolean) : [],
    notes: textValue(member.notes, 1200),
    created_at: textValue(member.createdAt, 60) || new Date().toISOString(),
    cpf: textValue(member.cpf, 40),
    marital_status: textValue(member.maritalStatus, 80),
    spouse_name: textValue(member.spouseName, 180),
    auth_user_id: uuidOrNull(member.authUserId),
    father_name: textValue(member.fatherName, 180),
    mother_name: textValue(member.motherName, 180),
    age_group: textValue(member.ageGroup, 80),
    age: textValue(member.age, 20),
    gender: textValue(member.gender, 60),
    member_type: textValue(member.memberType, 80),
    categories: textValue(member.categories, 180),
    ministry: textValue(member.ministry, 180),
    school_class_id: textValue(member.schoolClassId, 120),
    discipleship_class_id: textValue(member.discipleshipClassId, 120),
    zip_code: textValue(member.zipCode, 30),
    city: textValue(member.city, 120),
    neighborhood: textValue(member.neighborhood, 120),
    education: textValue(member.education, 120),
    previous_church: textValue(member.previousChurch, 180),
    conversion_date: textValue(member.conversionDate, 40),
    baptism_date: textValue(member.baptismDate, 40),
    registration_source: textValue(member.registrationSource, 160),
    pastoral_status: textValue(member.pastoralStatus, 120),
    member_visible_notes: textValue(member.memberVisibleNotes, 1200),
    water_baptized: booleanValue(member.waterBaptized),
    holy_spirit_baptized: booleanValue(member.holySpiritBaptized),
    joined_at: textValue(member.joinedAt, 40),
    updated_at: new Date().toISOString(),
    cpf_digits: digitsOnly(member.cpf),
    phone_digits: digitsOnly(member.phone),
    app_payload: { ...member, photoDataUrl: "" },
    mirror_source: "church_app_state",
  };
}

export async function syncMembersTable(client: SupabaseClient, payload: JsonRecord) {
  const rows = recordsFrom(payload.members).map(memberRow).filter((row): row is NonNullable<ReturnType<typeof memberRow>> => Boolean(row));
  const memberIds = rows.map((row) => row.id);

  if (rows.length) {
    const { error } = await client.from("members").upsert(rows, { onConflict: "id" }).select("id");
    if (error) return { error: error.message ?? "Nao foi possivel sincronizar membros." };
  }

  if (memberIds.length) {
    const { error } = await client.from("members").delete().eq("mirror_source", "church_app_state").not("id", "in", `(${memberIds.join(",")})`);
    if (error) return { error: error.message ?? "Nao foi possivel limpar membros removidos do espelho." };
  }

  return { ok: true, count: rows.length };
}
