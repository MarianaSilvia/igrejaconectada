import { formatDate } from "./app-helpers";
import type { ChurchEvent, MuralItem } from "./types";

type SharePayload = {
  title: string;
  text: string;
  url: string;
};

function originUrl() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function publicMuralUrl(id: string) {
  return `${originUrl()}/publico/mural/${encodeURIComponent(id)}`;
}

export function publicAgendaUrl(date?: string) {
  const path = `${originUrl()}/publico/agenda`;
  return date ? `${path}?date=${encodeURIComponent(date)}` : path;
}

export function muralShareText(item: Pick<MuralItem, "title" | "category" | "socialUrl">, url: string) {
  return [
    "Igreja Conectada",
    `Aviso: ${item.title}`,
    item.category ? `Categoria: ${item.category}` : "",
    item.socialUrl ? `Link relacionado: ${item.socialUrl}` : "",
    `Veja o aviso: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function agendaEventShareText(event: ChurchEvent, url: string) {
  return [
    "Igreja Conectada",
    `Agenda do dia - ${formatDate(event.date)}`,
    `${event.time || "Sem horário"} - ${event.title}`,
    event.ministry ? `Grupo: ${event.ministry}` : "",
    event.location ? `Local: ${event.location}` : "",
    event.responsible ? `Responsável: ${event.responsible}` : "",
    `Confira a agenda: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function dailyAgendaShareText(events: ChurchEvent[], url: string) {
  const eventLines = events.length
    ? events.map((event) => `- ${event.time || "Sem horário"} | ${event.title}${event.location ? ` | ${event.location}` : ""}`)
    : ["Nenhum evento publicado para hoje."];

  return ["Igreja Conectada", "Agenda de hoje", ...eventLines, `Veja a agenda: ${url}`].join("\n");
}

async function copyText(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export async function sharePublicContent(payload: SharePayload) {
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  await copyText(payload.text);
  return "copied" as const;
}
