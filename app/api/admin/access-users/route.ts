import { NextResponse } from "next/server";
import { adminClient, churchRoleFromLabel, requireSession } from "../auth";

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

function toChurchRole(role?: string) {
  if (role === "Administrador") return "ADMIN";
  if (role === "Lider") return "LEADER";
  if (role === "Professor") return "PROFESSOR";
  if (role === "Secretario") return "SECRETARY";
  if (role === "Tesoureiro") return "TREASURER";
  return "MEMBER";
}

function toChurchAccess(status?: string) {
  return status === "Ativo" ? "approved" : "pending";
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

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const canManage = await canManageAccessUsers(client, session.user.email ?? "", session.role);
  if (!canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
    app_metadata: {
      role: payload.role ?? "Lider",
      status: payload.status ?? "Ativo",
      church_gp_role: toChurchRole(payload.role),
      church_gp_access: toChurchAccess(payload.status),
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

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  const canManage = await canManageAccessUsers(client, session.user.email ?? "", session.role);
  if (!canManage) return NextResponse.json({ error: "Voce nao tem permissao para gerenciar acessos." }, { status: 403 });

  try {
    const userId = payload.userId ?? (await findUserIdByEmail(client, currentEmail ?? email));
    const appMetadata = {
      role: payload.role ?? "Membro",
      status: payload.status ?? "Ativo",
      church_gp_role: toChurchRole(payload.role ?? "Membro"),
      church_gp_access: toChurchAccess(payload.status ?? "Ativo"),
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
