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

function isBlockedStatus(value: unknown) {
  return /bloqueado|cancelado|inativo/i.test(textValue(value));
}

function isProtectedAuthUser(user: JsonRecord) {
  const role = textValue((user.app_metadata as JsonRecord | undefined)?.church_gp_role);
  return role && role !== "MEMBER";
}

export async function POST(request: Request) {
  const session = await requireSession(request, ["ADMIN"]);
  if (session.response || !session.user) return session.response;

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });

  const { data, error } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const payload = isRecord(data?.payload) ? data.payload : {};
  const memberRecords = recordsFrom(payload.members);
  const legacyAccessMembers = recordsFrom(payload.users);
  const sourceMembers = memberRecords.length
    ? memberRecords
        .filter((member) => !isBlockedStatus(member.status))
        .map((member) => ({
          email: normalizeEmail(member.email),
          name: textValue(member.fullName),
          congregationScope: normalizeCongregationScope(member.congregation),
        }))
    : legacyAccessMembers
        .filter((user) => textValue(user.role).toLowerCase() === "membro" && !isBlockedStatus(user.status))
        .map((user) => ({
          email: normalizeEmail(user.email),
          name: textValue(user.name),
          congregationScope: normalizeCongregationScope(user.congregationScope),
        }));

  const localMembers = Array.from(
    new Map(
      sourceMembers
        .filter((member) => member.email.includes("@") && !member.email.endsWith("@igrejaconectada.local"))
        .map((member) => [member.email, member]),
    ).values(),
  );

  const { data: authData, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 400 });

  const authByEmail = new Map(authData.users.map((user) => [normalizeEmail(user.email), user]));
  const provisionedUsers: JsonRecord[] = [];
  const results = {
    created: 0,
    updated: 0,
    skipped: Math.max(0, memberRecords.length - localMembers.length),
    errors: [] as Array<{ email: string; message: string }>,
  };

  for (const member of localMembers) {
    const email = member.email;
    const name = member.name || email;
    const congregationScope = normalizeCongregationScope(member.congregationScope);
    const existing = authByEmail.get(email);

    if (existing && isProtectedAuthUser(existing as unknown as JsonRecord)) {
      results.skipped += 1;
      continue;
    }

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
      let authUserId = existing?.id ?? "";
      if (existing) {
        const { error: updateError } = await client.auth.admin.updateUserById(existing.id, {
          password: defaultMemberPassword,
          email_confirm: true,
          user_metadata: { name },
          app_metadata: appMetadata,
        });
        if (updateError) throw updateError;
        results.updated += 1;
      } else {
        const { data: created, error: createError } = await client.auth.admin.createUser({
          email,
          password: defaultMemberPassword,
          email_confirm: true,
          user_metadata: { name },
          app_metadata: { ...appMetadata, created_by: session.user.id },
        });
        if (createError) throw createError;
        authUserId = created.user?.id ?? "";
        results.created += 1;
      }

      if (authUserId) {
        provisionedUsers.push({ id: authUserId, name, email, role: "Membro", status: "Ativo", congregationScope });
      }
    } catch (error) {
      results.errors.push({ email, message: error instanceof Error ? error.message : "Erro desconhecido." });
    }
  }

  if (provisionedUsers.length) {
    const existingUsers = recordsFrom(payload.users);
    const provisionedByEmail = new Map(provisionedUsers.map((user) => [normalizeEmail(user.email), user]));
    const mergedUsers = existingUsers.map((user) => {
      const provisioned = provisionedByEmail.get(normalizeEmail(user.email));
      return provisioned && textValue(user.role).toLowerCase() === "membro" ? { ...user, ...provisioned } : user;
    });

    for (const provisioned of provisionedUsers) {
      if (!mergedUsers.some((user) => normalizeEmail(user.email) === normalizeEmail(provisioned.email))) {
        mergedUsers.push(provisioned);
      }
    }

    const { error: stateError } = await client
      .from("church_app_state")
      .update({ payload: { ...payload, users: mergedUsers }, updated_at: new Date().toISOString() })
      .eq("id", "main");

    if (stateError) {
      results.errors.push({ email: "church_app_state", message: "Login criado, mas a lista de acessos não foi sincronizada." });
    }
  }

  return NextResponse.json(results);
}

