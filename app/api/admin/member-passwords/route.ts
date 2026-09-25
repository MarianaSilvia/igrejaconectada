import { NextResponse } from "next/server";
import { adminClient, requireSession } from "../auth";
import { normalizeCongregationScope } from "../../../congregation-scope";
import { churchRoleFromAccessRole } from "../../../permissions";

type JsonRecord = Record<string, unknown>;

const defaultMemberPassword = "123456";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return textValue(value).toLowerCase();
}

export async function POST(request: Request) {
  const session = await requireSession(request, ["ADMIN"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });

  const { data, error } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const payload = isRecord(data?.payload) ? data.payload : {};
  const localMembers = recordsFrom(payload.users).filter((user) => {
    const role = textValue(user.role).toLowerCase();
    const status = textValue(user.status).toLowerCase();
    return role === "membro" && status !== "bloqueado" && normalizeEmail(user.email).includes("@");
  });

  const { data: authData, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 400 });

  const authByEmail = new Map(authData.users.map((user) => [normalizeEmail(user.email), user]));
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as Array<{ email: string; message: string }>,
  };

  for (const member of localMembers) {
    const email = normalizeEmail(member.email);
    const name = textValue(member.name) || email;
    const congregationScope = normalizeCongregationScope(member.congregationScope);
    const appMetadata = {
      role: "Membro",
      status: "Ativo",
      church_gp_role: churchRoleFromAccessRole("Membro"),
      church_gp_access: "approved",
      congregation_scope: congregationScope,
      church_gp_congregation_scope: congregationScope,
      must_change_password: false,
      updated_by: session.user.id,
    };

    try {
      const existing = authByEmail.get(email);
      if (existing) {
        const { error: updateError } = await client.auth.admin.updateUserById(existing.id, {
          password: defaultMemberPassword,
          email_confirm: true,
          user_metadata: { name },
          app_metadata: appMetadata,
        });
        if (updateError) throw updateError;
        results.updated += 1;
        continue;
      }

      const { error: createError } = await client.auth.admin.createUser({
        email,
        password: defaultMemberPassword,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { ...appMetadata, created_by: session.user.id },
      });
      if (createError) throw createError;
      results.created += 1;
    } catch (error) {
      results.errors.push({ email, message: error instanceof Error ? error.message : "Erro desconhecido." });
    }
  }

  results.skipped = Math.max(0, localMembers.length - results.created - results.updated - results.errors.length);

  return NextResponse.json(results);
}
