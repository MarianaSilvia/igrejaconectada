import { NextResponse } from "next/server";

import { adminClient, requireSession } from "../../admin/auth";

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });

  const { error } = await client.auth.admin.updateUserById(session.user.id, {
    app_metadata: {
      ...session.user.app_metadata,
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    },
  });

  if (error) return NextResponse.json({ error: "Não foi possível concluir a troca da senha." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
