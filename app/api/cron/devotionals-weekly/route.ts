import { NextResponse } from "next/server";

import { adminClient } from "../../admin/auth";
import type { DevotionalRecord } from "../../../types";

type JsonRecord = Record<string, unknown>;

const stateId = "main";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function booleanValue(value: unknown) {
  return value === true;
}

function dateKeyInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function mondayForDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function addDaysKey(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function normalizeDevotional(record: JsonRecord): DevotionalRecord {
  const status = textValue(record.status, 40);
  const source = textValue(record.source, 40);

  return {
    id: textValue(record.id, 120),
    title: textValue(record.title, 180),
    verse: textValue(record.verse, 180),
    body: textValue(record.body, 5000),
    status: status === "Publicado" || status === "Aprovado" || status === "Arquivado" ? status : "Rascunho",
    publishedAt: textValue(record.publishedAt, 20),
    theme: textValue(record.theme, 120),
    source: source === "automatic" ? "automatic" : "manual",
    weekKey: textValue(record.weekKey, 20),
    createdByAutomation: booleanValue(record.createdByAutomation),
    usedAt: textValue(record.usedAt, 20),
  };
}

function auditId(now: Date) {
  return `audit-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function devotionalId(weekKey: string, index: number) {
  return `devotional-auto-${weekKey}-${String(index + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Cron não autorizado." }, { status: 401 });
  }

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });
  }

  const { data, error: readError } = await client.from("church_app_state").select("payload").eq("id", stateId).maybeSingle();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }

  const payload = isRecord(data?.payload) ? data.payload : {};
  const devotionals = recordsFrom(payload.devotionals).map((record) => normalizeDevotional(record));
  const approvedLibrary = devotionals
    .filter((devotional) => devotional.status === "Aprovado" && !devotional.createdByAutomation && devotional.title && devotional.body)
    .sort((first, second) => {
      const usage = (first.usedAt || "0000-00-00").localeCompare(second.usedAt || "0000-00-00");
      return usage || first.title.localeCompare(second.title, "pt-BR", { sensitivity: "base" });
    });

  if (approvedLibrary.length < 7) {
    return NextResponse.json(
      {
        error: "Cadastre pelo menos 7 devocionais aprovados antes de atualizar a semana automaticamente.",
        approvedCount: approvedLibrary.length,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const todayKey = dateKeyInSaoPaulo(now);
  const weekStart = mondayForDateKey(todayKey);
  const weekKey = addDaysKey(weekStart, 0);
  const selected = approvedLibrary.slice(0, 7);
  const selectedIds = new Set(selected.map((devotional) => devotional.id));

  const manualDevotionals = devotionals
    .filter((devotional) => !devotional.createdByAutomation)
    .map((devotional) =>
      selectedIds.has(devotional.id)
        ? {
            ...devotional,
            source: "manual" as const,
            usedAt: todayKey,
          }
        : devotional,
    );

  const weeklyDevotionals: DevotionalRecord[] = selected.map((template, index) => ({
    id: devotionalId(weekKey, index),
    title: template.title,
    verse: template.verse,
    body: template.body,
    status: "Publicado",
    publishedAt: addDaysKey(weekStart, index),
    theme: template.theme,
    source: "automatic",
    weekKey,
    createdByAutomation: true,
    usedAt: "",
  }));

  const audit = recordsFrom(payload.audit);
  const nextPayload = {
    ...payload,
    devotionals: [...weeklyDevotionals, ...manualDevotionals],
    audit: [
      {
        id: auditId(now),
        action: `Devocionais semanais atualizados automaticamente: ${weekKey}`,
        when: now.toISOString(),
      },
      ...audit,
    ].slice(0, 12),
  };

  const { data: saved, error: saveError } = await client
    .from("church_app_state")
    .upsert({
      id: stateId,
      payload: nextPayload,
      updated_at: now.toISOString(),
    })
    .select("updated_at")
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    weekKey,
    created: weeklyDevotionals.length,
    updatedAt: saved?.updated_at ?? now.toISOString(),
  });
}
