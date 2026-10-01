import type { ModuleKey } from "./permissions";
import type { ChurchEvent } from "./types";

type AgendaThemeEvent = Pick<ChurchEvent, "title" | "ministry" | "location" | "responsible">;

export type ModuleCoverKey =
  | "registrations"
  | "pastoral"
  | "agenda"
  | "visitors"
  | "notices"
  | "kids"
  | "members"
  | "school"
  | "discipleship"
  | "groups"
  | "mural"
  | "messages"
  | "contact"
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

export function agendaThemeKey(event: AgendaThemeEvent) {
  const mainText = normalized([event.title, event.ministry].join(" "));
  const text = normalized([event.title, event.ministry, event.location, event.responsible].join(" "));

  if (mainText.includes("ebd") || mainText.includes("escola biblica") || mainText.includes("escola dominical")) return "school";
  if (mainText.includes("discipulado")) return "discipleship";
  if (mainText.includes("circulo de oracao") || mainText.includes("oração") || mainText.includes("oracao")) return "prayer";
  if (mainText.includes("ensino") || mainText.includes("doutrina") || mainText.includes("estudo")) return "teaching";
  if (mainText.includes("santa ceia") || mainText.includes("ceia")) return "communion";
  if (mainText.includes("evangelismo") || mainText.includes("evangelistico")) return "evangelism";
  if (mainText.includes("jovem") || mainText.includes("jovens") || mainText.includes("juventude")) return "youth";
  if (mainText.includes("louvor") || mainText.includes("coral")) return "rehearsal";
  if (mainText.includes("pregacao") || mainText.includes("pregação") || mainText.includes("domingo") || mainText.includes("familia") || mainText.includes("culto")) return "preaching";
  if (text.includes("obreiro") || text.includes("administr") || text.includes("reuniao")) return "meeting";
  if (text.includes("ensaio") || text.includes("louvor") || text.includes("maestro")) return "rehearsal";
  if (text.includes("congresso") || text.includes("conferencia")) return "conference";
  if (text.includes("campanha") || text.includes("proposito")) return "campaign";
  if (text.includes("kids") || text.includes("crianca") || text.includes("infantil")) return "kids";
  if (text.includes("visita") || text.includes("pastoral")) return "pastoral";

  return "default";
}

export function agendaThemeClass(event: AgendaThemeEvent) {
  return `agenda-cover agenda-theme-${agendaThemeKey(event)}`;
}
