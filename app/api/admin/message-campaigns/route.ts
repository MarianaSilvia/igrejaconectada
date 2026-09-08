import { NextResponse } from "next/server";
import { adminClient, requireSession } from "../auth";

type RecipientPayload = {
  id?: string;
  name?: string;
  phone?: string;
};

type CampaignPayload = {
  audience?: string;
  body?: string;
  recipients?: RecipientPayload[];
};

function textValue(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function whatsappUrl(phone: string, text: string, name: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  const message = text.replaceAll("{nome}", name);
  return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export async function POST(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY", "LEADER"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as CampaignPayload | null;
  const audience = textValue(body?.audience, 120);
  const messageBody = textValue(body?.body, 1600);
  const recipients = Array.isArray(body?.recipients)
    ? body.recipients
        .map((recipient) => ({
          id: textValue(recipient.id, 140),
          name: textValue(recipient.name, 180),
          phone: textValue(recipient.phone, 60),
        }))
        .filter((recipient) => recipient.name && recipient.phone.replace(/\D/g, "").length >= 8)
        .slice(0, 80)
    : [];

  if (!audience || !messageBody || !recipients.length) {
    return NextResponse.json({ error: "Informe publico, mensagem e destinatarios para registrar a campanha." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const campaignId = `campaign-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { error: campaignError } = await client.from("message_campaigns").insert({
    id: campaignId,
    title: `Envio ${audience}`,
    audience,
    body: messageBody,
    channel: "whatsapp_manual",
    status: "prepared",
    recipient_count: recipients.length,
    created_by: session.user.id,
    created_at: now,
    updated_at: now,
  });

  if (campaignError) {
    return NextResponse.json({ error: "Nao foi possivel registrar a campanha." }, { status: 400 });
  }

  const { error: recipientsError } = await client.from("message_recipients").insert(
    recipients.map((recipient) => ({
      id: `recipient-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      campaign_id: campaignId,
      recipient_type: audience === "Responsaveis Kids" ? "kid_guardian" : "member",
      recipient_id: recipient.id,
      recipient_name: recipient.name,
      phone: recipient.phone,
      whatsapp_url: whatsappUrl(recipient.phone, messageBody, recipient.name),
      send_status: "opened",
      created_at: now,
    })),
  );

  if (recipientsError) {
    return NextResponse.json({ error: "Campanha criada, mas destinatarios nao foram registrados." }, { status: 400 });
  }

  return NextResponse.json({ id: campaignId, recipientCount: recipients.length });
}
