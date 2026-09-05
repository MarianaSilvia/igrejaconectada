"use client";

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client";

type ModuleKey =
  | "overview"
  | "users"
  | "members"
  | "kids"
  | "events"
  | "ministries"
  | "notices"
  | "messages"
  | "mural"
  | "pastoral"
  | "school"
  | "discipleship"
  | "reports"
  | "settings";

type AccessMode = "login" | "recover";

type CareStatus = "Pendente" | "Em analise" | "Agendado" | "Concluido";

type CareRequest = {
  id: string;
  member: string;
  phone: string;
  category: string;
  status: CareStatus;
  responsible: string;
  scheduleDate: string;
  scheduleTime: string;
  summary: string;
  returnNote: string;
  createdAt: string;
  updatedAt: string;
};

type ChurchEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  ministry: string;
  location: string;
  responsible: string;
  status: "Programado" | "Confirmado" | "Concluido";
};

type Notice = {
  id: string;
  title: string;
  body: string;
  status: "Publicado" | "Rascunho";
  audience: string;
  channel: "App" | "WhatsApp" | "Mural" | "Todos";
  retentionDays: number;
  expiresAt: string;
};

type MuralItem = {
  id: string;
  title: string;
  category: string;
  published: boolean;
  featured: boolean;
  expiresAt: string;
  imageDataUrl: string;
  bannerUrl: string;
  socialUrl: string;
};

type MuralImageResult = {
  dataUrl: string;
  message: string;
};

type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: "Administrador" | "Lider" | "Membro";
  status: "Ativo" | "Pendente" | "Bloqueado";
};

type AccessRole = AccessUser["role"];

type AccessUserForm = Omit<AccessUser, "id"> & {
  password: string;
};

type MemberRecord = {
  id: string;
  authUserId?: string;
  fullName: string;
  phone: string;
  email: string;
  status: "Membro ativo" | "Visitante" | "Novo convertido" | "Transferencia";
  memberType: "Membro" | "Visitante" | "Congregado" | "Lideranca";
  role: string;
  ministry: string;
  schoolClassId: string;
  discipleshipClassId: string;
  photoDataUrl: string;
  birthDate: string;
  maritalStatus: string;
  address: string;
  congregation: string;
  previousChurch: string;
  waterBaptized: boolean;
  holySpiritBaptized: boolean;
  joinedAt: string;
  notes: string;
};

type KidRecord = {
  id: string;
  childName: string;
  birthDate: string;
  ageGroup: "Bercario" | "Maternal" | "Kids" | "Juniores";
  className: string;
  photoDataUrl: string;
  allergies: string;
  notes: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  relationship: string;
  authorizedPickup: string;
  consentImage: boolean;
  joinedAt: string;
};

type MessageAudience =
  | "Todos os membros"
  | "Aniversariantes da semana"
  | "Aniversariantes do mes"
  | "EBD"
  | "Discipulado"
  | "Ministerios"
  | "Responsaveis Kids";

type MessageRecipient = {
  id: string;
  name: string;
  phone: string;
  group: string;
};

type MessageTemplateItem = {
  id: string;
  label: string;
  text: string;
  audience?: string;
  isBirthday?: boolean;
};

type DigitalCardData = {
  ownerType: "member" | "kid";
  ownerId: string;
  title: string;
  church: string;
  name: string;
  subtitle: string;
  id: string;
  detail: string;
  footerLeft: string;
  footerRight: string;
  photoDataUrl: string;
  accent: string;
};

type SchoolClass = {
  id: string;
  name: string;
  teacher: string;
  students: number;
  nextLesson: string;
  notices: Notice[];
};

type MinistryRecord = {
  id: string;
  name: string;
  leader: string;
  assistant: string;
  meetingDay: string;
  volunteers: number;
  status: "Ativo" | "Em formacao" | "Pausado";
  notes: string;
};

type AuditItem = {
  id: string;
  action: string;
  when: string;
};

type AppData = {
  careRequests: CareRequest[];
  events: ChurchEvent[];
  notices: Notice[];
  mural: MuralItem[];
  users: AccessUser[];
  members: MemberRecord[];
  kids: KidRecord[];
  schoolClasses: SchoolClass[];
  discipleshipClasses: SchoolClass[];
  ministries: MinistryRecord[];
  audit: AuditItem[];
  notificationReadIds: string[];
};

type RemoteAppStateResponse = {
  payload?: Partial<AppData> | null;
  error?: string;
};

const storageKey = "igreja-gestao-local-v1";

const modules: { key: ModuleKey; label: string; short: string }[] = [
  { key: "overview", label: "Visao geral", short: "Painel" },
  { key: "users", label: "Usuarios e acessos", short: "Acessos" },
  { key: "members", label: "Membros", short: "Membros" },
  { key: "kids", label: "Area Kids", short: "Kids" },
  { key: "events", label: "Agenda", short: "Agenda" },
  { key: "ministries", label: "Ministerios", short: "Ministerios" },
  { key: "notices", label: "Comunicados", short: "Avisos" },
  { key: "messages", label: "Comunicacao", short: "Mensagens" },
  { key: "mural", label: "Mural", short: "Mural" },
  { key: "pastoral", label: "Atendimento pastoral", short: "Pastoral" },
  { key: "school", label: "Escola Biblica", short: "EBD" },
  { key: "discipleship", label: "Discipulado", short: "Discipulado" },
  { key: "reports", label: "Relatorios", short: "Relatorios" },
  { key: "settings", label: "Configuracoes", short: "Config" },
];

const memberVisibleModuleKeys: ModuleKey[] = [
  "overview",
  "members",
  "kids",
  "events",
  "notices",
  "mural",
  "pastoral",
  "school",
  "discipleship",
];

const statusFlow: CareStatus[] = ["Pendente", "Em analise", "Agendado", "Concluido"];

const initialData: AppData = {
  careRequests: [
    {
      id: "care-1",
      member: "Ana Ribeiro",
      phone: "(11) 98888-1201",
      category: "Aconselhamento familiar",
      status: "Agendado",
      responsible: "Pr. Marcos",
      scheduleDate: "2026-09-04",
      scheduleTime: "19:30",
      summary: "Solicitou conversa com a lideranca sobre acompanhamento familiar.",
      returnNote: "Confirmar presenca um dia antes e registrar encaminhamento.",
      createdAt: "2026-09-01T18:20:00.000Z",
      updatedAt: "2026-09-02T12:10:00.000Z",
    },
    {
      id: "care-2",
      member: "Carlos Lima",
      phone: "(21) 97777-5402",
      category: "Pedido de visita",
      status: "Pendente",
      responsible: "",
      scheduleDate: "",
      scheduleTime: "",
      summary: "Pediu visita pastoral para esta semana.",
      returnNote: "",
      createdAt: "2026-09-02T09:00:00.000Z",
      updatedAt: "2026-09-02T09:00:00.000Z",
    },
  ],
  events: [
    {
      id: "event-1",
      title: "Culto da familia",
      date: "2026-09-06",
      time: "19:00",
      ministry: "Todos",
      location: "Templo principal",
      responsible: "Pr. Marcos",
      status: "Confirmado",
    },
    {
      id: "event-2",
      title: "Congresso de jovens",
      date: "2026-09-12",
      time: "18:30",
      ministry: "Jovens",
      location: "Auditorio",
      responsible: "Lider Ana",
      status: "Programado",
    },
    {
      id: "event-3",
      title: "Escola Biblica",
      date: "2026-09-13",
      time: "09:00",
      ministry: "EBD",
      location: "Salas de ensino",
      responsible: "Coord. EBD",
      status: "Programado",
    },
  ],
  notices: [
    {
      id: "notice-1",
      title: "Escala de setembro disponivel",
      body: "Lideres ja podem conferir e ajustar a escala mensal.",
      status: "Publicado",
      audience: "Lideres",
      channel: "App",
      retentionDays: 7,
      expiresAt: "2026-09-09",
    },
    {
      id: "notice-2",
      title: "Cadastro de novos alunos EBD",
      body: "Secretaria deve revisar as turmas antes de domingo.",
      status: "Publicado",
      audience: "Secretaria e EBD",
      channel: "Todos",
      retentionDays: 7,
      expiresAt: "2026-09-09",
    },
  ],
  mural: [
    {
      id: "mural-1",
      title: "Campanha de arrecadacao",
      category: "Acao social",
      published: true,
      featured: true,
      expiresAt: "2026-09-20",
      imageDataUrl: "",
      bannerUrl: "",
      socialUrl: "https://instagram.com/",
    },
    {
      id: "mural-2",
      title: "Encontro de casais",
      category: "Familia",
      published: true,
      featured: false,
      expiresAt: "2026-09-18",
      imageDataUrl: "",
      bannerUrl: "",
      socialUrl: "",
    },
    {
      id: "mural-3",
      title: "Inscricoes para batismo",
      category: "Secretaria",
      published: false,
      featured: false,
      expiresAt: "2026-09-30",
      imageDataUrl: "",
      bannerUrl: "",
      socialUrl: "",
    },
  ],
  users: [
    {
      id: "user-1",
      name: "Mariana Silva",
      email: "mariana@igreja.com",
      role: "Administrador",
      status: "Ativo",
    },
    {
      id: "user-2",
      name: "Pr. Marcos",
      email: "marcos@igreja.com",
      role: "Lider",
      status: "Ativo",
    },
  ],
  members: [
    {
      id: "member-1",
      fullName: "Ana Ribeiro",
      phone: "(11) 98888-1201",
      email: "ana@igreja.com",
      status: "Membro ativo",
      memberType: "Membro",
      role: "Lider de familia",
      ministry: "Familia",
      schoolClassId: "class-adults",
      discipleshipClassId: "",
      photoDataUrl: "",
      birthDate: "1991-04-12",
      maritalStatus: "Casado(a)",
      address: "Rua das Flores, 120",
      congregation: "Sede",
      previousChurch: "",
      waterBaptized: true,
      holySpiritBaptized: true,
      joinedAt: "2021-03-14",
      notes: "Acompanha novos casais e participa da recepcao.",
    },
    {
      id: "member-2",
      fullName: "Carlos Lima",
      phone: "(21) 97777-5402",
      email: "carlos@igreja.com",
      status: "Visitante",
      memberType: "Visitante",
      role: "Sem funcao definida",
      ministry: "Recepcao",
      schoolClassId: "",
      discipleshipClassId: "discipleship-new",
      photoDataUrl: "",
      birthDate: "1988-10-08",
      maritalStatus: "Solteiro(a)",
      address: "Av. Central, 900",
      congregation: "Sede",
      previousChurch: "",
      waterBaptized: false,
      holySpiritBaptized: false,
      joinedAt: "2026-08-22",
      notes: "Solicitou visita pastoral para conhecer melhor a igreja.",
    },
  ],
  kids: [
    {
      id: "kid-1",
      childName: "Livia Ribeiro",
      birthDate: "2018-09-07",
      ageGroup: "Kids",
      className: "Kids 6 a 8",
      photoDataUrl: "",
      allergies: "Sem alergias informadas",
      notes: "Autorizada para atividades em sala e apresentacoes.",
      guardianName: "Ana Ribeiro",
      guardianPhone: "(11) 98888-1201",
      guardianEmail: "ana@igreja.com",
      relationship: "Mae",
      authorizedPickup: "Ana Ribeiro e Paulo Ribeiro",
      consentImage: true,
      joinedAt: "2026-02-10",
    },
    {
      id: "kid-2",
      childName: "Miguel Lima",
      birthDate: "2020-09-21",
      ageGroup: "Maternal",
      className: "Maternal",
      photoDataUrl: "",
      allergies: "Alergia a amendoim",
      notes: "Avisar responsavel antes de lanche coletivo.",
      guardianName: "Carlos Lima",
      guardianPhone: "(21) 97777-5402",
      guardianEmail: "carlos@igreja.com",
      relationship: "Pai",
      authorizedPickup: "Carlos Lima",
      consentImage: false,
      joinedAt: "2026-08-22",
    },
  ],
  schoolClasses: [
    {
      id: "class-adults",
      name: "Classe adultos",
      teacher: "Pr. Marcos",
      students: 34,
      nextLesson: "Familia, discipulado e servico",
      notices: [
        {
          id: "school-notice-1",
          title: "Levar Biblia e caderno",
          body: "A proxima aula tera leitura dirigida em grupos.",
          status: "Publicado",
          audience: "Classe adultos",
          channel: "App",
          retentionDays: 7,
          expiresAt: "2026-09-09",
        },
      ],
    },
    {
      id: "class-youth",
      name: "Classe jovens",
      teacher: "Lider Ana",
      students: 22,
      nextLesson: "Identidade crista",
      notices: [],
    },
    {
      id: "class-new",
      name: "Classe novos convertidos",
      teacher: "Diac. Paulo",
      students: 12,
      nextLesson: "Primeiros passos da fe",
      notices: [],
    },
  ],
  discipleshipClasses: [
    {
      id: "discipleship-new",
      name: "Discipulado 1",
      teacher: "Pr. Marcos",
      students: 16,
      nextLesson: "Fundamentos da fe crista",
      notices: [
        {
          id: "discipleship-notice-1",
          title: "Encontro de acompanhamento",
          body: "Trazer Biblia e anotacoes da ultima aula para revisao em grupo.",
          status: "Publicado",
          audience: "Discipulado 1",
          channel: "App",
          retentionDays: 7,
          expiresAt: "2026-09-09",
        },
      ],
    },
    {
      id: "discipleship-leaders",
      name: "Discipulado 2",
      teacher: "Lider Ana",
      students: 8,
      nextLesson: "Acompanhamento e cuidado",
      notices: [],
    },
    {
      id: "discipleship-baptism",
      name: "Preparacao para o batismo",
      teacher: "Diac. Paulo",
      students: 10,
      nextLesson: "Nova vida em Cristo",
      notices: [],
    },
  ],
  ministries: [
    {
      id: "ministry-1",
      name: "Louvor",
      leader: "Ana Ribeiro",
      assistant: "Bruno Alves",
      meetingDay: "Quinta-feira",
      volunteers: 14,
      status: "Ativo",
      notes: "Revisar escala mensal e ensaio geral.",
    },
    {
      id: "ministry-2",
      name: "Jovens",
      leader: "Lider Ana",
      assistant: "Rafael Costa",
      meetingDay: "Sabado",
      volunteers: 22,
      status: "Ativo",
      notes: "Planejar encontro mensal e discipulado.",
    },
    {
      id: "ministry-3",
      name: "Intercessao",
      leader: "Marta Souza",
      assistant: "",
      meetingDay: "Terca-feira",
      volunteers: 9,
      status: "Em formacao",
      notes: "Abrir novos horarios de oracao.",
    },
  ],
  audit: [
    { id: "audit-1", action: "Central de notificacoes criada", when: "2026-09-02T15:10:00.000Z" },
    { id: "audit-2", action: "Modulo de backup validado", when: "2026-09-02T14:42:00.000Z" },
  ],
  notificationReadIds: [],
};

const blankCare: Omit<CareRequest, "id" | "createdAt" | "updatedAt"> = {
  member: "",
  phone: "",
  category: "Aconselhamento",
  status: "Pendente",
  responsible: "",
  scheduleDate: "",
  scheduleTime: "",
  summary: "",
  returnNote: "",
};

const blankEvent: Omit<ChurchEvent, "id"> = {
  title: "",
  date: "",
  time: "",
  ministry: "Todos",
  location: "",
  responsible: "",
  status: "Programado",
};

const blankNotice: Omit<Notice, "id"> = {
  title: "",
  body: "",
  status: "Publicado",
  audience: "Toda igreja",
  channel: "Todos",
  retentionDays: 3,
  expiresAt: "",
};

const blankMinistry: Omit<MinistryRecord, "id"> = {
  name: "",
  leader: "",
  assistant: "",
  meetingDay: "",
  volunteers: 0,
  status: "Ativo",
  notes: "",
};

const blankUser: AccessUserForm = {
  name: "",
  email: "",
  password: "",
  role: "Lider",
  status: "Pendente",
};

const blankMember: Omit<MemberRecord, "id"> = {
  authUserId: "",
  fullName: "",
  phone: "",
  email: "",
  status: "Visitante",
  memberType: "Visitante",
  role: "",
  ministry: "",
  schoolClassId: "",
  discipleshipClassId: "",
  photoDataUrl: "",
  birthDate: "",
  maritalStatus: "Solteiro(a)",
  address: "",
  congregation: "",
  previousChurch: "",
  waterBaptized: false,
  holySpiritBaptized: false,
  joinedAt: "",
  notes: "",
};

const blankMemberCredential = {
  memberId: "",
  email: "",
  password: "",
};

const blankKid: Omit<KidRecord, "id"> = {
  childName: "",
  birthDate: "",
  ageGroup: "Kids",
  className: "",
  photoDataUrl: "",
  allergies: "",
  notes: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  relationship: "Responsavel",
  authorizedPickup: "",
  consentImage: false,
  joinedAt: "",
};

const blankMuralItem: Omit<MuralItem, "id"> = {
  title: "",
  category: "Secretaria",
  published: true,
  featured: false,
  expiresAt: "",
  imageDataUrl: "",
  bannerUrl: "",
  socialUrl: "",
};

const blankSchoolNotice = {
  classId: "class-adults",
  title: "",
  body: "",
};

const messageAudiences: MessageAudience[] = [
  "Todos os membros",
  "Aniversariantes da semana",
  "Aniversariantes do mes",
  "EBD",
  "Discipulado",
  "Ministerios",
  "Responsaveis Kids",
];

const messageTemplates: MessageTemplateItem[] = [
  {
    id: "birthday-blessing",
    label: "Aniversario - bencao biblica",
    text:
      "Feliz aniversario, {nome}! Que o Senhor te abencoe e te guarde; que Ele faca resplandecer o rosto sobre voce e te conceda paz. Com carinho, {igreja}.",
  },
  {
    id: "birthday-purpose",
    label: "Aniversario - proposito",
    text:
      "Parabens, {nome}! Hoje celebramos sua vida e oramos para que este novo ciclo seja cheio da presenca de Deus, sabedoria e novos testemunhos. {igreja}.",
  },
  {
    id: "ebd-reminder",
    label: "EBD - lembrete de aula",
    text: "Paz, {nome}! Passando para lembrar da nossa EBD. Sua presenca fortalece a classe e ajuda a igreja crescer na Palavra. {igreja}.",
  },
  {
    id: "ministry-call",
    label: "Ministerio - comunicado",
    text: "Paz, {nome}! Temos um comunicado importante para o ministerio. Por favor, confirme leitura e disponibilidade. {igreja}.",
  },
  {
    id: "general-invite",
    label: "Geral - convite",
    text: "Paz, {nome}! Voce e nossa familia estao convidados para participar da programacao da igreja. Sera uma alegria receber voces. {igreja}.",
  },
  {
    id: "kids-note",
    label: "Kids - responsaveis",
    text: "Paz, {nome}! Temos um comunicado da Area Kids. Confira as orientacoes e, se precisar, fale com a coordenacao. {igreja}.",
  },
];

function formatDate(value: string) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isExpiredDate(value: string) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T23:59:59`) < today;
}

function hasPersistedPayload(value: Partial<AppData> | null | undefined) {
  if (!value) return false;
  return Object.keys(value).some((key) => Array.isArray(value[key as keyof AppData]));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function birthdayDateThisYear(value: string) {
  if (!value) return null;
  const [, month, day] = value.split("-").map(Number);
  if (!month || !day) return null;

  const today = new Date();
  return new Date(today.getFullYear(), month - 1, day);
}

function birthdayLabel(value: string) {
  if (!value) return "Sem aniversario";
  const date = birthdayDateThisYear(value);
  if (!date) return "Sem aniversario";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(date);
}

function isBirthdayThisMonth(value: string) {
  const date = birthdayDateThisYear(value);
  if (!date) return false;
  return date.getMonth() === new Date().getMonth();
}

function isBirthdayThisWeek(value: string) {
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

function normalizeWhatsappPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function comparablePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^55/, "");
}

function accessRoleFromMetadata(value: unknown): AccessRole {
  if (value === "Administrador" || value === "ADMIN" || value === "admin") return "Administrador";
  if (value === "Lider" || value === "LEADER" || value === "leader") return "Lider";
  return "Membro";
}

function isAdministrativeRole(role: AccessRole) {
  return role === "Administrador" || role === "Lider";
}

function messageFor(text: string, recipientName: string) {
  return text.replaceAll("{nome}", recipientName).replaceAll("{igreja}", "Igreja Conectada");
}

function whatsappUrl(phone: string, text: string, recipientName: string) {
  const number = normalizeWhatsappPhone(phone);
  if (!number) return "#";
  return `https://wa.me/${number}?text=${encodeURIComponent(messageFor(text, recipientName))}`;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classNoticeWhatsappText(className: string, title: string, body: string) {
  return [
    `Paz, {nome}! Aviso para a classe ${className}.`,
    title ? `Tema: ${title}.` : "",
    body,
    "Igreja Conectada.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function escapeText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cardMarkup(card: DigitalCardData) {
  const initial = card.name.slice(0, 1).toUpperCase();
  const photo = card.photoDataUrl
    ? `<img src="${card.photoDataUrl}" alt="" />`
    : `<div class="avatar-fallback">${escapeText(initial)}</div>`;

  return `
    <article class="printable-card" style="--accent:${card.accent}">
      <div class="card-top">
        <span>${escapeText(card.title)}</span>
        <strong>${escapeText(card.church)}</strong>
      </div>
      <div class="card-body">
        <div class="card-photo">${photo}</div>
        <div>
          <h1>${escapeText(card.name)}</h1>
          <p>${escapeText(card.id)}</p>
          <p>${escapeText(card.subtitle)}</p>
          <p>${escapeText(card.detail)}</p>
        </div>
      </div>
      <div class="card-footer">
        <span>${escapeText(card.footerLeft)}</span>
        <span>${escapeText(card.footerRight)}</span>
      </div>
    </article>
  `;
}

function printDigitalCard(card: DigitalCardData) {
  const popup = window.open("", "_blank", "width=720,height=520");
  if (!popup) return;

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeText(card.name)} - carteirinha</title>
        <style>
          @page { size: A4; margin: 18mm; }
          * { box-sizing: border-box; }
          body { align-items: center; background: #eef3f8; display: flex; font-family: Arial, sans-serif; justify-content: center; margin: 0; min-height: 100vh; }
          .printable-card { background: linear-gradient(135deg, #07111f, #122d4c); border: 2px solid var(--accent); border-radius: 14px; color: white; overflow: hidden; width: 420px; }
          .card-top, .card-footer { align-items: center; background: color-mix(in srgb, var(--accent) 22%, transparent); display: flex; gap: 12px; justify-content: space-between; padding: 14px 16px; }
          .card-top span, .card-footer span { color: #cce0f4; font-size: 12px; font-weight: 800; }
          .card-top strong { color: var(--accent); font-size: 14px; }
          .card-body { align-items: center; display: flex; gap: 16px; padding: 18px; }
          .card-photo { align-items: center; border: 1px solid var(--accent); border-radius: 12px; display: flex; height: 92px; justify-content: center; overflow: hidden; width: 92px; }
          .card-photo img { height: 100%; object-fit: cover; width: 100%; }
          .avatar-fallback { color: var(--accent); font-size: 44px; font-weight: 900; }
          h1 { font-size: 22px; line-height: 1.1; margin: 0 0 8px; }
          p { color: #cce0f4; font-size: 13px; font-weight: 700; margin: 4px 0; }
        </style>
      </head>
      <body>${cardMarkup(card)}<script>window.onload = () => { window.print(); };</script></body>
    </html>
  `);
  popup.document.close();
}

function downloadDigitalCardImage(card: DigitalCardData) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="840" height="520" viewBox="0 0 840 520">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#07111f"/>
          <stop offset="1" stop-color="#122d4c"/>
        </linearGradient>
      </defs>
      <rect width="820" height="500" x="10" y="10" rx="28" fill="url(#bg)" stroke="${card.accent}" stroke-width="4"/>
      <rect width="820" height="86" x="10" y="10" rx="28" fill="${card.accent}" opacity="0.2"/>
      <text x="42" y="64" fill="#cce0f4" font-family="Arial" font-size="24" font-weight="700">${escapeText(card.title)}</text>
      <text x="560" y="64" fill="${card.accent}" font-family="Arial" font-size="24" font-weight="900">${escapeText(card.church)}</text>
      <rect x="46" y="148" width="150" height="150" rx="22" fill="#0d1c31" stroke="${card.accent}" stroke-width="2"/>
      <text x="104" y="246" fill="${card.accent}" font-family="Arial" font-size="76" font-weight="900">${escapeText(card.name.slice(0, 1).toUpperCase())}</text>
      <text x="230" y="174" fill="#ffffff" font-family="Arial" font-size="42" font-weight="900">${escapeText(card.name)}</text>
      <text x="230" y="222" fill="#cce0f4" font-family="Arial" font-size="24" font-weight="700">${escapeText(card.id)}</text>
      <text x="230" y="264" fill="#cce0f4" font-family="Arial" font-size="24" font-weight="700">${escapeText(card.subtitle)}</text>
      <text x="230" y="306" fill="#cce0f4" font-family="Arial" font-size="24" font-weight="700">${escapeText(card.detail)}</text>
      <rect width="820" height="78" x="10" y="432" rx="28" fill="${card.accent}" opacity="0.16"/>
      <text x="42" y="480" fill="#cce0f4" font-family="Arial" font-size="22" font-weight="700">${escapeText(card.footerLeft)}</text>
      <text x="560" y="480" fill="#cce0f4" font-family="Arial" font-size="22" font-weight="700">${escapeText(card.footerRight)}</text>
    </svg>
  `;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${card.name.toLowerCase().replace(/\s+/g, "-")}-carteirinha.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextStatus(status: CareStatus): CareStatus {
  const current = statusFlow.indexOf(status);
  return statusFlow[Math.min(current + 1, statusFlow.length - 1)];
}

function suggestedNextStep(request: CareRequest) {
  if (request.status === "Pendente") return "Definir responsavel";
  if (request.status === "Em analise") return "Agendar atendimento";
  if (request.status === "Agendado") return "Registrar retorno";
  return "Arquivado no historico";
}

function normalizeMember(member: Partial<MemberRecord>): MemberRecord {
  const status = member.status ?? "Visitante";
  const memberType =
    member.memberType ?? (status === "Visitante" ? "Visitante" : status === "Membro ativo" ? "Membro" : "Congregado");

  return {
    ...blankMember,
    ...member,
    id: member.id ?? uid("member"),
    status,
    memberType,
  };
}

function normalizeKid(kid: Partial<KidRecord>): KidRecord {
  return {
    ...blankKid,
    ...kid,
    id: kid.id ?? uid("kid"),
  };
}

function normalizeEvent(event: Partial<ChurchEvent>): ChurchEvent {
  return {
    ...blankEvent,
    ...event,
    id: event.id ?? uid("event"),
  };
}

function normalizeNotice(notice: Partial<Notice>): Notice {
  return {
    ...blankNotice,
    ...notice,
    id: notice.id ?? uid("notice"),
    retentionDays: notice.retentionDays ?? 3,
    expiresAt: notice.expiresAt ?? dateAfterDays(notice.retentionDays ?? 3),
  };
}

function normalizeMinistry(ministry: Partial<MinistryRecord>): MinistryRecord {
  return {
    ...blankMinistry,
    ...ministry,
    id: ministry.id ?? uid("ministry"),
  };
}

function normalizeMuralItem(item: Partial<MuralItem>): MuralItem {
  return {
    ...blankMuralItem,
    ...item,
    id: item.id ?? uid("mural"),
  };
}

function normalizeDiscipleshipClasses(classes: SchoolClass[] | undefined) {
  const currentClasses = classes ?? initialData.discipleshipClasses;
  const byId = new Map(currentClasses.map((item) => [item.id, item]));

  return initialData.discipleshipClasses.map((template) => {
    const current = byId.get(template.id);
    return {
      ...template,
      teacher: current?.teacher ?? template.teacher,
      students: current?.students ?? template.students,
      nextLesson: current?.nextLesson ?? template.nextLesson,
      notices: current?.notices ?? template.notices,
    };
  });
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Imagem invalida."));
    };
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel processar a imagem."));
    image.src = dataUrl;
  });
}

async function optimizeMuralImage(file: File): Promise<MuralImageResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const originalDataUrl = await readImageFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const maxSide = 1000;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nao foi possivel preparar a imagem.");

  context.drawImage(image, 0, 0, width, height);
  const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const chosenDataUrl = optimizedDataUrl.length < originalDataUrl.length ? optimizedDataUrl : originalDataUrl;
  const approxKb = Math.round((chosenDataUrl.length * 3) / 4 / 1024);

  if (approxKb > 450) {
    throw new Error("Imagem muito grande. Escolha uma imagem menor ou use um link de imagem.");
  }

  return {
    dataUrl: chosenDataUrl,
    message: `Imagem carregada e otimizada (${approxKb} KB).`,
  };
}

function normalizeAppData(value: Partial<AppData>): AppData {
  return {
    ...initialData,
    ...value,
    careRequests: value.careRequests ?? initialData.careRequests,
    events: (value.events ?? initialData.events).map((event) => normalizeEvent(event)),
    notices: (value.notices ?? initialData.notices).map((notice) => normalizeNotice(notice)).filter((notice) => !isExpiredDate(notice.expiresAt)),
    mural: (value.mural ?? initialData.mural).map((item) => normalizeMuralItem(item)),
    users: value.users ?? initialData.users,
    members: (value.members ?? initialData.members).map((member) => normalizeMember(member)),
    kids: (value.kids ?? initialData.kids).map((kid) => normalizeKid(kid)),
    schoolClasses: value.schoolClasses ?? initialData.schoolClasses,
    discipleshipClasses: normalizeDiscipleshipClasses(value.discipleshipClasses),
    ministries: (value.ministries ?? initialData.ministries).map((ministry) => normalizeMinistry(ministry)),
    audit: value.audit ?? initialData.audit,
    notificationReadIds: value.notificationReadIds ?? initialData.notificationReadIds,
  };
}

function createLocalBackupData(data: AppData): AppData {
  return {
    ...data,
    mural: data.mural.map((item) => ({ ...item, imageDataUrl: "" })),
    members: data.members.map((member) => ({ ...member, photoDataUrl: "" })),
    kids: data.kids.map((kid) => ({ ...kid, photoDataUrl: "" })),
  };
}

export default function Home() {
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef("");
  const [hasSession, setHasSession] = useState(false);
  const [sessionUserId, setSessionUserId] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionRole, setSessionRole] = useState<AccessRole>("Administrador");
  const [accessMode, setAccessMode] = useState<AccessMode>("login");
  const [accessMessage, setAccessMessage] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [data, setData] = useState<AppData>(() => {
    if (typeof window === "undefined") return initialData;

    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return initialData;

    try {
      return normalizeAppData(JSON.parse(stored) as Partial<AppData>);
    } catch {
      window.localStorage.removeItem(storageKey);
      return initialData;
    }
  });
  const [careForm, setCareForm] = useState(blankCare);
  const [eventForm, setEventForm] = useState(blankEvent);
  const [noticeForm, setNoticeForm] = useState(blankNotice);
  const [ministryForm, setMinistryForm] = useState(blankMinistry);
  const [userForm, setUserForm] = useState(blankUser);
  const [memberForm, setMemberForm] = useState(blankMember);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberCredentialForm, setMemberCredentialForm] = useState(blankMemberCredential);
  const [kidForm, setKidForm] = useState(blankKid);
  const [muralForm, setMuralForm] = useState(blankMuralItem);
  const [muralImageMessage, setMuralImageMessage] = useState("");
  const [schoolNoticeForm, setSchoolNoticeForm] = useState(blankSchoolNotice);
  const [discipleshipNoticeForm, setDiscipleshipNoticeForm] = useState({ ...blankSchoolNotice, classId: "discipleship-new" });
  const [selectedRequestId, setSelectedRequestId] = useState("care-1");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [messageAudience, setMessageAudience] = useState<MessageAudience>("Todos os membros");
  const [messageTemplateId, setMessageTemplateId] = useState("general-invite");
  const [messageText, setMessageText] = useState(messageTemplates[4].text);
  const [remoteMessageTemplates, setRemoteMessageTemplates] = useState<MessageTemplateItem[]>([]);
  const [remoteStateReady, setRemoteStateReady] = useState(!isSupabaseConfigured());
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured() ? "Supabase pronto para login." : "Modo local: configure o Supabase no Vercel.");

  useEffect(() => {
    if (window.location.search.includes("cadastro=novo")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      let statusMessage = "O navegador esta sem espaco local. Os cadastros continuam sendo enviados para a base quando houver sessao ativa.";
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(createLocalBackupData(data)));
        statusMessage = "Backup local salvo sem imagens pesadas. A base Supabase continua preservando os cadastros.";
      } catch {
        // Mantem a tela funcionando mesmo quando o navegador recusa qualquer novo backup local.
      }
      window.setTimeout(() => setSyncStatus(statusMessage), 0);
    }
  }, [data]);

  useEffect(() => {
    if (!hasSession || !isSupabaseConfigured()) return;

    let cancelled = false;

    async function loadRemoteState() {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setRemoteStateReady(true);
        return;
      }

      const response = await fetch("/api/admin/app-state", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as RemoteAppStateResponse;

      if (cancelled) return;

      if (!response.ok) {
        setRemoteStateReady(true);
        setSyncStatus(result.error ?? "Nao foi possivel carregar cadastros da base.");
        return;
      }

      if (hasPersistedPayload(result.payload)) {
        const remoteData = normalizeAppData(result.payload ?? {});
        lastSavedPayloadRef.current = JSON.stringify(remoteData);
        setData(remoteData);
        setSyncStatus("Cadastros carregados da base Supabase.");
      } else {
        setSyncStatus("Base pronta. Cadastros deste painel serao preservados no Supabase.");
      }

      setRemoteStateReady(true);
    }

    void loadRemoteState();

    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  useEffect(() => {
    if (!hasSession || !isSupabaseConfigured() || !remoteStateReady) return;

    const payload = JSON.stringify(data);
    if (payload === lastSavedPayloadRef.current) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setSyncStatus("Sessao expirada. Entre novamente para salvar cadastros na base.");
        return;
      }

      const response = await fetch("/api/admin/app-state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payload: data }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setSyncStatus(result.error ?? "Nao foi possivel salvar cadastros na base.");
        return;
      }

      lastSavedPayloadRef.current = payload;
      setSyncStatus("Cadastros salvos na base Supabase.");
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [data, hasSession, remoteStateReady]);

  useEffect(() => {
    const cleanup = window.setTimeout(() => {
      setData((current) => {
        const activeItems = current.notices.filter((notice) => !isExpiredDate(notice.expiresAt));
        if (activeItems.length === current.notices.length) return current;

        return {
          ...current,
          notices: activeItems,
          audit: [{ id: uid("audit"), action: "Avisos expirados removidos automaticamente", when: new Date().toISOString() }, ...current.audit].slice(0, 12),
        };
      });
    }, 0);

    return () => window.clearTimeout(cleanup);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase
      .from("message_templates")
      .select("id,label,body,audience,is_birthday")
      .then(({ data: templates, error }) => {
        if (error) {
          setSyncStatus("Supabase conectado, aguardando login para sincronizar dados.");
          return;
        }

        if (templates?.length) {
          const mappedTemplates = templates.map((template) => ({
              id: template.id,
              label: template.label,
              text: template.body,
              audience: template.audience,
              isBirthday: template.is_birthday,
            }));
          const defaultTemplate = mappedTemplates.find((template) => template.id === "general_invite") ?? mappedTemplates[0];

          setRemoteMessageTemplates(mappedTemplates);
          setMessageTemplateId(defaultTemplate.id);
          setMessageText(defaultTemplate.text);
          setSyncStatus("Modelos de mensagem carregados do Supabase.");
        }
      });
  }, []);

  const normalizedSessionEmail = normalizeEmail(sessionEmail);
  const currentAccessUser = useMemo(
    () => data.users.find((user) => normalizeEmail(user.email) === normalizedSessionEmail),
    [data.users, normalizedSessionEmail],
  );
  const currentAccessRole = currentAccessUser?.role ?? sessionRole;
  const isAdminView = isAdministrativeRole(currentAccessRole);
  const currentMember = useMemo(
    () =>
      data.members.find(
        (member) =>
          (sessionUserId && member.authUserId === sessionUserId) ||
          (normalizedSessionEmail && normalizeEmail(member.email) === normalizedSessionEmail),
      ),
    [data.members, normalizedSessionEmail, sessionUserId],
  );
  const currentMemberPhone = comparablePhone(currentMember?.phone ?? "");
  const visibleModules = useMemo(
    () => (isAdminView ? modules : modules.filter((module) => memberVisibleModuleKeys.includes(module.key))),
    [isAdminView],
  );
  const visibleMembers = useMemo(
    () => (isAdminView ? data.members : currentMember ? [currentMember] : []),
    [currentMember, data.members, isAdminView],
  );
  const visibleKids = useMemo(
    () =>
      isAdminView
        ? data.kids
        : data.kids.filter((kid) => {
            const guardianEmailMatches = normalizedSessionEmail && normalizeEmail(kid.guardianEmail) === normalizedSessionEmail;
            const guardianPhoneMatches = currentMemberPhone && comparablePhone(kid.guardianPhone) === currentMemberPhone;
            return guardianEmailMatches || guardianPhoneMatches;
          }),
    [currentMemberPhone, data.kids, isAdminView, normalizedSessionEmail],
  );
  const visibleCareRequests = useMemo(
    () =>
      isAdminView
        ? data.careRequests
        : data.careRequests.filter((request) => {
            const requestPhoneMatches = currentMemberPhone && comparablePhone(request.phone) === currentMemberPhone;
            const requestMemberMatches = currentMember && normalizeSearchText(request.member) === normalizeSearchText(currentMember.fullName);
            return requestPhoneMatches || requestMemberMatches;
          }),
    [currentMember, currentMemberPhone, data.careRequests, isAdminView],
  );
  const selectedRequest = visibleCareRequests.find((request) => request.id === selectedRequestId) ?? visibleCareRequests[0];
  const profileName = currentMember?.fullName ?? currentAccessUser?.name ?? (sessionEmail ? sessionEmail.split("@")[0] : "Usuario");
  const profileInitial = profileName.slice(0, 1).toUpperCase() || "U";

  const notifications = useMemo(() => {
    const pendingCare = visibleCareRequests
      .filter((request) => request.status !== "Concluido")
      .map((request) => ({
        id: `care-${request.id}-${request.status}`,
        title: `${request.member}: ${suggestedNextStep(request)}`,
        body: request.category,
        module: "pastoral" as ModuleKey,
      }));

    const upcomingEvents = data.events.slice(0, 3).map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      body: `${formatDate(event.date)} - ${event.ministry}`,
      module: "events" as ModuleKey,
    }));

    const publishedMural = data.mural
      .filter((item) => item.published)
      .map((item) => ({
        id: `mural-${item.id}`,
        title: item.title,
        body: item.featured ? "Destaque no mural" : item.category,
        module: "mural" as ModuleKey,
      }));

    return [...pendingCare, ...upcomingEvents, ...publishedMural];
  }, [data.events, data.mural, visibleCareRequests]);

  const unreadCount = notifications.filter((notice) => !data.notificationReadIds.includes(notice.id)).length;
  const activeNotices = data.notices.filter((notice) => !isExpiredDate(notice.expiresAt));
  const monthlyBirthdays = data.members.filter((member) => isBirthdayThisMonth(member.birthDate));
  const weeklyBirthdays = monthlyBirthdays.filter((member) => isBirthdayThisWeek(member.birthDate));
  const monthlyKidsBirthdays = data.kids.filter((kid) => isBirthdayThisMonth(kid.birthDate));
  const canCreateUser = isAdminView && Boolean(userForm.name.trim() && userForm.email.trim() && userForm.password.trim().length >= 6);
  const canCreateMember = Boolean(memberForm.fullName.trim() && memberForm.phone.trim()) && (isAdminView || editingMemberId === currentMember?.id);
  const canSaveMemberAccess = Boolean(
    isAdminView &&
      memberCredentialForm.memberId &&
      memberCredentialForm.email.trim() &&
      (!memberCredentialForm.password.trim() || memberCredentialForm.password.trim().length >= 6),
  );
  const canCreateKid = isAdminView && Boolean(kidForm.childName.trim() && kidForm.guardianName.trim() && kidForm.guardianPhone.trim());
  const canCreateMuralItem = isAdminView && Boolean(muralForm.title.trim() && muralForm.expiresAt);
  const canCreateSchoolNotice = isAdminView && Boolean(schoolNoticeForm.classId && schoolNoticeForm.title.trim() && schoolNoticeForm.body.trim());
  const canCreateDiscipleshipNotice = Boolean(
    isAdminView && discipleshipNoticeForm.classId && discipleshipNoticeForm.title.trim() && discipleshipNoticeForm.body.trim(),
  );
  const canCreateEvent = isAdminView && Boolean(eventForm.title.trim() && eventForm.date);
  const canCreateNotice = isAdminView && Boolean(noticeForm.title.trim() && noticeForm.body.trim());
  const canCreateMinistry = isAdminView && Boolean(ministryForm.name.trim() && ministryForm.leader.trim());
  const availableMessageTemplates = remoteMessageTemplates.length ? remoteMessageTemplates : messageTemplates;
  const messageRecipients = useMemo<MessageRecipient[]>(() => {
    const memberRecipients = data.members
      .filter((member) => normalizeWhatsappPhone(member.phone))
      .map((member) => ({
        id: member.id,
        name: member.fullName,
        phone: member.phone,
        group: member.ministry || member.memberType,
      }));

    if (messageAudience === "Todos os membros") return memberRecipients;
    if (messageAudience === "Aniversariantes da semana") {
      return weeklyBirthdays
        .filter((member) => normalizeWhatsappPhone(member.phone))
        .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: birthdayLabel(member.birthDate) }));
    }
    if (messageAudience === "Aniversariantes do mes") {
      return monthlyBirthdays
        .filter((member) => normalizeWhatsappPhone(member.phone))
        .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: birthdayLabel(member.birthDate) }));
    }
    if (messageAudience === "EBD") {
      return memberRecipients.filter((recipient) => /ebd|biblica|professor/i.test(recipient.group));
    }
    if (messageAudience === "Discipulado") {
      return memberRecipients.filter((recipient) => /discipulado|discipulador|novo convertido|batismo/i.test(recipient.group));
    }
    if (messageAudience === "Ministerios") {
      return memberRecipients.filter((recipient) => Boolean(recipient.group && recipient.group !== "Visitante"));
    }
    return data.kids
      .filter((kid) => normalizeWhatsappPhone(kid.guardianPhone))
      .map((kid) => ({
        id: kid.id,
        name: kid.guardianName,
        phone: kid.guardianPhone,
        group: kid.childName,
      }));
  }, [data.kids, data.members, messageAudience, monthlyBirthdays, weeklyBirthdays]);

  function classWhatsappRecipients(classRecord: SchoolClass, area: "EBD" | "Discipulado") {
    const className = classRecord.name;
    const classText = normalizeSearchText(className);
    const classWords = classText.split(/\s+/).filter((word) => word.length > 3);
    const areaWords =
      area === "EBD"
        ? ["ebd", "escola biblica", "biblica", "professor"]
        : ["discipulado", "discipulado 1", "discipulado 2", "discipulador", "novo convertido", "novos convertidos", "batismo"];

    return data.members
      .filter((member) => normalizeWhatsappPhone(member.phone))
      .filter((member) => {
        const memberText = normalizeSearchText(
          [member.fullName, member.status, member.memberType, member.role, member.ministry, member.notes].join(" "),
        );
        const matchesEnrollment = area === "EBD" ? member.schoolClassId === classRecord.id : member.discipleshipClassId === classRecord.id;
        const matchesArea = areaWords.some((word) => memberText.includes(word));
        const matchesClass = classWords.some((word) => memberText.includes(word));
        return matchesEnrollment || matchesArea || matchesClass;
      })
      .map((member) => ({
        id: member.id,
        name: member.fullName,
        phone: member.phone,
        group: className,
      }));
  }

  function openClassWhatsapp(classRecord: SchoolClass, title: string, body: string, area: "EBD" | "Discipulado") {
    if (!requireAdministrativeAccess(`enviar WhatsApp da ${area}`)) return;

    const recipients = classWhatsappRecipients(classRecord, area);
    const className = classRecord.name;
    const text = classNoticeWhatsappText(className, title, body);

    if (!recipients.length || !text.trim()) {
      setSyncStatus(`Nenhum contato de WhatsApp encontrado para ${className}. Vincule membros pela funcao, ministerio ou observacoes.`);
      return;
    }

    recipients.slice(0, 12).forEach((recipient, index) => {
      window.setTimeout(() => {
        window.open(whatsappUrl(recipient.phone, text, recipient.name), "_blank", "noopener,noreferrer");
      }, index * 250);
    });
    setSyncStatus(`Envio por WhatsApp preparado para ${Math.min(recipients.length, 12)} contatos de ${className}.`);
    log(`WhatsApp preparado para ${Math.min(recipients.length, 12)} contatos de ${className}`);
  }

  function classNameById(classes: SchoolClass[], classId: string) {
    return classes.find((item) => item.id === classId)?.name ?? "";
  }

  function readPhoto(event: ChangeEvent<HTMLInputElement>, onReady: (photoDataUrl: string) => void) {
    const file = event.target.files?.[0];
    if (!file) return;

    void readImageFileAsDataUrl(file).then(onReady).catch(() => {
      setSyncStatus("Nao foi possivel carregar a imagem selecionada.");
    });
  }

  async function readMuralImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMuralImageMessage("Preparando imagem...");

    try {
      const result = await optimizeMuralImage(file);
      setMuralForm((form) => ({ ...form, imageDataUrl: result.dataUrl }));
      setMuralImageMessage(result.message);
    } catch (error) {
      setMuralForm((form) => ({ ...form, imageDataUrl: "" }));
      setMuralImageMessage(error instanceof Error ? error.message : "Nao foi possivel carregar a imagem.");
    }
  }

  function log(action: string) {
    setData((current) => ({
      ...current,
      audit: [{ id: uid("audit"), action, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function requireAdministrativeAccess(action: string) {
    if (isAdminView) return true;
    setSyncStatus(`Acesso de membro: ${action} esta disponivel apenas para administradores e lideres.`);
    return false;
  }

  function createCareRequest() {
    const memberName = isAdminView ? careForm.member.trim() : currentMember?.fullName ?? profileName;
    const memberPhone = isAdminView ? careForm.phone.trim() : currentMember?.phone ?? careForm.phone.trim();
    if (!memberName || !careForm.summary.trim()) return;

    const now = new Date().toISOString();
    const request: CareRequest = {
      ...careForm,
      member: memberName,
      phone: memberPhone,
      id: uid("care"),
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      careRequests: [request, ...current.careRequests],
      audit: [{ id: uid("audit"), action: `Pedido pastoral criado para ${request.member}`, when: now }, ...current.audit],
    }));
    setSelectedRequestId(request.id);
    setCareForm(isAdminView ? blankCare : { ...blankCare, member: memberName, phone: memberPhone });
    setActiveModule("pastoral");
  }

  function updateCareRequest(id: string, patch: Partial<CareRequest>, action: string) {
    if (!requireAdministrativeAccess(action)) return;

    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      careRequests: current.careRequests.map((request) =>
        request.id === id ? { ...request, ...patch, updatedAt: now } : request,
      ),
      audit: [{ id: uid("audit"), action, when: now }, ...current.audit].slice(0, 12),
    }));
  }

  function toggleMural(id: string, field: "published" | "featured") {
    if (!requireAdministrativeAccess("alterar mural")) return;

    setData((current) => ({
      ...current,
      mural: current.mural.map((item) => (item.id === id ? { ...item, [field]: !item[field] } : item)),
      audit: [{ id: uid("audit"), action: "Mural atualizado", when: new Date().toISOString() }, ...current.audit],
    }));
  }

  async function createUser() {
    if (!requireAdministrativeAccess("criar usuarios")) return;
    if (!userForm.name.trim() || !userForm.email.trim()) return;

    const now = new Date().toISOString();
    const user: AccessUser = {
      id: uid("user"),
      name: userForm.name,
      email: userForm.email,
      role: userForm.role,
      status: userForm.status,
    };

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setSyncStatus("Entre com uma conta Supabase antes de criar novos acessos.");
        return;
      }

      const response = await fetch("/api/admin/access-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userForm),
      });
      const result = (await response.json()) as { id?: string; error?: string };

      if (!response.ok) {
        setSyncStatus(result.error ?? "Nao foi possivel criar o acesso no Supabase.");
        return;
      }

      user.id = result.id ?? user.id;
      setSyncStatus(`Acesso Supabase criado para ${user.name}.`);
    }

    setData((current) => ({
      ...current,
      users: [user, ...current.users],
      audit: [{ id: uid("audit"), action: `Usuario criado para ${user.name}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setUserForm(blankUser);
  }

  async function updateAccessUserStatus(user: AccessUser, status: AccessUser["status"]) {
    if (!requireAdministrativeAccess("alterar acessos")) return;
    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setSyncStatus("Entre com uma conta Supabase antes de alterar acessos.");
        return;
      }

      const response = await fetch("/api/admin/access-users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          currentEmail: user.email,
          name: user.name,
          email: user.email,
          role: user.role,
          status,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setSyncStatus(result.error ?? "Nao foi possivel alterar o acesso no Supabase.");
        return;
      }
    }

    setData((current) => ({
      ...current,
      users: current.users.map((item) => (item.id === user.id ? { ...item, status } : item)),
      audit: [{ id: uid("audit"), action: `Acesso ${status.toLowerCase()}: ${user.name}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setSyncStatus(status === "Bloqueado" ? `Acesso de ${user.name} cancelado.` : `Acesso de ${user.name} reativado.`);
  }

  async function deleteAccessUser(user: AccessUser) {
    if (!requireAdministrativeAccess("excluir acessos")) return;
    if (!window.confirm(`Excluir definitivamente o acesso de ${user.name}?`)) return;

    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setSyncStatus("Entre com uma conta Supabase antes de excluir acessos.");
        return;
      }

      const response = await fetch("/api/admin/access-users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setSyncStatus(result.error ?? "Nao foi possivel excluir o acesso no Supabase.");
        return;
      }
    }

    setData((current) => ({
      ...current,
      users: current.users.filter((item) => item.id !== user.id),
      members: current.members.map((member) =>
        member.authUserId === user.id || member.email.toLowerCase() === user.email.toLowerCase()
          ? { ...member, authUserId: "" }
          : member,
      ),
      audit: [{ id: uid("audit"), action: `Acesso excluido: ${user.name}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setSyncStatus(`Acesso de ${user.name} excluido.`);
  }

  function createMember() {
    if (!memberForm.fullName.trim() || !memberForm.phone.trim()) return;
    if (!isAdminView && editingMemberId !== currentMember?.id) {
      setSyncStatus("Acesso de membro: voce pode atualizar apenas o seu proprio cadastro.");
      return;
    }

    const now = new Date().toISOString();
    const isEditing = Boolean(editingMemberId);
    const member: MemberRecord = { ...memberForm, id: editingMemberId ?? uid("member") };

    setData((current) => ({
      ...current,
      members: editingMemberId
        ? current.members.map((item) => (item.id === editingMemberId ? member : item))
        : [member, ...current.members],
      audit: [
        {
          id: uid("audit"),
          action: isEditing ? `Ficha atualizada: ${member.fullName}` : `Membro cadastrado: ${member.fullName}`,
          when: now,
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setMemberForm(blankMember);
    setEditingMemberId(null);
    setSyncStatus(isEditing ? `Ficha de ${member.fullName} atualizada.` : `Ficha de ${member.fullName} cadastrada.`);
  }

  function editMember(member: MemberRecord) {
    if (!isAdminView && member.id !== currentMember?.id) {
      setSyncStatus("Acesso de membro: somente o proprio cadastro pode ser editado.");
      return;
    }

    const { id, ...form } = member;
    setMemberForm(form);
    setEditingMemberId(id);
    setSyncStatus(`Editando ficha de ${member.fullName}.`);
    window.setTimeout(() => {
      document.getElementById("member-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("member-full-name")?.focus();
    }, 0);
  }

  function cancelMemberEdit() {
    setMemberForm(blankMember);
    setEditingMemberId(null);
  }

  function deleteMember(member: MemberRecord) {
    if (!requireAdministrativeAccess("excluir fichas de membros")) return;
    if (!window.confirm(`Excluir a ficha de ${member.fullName}?`)) return;

    setData((current) => ({
      ...current,
      members: current.members.filter((item) => item.id !== member.id),
      audit: [{ id: uid("audit"), action: `Ficha excluida: ${member.fullName}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));

    if (editingMemberId === member.id) {
      cancelMemberEdit();
    }

    if (memberCredentialForm.memberId === member.id) {
      setMemberCredentialForm(blankMemberCredential);
    }
  }

  function toggleMemberCredentials(member: MemberRecord) {
    if (!requireAdministrativeAccess("alterar login e senha de membros")) return;
    setMemberCredentialForm((form) =>
      form.memberId === member.id
        ? blankMemberCredential
        : {
            memberId: member.id,
            email: member.email,
            password: "",
          },
    );
  }

  function memberAccessMessage(member: MemberRecord) {
    return [
      "Ola, {nome}! Seu acesso ao Igreja Conectada foi preparado.",
      "Acesse: https://igrejaconectada-kappa.vercel.app",
      `Login: ${memberCredentialForm.email.trim() || member.email}`,
      `Senha: ${memberCredentialForm.password.trim() || "senha ja cadastrada"}`,
      "Acesse o sistema e altere sua senha se solicitado pela secretaria.",
    ].join("\n");
  }

  async function saveMemberAccess(member: MemberRecord) {
    if (!requireAdministrativeAccess("criar ou alterar login de membros")) return;
    if (!canSaveMemberAccess) return;

    const email = memberCredentialForm.email.trim().toLowerCase();
    const password = memberCredentialForm.password.trim();
    const now = new Date().toISOString();
    let authUserId = member.authUserId;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setSyncStatus("Entre com uma conta Supabase antes de alterar login e senha.");
        return;
      }

      const response = await fetch("/api/admin/access-users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: member.authUserId,
          currentEmail: member.email,
          name: member.fullName,
          email,
          password: password || undefined,
          role: "Membro",
          status: "Ativo",
        }),
      });
      const result = (await response.json()) as { id?: string; email?: string; error?: string; created?: boolean };

      if (!response.ok) {
        setSyncStatus(result.error ?? "Nao foi possivel salvar o acesso do membro.");
        return;
      }

      authUserId = result.id ?? authUserId;
      setSyncStatus(result.created ? `Login criado para ${member.fullName}.` : `Login atualizado para ${member.fullName}.`);
    }

    setData((current) => {
      const userId = authUserId ?? member.authUserId ?? uid("user");
      const accessUser: AccessUser = {
        id: userId,
        name: member.fullName,
        email,
        role: "Membro",
        status: "Ativo",
      };
      const hasUser = current.users.some((user) => user.id === userId || user.email.toLowerCase() === member.email.toLowerCase());

      return {
        ...current,
        members: current.members.map((item) => (item.id === member.id ? { ...item, email, authUserId } : item)),
        users: hasUser
          ? current.users.map((user) => (user.id === userId || user.email.toLowerCase() === member.email.toLowerCase() ? accessUser : user))
          : [accessUser, ...current.users],
        audit: [{ id: uid("audit"), action: `Login atualizado para ${member.fullName}`, when: now }, ...current.audit].slice(0, 12),
      };
    });

    setMemberCredentialForm((form) => ({ ...form, password: "" }));
  }

  function createKid() {
    if (!requireAdministrativeAccess("cadastrar Kids")) return;
    if (!canCreateKid) return;

    const now = new Date().toISOString();
    const kid: KidRecord = { ...kidForm, id: uid("kid") };

    setData((current) => ({
      ...current,
      kids: [kid, ...current.kids],
      audit: [{ id: uid("audit"), action: `Crianca cadastrada no Kids: ${kid.childName}`, when: now }, ...current.audit].slice(0, 12),
    }));
    void saveKidToSupabase(kid);
    setKidForm(blankKid);
  }

  function deleteKid(kid: KidRecord) {
    if (!requireAdministrativeAccess("excluir cadastro Kids")) return;
    if (!window.confirm(`Excluir o cadastro Kids de ${kid.childName}?`)) return;

    setData((current) => ({
      ...current,
      kids: current.kids.filter((item) => item.id !== kid.id),
      audit: [{ id: uid("audit"), action: `Cadastro Kids excluido: ${kid.childName}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    setSyncStatus(`Cadastro Kids de ${kid.childName} excluido.`);
  }

  function createMuralItem() {
    if (!requireAdministrativeAccess("criar itens do mural")) return;
    if (!muralForm.title.trim() || !muralForm.expiresAt) return;

    const now = new Date().toISOString();
    const item: MuralItem = { ...muralForm, id: uid("mural") };

    setData((current) => ({
      ...current,
      mural: [item, ...current.mural],
      audit: [{ id: uid("audit"), action: `Item publicado no mural: ${item.title}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setMuralForm(blankMuralItem);
    setMuralImageMessage("");
  }

  function deleteMuralItem(item: MuralItem) {
    if (!requireAdministrativeAccess("excluir itens do mural")) return;
    if (!window.confirm(`Excluir o item do mural "${item.title}"?`)) return;

    setData((current) => ({
      ...current,
      mural: current.mural.filter((muralItem) => muralItem.id !== item.id),
      audit: [{ id: uid("audit"), action: `Item excluido do mural: ${item.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function createEvent() {
    if (!requireAdministrativeAccess("adicionar eventos")) return;
    if (!canCreateEvent) return;

    const now = new Date().toISOString();
    const event: ChurchEvent = { ...eventForm, id: uid("event") };

    setData((current) => ({
      ...current,
      events: [event, ...current.events],
      audit: [{ id: uid("audit"), action: `Evento adicionado na agenda: ${event.title}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setEventForm(blankEvent);
  }

  function updateEventStatus(event: ChurchEvent, status: ChurchEvent["status"]) {
    if (!requireAdministrativeAccess("alterar eventos")) return;
    setData((current) => ({
      ...current,
      events: current.events.map((item) => (item.id === event.id ? { ...item, status } : item)),
      audit: [{ id: uid("audit"), action: `Evento ${status.toLowerCase()}: ${event.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function deleteEvent(event: ChurchEvent) {
    if (!requireAdministrativeAccess("excluir eventos")) return;
    if (!window.confirm(`Excluir o evento "${event.title}" da agenda?`)) return;

    setData((current) => ({
      ...current,
      events: current.events.filter((item) => item.id !== event.id),
      audit: [{ id: uid("audit"), action: `Evento excluido da agenda: ${event.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function createNotice() {
    if (!requireAdministrativeAccess("criar comunicados")) return;
    if (!canCreateNotice) return;

    const now = new Date().toISOString();
    const expiresAt = noticeForm.expiresAt || dateAfterDays(noticeForm.retentionDays);
    const notice: Notice = { ...noticeForm, expiresAt, id: uid("notice") };

    setData((current) => ({
      ...current,
      notices: [notice, ...current.notices.filter((item) => !isExpiredDate(item.expiresAt))],
      audit: [{ id: uid("audit"), action: `Comunicado criado: ${notice.title}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setNoticeForm(blankNotice);
  }

  function deleteNotice(notice: Notice) {
    if (!requireAdministrativeAccess("excluir comunicados")) return;
    if (!window.confirm(`Excluir o aviso "${notice.title}"?`)) return;

    setData((current) => ({
      ...current,
      notices: current.notices.filter((item) => item.id !== notice.id),
      audit: [{ id: uid("audit"), action: `Aviso excluido: ${notice.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function createMinistry() {
    if (!requireAdministrativeAccess("criar ministerios")) return;
    if (!canCreateMinistry) return;

    const now = new Date().toISOString();
    const ministry: MinistryRecord = { ...ministryForm, id: uid("ministry") };

    setData((current) => ({
      ...current,
      ministries: [ministry, ...current.ministries],
      audit: [{ id: uid("audit"), action: `Ministerio cadastrado: ${ministry.name}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setMinistryForm(blankMinistry);
  }

  function createSchoolNotice() {
    if (!requireAdministrativeAccess("enviar avisos da EBD")) return;
    if (!canCreateSchoolNotice) return;

    const now = new Date().toISOString();
    const targetClass = data.schoolClasses.find((schoolClass) => schoolClass.id === schoolNoticeForm.classId);
    const notice: Notice = {
      id: uid("school-notice"),
      title: schoolNoticeForm.title,
      body: schoolNoticeForm.body,
      status: "Publicado",
      audience: targetClass?.name ?? "Classe EBD",
      channel: "App",
      retentionDays: 7,
      expiresAt: dateAfterDays(7),
    };

    setData((current) => ({
      ...current,
      schoolClasses: current.schoolClasses.map((schoolClass) =>
        schoolClass.id === schoolNoticeForm.classId
          ? { ...schoolClass, notices: [notice, ...schoolClass.notices] }
          : schoolClass,
      ),
      audit: [
        {
          id: uid("audit"),
          action: `Aviso enviado para ${targetClass?.name ?? "classe EBD"}: ${notice.title}`,
          when: now,
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setSchoolNoticeForm((form) => ({ ...blankSchoolNotice, classId: form.classId }));
  }

  function createDiscipleshipNotice() {
    if (!requireAdministrativeAccess("enviar avisos do discipulado")) return;
    if (!canCreateDiscipleshipNotice) return;

    const now = new Date().toISOString();
    const targetClass = data.discipleshipClasses.find((discipleshipClass) => discipleshipClass.id === discipleshipNoticeForm.classId);
    const notice: Notice = {
      id: uid("discipleship-notice"),
      title: discipleshipNoticeForm.title,
      body: discipleshipNoticeForm.body,
      status: "Publicado",
      audience: targetClass?.name ?? "Classe de discipulado",
      channel: "App",
      retentionDays: 7,
      expiresAt: dateAfterDays(7),
    };

    setData((current) => ({
      ...current,
      discipleshipClasses: current.discipleshipClasses.map((discipleshipClass) =>
        discipleshipClass.id === discipleshipNoticeForm.classId
          ? { ...discipleshipClass, notices: [notice, ...discipleshipClass.notices] }
          : discipleshipClass,
      ),
      audit: [
        {
          id: uid("audit"),
          action: `Aviso enviado para ${targetClass?.name ?? "classe de discipulado"}: ${notice.title}`,
          when: now,
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setDiscipleshipNoticeForm((form) => ({ ...blankSchoolNotice, classId: form.classId }));
  }

  function markAllNotificationsRead() {
    setData((current) => ({
      ...current,
      notificationReadIds: notifications.map((notice) => notice.id),
    }));
  }

  function resetLocalData() {
    setData(initialData);
    setSelectedRequestId("care-1");
    setCareForm(blankCare);
    setEventForm(blankEvent);
    setNoticeForm(blankNotice);
    setMinistryForm(blankMinistry);
    setUserForm(blankUser);
    setMemberForm(blankMember);
    setEditingMemberId(null);
    setMemberCredentialForm(blankMemberCredential);
    setKidForm(blankKid);
    setMuralForm(blankMuralItem);
    setSchoolNoticeForm(blankSchoolNotice);
    setDiscipleshipNoticeForm({ ...blankSchoolNotice, classId: "discipleship-new" });
  }

  const actionHighlights = [
    {
      label: "Atencao pastoral",
      value: data.careRequests.filter((request) => !request.responsible && request.status !== "Concluido").length.toString(),
      hint: "sem responsavel",
      module: "pastoral" as ModuleKey,
    },
    {
      label: "Agenda da semana",
      value: data.events.length.toString(),
      hint: "encontros programados",
      module: "events" as ModuleKey,
    },
    {
      label: "Comunicados ativos",
      value: activeNotices.filter((notice) => notice.status === "Publicado").length.toString(),
      hint: "publicados",
      module: "notices" as ModuleKey,
    },
    {
      label: "Area Kids",
      value: data.kids.length.toString(),
      hint: "criancas cadastradas",
      module: "kids" as ModuleKey,
    },
    {
      label: "Atendimentos",
      value: data.careRequests.filter((request) => request.status !== "Concluido").length.toString(),
      hint: "em acompanhamento",
      module: "pastoral" as ModuleKey,
    },
  ];

  function switchAccessMode(mode: AccessMode) {
    setAccessMode(mode);
    setAccessMessage("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = getSupabaseClient();
    const loginEmail = normalizeEmail(email);
    let resolvedUserId = "";
    let resolvedRole: AccessRole = data.users.find((user) => normalizeEmail(user.email) === loginEmail)?.role ?? "Administrador";

    if (supabase) {
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAccessMessage("Nao foi possivel entrar pelo Supabase. Verifique e-mail, senha e usuario cadastrado.");
        return;
      }
      const accessStatus = authData.user?.app_metadata?.church_gp_access ?? authData.user?.app_metadata?.status ?? authData.user?.user_metadata?.status;
      if (accessStatus && accessStatus !== "approved" && accessStatus !== "Ativo") {
        await supabase.auth.signOut();
        setAccessMessage("Seu acesso ainda nao esta ativo. Fale com a administracao.");
        return;
      }
      resolvedUserId = authData.user?.id ?? "";
      resolvedRole =
        data.users.find((user) => normalizeEmail(user.email) === normalizeEmail(authData.user?.email ?? loginEmail))?.role ??
        accessRoleFromMetadata(authData.user?.app_metadata?.church_gp_role ?? authData.user?.app_metadata?.role);
      setRemoteStateReady(false);
      setSyncStatus("Sessao Supabase ativa. Novos dados serao sincronizados.");
    }

    setSessionUserId(resolvedUserId);
    setSessionEmail(loginEmail);
    setSessionRole(resolvedRole);
    setHasSession(true);
  }

  async function handleLogout() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    setHasSession(false);
    setSessionUserId("");
    setSessionEmail("");
    setSessionRole("Administrador");
    setNotificationsOpen(false);
    setActiveModule("overview");
    setAccessMode("login");
    setRemoteStateReady(!isSupabaseConfigured());
    lastSavedPayloadRef.current = "";
    setAccessMessage("Voce saiu do sistema com seguranca.");
  }

  function selectMessageTemplate(templateId: string) {
    const template = availableMessageTemplates.find((item) => item.id === templateId);
    setMessageTemplateId(templateId);
    if (template) setMessageText(template.text);
  }

  function openBulkWhatsapp() {
    if (!requireAdministrativeAccess("enviar mensagens em massa")) return;

    messageRecipients.slice(0, 12).forEach((recipient, index) => {
      window.setTimeout(() => {
        window.open(whatsappUrl(recipient.phone, messageText, recipient.name), "_blank", "noopener,noreferrer");
      }, index * 450);
    });
    void saveMessageCampaignToSupabase();
    log(`Mensagens preparadas para ${Math.min(messageRecipients.length, 12)} contatos`);
  }

  function memberCardData(member: MemberRecord): DigitalCardData {
    return {
      ownerType: "member",
      ownerId: member.id,
      title: "Carteirinha digital",
      church: "Igreja Conectada",
      name: member.fullName,
      subtitle: `${member.memberType} - ${member.status}`,
      id: `ID ${member.id.slice(0, 12).toUpperCase()}`,
      detail: member.role || "Funcao nao informada",
      footerLeft: member.congregation || "Congregacao",
      footerRight: member.joinedAt ? `Desde ${formatDate(member.joinedAt)}` : "Cadastro local",
      photoDataUrl: member.photoDataUrl,
      accent: "#14d9c4",
    };
  }

  function kidCardData(kid: KidRecord): DigitalCardData {
    return {
      ownerType: "kid",
      ownerId: kid.id,
      title: "Carteirinha Kids",
      church: "Igreja Conectada Kids",
      name: kid.childName,
      subtitle: `${kid.ageGroup} - ${kid.className || "Turma Kids"}`,
      id: `ID ${kid.id.slice(0, 12).toUpperCase()}`,
      detail: `Responsavel: ${kid.guardianName}`,
      footerLeft: kid.allergies || "Sem cuidados especiais",
      footerRight: kid.consentImage ? "Imagem autorizada" : "Sem autorizacao de imagem",
      photoDataUrl: kid.photoDataUrl,
      accent: "#ffd778",
    };
  }

  async function saveKidToSupabase(kid: KidRecord) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { error } = await supabase.from("kids_profiles").insert({
      id: kid.id,
      child_name: kid.childName,
      birth_date: kid.birthDate || null,
      age_group: kid.ageGroup,
      class_name: kid.className || null,
      photo_url: null,
      allergies: kid.allergies || null,
      notes: kid.notes || null,
      guardian_name: kid.guardianName,
      guardian_phone: kid.guardianPhone,
      guardian_email: kid.guardianEmail || null,
      relationship: kid.relationship || null,
      authorized_pickup: kid.authorizedPickup || null,
      consent_image: kid.consentImage,
      whatsapp_opt_in: true,
    });

    setSyncStatus(error ? "Kids salvo localmente; faca login Supabase para sincronizar." : "Cadastro Kids sincronizado com Supabase.");
  }

  async function saveCardExportToSupabase(card: DigitalCardData, format: "print_pdf" | "image_svg") {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSyncStatus("Carteirinha gerada localmente; faca login Supabase para registrar historico.");
      return;
    }

    const { error } = await supabase.from("digital_card_exports").insert({
      owner_type: card.ownerType,
      owner_id: card.ownerId,
      card_title: card.title,
      export_format: format,
      exported_by: user.id,
    });

    setSyncStatus(error ? "Carteirinha gerada; historico nao foi salvo no Supabase." : "Historico da carteirinha salvo no Supabase.");
  }

  async function saveMessageCampaignToSupabase() {
    const supabase = getSupabaseClient();
    if (!supabase || !messageRecipients.length) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSyncStatus("Mensagens abertas localmente; faca login Supabase para registrar campanha.");
      return;
    }

    const campaignId = uid("campaign");
    const { error: campaignError } = await supabase.from("message_campaigns").insert({
      id: campaignId,
      title: `Envio ${messageAudience}`,
      audience: messageAudience,
      body: messageText,
      channel: "whatsapp_manual",
      status: "prepared",
      recipient_count: messageRecipients.length,
      created_by: user.id,
    });

    if (campaignError) {
      setSyncStatus("Mensagens abertas; campanha nao foi salva no Supabase.");
      return;
    }

    const { error: recipientsError } = await supabase.from("message_recipients").insert(
      messageRecipients.map((recipient) => ({
        campaign_id: campaignId,
        recipient_type: messageAudience === "Responsaveis Kids" ? "kid_guardian" : "member",
        recipient_id: recipient.id,
        recipient_name: recipient.name,
        phone: recipient.phone,
        whatsapp_url: whatsappUrl(recipient.phone, messageText, recipient.name),
        send_status: "opened",
      })),
    );

    setSyncStatus(recipientsError ? "Campanha salva, mas alguns destinatarios nao foram registrados." : "Campanha registrada no Supabase.");
  }

  function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage("Se o e-mail estiver cadastrado, a administracao recebera o pedido de recuperacao.");
  }

  if (!hasSession) {
    return (
      <AccessScreen
        accessMessage={accessMessage}
        loginPasswordVisible={loginPasswordVisible}
        mode={accessMode}
        onLogin={handleLogin}
        onRecover={handleRecover}
        onSwitchMode={switchAccessMode}
        setLoginPasswordVisible={setLoginPasswordVisible}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="app-shell">
        <aside className="sidebar" aria-label="Navegacao principal">
          <div className="brand-block">
            <div className="brand-mark">IG</div>
            <div>
              <p className="brand-name">Igreja Conectada</p>
              <p className="brand-caption">{isAdminView ? "Painel administrativo" : "Area do membro"}</p>
            </div>
          </div>

          <nav className="module-list" aria-label="Modulos do sistema">
            {visibleModules.map((module) => (
              <button
                className={activeModule === module.key ? "module-button active" : "module-button"}
                key={module.key}
                onClick={() => setActiveModule(module.key)}
                type="button"
              >
                <span>{module.short}</span>
                <strong>{module.label}</strong>
              </button>
            ))}
          </nav>

          <div className="connection-card">
            <span className="status-dot" />
            <div>
              <strong>{isSupabaseConfigured() ? "Supabase preparado" : "Modo local ativo"}</strong>
              <span>{syncStatus}</span>
            </div>
          </div>
        </aside>

        <nav className="mobile-tabbar" aria-label="Atalhos principais">
          <button
            className={activeModule === "overview" ? "active" : ""}
            onClick={() => setActiveModule("overview")}
            type="button"
          >
            Painel
          </button>
          <button
            className={activeModule === "pastoral" ? "active" : ""}
            onClick={() => setActiveModule("pastoral")}
            type="button"
          >
            Pastoral
          </button>
          <button
            className={activeModule === "members" ? "active" : ""}
            onClick={() => setActiveModule("members")}
            type="button"
          >
            Membros
          </button>
          <button
            className={activeModule === "events" ? "active" : ""}
            onClick={() => setActiveModule("events")}
            type="button"
          >
            Agenda
          </button>
          <button className={notificationsOpen ? "active" : ""} onClick={() => setNotificationsOpen((open) => !open)} type="button">
            Acoes
          </button>
          <button className="logout-tab" onClick={handleLogout} type="button">
            Sair
          </button>
        </nav>

        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">Quarta-feira, 2 de setembro</p>
              <h1>{visibleModules.find((module) => module.key === activeModule)?.label}</h1>
              <label className="mobile-module-picker">
                Ir para modulo
                <select onChange={(event) => setActiveModule(event.target.value as ModuleKey)} value={activeModule}>
                  {visibleModules.map((module) => (
                    <option key={module.key} value={module.key}>
                      {module.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="topbar-actions">
              <label className="command-search">
                <span>Busca global</span>
                <input placeholder="Buscar membro, evento ou pedido" type="search" />
              </label>
              <button
                aria-expanded={notificationsOpen}
                className="notification-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                type="button"
              >
                <span>Acoes</span>
                {unreadCount > 0 && <strong>{unreadCount}</strong>}
              </button>
              <div className="profile-pill">
                <span>{profileInitial}</span>
                <div>
                  <strong>{profileName}</strong>
                  <small>{currentAccessRole}</small>
                </div>
              </div>
              <button className="logout-button" onClick={handleLogout} type="button">
                Sair
              </button>
            </div>

            {notificationsOpen && (
              <div className="notifications-panel">
                <div className="panel-heading">
                  <h2>Central de acoes</h2>
                  <button onClick={markAllNotificationsRead} type="button">
                    Marcar tudo como lido
                  </button>
                </div>
                <div className="notification-list">
                  {notifications.map((notice) => (
                    <button
                      className={data.notificationReadIds.includes(notice.id) ? "notification-card read" : "notification-card"}
                      key={notice.id}
                      onClick={() => {
                        setActiveModule(notice.module);
                        setNotificationsOpen(false);
                        setData((current) => ({
                          ...current,
                          notificationReadIds: Array.from(new Set([...current.notificationReadIds, notice.id])),
                        }));
                      }}
                      type="button"
                    >
                      <strong>{notice.title}</strong>
                      <span>{notice.body}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </header>

          {activeModule === "overview" && (isAdminView ? (
            <section className="content-grid">
              <div className="hero-panel">
                <p className="eyebrow">Painel inteligente da igreja</p>
                <h2>Prioridades, pessoas e ministerios em tempo real.</h2>
                <p>
                  Acompanhe pedidos pastorais, eventos, comunicados e a rotina da igreja em uma central viva,
                  pronta para crescer com dados reais.
                </p>
                <div className="hero-actions">
                  <button onClick={() => setActiveModule("pastoral")} type="button">
                    Abrir fila pastoral
                  </button>
                  <button className="secondary" onClick={() => setNotificationsOpen(true)} type="button">
                    Ver acoes de hoje
                  </button>
                </div>
              </div>

              <div className="action-strip">
                {actionHighlights.map((item) => (
                  <button className="action-tile" key={item.label} onClick={() => setActiveModule(item.module)} type="button">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.hint}</small>
                  </button>
                ))}
              </div>

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Proximos encontros</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {data.events.map((event) => (
                    <div className="data-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>{event.ministry}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Mural da igreja</h2>
                  <span>{data.mural.filter((item) => item.published).length} de 5 publicados</span>
                </div>
                <div className="mural-stack">
                  {data.mural
                    .filter((item) => item.published)
                    .map((item) => (
                      <div className={item.featured ? "mural-card featured" : "mural-card"} key={item.id}>
                        {(item.imageDataUrl || item.bannerUrl) && (
                          <div className="mural-card-media">
                            <img alt="" src={item.imageDataUrl || item.bannerUrl} />
                          </div>
                        )}
                        <strong>{item.title}</strong>
                        <small>{item.category}</small>
                      </div>
                    ))}
                </div>
              </article>
            </section>
          ) : (
            <section className="content-grid">
              <div className="hero-panel">
                <p className="eyebrow">Area do membro</p>
                <h2>Bem-vindo, {profileName}.</h2>
                <p>Veja sua ficha, acompanhe a agenda, leia os avisos e envie pedidos de atendimento pastoral ou oracao.</p>
                <div className="hero-actions">
                  <button onClick={() => setActiveModule("members")} type="button">
                    Meu cadastro
                  </button>
                  <button className="secondary" onClick={() => setActiveModule("pastoral")} type="button">
                    Novo pedido
                  </button>
                  <button className="secondary" onClick={() => setActiveModule("notices")} type="button">
                    Ver avisos
                  </button>
                  <button className="secondary" onClick={() => setActiveModule("mural")} type="button">
                    Ver mural
                  </button>
                </div>
              </div>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Minha ficha</h2>
                  <span>{currentMember ? "Cadastro localizado" : "Sem vinculo"}</span>
                </div>
                {currentMember ? (
                  <div className="data-row member-row">
                    <div className="member-avatar">
                      {currentMember.photoDataUrl ? <img alt="" src={currentMember.photoDataUrl} /> : currentMember.fullName.slice(0, 1)}
                    </div>
                    <div>
                      <strong>{currentMember.fullName}</strong>
                      <small>{currentMember.memberType} - {currentMember.status}</small>
                      <small>{currentMember.phone} - {currentMember.email || "E-mail nao informado"}</small>
                    </div>
                  </div>
                ) : (
                  <p className="empty-state">Nao encontramos uma ficha vinculada a este login. Fale com a secretaria para vincular seu cadastro.</p>
                )}
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Proximos encontros</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {data.events.map((event) => (
                    <div className="data-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>
                          {event.time || "Sem horario"} - {event.ministry} - {event.location || "Local nao informado"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Avisos gerais</h2>
                  <button onClick={() => setActiveModule("notices")} type="button">
                    Ver avisos
                  </button>
                </div>
                <div className="row-list">
                  {activeNotices
                    .filter((notice) => notice.status === "Publicado")
                    .slice(0, 4)
                    .map((notice) => (
                      <div className="data-row" key={notice.id}>
                        <span className="bullet-mark" />
                        <div>
                          <strong>{notice.title}</strong>
                          <small>{notice.audience} - {notice.channel}</small>
                          <small>{notice.body}</small>
                        </div>
                      </div>
                    ))}
                  {!activeNotices.filter((notice) => notice.status === "Publicado").length && (
                    <p className="empty-state">Nenhum aviso geral publicado no momento.</p>
                  )}
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Mural da igreja</h2>
                  <button onClick={() => setActiveModule("mural")} type="button">
                    Ver mural
                  </button>
                </div>
                <div className="mural-stack">
                  {data.mural
                    .filter((item) => item.published)
                    .slice(0, 4)
                    .map((item) => (
                      <div className={item.featured ? "mural-card featured" : "mural-card"} key={item.id}>
                        {(item.imageDataUrl || item.bannerUrl) && (
                          <div className="mural-card-media">
                            <img alt="" src={item.imageDataUrl || item.bannerUrl} />
                          </div>
                        )}
                        <strong>{item.title}</strong>
                        <small>{item.category}</small>
                        {item.socialUrl && (
                          <a className="inline-link" href={item.socialUrl} rel="noreferrer" target="_blank">
                            Abrir link
                          </a>
                        )}
                      </div>
                    ))}
                  {!data.mural.filter((item) => item.published).length && (
                    <p className="empty-state">Nenhum item publicado no mural no momento.</p>
                  )}
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Meus pedidos</h2>
                  <span>{visibleCareRequests.length} registros</span>
                </div>
                <div className="row-list">
                  {visibleCareRequests.length ? (
                    visibleCareRequests.map((request) => (
                      <div className="data-row" key={request.id}>
                        <span className={`status-chip ${request.status.toLowerCase().replaceAll(" ", "-")}`}>{request.status}</span>
                        <div>
                          <strong>{request.category}</strong>
                          <small>{request.summary}</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">Nenhum pedido enviado por este acesso.</p>
                  )}
                </div>
              </article>
            </section>
          ))}

          {activeModule === "pastoral" && (
            <section className="pastoral-layout">
              <article className="surface">
                <div className="panel-heading">
                  <h2>{isAdminView ? "Novo pedido pastoral" : "Solicitar atendimento ou oracao"}</h2>
                  <span>{isAdminView ? "Fluxo real" : "Pedido pessoal"}</span>
                </div>
                <div className="form-grid">
                  <label>
                    Nome do membro
                    <input
                      disabled={!isAdminView}
                      onChange={(event) => setCareForm((form) => ({ ...form, member: event.target.value }))}
                      placeholder="Ex.: Maria Oliveira"
                      value={isAdminView ? careForm.member : currentMember?.fullName ?? profileName}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      disabled={!isAdminView}
                      onChange={(event) => setCareForm((form) => ({ ...form, phone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={isAdminView ? careForm.phone : currentMember?.phone ?? careForm.phone}
                    />
                  </label>
                  <label>
                    Categoria
                    <select
                      onChange={(event) => setCareForm((form) => ({ ...form, category: event.target.value }))}
                      value={careForm.category}
                    >
                      <option>Aconselhamento</option>
                      <option>Pedido de visita</option>
                      <option>Oracao</option>
                      <option>Familia</option>
                      <option>Urgente</option>
                    </select>
                  </label>
                  <label className="full">
                    Descricao do pedido
                    <textarea
                      onChange={(event) => setCareForm((form) => ({ ...form, summary: event.target.value }))}
                      placeholder="Escreva o motivo do atendimento"
                      value={careForm.summary}
                    />
                  </label>
                  <button className="primary-action" onClick={createCareRequest} type="button">
                    {isAdminView ? "Criar atendimento" : "Enviar pedido"}
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>{isAdminView ? "Fila pastoral" : "Meus pedidos"}</h2>
                  <span>{visibleCareRequests.length} registros</span>
                </div>
                <div className="care-list">
                  {visibleCareRequests.map((request) => (
                    <button
                      className={request.id === selectedRequest?.id ? "care-list-item selected" : "care-list-item"}
                      key={request.id}
                      onClick={() => setSelectedRequestId(request.id)}
                      type="button"
                    >
                      <span className={`status-chip ${request.status.toLowerCase().replaceAll(" ", "-")}`}>
                        {request.status}
                      </span>
                      <strong>{request.member}</strong>
                      <small>{suggestedNextStep(request)}</small>
                    </button>
                  ))}
                  {!visibleCareRequests.length && <p className="empty-state">Nenhum pedido registrado para este acesso.</p>}
                </div>
              </article>

              {isAdminView && selectedRequest && <article className="surface care-detail">
                <div className="panel-heading">
                  <h2>{selectedRequest.member}</h2>
                  <span>{selectedRequest.category}</span>
                </div>
                <p>{selectedRequest.summary}</p>

                <div className="flow-line" aria-label="Etapas do atendimento">
                  {statusFlow.map((status) => (
                    <span
                      className={statusFlow.indexOf(status) <= statusFlow.indexOf(selectedRequest.status) ? "flow-step done" : "flow-step"}
                      key={status}
                    >
                      {status}
                    </span>
                  ))}
                </div>

                <div className="detail-grid">
                  <label>
                    Responsavel
                    <input
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { responsible: event.target.value }, "Responsavel pastoral atualizado")
                      }
                      placeholder="Nome do pastor ou lider"
                      value={selectedRequest.responsible}
                    />
                  </label>
                  <label>
                    Data
                    <input
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { scheduleDate: event.target.value }, "Data do atendimento atualizada")
                      }
                      type="date"
                      value={selectedRequest.scheduleDate}
                    />
                  </label>
                  <label>
                    Horario
                    <input
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { scheduleTime: event.target.value }, "Horario do atendimento atualizado")
                      }
                      type="time"
                      value={selectedRequest.scheduleTime}
                    />
                  </label>
                  <label className="full">
                    Retorno e encaminhamento
                    <textarea
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { returnNote: event.target.value }, "Retorno pastoral registrado")
                      }
                      placeholder="Registre conversa, retorno, decisao e proximo passo"
                      value={selectedRequest.returnNote}
                    />
                  </label>
                </div>

                <div className="detail-actions">
                  <button
                    onClick={() =>
                      updateCareRequest(
                        selectedRequest.id,
                        { status: nextStatus(selectedRequest.status) },
                        `Status alterado para ${nextStatus(selectedRequest.status)}`,
                      )
                    }
                    type="button"
                  >
                    Avancar etapa
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      updateCareRequest(selectedRequest.id, { status: "Concluido" }, "Atendimento pastoral concluido")
                    }
                    type="button"
                  >
                    Concluir
                  </button>
                </div>
              </article>}
            </section>
          )}

          {activeModule === "mural" && (
            <section className="content-grid">
              {isAdminView && <article className="surface">
                <div className="panel-heading">
                  <h2>Novo item do mural</h2>
                  <span>Publicacao</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Titulo
                    <input
                      onChange={(event) => setMuralForm((form) => ({ ...form, title: event.target.value }))}
                      placeholder="Ex.: Encontro de jovens"
                      value={muralForm.title}
                    />
                  </label>
                  <label>
                    Categoria
                    <input
                      onChange={(event) => setMuralForm((form) => ({ ...form, category: event.target.value }))}
                      placeholder="Ex.: Jovens"
                      value={muralForm.category}
                    />
                  </label>
                  <div className="photo-uploader full">
                    <div className="photo-preview mural-preview">
                      {muralForm.imageDataUrl ? <img alt="" src={muralForm.imageDataUrl} /> : <span>Banner</span>}
                    </div>
                    <label>
                      Foto, imagem ou banner
                      <input accept="image/*" onChange={readMuralImage} type="file" />
                    </label>
                    {muralImageMessage && <small className="form-hint">{muralImageMessage}</small>}
                  </div>
                  <label className="full">
                    Link da imagem ou banner
                    <input
                      onChange={(event) => setMuralForm((form) => ({ ...form, bannerUrl: event.target.value }))}
                      placeholder="https://..."
                      type="url"
                      value={muralForm.bannerUrl}
                    />
                  </label>
                  <label className="full">
                    Link de rede social
                    <input
                      onChange={(event) => setMuralForm((form) => ({ ...form, socialUrl: event.target.value }))}
                      placeholder="Instagram, Facebook, YouTube ou outro link"
                      type="url"
                      value={muralForm.socialUrl}
                    />
                  </label>
                  <label>
                    Expira em
                    <input
                      onChange={(event) => setMuralForm((form) => ({ ...form, expiresAt: event.target.value }))}
                      type="date"
                      value={muralForm.expiresAt}
                    />
                  </label>
                  <label className="switch full">
                    <input
                      checked={muralForm.published}
                      onChange={(event) => setMuralForm((form) => ({ ...form, published: event.target.checked }))}
                      type="checkbox"
                    />
                    Publicar agora
                  </label>
                  <label className="switch full">
                    <input
                      checked={muralForm.featured}
                      onChange={(event) => setMuralForm((form) => ({ ...form, featured: event.target.checked }))}
                      type="checkbox"
                    />
                    Marcar como destaque
                  </label>
                  <button className="primary-action" disabled={!canCreateMuralItem} onClick={createMuralItem} type="button">
                    Adicionar ao mural
                  </button>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>{isAdminView ? "Administrar mural" : "Mural da igreja"}</h2>
                  <span>
                    {isAdminView
                      ? `${data.mural.filter((item) => item.published).length} publicados`
                      : `${data.mural.filter((item) => item.published).length + activeNotices.filter((notice) => notice.status === "Publicado").length + data.events.length} itens gerais`}
                  </span>
                </div>
                <div className="table-like">
                  {(isAdminView ? data.mural : data.mural.filter((item) => item.published)).map((item) => (
                    <div className="table-row" key={item.id}>
                      <div>
                        {(item.imageDataUrl || item.bannerUrl) && (
                          <div className="mural-media">
                            <img alt="" src={item.imageDataUrl || item.bannerUrl} />
                          </div>
                        )}
                        <strong>{item.title}</strong>
                        <small>{item.category} - expira em {formatDate(item.expiresAt)}</small>
                        {item.socialUrl && (
                          <a className="inline-link" href={item.socialUrl} rel="noreferrer" target="_blank">
                            Abrir rede social
                          </a>
                        )}
                      </div>
                      {isAdminView && <label className="switch">
                        Publicado
                        <input checked={item.published} onChange={() => toggleMural(item.id, "published")} type="checkbox" />
                      </label>}
                      {isAdminView && <label className="switch">
                        Destaque
                        <input checked={item.featured} onChange={() => toggleMural(item.id, "featured")} type="checkbox" />
                      </label>}
                      {isAdminView && <button className="danger-action" onClick={() => deleteMuralItem(item)} type="button">
                        Excluir
                      </button>}
                    </div>
                  ))}
                  {!isAdminView && !data.mural.filter((item) => item.published).length && (
                    <div className="data-row">
                      <span className="bullet-mark" />
                      <div>
                        <strong>Nenhum banner publicado</strong>
                        <small>Quando a administracao publicar fotos, imagens ou banners, eles aparecem aqui.</small>
                      </div>
                    </div>
                  )}
                  {!isAdminView && activeNotices.filter((notice) => notice.status === "Publicado").map((notice) => (
                    <div className="table-row" key={`notice-${notice.id}`}>
                      <div>
                        <strong>{notice.title}</strong>
                        <small>Aviso - {notice.audience} - {notice.channel}</small>
                        <small>{notice.body}</small>
                      </div>
                    </div>
                  ))}
                  {!isAdminView && data.events.map((event) => (
                    <div className="table-row" key={`event-${event.id}`}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>
                          Evento - {event.time || "Sem horario"} - {event.ministry} - {event.status}
                        </small>
                        <small>{event.location || "Local nao informado"} - {event.responsible || "Sem responsavel"}</small>
                      </div>
                    </div>
                  ))}
                  {!isAdminView &&
                    !data.mural.filter((item) => item.published).length &&
                    !activeNotices.filter((notice) => notice.status === "Publicado").length &&
                    !data.events.length && (
                      <p className="empty-state">Nenhum aviso, banner ou evento publicado no momento.</p>
                    )}
                </div>
              </article>
            </section>
          )}

          {activeModule === "events" && (
            <section className="content-grid">
              {isAdminView && <article className="surface">
                <div className="panel-heading">
                  <h2>Novo evento</h2>
                  <span>Agenda</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Titulo
                    <input
                      onChange={(event) => setEventForm((form) => ({ ...form, title: event.target.value }))}
                      placeholder="Ex.: Culto de ensino"
                      value={eventForm.title}
                    />
                  </label>
                  <label>
                    Data
                    <input onChange={(event) => setEventForm((form) => ({ ...form, date: event.target.value }))} type="date" value={eventForm.date} />
                  </label>
                  <label>
                    Horario
                    <input onChange={(event) => setEventForm((form) => ({ ...form, time: event.target.value }))} type="time" value={eventForm.time} />
                  </label>
                  <label>
                    Ministerio
                    <input
                      onChange={(event) => setEventForm((form) => ({ ...form, ministry: event.target.value }))}
                      placeholder="Ex.: Jovens"
                      value={eventForm.ministry}
                    />
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setEventForm((form) => ({ ...form, status: event.target.value as ChurchEvent["status"] }))} value={eventForm.status}>
                      <option>Programado</option>
                      <option>Confirmado</option>
                      <option>Concluido</option>
                    </select>
                  </label>
                  <label>
                    Local
                    <input
                      onChange={(event) => setEventForm((form) => ({ ...form, location: event.target.value }))}
                      placeholder="Ex.: Templo principal"
                      value={eventForm.location}
                    />
                  </label>
                  <label>
                    Responsavel
                    <input
                      onChange={(event) => setEventForm((form) => ({ ...form, responsible: event.target.value }))}
                      placeholder="Ex.: Pr. Marcos"
                      value={eventForm.responsible}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateEvent} onClick={createEvent} type="button">
                    Adicionar evento
                  </button>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Agenda da igreja</h2>
                  <span>{data.events.length} eventos</span>
                </div>
                <div className="row-list">
                  {data.events.map((event) => (
                    <div className="data-row access-user-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>
                          {event.time || "Sem horario"} - {event.ministry} - {event.status}
                        </small>
                        <small>{event.location || "Local nao informado"} - {event.responsible || "Sem responsavel"}</small>
                      </div>
                      {isAdminView && <div className="row-actions">
                        <button
                          className={event.status === "Concluido" ? "secondary" : "danger-action"}
                          onClick={() => updateEventStatus(event, event.status === "Concluido" ? "Programado" : "Concluido")}
                          type="button"
                        >
                          {event.status === "Concluido" ? "Reativar" : "Cancelar"}
                        </button>
                        <button className="danger-action" onClick={() => deleteEvent(event)} type="button">
                          Excluir
                        </button>
                      </div>}
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "notices" && (
            <section className="content-grid">
              {isAdminView && <article className="surface">
                <div className="panel-heading">
                  <h2>Novo comunicado</h2>
                  <span>Avisos</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Titulo
                    <input
                      onChange={(event) => setNoticeForm((form) => ({ ...form, title: event.target.value }))}
                      placeholder="Ex.: Reuniao de lideres"
                      value={noticeForm.title}
                    />
                  </label>
                  <label>
                    Publico
                    <input
                      onChange={(event) => setNoticeForm((form) => ({ ...form, audience: event.target.value }))}
                      placeholder="Ex.: Toda igreja"
                      value={noticeForm.audience}
                    />
                  </label>
                  <label>
                    Canal
                    <select onChange={(event) => setNoticeForm((form) => ({ ...form, channel: event.target.value as Notice["channel"] }))} value={noticeForm.channel}>
                      <option>Todos</option>
                      <option>App</option>
                      <option>WhatsApp</option>
                      <option>Mural</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setNoticeForm((form) => ({ ...form, status: event.target.value as Notice["status"] }))} value={noticeForm.status}>
                      <option>Publicado</option>
                      <option>Rascunho</option>
                    </select>
                  </label>
                  <label>
                    Tempo no ar
                    <select
                      onChange={(event) => {
                        const retentionDays = Number(event.target.value);
                        setNoticeForm((form) => ({ ...form, retentionDays, expiresAt: dateAfterDays(retentionDays) }));
                      }}
                      value={noticeForm.retentionDays}
                    >
                      <option value={3}>3 dias</option>
                      <option value={4}>4 dias</option>
                      <option value={7}>7 dias</option>
                      <option value={15}>15 dias</option>
                    </select>
                  </label>
                  <label>
                    Excluir em
                    <input
                      onChange={(event) => setNoticeForm((form) => ({ ...form, expiresAt: event.target.value }))}
                      type="date"
                      value={noticeForm.expiresAt || dateAfterDays(noticeForm.retentionDays)}
                    />
                  </label>
                  <label className="full">
                    Mensagem
                    <textarea
                      onChange={(event) => setNoticeForm((form) => ({ ...form, body: event.target.value }))}
                      placeholder="Escreva o comunicado"
                      value={noticeForm.body}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateNotice} onClick={createNotice} type="button">
                    Criar comunicado
                  </button>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Comunicados</h2>
                  <span>{activeNotices.length} avisos ativos</span>
                </div>
                <div className="row-list">
                  {activeNotices.map((notice) => (
                    <div className="data-row access-user-row" key={notice.id}>
                      <span className="bullet-mark" />
                      <div>
                        <strong>{notice.title}</strong>
                        <small>
                          {notice.status} - {notice.audience} - {notice.channel}
                        </small>
                        <small>Expira em {formatDate(notice.expiresAt)} - {notice.retentionDays} dias no ar</small>
                        <small>{notice.body}</small>
                      </div>
                      {isAdminView && <div className="row-actions">
                        <button className="danger-action" onClick={() => deleteNotice(notice)} type="button">
                          Excluir
                        </button>
                      </div>}
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "users" && (
            <section className="content-grid">
              <article className="surface">
                <div className="panel-heading">
                  <h2>Novo usuario</h2>
                  <span>Acesso interno</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Nome
                    <input
                      onChange={(event) => setUserForm((form) => ({ ...form, name: event.target.value }))}
                      placeholder="Ex.: Lider de jovens"
                      value={userForm.name}
                    />
                  </label>
                  <label className="full">
                    E-mail
                    <input
                      onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))}
                      placeholder="usuario@email.com"
                      type="email"
                      value={userForm.email}
                    />
                  </label>
                  <label className="full">
                    Senha inicial
                    <input
                      autoComplete="new-password"
                      minLength={6}
                      onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))}
                      placeholder="Minimo de 6 caracteres"
                      type="password"
                      value={userForm.password}
                    />
                  </label>
                  <label>
                    Perfil
                    <select onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as AccessUser["role"] }))} value={userForm.role}>
                      <option>Administrador</option>
                      <option>Lider</option>
                      <option>Membro</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setUserForm((form) => ({ ...form, status: event.target.value as AccessUser["status"] }))} value={userForm.status}>
                      <option>Ativo</option>
                      <option>Pendente</option>
                      <option>Bloqueado</option>
                    </select>
                  </label>
                  <button className="primary-action" disabled={!canCreateUser} onClick={createUser} type="button">
                    Adicionar usuario
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Usuarios cadastrados</h2>
                  <span>{data.users.length} acessos</span>
                </div>
                <div className="row-list">
                  {data.users.map((user) => (
                    <div className="data-row access-user-row" key={user.id}>
                      <span className={user.status === "Bloqueado" ? "bullet-mark danger-mark" : "bullet-mark"} />
                      <div>
                        <strong>{user.name}</strong>
                        <small>{user.role} - {user.status} - {user.email}</small>
                      </div>
                      <div className="row-actions">
                        <button
                          className={user.status === "Bloqueado" ? "secondary" : "danger-action"}
                          onClick={() => { void updateAccessUserStatus(user, user.status === "Bloqueado" ? "Ativo" : "Bloqueado"); }}
                          type="button"
                        >
                          {user.status === "Bloqueado" ? "Reativar" : "Cancelar acesso"}
                        </button>
                        <button className="danger-action" onClick={() => { void deleteAccessUser(user); }} type="button">
                          Excluir acesso
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "members" && (
            <section className="content-grid">
              {isAdminView || editingMemberId === currentMember?.id ? (
              <article className={editingMemberId ? "surface editing-surface" : "surface"} id="member-form-panel">
                <div className="panel-heading">
                  <h2>{editingMemberId ? "Editar ficha" : "Ficha completa"}</h2>
                  <span>{isAdminView ? (editingMemberId ? "Atualizando cadastro" : "Membro ou visitante") : "Meu cadastro"}</span>
                </div>
                <div className="form-grid">
                  <div className="photo-uploader full">
                    <div className="photo-preview">
                      {memberForm.photoDataUrl ? <img alt="" src={memberForm.photoDataUrl} /> : <span>Foto</span>}
                    </div>
                    <label>
                      Enviar foto
                      <input accept="image/*" onChange={(event) => readPhoto(event, (photoDataUrl) => setMemberForm((form) => ({ ...form, photoDataUrl })))} type="file" />
                    </label>
                  </div>
                  <label className="full">
                    Nome completo
                    <input
                      id="member-full-name"
                      onChange={(event) => setMemberForm((form) => ({ ...form, fullName: event.target.value }))}
                      placeholder="Ex.: Maria Oliveira"
                      value={memberForm.fullName}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, phone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={memberForm.phone}
                    />
                  </label>
                  <label>
                    E-mail
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, email: event.target.value }))}
                      placeholder="membro@email.com"
                      type="email"
                      value={memberForm.email}
                    />
                  </label>
                  {isAdminView && <label>
                    Tipo de pessoa
                    <select
                      onChange={(event) => setMemberForm((form) => ({ ...form, memberType: event.target.value as MemberRecord["memberType"] }))}
                      value={memberForm.memberType}
                    >
                      <option>Membro</option>
                      <option>Visitante</option>
                      <option>Congregado</option>
                      <option>Lideranca</option>
                    </select>
                  </label>}
                  {isAdminView && <label>
                    Status
                    <select onChange={(event) => setMemberForm((form) => ({ ...form, status: event.target.value as MemberRecord["status"] }))} value={memberForm.status}>
                      <option>Membro ativo</option>
                      <option>Visitante</option>
                      <option>Novo convertido</option>
                      <option>Transferencia</option>
                    </select>
                  </label>}
                  {isAdminView && <label>
                    Funcao na igreja
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, role: event.target.value }))}
                      placeholder="Ex.: Professor EBD, obreiro, lider"
                      value={memberForm.role}
                    />
                  </label>}
                  {isAdminView && <label>
                    Ministerio
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, ministry: event.target.value }))}
                      placeholder="Ex.: Louvor"
                      value={memberForm.ministry}
                    />
                  </label>}
                  <label>
                    Classe EBD
                    <select onChange={(event) => setMemberForm((form) => ({ ...form, schoolClassId: event.target.value }))} value={memberForm.schoolClassId}>
                      <option value="">Nao matriculado</option>
                      {data.schoolClasses.map((schoolClass) => (
                        <option key={schoolClass.id} value={schoolClass.id}>
                          {schoolClass.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Classe Discipulado
                    <select
                      onChange={(event) => setMemberForm((form) => ({ ...form, discipleshipClassId: event.target.value }))}
                      value={memberForm.discipleshipClassId}
                    >
                      <option value="">Nao matriculado</option>
                      {data.discipleshipClasses.map((discipleshipClass) => (
                        <option key={discipleshipClass.id} value={discipleshipClass.id}>
                          {discipleshipClass.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nascimento
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, birthDate: event.target.value }))}
                      type="date"
                      value={memberForm.birthDate}
                    />
                  </label>
                  <label>
                    Estado civil
                    <select onChange={(event) => setMemberForm((form) => ({ ...form, maritalStatus: event.target.value }))} value={memberForm.maritalStatus}>
                      <option>Solteiro(a)</option>
                      <option>Casado(a)</option>
                      <option>Viuvo(a)</option>
                      <option>Divorciado(a)</option>
                    </select>
                  </label>
                  <label>
                    Congregacao
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, congregation: event.target.value }))}
                      placeholder="Ex.: Sede"
                      value={memberForm.congregation}
                    />
                  </label>
                  <label>
                    Desde
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, joinedAt: event.target.value }))}
                      type="date"
                      value={memberForm.joinedAt}
                    />
                  </label>
                  <label className="full">
                    Endereco
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, address: event.target.value }))}
                      placeholder="Rua, numero, bairro e cidade"
                      value={memberForm.address}
                    />
                  </label>
                  <label className="full">
                    Igreja anterior
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, previousChurch: event.target.value }))}
                      placeholder="Opcional"
                      value={memberForm.previousChurch}
                    />
                  </label>
                  <label className="check-card">
                    <input
                      checked={memberForm.waterBaptized}
                      onChange={(event) => setMemberForm((form) => ({ ...form, waterBaptized: event.target.checked }))}
                      type="checkbox"
                    />
                    Batizado em aguas
                  </label>
                  <label className="check-card">
                    <input
                      checked={memberForm.holySpiritBaptized}
                      onChange={(event) => setMemberForm((form) => ({ ...form, holySpiritBaptized: event.target.checked }))}
                      type="checkbox"
                    />
                    Batizado no Espirito Santo
                  </label>
                  {isAdminView && <label className="full">
                    Observacoes
                    <textarea
                      onChange={(event) => setMemberForm((form) => ({ ...form, notes: event.target.value }))}
                      placeholder="Historico, acompanhamento, restricoes ou observacoes pastorais"
                      value={memberForm.notes}
                    />
                  </label>}
                  <div className="form-actions full">
                    <button className="primary-action" disabled={!canCreateMember} onClick={createMember} type="button">
                      {editingMemberId ? "Atualizar ficha" : "Salvar ficha"}
                    </button>
                    {editingMemberId && (
                      <button className="secondary" onClick={cancelMemberEdit} type="button">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </article>
              ) : (
              <article className="surface" id="member-form-panel">
                <div className="panel-heading">
                  <h2>Meu cadastro</h2>
                  <span>{currentMember ? "Visualizacao pessoal" : "Nao vinculado"}</span>
                </div>
                <p className="empty-state">
                  {currentMember
                    ? "Use o botao Editar ficha no seu cadastro para atualizar seus dados pessoais."
                    : "Nao encontramos uma ficha vinculada a este login. Fale com a secretaria para revisar o acesso."}
                </p>
              </article>
              )}

              <article className="surface">
                <div className="panel-heading">
                  <h2>{isAdminView ? "Membros cadastrados" : "Meu cadastro"}</h2>
                  <span>{visibleMembers.length} registro{visibleMembers.length === 1 ? "" : "s"}</span>
                </div>
                {isAdminView && <div className="birthday-grid">
                  <div className="birthday-card">
                    <strong>Aniversariantes da semana</strong>
                    <span>{weeklyBirthdays.length}</span>
                    <small>
                      {weeklyBirthdays.length
                        ? weeklyBirthdays.map((member) => `${member.fullName} (${birthdayLabel(member.birthDate)})`).join(", ")
                        : "Nenhum aniversario nesta semana."}
                    </small>
                  </div>
                  <div className="birthday-card">
                    <strong>Aniversariantes do mes</strong>
                    <span>{monthlyBirthdays.length}</span>
                    <small>
                      {monthlyBirthdays.length
                        ? monthlyBirthdays.map((member) => `${member.fullName} (${birthdayLabel(member.birthDate)})`).join(", ")
                      : "Nenhum aniversario neste mes."}
                    </small>
                  </div>
                </div>}
                <div className="row-list">
                  {visibleMembers.map((member) => {
                    const card = memberCardData(member);
                    const schoolClassName = classNameById(data.schoolClasses, member.schoolClassId);
                    const discipleshipClassName = classNameById(data.discipleshipClasses, member.discipleshipClassId);

                    return (
                    <div className="member-record" key={member.id}>
                      <div className="data-row member-row">
                        <div className="member-avatar">
                          {member.photoDataUrl ? <img alt="" src={member.photoDataUrl} /> : member.fullName.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{member.fullName}</strong>
                          <small>
                            {member.memberType} - {member.status} - {member.role || "Sem funcao"} - {member.phone}
                          </small>
                          <small>
                            {member.ministry || "Sem ministerio"} - {member.congregation || "Congregacao nao informada"} - Aniv. {birthdayLabel(member.birthDate)}
                          </small>
                          <small>
                            EBD: {schoolClassName || "Nao matriculado"} - Discipulado: {discipleshipClassName || "Nao matriculado"}
                          </small>
                        </div>
                      </div>
                      <div className="digital-card">
                        <div className="digital-card-top">
                          <span>{card.title}</span>
                          <strong>{card.church}</strong>
                        </div>
                        <div className="digital-card-body">
                          <div className="member-avatar">
                            {member.photoDataUrl ? <img alt="" src={member.photoDataUrl} /> : member.fullName.slice(0, 1)}
                          </div>
                          <div>
                            <strong>{card.name}</strong>
                            <small>{card.id}</small>
                            <small>{card.subtitle}</small>
                            <small>{card.detail}</small>
                          </div>
                        </div>
                        <div className="digital-card-footer">
                          <span>{card.footerLeft}</span>
                          <span>{card.footerRight}</span>
                        </div>
                        <div className="card-actions">
                          <button onClick={() => { void saveCardExportToSupabase(card, "print_pdf"); printDigitalCard(card); }} type="button">
                            Imprimir/PDF
                          </button>
                          <button className="secondary" onClick={() => { void saveCardExportToSupabase(card, "image_svg"); downloadDigitalCardImage(card); }} type="button">
                            Baixar imagem
                          </button>
                          <button className="secondary" onClick={() => editMember(member)} type="button">
                            Editar ficha
                          </button>
                          {isAdminView && <button className="secondary" onClick={() => toggleMemberCredentials(member)} type="button">
                            Login e senha
                          </button>}
                          {isAdminView && <button className="danger-action" onClick={() => deleteMember(member)} type="button">
                            Excluir ficha
                          </button>}
                        </div>
                      </div>
                      {isAdminView && memberCredentialForm.memberId === member.id && (
                        <div className="credential-panel">
                          <div className="panel-heading compact-heading">
                            <h2>Acesso do membro</h2>
                            <span>{member.authUserId ? "Login vinculado" : "Novo login"}</span>
                          </div>
                          <div className="form-grid">
                            <label>
                              Login / e-mail
                              <input
                                onChange={(event) => setMemberCredentialForm((form) => ({ ...form, email: event.target.value }))}
                                placeholder="membro@email.com"
                                type="email"
                                value={memberCredentialForm.email}
                              />
                            </label>
                            <label>
                              Senha
                              <input
                                onChange={(event) => setMemberCredentialForm((form) => ({ ...form, password: event.target.value }))}
                                placeholder="Minimo 6 caracteres"
                                type="password"
                                value={memberCredentialForm.password}
                              />
                            </label>
                            <button className="primary-action" disabled={!canSaveMemberAccess} onClick={() => { void saveMemberAccess(member); }} type="button">
                              Criar ou atualizar login
                            </button>
                            <a
                              aria-disabled={!normalizeWhatsappPhone(member.phone) || !memberCredentialForm.email.trim()}
                              className={!normalizeWhatsappPhone(member.phone) || !memberCredentialForm.email.trim() ? "whatsapp-link full disabled" : "whatsapp-link full"}
                              href={whatsappUrl(member.phone, memberAccessMessage(member), member.fullName)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Enviar login pelo WhatsApp
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {!visibleMembers.length && <p className="empty-state">Nenhuma ficha vinculada a este acesso.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "kids" && (
            <section className="content-grid">
              {isAdminView && <article className="surface">
                <div className="panel-heading">
                  <h2>Cadastro Kids</h2>
                  <span>Crianca e responsavel</span>
                </div>
                <div className="form-grid">
                  <div className="photo-uploader full">
                    <div className="photo-preview kids-preview">
                      {kidForm.photoDataUrl ? <img alt="" src={kidForm.photoDataUrl} /> : <span>Kids</span>}
                    </div>
                    <label>
                      Foto da crianca
                      <input accept="image/*" onChange={(event) => readPhoto(event, (photoDataUrl) => setKidForm((form) => ({ ...form, photoDataUrl })))} type="file" />
                    </label>
                  </div>
                  <label className="full">
                    Nome da crianca
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, childName: event.target.value }))}
                      placeholder="Ex.: Julia Santos"
                      value={kidForm.childName}
                    />
                  </label>
                  <label>
                    Nascimento
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, birthDate: event.target.value }))}
                      type="date"
                      value={kidForm.birthDate}
                    />
                  </label>
                  <label>
                    Faixa
                    <select onChange={(event) => setKidForm((form) => ({ ...form, ageGroup: event.target.value as KidRecord["ageGroup"] }))} value={kidForm.ageGroup}>
                      <option>Bercario</option>
                      <option>Maternal</option>
                      <option>Kids</option>
                      <option>Juniores</option>
                    </select>
                  </label>
                  <label>
                    Turma
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, className: event.target.value }))}
                      placeholder="Ex.: Kids 6 a 8"
                      value={kidForm.className}
                    />
                  </label>
                  <label>
                    Desde
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, joinedAt: event.target.value }))}
                      type="date"
                      value={kidForm.joinedAt}
                    />
                  </label>
                  <label className="full">
                    Alergias ou cuidados
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, allergies: event.target.value }))}
                      placeholder="Ex.: alergia alimentar, medicamento, observacao medica"
                      value={kidForm.allergies}
                    />
                  </label>
                  <label>
                    Responsavel
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, guardianName: event.target.value }))}
                      placeholder="Nome do responsavel"
                      value={kidForm.guardianName}
                    />
                  </label>
                  <label>
                    Parentesco
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, relationship: event.target.value }))}
                      placeholder="Mae, pai, avo, tutor"
                      value={kidForm.relationship}
                    />
                  </label>
                  <label>
                    Telefone do responsavel
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, guardianPhone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={kidForm.guardianPhone}
                    />
                  </label>
                  <label>
                    E-mail do responsavel
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, guardianEmail: event.target.value }))}
                      placeholder="responsavel@email.com"
                      type="email"
                      value={kidForm.guardianEmail}
                    />
                  </label>
                  <label className="full">
                    Pessoas autorizadas a buscar
                    <input
                      onChange={(event) => setKidForm((form) => ({ ...form, authorizedPickup: event.target.value }))}
                      placeholder="Informe quem pode retirar a crianca"
                      value={kidForm.authorizedPickup}
                    />
                  </label>
                  <label className="check-card full">
                    <input
                      checked={kidForm.consentImage}
                      onChange={(event) => setKidForm((form) => ({ ...form, consentImage: event.target.checked }))}
                      type="checkbox"
                    />
                    Responsavel autorizou uso de imagem
                  </label>
                  <label className="full">
                    Observacoes
                    <textarea
                      onChange={(event) => setKidForm((form) => ({ ...form, notes: event.target.value }))}
                      placeholder="Rotina, restricoes, acompanhamento ou informacoes para professores"
                      value={kidForm.notes}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateKid} onClick={createKid} type="button">
                    Salvar Kids
                  </button>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>{isAdminView ? "Kids cadastrados" : "Area Kids vinculada"}</h2>
                  <span>{visibleKids.length} crianca{visibleKids.length === 1 ? "" : "s"}</span>
                </div>
                {isAdminView && <div className="birthday-grid">
                  <div className="birthday-card kids-birthday">
                    <strong>Aniversariantes Kids do mes</strong>
                    <span>{monthlyKidsBirthdays.length}</span>
                    <small>
                      {monthlyKidsBirthdays.length
                        ? monthlyKidsBirthdays.map((kid) => `${kid.childName} (${birthdayLabel(kid.birthDate)})`).join(", ")
                        : "Nenhum aniversario Kids neste mes."}
                    </small>
                  </div>
                  <div className="birthday-card kids-birthday">
                    <strong>Responsaveis</strong>
                    <span>{new Set(data.kids.map((kid) => kid.guardianPhone)).size}</span>
                    <small>Contatos para check-in, retirada e avisos do departamento.</small>
                  </div>
                </div>}
                <div className="row-list">
                  {visibleKids.map((kid) => {
                    const card = kidCardData(kid);

                    return (
                    <div className="member-record kids-record" key={kid.id}>
                      <div className="data-row member-row">
                        <div className="member-avatar kids-avatar">
                          {kid.photoDataUrl ? <img alt="" src={kid.photoDataUrl} /> : kid.childName.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{kid.childName}</strong>
                          <small>
                            {kid.ageGroup} - {kid.className || "Turma nao informada"} - Aniv. {birthdayLabel(kid.birthDate)}
                          </small>
                          <small>
                            Resp. {kid.guardianName} - {kid.guardianPhone} - Retirada: {kid.authorizedPickup || "nao informada"}
                          </small>
                        </div>
                      </div>
                      <div className="digital-card kids-card">
                        <div className="digital-card-top">
                          <span>{card.title}</span>
                          <strong>{card.church}</strong>
                        </div>
                        <div className="digital-card-body">
                          <div className="member-avatar kids-avatar">
                            {kid.photoDataUrl ? <img alt="" src={kid.photoDataUrl} /> : kid.childName.slice(0, 1)}
                          </div>
                          <div>
                            <strong>{card.name}</strong>
                            <small>{card.id}</small>
                            <small>{card.subtitle}</small>
                            <small>{card.detail}</small>
                          </div>
                        </div>
                        <div className="digital-card-footer">
                          <span>{card.footerLeft}</span>
                          <span>{card.footerRight}</span>
                        </div>
                        <div className="card-actions">
                          <button onClick={() => { void saveCardExportToSupabase(card, "print_pdf"); printDigitalCard(card); }} type="button">
                            Imprimir/PDF
                          </button>
                          <button className="secondary" onClick={() => { void saveCardExportToSupabase(card, "image_svg"); downloadDigitalCardImage(card); }} type="button">
                            Baixar imagem
                          </button>
                          {isAdminView && <button className="danger-action" onClick={() => deleteKid(kid)} type="button">
                            Excluir cadastro
                          </button>}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {!visibleKids.length && <p className="empty-state">Nenhum cadastro Kids vinculado a este acesso.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "ministries" && (
            <section className="content-grid">
              <article className="surface">
                <div className="panel-heading">
                  <h2>Novo ministerio</h2>
                  <span>Equipe</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Nome do ministerio
                    <input
                      onChange={(event) => setMinistryForm((form) => ({ ...form, name: event.target.value }))}
                      placeholder="Ex.: Recepcao"
                      value={ministryForm.name}
                    />
                  </label>
                  <label>
                    Lider
                    <input
                      onChange={(event) => setMinistryForm((form) => ({ ...form, leader: event.target.value }))}
                      placeholder="Nome do lider"
                      value={ministryForm.leader}
                    />
                  </label>
                  <label>
                    Auxiliar
                    <input
                      onChange={(event) => setMinistryForm((form) => ({ ...form, assistant: event.target.value }))}
                      placeholder="Opcional"
                      value={ministryForm.assistant}
                    />
                  </label>
                  <label>
                    Dia de reuniao
                    <input
                      onChange={(event) => setMinistryForm((form) => ({ ...form, meetingDay: event.target.value }))}
                      placeholder="Ex.: Quinta-feira"
                      value={ministryForm.meetingDay}
                    />
                  </label>
                  <label>
                    Voluntarios
                    <input
                      min={0}
                      onChange={(event) => setMinistryForm((form) => ({ ...form, volunteers: Number(event.target.value) }))}
                      type="number"
                      value={ministryForm.volunteers}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      onChange={(event) => setMinistryForm((form) => ({ ...form, status: event.target.value as MinistryRecord["status"] }))}
                      value={ministryForm.status}
                    >
                      <option>Ativo</option>
                      <option>Em formacao</option>
                      <option>Pausado</option>
                    </select>
                  </label>
                  <label className="full">
                    Observacoes
                    <textarea
                      onChange={(event) => setMinistryForm((form) => ({ ...form, notes: event.target.value }))}
                      placeholder="Escalas, necessidades ou observacoes"
                      value={ministryForm.notes}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateMinistry} onClick={createMinistry} type="button">
                    Adicionar ministerio
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Ministerios</h2>
                  <span>{data.ministries.length} equipes</span>
                </div>
                <div className="row-list">
                  {data.ministries.map((ministry) => (
                    <div className="data-row" key={ministry.id}>
                      <span className="date-box">{ministry.volunteers}</span>
                      <div>
                        <strong>{ministry.name}</strong>
                        <small>
                          {ministry.status} - Lider: {ministry.leader}
                          {ministry.assistant ? ` - Auxiliar: ${ministry.assistant}` : ""}
                        </small>
                        <small>{ministry.meetingDay || "Reuniao nao definida"} - {ministry.notes || "Sem observacoes"}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "school" && (
            <section className="content-grid">
              {isAdminView && <article className="surface">
                <div className="panel-heading">
                  <h2>Novo aviso da EBD</h2>
                  <span>Por classe</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Classe
                    <select
                      onChange={(event) => setSchoolNoticeForm((form) => ({ ...form, classId: event.target.value }))}
                      value={schoolNoticeForm.classId}
                    >
                      {data.schoolClasses.map((schoolClass) => (
                        <option key={schoolClass.id} value={schoolClass.id}>
                          {schoolClass.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    Titulo do aviso
                    <input
                      onChange={(event) => setSchoolNoticeForm((form) => ({ ...form, title: event.target.value }))}
                      placeholder="Ex.: Material da proxima aula"
                      value={schoolNoticeForm.title}
                    />
                  </label>
                  <label className="full">
                    Mensagem
                    <textarea
                      onChange={(event) => setSchoolNoticeForm((form) => ({ ...form, body: event.target.value }))}
                      placeholder="Escreva o aviso para a classe selecionada"
                      value={schoolNoticeForm.body}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateSchoolNotice} onClick={createSchoolNotice} type="button">
                    Gerar aviso para classe
                  </button>
                  <button
                    className="secondary"
                    disabled={!canCreateSchoolNotice}
                    onClick={() => {
                      const selectedClass = data.schoolClasses.find((schoolClass) => schoolClass.id === schoolNoticeForm.classId);
                      if (selectedClass) openClassWhatsapp(selectedClass, schoolNoticeForm.title, schoolNoticeForm.body, "EBD");
                    }}
                    type="button"
                  >
                    Enviar via WhatsApp
                  </button>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Classes da EBD</h2>
                  <span>{data.schoolClasses.length} classes</span>
                </div>
                <div className="row-list">
                  {data.schoolClasses.map((schoolClass) => (
                    <div className="data-row class-row" key={schoolClass.id}>
                      <span className="date-box">{schoolClass.students}</span>
                      <div>
                        <strong>{schoolClass.name}</strong>
                        <small>Professor: {schoolClass.teacher} - Proxima aula: {schoolClass.nextLesson}</small>
                        {isAdminView && <small>{classWhatsappRecipients(schoolClass, "EBD").length} contatos de WhatsApp encontrados</small>}
                        <div className="notice-stack">
                          {schoolClass.notices.length === 0 ? (
                            <small>Nenhum aviso enviado para esta classe.</small>
                          ) : (
                            schoolClass.notices.map((notice) => (
                              <span className="notice-pill" key={notice.id}>
                                {notice.title}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "discipleship" && (
            <section className="content-grid">
              {isAdminView && <article className="surface">
                <div className="panel-heading">
                  <h2>Novo aviso do Discipulado</h2>
                  <span>Por classe</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Classe
                    <select
                      onChange={(event) => setDiscipleshipNoticeForm((form) => ({ ...form, classId: event.target.value }))}
                      value={discipleshipNoticeForm.classId}
                    >
                      {data.discipleshipClasses.map((discipleshipClass) => (
                        <option key={discipleshipClass.id} value={discipleshipClass.id}>
                          {discipleshipClass.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    Titulo do aviso
                    <input
                      onChange={(event) => setDiscipleshipNoticeForm((form) => ({ ...form, title: event.target.value }))}
                      placeholder="Ex.: Encontro de acompanhamento"
                      value={discipleshipNoticeForm.title}
                    />
                  </label>
                  <label className="full">
                    Mensagem
                    <textarea
                      onChange={(event) => setDiscipleshipNoticeForm((form) => ({ ...form, body: event.target.value }))}
                      placeholder="Escreva o aviso para a classe selecionada"
                      value={discipleshipNoticeForm.body}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateDiscipleshipNotice} onClick={createDiscipleshipNotice} type="button">
                    Gerar aviso para classe
                  </button>
                  <button
                    className="secondary"
                    disabled={!canCreateDiscipleshipNotice}
                    onClick={() => {
                      const selectedClass = data.discipleshipClasses.find((discipleshipClass) => discipleshipClass.id === discipleshipNoticeForm.classId);
                      if (selectedClass) openClassWhatsapp(selectedClass, discipleshipNoticeForm.title, discipleshipNoticeForm.body, "Discipulado");
                    }}
                    type="button"
                  >
                    Enviar via WhatsApp
                  </button>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Classes do Discipulado</h2>
                  <span>{data.discipleshipClasses.length} classes</span>
                </div>
                <div className="row-list">
                  {data.discipleshipClasses.map((discipleshipClass) => (
                    <div className="data-row class-row" key={discipleshipClass.id}>
                      <span className="date-box">{discipleshipClass.students}</span>
                      <div>
                        <strong>{discipleshipClass.name}</strong>
                        <small>Professor: {discipleshipClass.teacher} - Proxima aula: {discipleshipClass.nextLesson}</small>
                        {isAdminView && <small>{classWhatsappRecipients(discipleshipClass, "Discipulado").length} contatos de WhatsApp encontrados</small>}
                        <div className="notice-stack">
                          {discipleshipClass.notices.length === 0 ? (
                            <small>Nenhum aviso enviado para esta classe.</small>
                          ) : (
                            discipleshipClass.notices.map((notice) => (
                              <span className="notice-pill" key={notice.id}>
                                {notice.title}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "messages" && (
            <section className="content-grid">
              <article className="surface">
                <div className="panel-heading">
                  <h2>Comunicacao por WhatsApp</h2>
                  <span>{messageRecipients.length} contatos</span>
                </div>
                <div className="form-grid">
                  <label>
                    Publico
                    <select onChange={(event) => setMessageAudience(event.target.value as MessageAudience)} value={messageAudience}>
                      {messageAudiences.map((audience) => (
                        <option key={audience}>{audience}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Modelo pronto
                    <select onChange={(event) => selectMessageTemplate(event.target.value)} value={messageTemplateId}>
                      {availableMessageTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    Mensagem
                    <textarea
                      onChange={(event) => setMessageText(event.target.value)}
                      placeholder="Use {nome} para personalizar com o nome de cada pessoa."
                      value={messageText}
                    />
                  </label>
                  <div className="message-preview full">
                    <strong>Previa</strong>
                    <span>{messageRecipients[0] ? messageFor(messageText, messageRecipients[0].name) : "Nenhum contato encontrado para este publico."}</span>
                  </div>
                  <button className="primary-action" disabled={!messageRecipients.length || !messageText.trim()} onClick={openBulkWhatsapp} type="button">
                    Abrir envio em massa
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Lista de envio</h2>
                  <span>WhatsApp</span>
                </div>
                <p className="body-copy">
                  O WhatsApp pode bloquear muitas abas ao mesmo tempo. Se necessario, envie pela lista individual abaixo.
                </p>
                <div className="row-list">
                  {messageRecipients.length === 0 ? (
                    <div className="data-row">
                      <span className="bullet-mark" />
                      <div>
                        <strong>Nenhum contato encontrado</strong>
                        <small>Cadastre telefone nos membros, professores, ministerios ou responsaveis Kids.</small>
                      </div>
                    </div>
                  ) : (
                    messageRecipients.map((recipient) => (
                      <div className="data-row message-row" key={`${recipient.id}-${recipient.phone}`}>
                        <span className="bullet-mark" />
                        <div>
                          <strong>{recipient.name}</strong>
                          <small>{recipient.group} - {recipient.phone}</small>
                        </div>
                        <a className="whatsapp-link" href={whatsappUrl(recipient.phone, messageText, recipient.name)} rel="noreferrer" target="_blank">
                          Enviar
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>
          )}

          {activeModule === "reports" && (
            <SimpleModule
              action={() => log("Relatorio operacional gerado")}
              button="Gerar registro"
              description="Resumo local para acompanhar operacao antes da integracao final."
              rows={[
                `${data.careRequests.length} atendimentos pastorais`,
                `${data.members.length} membros cadastrados`,
                `${monthlyBirthdays.length} aniversariantes no mes`,
                `${data.kids.length} criancas no Kids`,
                `${monthlyKidsBirthdays.length} aniversariantes Kids no mes`,
                `${data.users.length} usuarios com acesso`,
                `${data.schoolClasses.length} classes EBD`,
                `${data.discipleshipClasses.length} classes Discipulado`,
                `${messageRecipients.length} contatos no envio atual`,
                `${data.events.length} eventos cadastrados`,
                `${unreadCount} notificacoes nao lidas`,
              ]}
              title="Relatorios"
            />
          )}

          {activeModule === "settings" && (
            <section className="content-grid">
              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Backup e recuperacao local</h2>
                  <span>JSON validado</span>
                </div>
                <p className="body-copy">
                  Esta copia roda neste computador. O backup abaixo representa os dados locais do navegador e ajuda a
                  validar a estrutura antes de conectar novamente ao Supabase.
                </p>
                <div className="backup-box">
                  <strong>Cobertura do backup</strong>
                  <span>100%</span>
                  <small>
                    {data.members.length} membros, {monthlyBirthdays.length} aniversariantes no mes, {data.kids.length} criancas no Kids,
                    {" "}
                    {monthlyKidsBirthdays.length} aniversariantes Kids no mes, {data.users.length} usuarios,
                    {" "}
                    {data.careRequests.length} atendimentos,
                    {" "}
                    {data.events.length} eventos, {data.schoolClasses.length} classes EBD,
                    {" "}
                    {data.discipleshipClasses.length} classes Discipulado, {activeNotices.length} comunicados ativos,
                    {" "}
                    {data.mural.length} itens de mural e {data.audit.length} auditorias.
                  </small>
                </div>
                <textarea className="backup-json" readOnly value={JSON.stringify(data, null, 2)} />
                <div className="detail-actions">
                  <button onClick={() => log("Backup local gerado")} type="button">
                    Registrar backup
                  </button>
                  <button className="secondary" onClick={resetLocalData} type="button">
                    Restaurar dados exemplo
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Auditoria</h2>
                  <span>{data.audit.length} eventos</span>
                </div>
                <div className="audit-list">
                  {data.audit.map((item) => (
                    <div className="audit-item" key={item.id}>
                      <strong>{item.action}</strong>
                      <small>{formatDateTime(item.when)}</small>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function AccessScreen({
  accessMessage,
  loginPasswordVisible,
  mode,
  onLogin,
  onRecover,
  onSwitchMode,
  setLoginPasswordVisible,
}: {
  accessMessage: string;
  loginPasswordVisible: boolean;
  mode: AccessMode;
  onLogin: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onRecover: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: AccessMode) => void;
  setLoginPasswordVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const isLogin = mode === "login";
  const isRecover = mode === "recover";
  const title = isRecover ? "Recuperar acesso" : "Bem-vindo de volta";
  const description = isLogin
    ? "Use seu e-mail e senha para acessar o painel correto."
    : "Informe seu e-mail para pedir a redefinicao da senha.";

  return (
    <main className="access-page">
      <section className="access-intro" aria-label="Apresentacao do sistema">
        <div className="brand-block">
          <div className="brand-mark">IG</div>
          <p className="brand-name">Igreja Conectada</p>
        </div>
        <div>
          <p className="access-kicker">Cuidar - Servir - Conectar</p>
          <h1>Toda a igreja, mais perto.</h1>
          <p>Uma plataforma segura para fortalecer o cuidado com pessoas, ministerios e a missao.</p>
        </div>
        <blockquote>
          <p>&quot;Sirvam uns aos outros, cada um conforme o dom que recebeu.&quot;</p>
          <cite>1 Pedro 4:10</cite>
        </blockquote>
      </section>

      <section className="access-panel" aria-label={title}>
        <div className="access-copy">
          <p className="eyebrow">Area segura</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        {accessMessage && (
          <p className="form-message" role="status">
            {accessMessage}
          </p>
        )}

        {isLogin && (
          <form className="access-form" method="post" onSubmit={onLogin}>
            <label>
              E-mail
              <input autoComplete="email" name="email" placeholder="voce@email.com" required type="email" />
            </label>
            <label>
              Senha
              <span className="password-field">
                <input
                  autoComplete="current-password"
                  name="password"
                  placeholder="Sua senha"
                  required
                  type={loginPasswordVisible ? "text" : "password"}
                />
                <button
                  aria-label={loginPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setLoginPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {loginPasswordVisible ? "Ocultar" : "Mostrar"}
                </button>
              </span>
            </label>
            <button className="access-primary" type="submit">
              Entrar no sistema
            </button>
          </form>
        )}

        {isRecover && (
          <form className="access-form" method="post" onSubmit={onRecover}>
            <label>
              E-mail
              <input autoComplete="email" name="recovery_email" placeholder="voce@email.com" required type="email" />
            </label>
            <button className="access-primary" type="submit">
              Enviar instrucoes
            </button>
          </form>
        )}

        <div className="access-links">
          {!isRecover && (
            <button onClick={() => onSwitchMode("recover")} type="button">
              Esqueci minha senha
            </button>
          )}
          {!isLogin && (
            <button onClick={() => onSwitchMode("login")} type="button">
              Voltar ao login
            </button>
          )}
        </div>

        <div className="access-profile-note">
          <strong>Acesso por perfil</strong>
          <span>O sistema identifica membros, lideres e administradores.</span>
        </div>
      </section>
    </main>
  );
}

function SimpleModule({
  action,
  button,
  description,
  rows,
  title,
}: {
  action: () => void;
  button: string;
  description: string;
  rows: string[];
  title: string;
}) {
  const [feedback, setFeedback] = useState("");

  function handleAction() {
    action();
    setFeedback(`${button} concluido agora.`);
  }

  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>{title}</h2>
          <button onClick={handleAction} type="button">
            {button}
          </button>
        </div>
        <p className="body-copy">{description}</p>
        {feedback && <div className="action-feedback">{feedback}</div>}
        <div className="row-list">
          {rows.map((row) => (
            <div className="data-row" key={row}>
              <span className="bullet-mark" />
              <div>
                <strong>{row}</strong>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
