import { NextResponse } from "next/server";
import { adminClient } from "../auth";

type JsonRecord = Record<string, unknown>;

const secret = process.env.CRON_SECRET;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAuthorized(request: Request) {
  if (!secret) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return headerSecret === secret || bearerSecret === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });
  }

  const { data, error } = await client.from("church_app_state").select("payload,updated_at").eq("id", "main").maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const payload = isRecord(data?.payload) ? data.payload : {};
  const classes = recordsFrom(payload.discipleshipClasses).map((classRecord) => ({
    id: textValue(classRecord.id),
    name: textValue(classRecord.name),
    teacher: textValue(classRecord.teacher),
    students: Number(classRecord.students ?? 0) || 0,
    nextLesson: textValue(classRecord.nextLesson),
  }));
  const classIds = new Set(classes.map((classRecord) => classRecord.id).filter(Boolean));
  const members = recordsFrom(payload.members)
    .filter((member) => classIds.has(textValue(member.discipleshipClassId)))
    .map((member) => ({
      id: textValue(member.id),
      memberCode: textValue(member.memberCode),
      fullName: textValue(member.fullName),
      phone: textValue(member.phone),
      email: textValue(member.email),
      congregation: textValue(member.congregation),
      status: textValue(member.status),
      memberType: textValue(member.memberType),
      ministerialFunction: textValue(member.ministerialFunction),
      discipleshipClassId: textValue(member.discipleshipClassId),
    }));

  return NextResponse.json({
    updatedAt: data?.updated_at ?? null,
    generatedAt: new Date().toISOString(),
    classes,
    members,
  });
}
