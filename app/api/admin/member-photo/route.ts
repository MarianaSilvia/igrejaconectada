import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { adminClient, requireSession, type ChurchRole } from "../auth";

const bucketName = "member-photos";
const maxBase64Length = 700_000;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type PhotoUploadPayload = {
  memberId?: string;
  existingFileKey?: string;
  dataUrl?: string;
};

type PhotoDeletePayload = {
  memberId?: string;
  fileKey?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function userEmail(user: User) {
  return (user.email ?? "").trim().toLowerCase();
}

function memberBelongsToUser(member: JsonRecord, user: User) {
  const email = userEmail(user);
  return Boolean(
    (textValue(member.authUserId) && textValue(member.authUserId) === user.id) ||
      (email && textValue(member.email).toLowerCase() === email),
  );
}

function canManageAnyMemberPhoto(role: ChurchRole) {
  return role === "ADMIN" || role === "SECRETARY";
}

async function canManagePhoto(memberId: string, role: ChurchRole, user: User) {
  if (canManageAnyMemberPhoto(role)) return true;
  if (!memberId) return true;

  const client = adminClient();
  if (!client) return false;

  const { data } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = data?.payload;
  if (!isRecord(payload)) return false;

  const member = recordsFrom(payload.members).find((item) => textValue(item.id) === memberId);
  return Boolean(member && memberBelongsToUser(member, user));
}

function parseDataUrl(dataUrl?: string) {
  const value = textValue(dataUrl, maxBase64Length + 100);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(value);

  if (!match) return { error: "Envie uma imagem JPG, PNG ou WebP valida." };

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");

  if (!allowedMimeTypes.has(mimeType)) return { error: "Formato de imagem nao permitido." };
  if (base64.length > maxBase64Length) return { error: "Foto muito grande. Envie uma foto menor." };

  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function safeFileKey(fileKey?: string) {
  const value = textValue(fileKey, 500);
  return value && !value.includes("..") ? value : "";
}

async function ensureBucket() {
  const client = adminClient();
  if (!client) return { error: "Supabase administrativo nao configurado." };

  const { data: bucket } = await client.storage.getBucket(bucketName);
  if (bucket) return { client };

  const { error } = await client.storage.createBucket(bucketName, {
    public: true,
    allowedMimeTypes: Array.from(allowedMimeTypes),
    fileSizeLimit: "1MB",
  });

  if (error && !/already exists|already_exist|duplicate/i.test(error.message)) {
    return { error: "Nao foi possivel preparar o armazenamento de fotos." };
  }

  return { client };
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const payload = (await request.json().catch(() => null)) as PhotoUploadPayload | null;
  const memberId = textValue(payload?.memberId, 140);

  if (!(await canManagePhoto(memberId, session.role, session.user))) {
    return NextResponse.json({ error: "Voce nao tem permissao para alterar esta foto." }, { status: 403 });
  }

  const parsed = parseDataUrl(payload?.dataUrl);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const bucket = await ensureBucket();
  if ("error" in bucket) return NextResponse.json({ error: bucket.error }, { status: 503 });

  const targetId = memberId || `draft-${session.user.id}`;
  const fileKey = `${targetId}/${Date.now()}.${extensionFromMime(parsed.mimeType)}`;
  const previousFileKey = safeFileKey(payload?.existingFileKey);

  const { error } = await bucket.client.storage.from(bucketName).upload(fileKey, parsed.buffer, {
    cacheControl: "3600",
    contentType: parsed.mimeType,
    upsert: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (previousFileKey && previousFileKey !== fileKey) {
    await bucket.client.storage.from(bucketName).remove([previousFileKey]);
  }

  const { data } = bucket.client.storage.from(bucketName).getPublicUrl(fileKey);

  return NextResponse.json({ photoUrl: data.publicUrl, photoFileKey: fileKey });
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const payload = (await request.json().catch(() => null)) as PhotoDeletePayload | null;
  const memberId = textValue(payload?.memberId, 140);
  const fileKey = safeFileKey(payload?.fileKey);

  if (!fileKey) return NextResponse.json({ error: "Foto nao informada para remocao." }, { status: 400 });
  if (!(await canManagePhoto(memberId, session.role, session.user))) {
    return NextResponse.json({ error: "Voce nao tem permissao para remover esta foto." }, { status: 403 });
  }

  const bucket = await ensureBucket();
  if ("error" in bucket) return NextResponse.json({ error: bucket.error }, { status: 503 });

  const { error } = await bucket.client.storage.from(bucketName).remove([fileKey]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
