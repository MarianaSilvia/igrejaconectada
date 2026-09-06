import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { administrativeRoles, churchRoleFromLabel, type ChurchRole } from "../../permissions";

export { administrativeRoles, churchRoleFromLabel };
export type { ChurchRole };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function unavailableResponse() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase administrativo nao configurado." }, { status: 503 });
  }

  return null;
}

export function adminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export function churchRoleFromUser(user: User): ChurchRole {
  const metadata = user.app_metadata ?? {};
  return churchRoleFromLabel(metadata.church_gp_role ?? metadata.role);
}

export function hasApprovedAccess(user: User) {
  const metadata = user.app_metadata ?? {};
  const access = String(metadata.church_gp_access ?? "").toLowerCase();
  const status = String(metadata.status ?? "").toLowerCase();

  if (!access && !status) return true;

  return access === "approved" || status === "ativo" || status === "active";
}

export async function requireSession(request: Request, allowedRoles?: Iterable<ChurchRole>) {
  const unavailable = unavailableResponse();
  if (unavailable) return { response: unavailable };

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { response: NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 }) };
  }

  const sessionClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: sessionData, error: sessionError } = await sessionClient.auth.getUser(token);

  if (sessionError || !sessionData.user) {
    return { response: NextResponse.json({ error: "Sessao invalida ou expirada." }, { status: 401 }) };
  }

  const user = sessionData.user;
  const role = churchRoleFromUser(user);

  if (!hasApprovedAccess(user)) {
    return { response: NextResponse.json({ error: "Acesso pendente ou bloqueado." }, { status: 403 }) };
  }

  if (allowedRoles && !new Set(allowedRoles).has(role)) {
    return { response: NextResponse.json({ error: "Voce nao tem permissao para esta acao." }, { status: 403 }) };
  }

  return { user, role };
}
