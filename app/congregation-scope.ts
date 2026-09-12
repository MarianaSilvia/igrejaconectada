export const globalCongregationScope = "Todas";

export const congregationOptions = ["sede/Farroupilha", "Congre.Maringá", "Congre.Pains"] as const;

export type CongregationScope = (typeof congregationOptions)[number] | typeof globalCongregationScope;

export function normalizeCongregationScope(value: unknown): CongregationScope {
  if (typeof value !== "string") return globalCongregationScope;

  const scope = value.trim();
  if (!scope || scope.toLowerCase() === "todas" || scope.toLowerCase() === "todas as congregacoes") {
    return globalCongregationScope;
  }

  return congregationOptions.find((option) => option.toLowerCase() === scope.toLowerCase()) ?? globalCongregationScope;
}

export function isGlobalCongregationScope(value: unknown) {
  return normalizeCongregationScope(value) === globalCongregationScope;
}

export function congregationMatchesScope(value: unknown, scope: unknown) {
  const normalizedScope = normalizeCongregationScope(scope);
  if (normalizedScope === globalCongregationScope) return true;

  const congregation = typeof value === "string" ? value.trim() : "";
  if (!congregation || congregation.toLowerCase() === globalCongregationScope.toLowerCase()) return true;

  return congregation.toLowerCase() === normalizedScope.toLowerCase();
}
