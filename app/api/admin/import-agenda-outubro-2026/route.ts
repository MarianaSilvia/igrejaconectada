import { NextResponse } from "next/server";
import { adminClient } from "../auth";
import type { ChurchEvent } from "../../../types";

type ImportEventInput = Omit<ChurchEvent, "id" | "date" | "congregation" | "location" | "recurrence" | "status"> & {
  day: string;
};

const secret = process.env.CRON_SECRET;

const agendaRows: ImportEventInput[] = [
  {
    day: "04",
    time: "19:30",
    title: "Culto Promovido pelo Evangelismo",
    ministry: "Evangelismo",
    responsible: "Dirigente: Ir. Jardel | Pregador(a): Dc. Alessandro | Louvor: Coral Remidos por Cristo | Portaria/Secretaria: Claudia e Angela",
  },
  {
    day: "11",
    time: "19:30",
    title: "Culto Santa Ceia",
    ministry: "Todos",
    responsible: "Dirigente: Pb. Jairo Barbosa | Pregador(a): Pr. Leomar | Louvor: Coral Remidos por Cristo / Jovens | Portaria/Secretaria: Rogério e Saloméia",
  },
  {
    day: "18",
    time: "19:30",
    title: "Culto Promovido pelos Jovens",
    ministry: "Jovens",
    responsible: "Dirigente: Aux. Leonardo | Portaria/Secretaria: Ir. Marcir e Aux.",
  },
  {
    day: "25",
    time: "19:30",
    title: "Culto Promovido pelo Círculo de Oração",
    ministry: "Círculo de Oração",
    responsible: "Dirigente: Ir. Rosane | Louvor: Coral Renascer | Portaria/Secretaria: Pb. Sílvio Teixeira",
  },
  {
    day: "06",
    time: "19:30",
    title: "Estudo da Palavra",
    ministry: "Ensino",
    responsible: "Dirigente: Ir. Jardel | Pregadora: Dc. Elzio | Portaria/Secretaria: Pb. Sílvio Teixeira",
  },
  {
    day: "13",
    time: "19:30",
    title: "Estudo da Palavra",
    ministry: "Ensino",
    responsible: "Dirigente: Aux. Luiz Carlos | Pregadora: Pb. Jairo Barbosa | Portaria/Secretaria: Dc. Elzio",
  },
  {
    day: "20",
    time: "19:30",
    title: "Estudo da Palavra",
    ministry: "Ensino",
    responsible: "Dirigente: Dc. Mauri | Pregadora: Ir. Geovane | Portaria/Secretaria: Ir. Jardel",
  },
  {
    day: "27",
    time: "19:30",
    title: "Estudo da Palavra",
    ministry: "Ensino",
    responsible: "Dirigente: Ir. Ezequias | Pregadora: Dc. Mauri | Portaria/Secretaria: Dc. Elzio",
  },
  { day: "07", time: "19:30", title: "Culto Círculo de Oração", ministry: "Círculo de Oração", responsible: "" },
  { day: "14", time: "19:30", title: "Culto Círculo de Oração", ministry: "Círculo de Oração", responsible: "" },
  { day: "21", time: "19:30", title: "Culto Círculo de Oração", ministry: "Círculo de Oração", responsible: "" },
  { day: "28", time: "19:30", title: "Culto Círculo de Oração", ministry: "Círculo de Oração", responsible: "" },
  {
    day: "02",
    time: "19:30",
    title: "Culto Escola Bíblica Dominical - Lição 01",
    ministry: "EBD",
    responsible: "Dirigente: Ir. Rosane | Pregador: Pb. Sílvio Teixeira",
  },
  {
    day: "19",
    time: "19:30",
    title: "Culto Escola Bíblica Dominical - Lição 02",
    ministry: "EBD",
    responsible: "Dirigente: Ir. Cristina | Pregador: Pb. Jairo Barbosa",
  },
  {
    day: "16",
    time: "19:30",
    title: "Culto Escola Bíblica Dominical - Lição 03",
    ministry: "EBD",
    responsible: "Dirigente: Ir. Esilda | Pregador: Ir. Saloméia",
  },
  {
    day: "23",
    time: "19:30",
    title: "Culto Escola Bíblica Dominical - Lição 04",
    ministry: "EBD",
    responsible: "Dirigente: Ir. Lucia | Pregador: Pb. Sílvio Teixeira",
  },
  {
    day: "30",
    time: "19:30",
    title: "Culto Escola Bíblica Dominical - Lição 05",
    ministry: "EBD",
    responsible: "Dirigente: Pb. Jairo Barbosa | Pregador: Ir. Rosemari",
  },
  { day: "03", time: "20:00", title: "Aula do Discipulado 2 - Lição 07", ministry: "Discipulado", responsible: "Pregador(a): Ir. Rosemari" },
  { day: "10", time: "20:00", title: "Aula do Discipulado 2 - Lição 08", ministry: "Discipulado", responsible: "Pregador(a): Ir. Saloméia" },
  { day: "17", time: "20:00", title: "Aula do Discipulado 2 - Lição 09", ministry: "Discipulado", responsible: "Pregador(a): Ir. Mariana" },
  { day: "24", time: "20:00", title: "Aula do Discipulado 2 - Lição 10", ministry: "Discipulado", responsible: "Pregador(a): Pb. Jairo Barbosa" },
  { day: "31", time: "20:00", title: "Aula do Discipulado 2 - Lição 11", ministry: "Discipulado", responsible: "Pregador(a): Pb. Jairo Barbosa" },
];

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function eventKey(event: Pick<ChurchEvent, "date" | "time" | "title">) {
  return [
    event.date,
    event.time,
    event.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
  ].join("|");
}

function pdfEvents(): ChurchEvent[] {
  return agendaRows.map((row) => ({
    id: `event-escala-maringa-2026-10-${row.day}-${slug(row.title)}`,
    congregation: "Congre.Maringá",
    title: row.title,
    date: `2026-10-${row.day}`,
    time: row.time,
    ministry: row.ministry,
    location: "Congregação Maringá",
    responsible: row.responsible,
    recurrence: "Unico",
    status: "Programado",
  }));
}

function isAuthorized(request: Request) {
  if (!secret) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return headerSecret === secret || bearerSecret === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 });
  }

  const { data, error } = await client.from("church_app_state").select("payload,updated_at").eq("id", "main").maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const payload = data?.payload && typeof data.payload === "object" ? data.payload : {};
  const payloadRecord = payload as { events?: unknown; audit?: unknown };
  const existingEvents = Array.isArray(payloadRecord.events) ? (payloadRecord.events as ChurchEvent[]) : [];
  const existingKeys = new Set(existingEvents.map((event) => eventKey(event)));
  const eventsToAdd = pdfEvents().filter((event) => !existingKeys.has(eventKey(event)));

  const auditItem = {
    id: `audit-agenda-outubro-2026-${Date.now()}`,
    action: `Agenda atualizada pelo PDF da escala de outubro/2026: ${eventsToAdd.length} eventos adicionados.`,
    when: new Date().toISOString(),
  };

  const nextPayload = {
    ...payload,
    events: [...eventsToAdd, ...existingEvents],
    audit: [auditItem, ...(Array.isArray(payloadRecord.audit) ? payloadRecord.audit : [])].slice(0, 12),
  };

  const { data: saved, error: saveError } = await client
    .from("church_app_state")
    .upsert({
      id: "main",
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    })
    .select("updated_at")
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    previousUpdatedAt: data?.updated_at,
    updatedAt: saved?.updated_at,
    pdfEvents: agendaRows.length,
    added: eventsToAdd.length,
    skipped: agendaRows.length - eventsToAdd.length,
  });
}
