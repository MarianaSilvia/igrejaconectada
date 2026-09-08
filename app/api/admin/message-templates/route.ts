import { NextResponse } from "next/server";
import { adminClient, requireSession } from "../auth";

type TemplateRow = {
  id: string;
  label: string;
  body: string;
  audience: string | null;
  is_birthday: boolean | null;
};

export async function GET(request: Request) {
  const session = await requireSession(request, ["ADMIN", "SECRETARY", "LEADER"]);
  if (session.response) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });

  const { data, error } = await client
    .from("message_templates")
    .select("id,label,body,audience,is_birthday")
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Nao foi possivel carregar os modelos de mensagem." }, { status: 400 });
  }

  const templates = (data as TemplateRow[]).map((template) => ({
    id: template.id,
    label: template.label,
    text: template.body,
    audience: template.audience ?? undefined,
    isBirthday: template.is_birthday ?? false,
  }));

  return NextResponse.json({ templates });
}
