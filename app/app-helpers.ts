import type { ChurchEvent } from "./types";

export function formatDate(value: string) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

export function dateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isExpiredDate(value: string) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T23:59:59`) < today;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function birthdayDateThisYear(value: string) {
  if (!value) return null;
  const [, month, day] = value.split("-").map(Number);
  if (!month || !day) return null;

  const today = new Date();
  return new Date(today.getFullYear(), month - 1, day);
}

export function birthdayLabel(value: string) {
  if (!value) return "Sem aniversario";
  const date = birthdayDateThisYear(value);
  if (!date) return "Sem aniversario";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(date);
}

export function ageFromBirthDate(value: string, now = new Date()) {
  if (!value) return "";
  const birthDate = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > now) return "";

  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return String(Math.max(age, 0));
}

export function ageGroupFromBirthDate(value: string, now = new Date()) {
  const ageText = ageFromBirthDate(value, now);
  if (!ageText) return "";
  const age = Number(ageText);
  if (age <= 12) return "Crianca";
  if (age <= 17) return "Adolescente";
  if (age <= 29) return "Jovem";
  if (age >= 60) return "Idoso";
  return "Adulto";
}

export function isBirthdayThisMonth(value: string) {
  const date = birthdayDateThisYear(value);
  if (!date) return false;
  return date.getMonth() === new Date().getMonth();
}

export function isBirthdayThisWeek(value: string) {
  const date = birthdayDateThisYear(value);
  if (!date) return false;

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return date >= start && date <= end;
}

export function eventDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function currentWeekRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function weekRangeWithOffset(offset: number, now = new Date()) {
  const base = new Date(now);
  base.setDate(base.getDate() + offset * 7);
  return currentWeekRange(base);
}

export function isEventInWeek(event: ChurchEvent, start: Date, end: Date) {
  const date = eventDate(event.date);
  if (!date) return false;
  return date >= start && date <= end;
}

export function sortEventsByDate(first: ChurchEvent, second: ChurchEvent) {
  return `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`);
}

export function currentDateKey() {
  return new Date().toLocaleDateString("en-CA");
}

export function normalizeWhatsappPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function comparablePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^55/, "");
}

export function messageFor(text: string, recipientName: string) {
  return text.replaceAll("{nome}", recipientName).replaceAll("{igreja}", "Igreja Conectada");
}

export function whatsappUrl(phone: string, text: string, recipientName: string) {
  const number = normalizeWhatsappPhone(phone);
  if (!number) return "#";
  return `https://wa.me/${number}?text=${encodeURIComponent(messageFor(text, recipientName))}`;
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function replaceLegacyMinistryText(value: string) {
  return value
    .replaceAll("Ministérios", "Grupos")
    .replaceAll("Ministerios", "Grupos")
    .replaceAll("ministérios", "grupos")
    .replaceAll("ministerios", "grupos")
    .replaceAll("Ministério", "Grupo")
    .replaceAll("Ministerio", "Grupo")
    .replaceAll("ministério", "grupo")
    .replaceAll("ministerio", "grupo");
}

export function classNoticeWhatsappText(className: string, title: string, body: string) {
  return [`Paz, {nome}! Aviso para a classe ${className}.`, title ? `Tema: ${title}.` : "", body, "Igreja Conectada."]
    .filter(Boolean)
    .join("\n\n");
}
