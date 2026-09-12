import { NextResponse } from "next/server";
import { adminClient, churchRoleFromLabel, requireSession } from "../auth";
import { isGlobalCongregationScope, normalizeCongregationScope } from "../../../congregation-scope";
import { churchRoleFromAccessRole, type AccessRole } from "../../../permissions";

type AccessUserPayload = {
  userId?: string;
  name?: string;
  currentEmail?: string;
  email?: string;
  password?: string;
  role?: string;
  status?: string;
  congregationScope?: string;
};

type DeleteAccessUserPayload = {
  userId?: string;
  email?: string;
};

type JsonRecord = Record<string, unknown>;

const allowedAccessRoles: AccessRole[] = ["Administrador", "Lider", "Professor", "Secretario", "Tesoureiro", "Membro"];
const allowedAccessStatuses = ["Ativo", "Pendente", "Bloqueado"] as const;
type AccessStatus = (typeof allowedAccessStatuses)[number];

function normalizeAccessRole(role?: string): AccessRole {
  return allowedAccessRoles.includes(role as AccessRole) ? (role as AccessRole) : "Membro";
}

function normalizeAccessStatus(status?: string): AccessStatus {
  return allowedAccessStatuses.includes(status as AccessStatus) ? (status as AccessStatus) : "Ativo";
}

function hasInvalidRoleOrStatus(payload: AccessUserPayload) {
  return Boolean(
    (payload.role && !allowedAccessRoles.includes(payload.role as AccessRole)) ||
      (payload.status && !allowedAccessStatuses.includes(payload.status as AccessStatus)),
  );
}

function toChurchRole(role: AccessRole) {
  return churchRoleFromAccessRole(role);
}

function toChurchAccess(status: AccessStatus) {
  if (status === "Ativo") return "approved";
  if (status === "Bloqueado") return "blocked";
  return "pending";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSupabaseAuthId(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function accessManagerContext(client: NonNullable<ReturnType<typeof adminClient>>, email: string, metadataRole: string) {
  const { data } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = isRecord(data?.payload) ? data.payload : {};
  const localUser = recordsFrom(payload.users).find((user) => textValue(user.email).toLowerCase() === email.toLowerCase());
  const canManage = metadataRole === "ADMIN" || Boolean(localUser && churchRoleFromLabel(localUser.role) === "ADMIN");
  const scope = normalizeCongregationScope(
    localUser?.congregationScope ??
      (metadataRole === "ADMIN" ? undefined : "") ??
      undefined,
  );

  return { canManage, payload, scope };
}

function targetAccessUser(payload: JsonRecord, userId?: string, email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  return recordsFrom(payload.users).find((user) => {
    const idMatches = Boolean(userId && textValue(user.id) === userId);
    const emailMatches = Boolean(normalizedEmail && textValue(user.email).toLowerCase() === normalizedEmail);
    return idMatches || emailMatches;
  });
}

function canManageTargetScope(managerScope: string, target?: JsonRecord) {
  if (isGlobalCongregationScope(managerScope)) return true;
  if (!target) return true;
  return normalizeCongregationScope(target.congregationScope) === managerScope;
}

async function findUserIdByEmail(client: NonNullable<ReturnType<typeof adminClient>>, email?: string) {
  if (!email) return null;

  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const target = email.trim().toLowerCase();
  return data.users.find((user) => user.email?.toLowerCase() === target)?.id ?? null;
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const payload = (await request.json()) as AccessUserPayload;
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();

  if (!name || !email || !password || password.length < 6) {
    return NextResponse.json({ error: "Informe nome, e-mail e senha com pelo menos 6 caracteres." }, { status: 400 });
  }

  if (hasInvalidRoleOrStatus(payload)) {
    return NextResponse.json({ error: "Perfil ou status invalido para criar acesso." }, { status: 400 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const manager = await accessManagerContext(client, session.user.email ?? "", session.role);
  if (!manager.canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });

  const role = normalizeAccessRole(payload.role ?? "Lider");
  const status = normalizeAccessStatus(payload.status ?? "Ativo");
  const congregationScope = isGlobalCongregationScope(manager.scope) ? normalizeCongregationScope(payload.congregationScope) : manager.scope;

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
    app_metadata: {
      role,
      status,
      church_gp_role: toChurchRole(role),
      church_gp_access: toChurchAccess(status),
      congregation_scope: congregationScope,
      church_gp_congregation_scope: congregationScope,
      created_by: session.user.id,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.user.id, email: data.user.email });
}

export async function PATCH(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const payload = (await request.json()) as AccessUserPayload;
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();
  const currentEmail = payload.currentEmail?.trim().toLowerCase();

  if (!name || !email) {
    return NextResponse.json({ error: "Informe nome e e-mail para atualizar o acesso." }, { status: 400 });
  }

  if (password && password.length < 6) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }

  if (hasInvalidRoleOrStatus(payload)) {
    return NextResponse.json({ error: "Perfil ou status invalido para atualizar acesso." }, { status: 400 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const manager = await accessManagerContext(client, session.user.email ?? "", session.role);
  if (!manager.canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });
  if (!canManageTargetScope(manager.scope, targetAccessUser(manager.payload, payload.userId, currentEmail ?? email))) {
    return NextResponse.json({ error: "Voce nao pode alterar acesso de outra congregacao." }, { status: 403 });
  }

  try {
    const userId = payload.userId ?? (await findUserIdByEmail(client, currentEmail ?? email));
    const role = normalizeAccessRole(payload.role ?? "Membro");
    const status = normalizeAccessStatus(payload.status ?? "Ativo");
    const congregationScope = isGlobalCongregationScope(manager.scope) ? normalizeCongregationScope(payload.congregationScope) : manager.scope;

    if (userId === session.user.id && (role !== "Administrador" || status !== "Ativo")) {
      return NextResponse.json({ error: "Voce nao pode rebaixar ou bloquear o proprio acesso enquanto esta conectado." }, { status: 400 });
    }

    const appMetadata = {
      role,
      status,
      church_gp_role: toChurchRole(role),
      church_gp_access: toChurchAccess(status),
      congregation_scope: congregationScope,
      church_gp_congregation_scope: congregationScope,
      updated_by: session.user.id,
    };

    if (userId) {
      const { data, error } = await client.auth.admin.updateUserById(userId, {
        email,
        ...(password ? { password } : {}),
        email_confirm: true,
        user_metadata: { name },
        app_metadata: appMetadata,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ id: data.user.id, email: data.user.email, created: false });
    }

    if (!password) {
      return NextResponse.json({ error: "Informe uma senha inicial para criar o acesso deste membro." }, { status: 400 });
    }

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { ...appMetadata, created_by: session.user.id },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.user.id, email: data.user.email, created: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel localizar o usuario no Supabase." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return session.response;

  const payload = (await request.json()) as DeleteAccessUserPayload;
  const requestedUserId = payload.userId?.trim();
  const email = payload.email?.trim().toLowerCase();

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const manager = await accessManagerContext(client, session.user.email ?? "", session.role);
  if (!manager.canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });
  if (!canManageTargetScope(manager.scope, targetAccessUser(manager.payload, requestedUserId, email))) {
    return NextResponse.json({ error: "Voce nao pode excluir acesso de outra congregacao." }, { status: 403 });
  }

  try {
    if (!requestedUserId && !email) {
      return NextResponse.json({ error: "Informe o usuario ou e-mail do acesso para excluir." }, { status: 400 });
    }

    if (requestedUserId === session.user.id || (email && email === (session.user.email ?? "").toLowerCase())) {
      return NextResponse.json({ error: "Voce nao pode excluir o proprio acesso enquanto esta conectado." }, { status: 400 });
    }

    const userId = (await findUserIdByEmail(client, email)) ?? (isSupabaseAuthId(requestedUserId) ? requestedUserId : null);

    if (!userId) {
      return NextResponse.json({ id: requestedUserId ?? email, authDeleted: false, localOnly: true });
    }

    const { error } = await client.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: userId, authDeleted: true, localOnly: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel excluir o acesso no Supabase." },
      { status: 400 },
    );
  }
}
