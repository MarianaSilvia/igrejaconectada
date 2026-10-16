export const globalCongregationScope = "Todas";
export const unassignedCongregationScope = "";

export const congregationOptions = ["sede/Farroupilha", "Congre.Maringá", "Congre.Pains"] as const;

export type CongregationScope =
  | (typeof congregationOptions)[number]
  | typeof globalCongregationScope
  | typeof unassignedCongregationScope;

const congregationAliases: Record<string, (typeof congregationOptions)[number]> = {
  sede: "sede/Farroupilha",
  farroupilha: "sede/Farroupilha",
  maringa: "Congre.Maringá",
  congreemaringa: "Congre.Maringá",
  pains: "Congre.Pains",
  congrepains: "Congre.Pains",
};

function congregationKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}


export function normalizeCongregationScope(value: unknown): CongregationScope {
  if (typeof value !== "string") return unassignedCongregationScope;

  const scope = value.trim();
  if (!scope) return unassignedCongregationScope;
  if (scope.toLowerCase() === "todas" || scope.toLowerCase() === "todas as congregacoes") {
    return globalCongregationScope;
  }

  const directMatch = congregationOptions.find((option) => option.toLowerCase() === scope.toLowerCase());
  return directMatch ?? congregationAliases[congregationKey(scope)] ?? unassignedCongregationScope;
}

export function isGlobalCongregationScope(value: unknown) {
  return normalizeCongregationScope(value) === globalCongregationScope;
}

export function congregationMatchesScope(value: unknown, scope: unknown) {
  const normalizedScope = normalizeCongregationScope(scope);
  if (normalizedScope === globalCongregationScope) return true;

  const congregation = typeof value === "string" ? value.trim() : "";
  if (normalizedScope === unassignedCongregationScope) return !congregation;
  if (!congregation) return false;
  if (congregation.toLowerCase() === globalCongregationScope.toLowerCase()) return true;

  return congregationKey(congregation) === congregationKey(normalizedScope);
}
