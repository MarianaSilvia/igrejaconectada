import { NextResponse } from "next/server";
import { adminClient, requireSession } from "../auth";

type KidPayload = {
  id?: string;
  childName?: string;
  birthDate?: string;
  ageGroup?: string;
  className?: string;
  allergies?: string;
  notes?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  relationship?: string;
  authorizedPickup?: string;
  consentImage?: boolean;
};

function textValue(value: unknown, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as KidPayload | null;
  const id = textValue(body?.id, 140);
  const childName = textValue(body?.childName, 180);
  const ageGroup = textValue(body?.ageGroup, 80);
  const guardianName = textValue(body?.guardianName, 180);
  const guardianPhone = textValue(body?.guardianPhone, 60);

  if (!id || !childName || !ageGroup || !guardianName || !guardianPhone) {
    return NextResponse.json({ error: "Informe crianca, faixa etaria e responsavel para salvar Kids." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await client.from("kids_profiles").upsert({
    id,
    child_name: childName,
    birth_date: textValue(body?.birthDate, 40) || null,
    age_group: ageGroup,
    class_name: textValue(body?.className, 120) || null,
    photo_url: null,
    allergies: textValue(body?.allergies, 400) || null,
    notes: textValue(body?.notes, 800) || null,
    guardian_name: guardianName,
    guardian_phone: guardianPhone,
    guardian_email: textValue(body?.guardianEmail, 180) || null,
    relationship: textValue(body?.relationship, 80) || null,
    authorized_pickup: textValue(body?.authorizedPickup, 400) || null,
    consent_image: body?.consentImage === true,
    whatsapp_opt_in: true,
    created_by: session.user.id,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel sincronizar Kids." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
