import { NextResponse } from "next/server";
import { adminClient, churchRoleFromLabel, requireSession } from "../auth";
import { churchRoleFromAccessRole, type AccessRole } from "../../../permissions";

type AccessUserPayload = {
  userId?: string;
  name?: string;
  currentEmail?: string;
  email?: string;
  password?: string;
  role?: string;
  status?: string;
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

async function canManageAccessUsers(client: NonNullable<ReturnType<typeof adminClient>>, email: string, metadataRole: string) {
  if (metadataRole === "ADMIN") return true;

  const { data } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  const payload = data?.payload;
  if (!isRecord(payload)) return false;

  const localUser = recordsFrom(payload.users).find((user) => textValue(user.email).toLowerCase() === email.toLowerCase());
  return Boolean(localUser && churchRoleFromLabel(localUser.role) === "ADMIN");
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
  const canManage = await canManageAccessUsers(client, session.user.email ?? "", session.role);
  if (!canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });

  const role = normalizeAccessRole(payload.role ?? "Lider");
  const status = normalizeAccessStatus(payload.status ?? "Ativo");

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
  const canManage = await canManageAccessUsers(client, session.user.email ?? "", session.role);
  if (!canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });

  try {
    const userId = payload.userId ?? (await findUserIdByEmail(client, currentEmail ?? email));
    const role = normalizeAccessRole(payload.role ?? "Membro");
    const status = normalizeAccessStatus(payload.status ?? "Ativo");

    if (userId === session.user.id && (role !== "Administrador" || status !== "Ativo")) {
      return NextResponse.json({ error: "Voce nao pode rebaixar ou bloquear o proprio acesso enquanto esta conectado." }, { status: 400 });
    }

    const appMetadata = {
      role,
      status,
      church_gp_role: toChurchRole(role),
      church_gp_access: toChurchAccess(status),
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
  const email = payload.email?.trim().toLowerCase();

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const canManage = await canManageAccessUsers(client, session.user.email ?? "", session.role);
  if (!canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });

  try {
    const userId = payload.userId ?? (await findUserIdByEmail(client, email));

    if (!userId) {
      return NextResponse.json({ error: "Usuario nao localizado no Supabase." }, { status: 404 });
    }

    if (userId === session.user.id) {
      return NextResponse.json({ error: "Voce nao pode excluir o proprio acesso enquanto esta conectado." }, { status: 400 });
    }

    const { error } = await client.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: userId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel excluir o acesso no Supabase." },
      { status: 400 },
    );
  }
}
