export type ModuleKey =
  | "overview"
  | "users"
  | "members"
  | "visitors"
  | "kids"
  | "events"
  | "schedules"
  | "ministries"
  | "notices"
  | "messages"
  | "mural"
  | "pastoral"
  | "school"
  | "discipleship"
  | "reports"
  | "finance"
  | "assets"
  | "devotional"
  | "settings";

export type AccessRole = "Administrador" | "Lider" | "Professor" | "Secretario" | "Tesoureiro" | "Membro";
export type ChurchRole = "ADMIN" | "LEADER" | "PROFESSOR" | "SECRETARY" | "TREASURER" | "MEMBER";

export const modules: { key: ModuleKey; label: string; short: string }[] = [
  { key: "overview", label: "Visao geral", short: "Painel" },
  { key: "users", label: "Usuarios e acessos", short: "Acessos" },
  { key: "members", label: "Membros", short: "Membros" },
  { key: "visitors", label: "Visitantes", short: "Visitantes" },
  { key: "kids", label: "Area Kids", short: "Kids" },
  { key: "events", label: "Agenda", short: "Agenda" },
  { key: "schedules", label: "Escalas", short: "Escalas" },
  { key: "ministries", label: "Grupos", short: "Grupos" },
  { key: "notices", label: "Comunicados", short: "Avisos" },
  { key: "messages", label: "Comunicacao", short: "Mensagens" },
  { key: "mural", label: "Mural", short: "Mural" },
  { key: "pastoral", label: "Atendimento pastoral", short: "Pastoral" },
  { key: "school", label: "Escola Biblica", short: "EBD" },
  { key: "discipleship", label: "Discipulado", short: "Discipulado" },
  { key: "reports", label: "Relatorios", short: "Relatorios" },
  { key: "finance", label: "Financeiro", short: "Financeiro" },
  { key: "assets", label: "Patrimonio", short: "Patrimonio" },
  { key: "devotional", label: "Devocional", short: "Palavra" },
  { key: "settings", label: "Configuracoes", short: "Config" },
];

export const memberVisibleModuleKeys: ModuleKey[] = [
  "overview",
  "members",
  "events",
  "notices",
  "messages",
  "mural",
  "pastoral",
  "school",
  "discipleship",
  "devotional",
];

export const administrativeRoles = new Set<ChurchRole>(["ADMIN", "LEADER", "PROFESSOR", "SECRETARY", "TREASURER"]);

const accessRoleByChurchRole: Record<ChurchRole, AccessRole> = {
  ADMIN: "Administrador",
  LEADER: "Lider",
  PROFESSOR: "Professor",
  SECRETARY: "Secretario",
  TREASURER: "Tesoureiro",
  MEMBER: "Membro",
};

const churchRoleByAccessRole: Record<AccessRole, ChurchRole> = {
  Administrador: "ADMIN",
  Lider: "LEADER",
  Professor: "PROFESSOR",
  Secretario: "SECRETARY",
  Tesoureiro: "TREASURER",
  Membro: "MEMBER",
};

const roleByLabel: Record<string, ChurchRole> = {
  administrador: "ADMIN",
  admin: "ADMIN",
  lider: "LEADER",
  líder: "LEADER",
  leader: "LEADER",
  professor: "PROFESSOR",
  secretario: "SECRETARY",
  secretário: "SECRETARY",
  secretary: "SECRETARY",
  tesoureiro: "TREASURER",
  treasurer: "TREASURER",
  membro: "MEMBER",
  member: "MEMBER",
};

export const moduleAccessByRole: Record<AccessRole, ModuleKey[]> = {
  Administrador: modules.map((module) => module.key),
  Lider: ["overview", "members", "visitors", "events", "schedules", "ministries", "notices", "messages", "mural", "pastoral", "school", "discipleship", "reports", "devotional"],
  Professor: ["overview", "members", "events", "schedules", "notices", "messages", "mural", "pastoral", "school", "discipleship", "reports"],
  Secretario: ["overview", "users", "members", "visitors", "kids", "events", "schedules", "notices", "messages", "mural", "pastoral", "school", "discipleship", "reports", "settings"],
  Tesoureiro: ["overview", "events", "schedules", "notices", "messages", "mural", "reports", "finance"],
  Membro: memberVisibleModuleKeys,
};

export function churchRoleFromLabel(value: unknown): ChurchRole {
  const role = String(value ?? "").trim();
  const normalizedRole = role.toUpperCase();

  if (["ADMIN", "LEADER", "PROFESSOR", "SECRETARY", "TREASURER", "MEMBER"].includes(normalizedRole)) {
    return normalizedRole as ChurchRole;
  }

  return roleByLabel[role.toLowerCase()] ?? "MEMBER";
}

export function accessRoleFromMetadata(value: unknown): AccessRole {
  return accessRoleByChurchRole[churchRoleFromLabel(value)];
}

export function churchRoleFromAccessRole(role: AccessRole): ChurchRole {
  return churchRoleByAccessRole[role] ?? "MEMBER";
}

export function isAdministrativeRole(role: AccessRole) {
  return role !== "Membro";
}

export function canAccessModule(role: AccessRole, moduleKey: ModuleKey) {
  return moduleAccessByRole[role].includes(moduleKey);
}

export function canManageModule(role: AccessRole, moduleKey: ModuleKey) {
  if (role === "Administrador") return true;
  if (role === "Secretario") return ["users", "members", "visitors", "kids", "events", "schedules", "notices", "messages", "mural", "reports"].includes(moduleKey);
  if (role === "Lider") return ["ministries", "pastoral", "visitors", "events", "schedules", "notices", "messages", "mural", "reports", "devotional"].includes(moduleKey);
  if (role === "Professor") return ["school", "discipleship", "schedules", "messages", "reports"].includes(moduleKey);
  if (role === "Tesoureiro") return moduleKey === "reports" || moduleKey === "finance";
  return false;
}
