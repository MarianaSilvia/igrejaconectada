import type { ModuleKey } from "./permissions";
import type { ChurchEvent } from "./types";

export type ModuleCoverKey =
  | "registrations"
  | "pastoral"
  | "agenda"
  | "visitors"
  | "schedules"
  | "notices"
  | "kids"
  | "members"
  | "school"
  | "discipleship"
  | "groups"
  | "mural"
  | "messages"
  | "reports";

export function moduleCoverClass(key: ModuleCoverKey | ModuleKey) {
  return `module-cover module-cover-${key}`;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function agendaThemeKey(event: ChurchEvent) {
  const text = normalized([event.title, event.ministry, event.location, event.responsible].join(" "));

  if (text.includes("santa ceia") || text.includes("ceia")) return "communion";
  if (text.includes("ensino") || text.includes("doutrina") || text.includes("estudo")) return "teaching";
  if (text.includes("domingo") || text.includes("familia") || text.includes("culto")) return "worship";
  if (text.includes("obreiro") || text.includes("administr") || text.includes("reuniao")) return "meeting";
  if (text.includes("ensaio") || text.includes("louvor") || text.includes("maestro")) return "rehearsal";
  if (text.includes("congresso") || text.includes("conferencia")) return "conference";
  if (text.includes("campanha") || text.includes("proposito")) return "campaign";
  if (text.includes("ebd") || text.includes("escola biblica") || text.includes("escola dominical")) return "school";
  if (text.includes("discipulado")) return "discipleship";
  if (text.includes("kids") || text.includes("crianca") || text.includes("infantil")) return "kids";
  if (text.includes("visita") || text.includes("pastoral")) return "pastoral";

  return "default";
}

export function agendaThemeClass(event: ChurchEvent) {
  return `agenda-cover agenda-theme-${agendaThemeKey(event)}`;
}
