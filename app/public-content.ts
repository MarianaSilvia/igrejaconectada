import { currentDateKey, isExpiredDate, sortEventsByDate } from "./app-helpers";
import { adminClient } from "./api/admin/auth";
import type { ChurchEvent, MuralItem } from "./types";

type JsonRecord = Record<string, unknown>;

export type PublicMuralItem = Pick<MuralItem, "id" | "title" | "category" | "expiresAt" | "imageDataUrl" | "bannerUrl" | "socialUrl" | "featured">;

export type PublicAgendaEvent = Pick<ChurchEvent, "id" | "title" | "date" | "time" | "ministry" | "location" | "responsible" | "status">;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function booleanValue(value: unknown) {
  return value === true;
}

function muralFromRecord(record: JsonRecord): MuralItem {
  return {
    id: textValue(record.id, 120),
    congregation: textValue(record.congregation, 120),
    title: textValue(record.title, 180),
    category: textValue(record.category, 120),
    published: booleanValue(record.published),
    featured: booleanValue(record.featured),
    expiresAt: textValue(record.expiresAt, 20),
    imageDataUrl: textValue(record.imageDataUrl, 2_000_000),
    bannerUrl: textValue(record.bannerUrl, 1000),
    socialUrl: textValue(record.socialUrl, 1000),
  };
}

function eventFromRecord(record: JsonRecord): ChurchEvent {
  const status = textValue(record.status, 40);

  return {
    id: textValue(record.id, 120),
    congregation: textValue(record.congregation, 120),
    title: textValue(record.title, 180),
    date: textValue(record.date, 20),
    time: textValue(record.time, 20),
    ministry: textValue(record.ministry, 120),
    location: textValue(record.location, 180),
    responsible: textValue(record.responsible, 180),
    recurrence: "Unico",
    status: status === "Confirmado" || status === "Concluido" ? status : "Programado",
  };
}

async function readPublicPayload() {
  const client = adminClient();
  if (!client) return { payload: {}, error: "Supabase administrativo não configurado." };

  const { data, error } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  if (error) return { payload: {}, error: "Não foi possível carregar o conteúdo público." };

  return { payload: isRecord(data?.payload) ? data.payload : {}, error: "" };
}

export async function getPublicMuralItem(id: string) {
  const { payload, error } = await readPublicPayload();
  if (error) return { item: null, error };

  const item = recordsFrom(payload.mural)
    .map(muralFromRecord)
    .find((record) => record.id === id && record.published && !isExpiredDate(record.expiresAt));

  if (!item) return { item: null, error: "" };

  return {
    item: {
      id: item.id,
      title: item.title,
      category: item.category,
      expiresAt: item.expiresAt,
      imageDataUrl: item.imageDataUrl,
      bannerUrl: item.bannerUrl,
      socialUrl: item.socialUrl,
      featured: item.featured,
    } satisfies PublicMuralItem,
    error: "",
  };
}

export async function getPublicAgenda(date = currentDateKey()) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : currentDateKey();
  const { payload, error } = await readPublicPayload();
  if (error) return { date: safeDate, events: [] as PublicAgendaEvent[], error };

  const events = recordsFrom(payload.events)
    .map(eventFromRecord)
    .filter((event) => event.date === safeDate)
    .filter((event) => event.status !== "Concluido")
    .sort(sortEventsByDate)
    .map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      time: event.time,
      ministry: event.ministry,
      location: event.location,
      responsible: event.responsible,
      status: event.status,
    }));

  return { date: safeDate, events, error: "" };
}
