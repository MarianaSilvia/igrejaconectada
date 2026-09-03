"use client";

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";

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
  | "reports"
  | "settings";

type AccessMode = "login" | "recover" | "register";

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
};

type MuralItem = {
  id: string;
  title: string;
  category: string;
  published: boolean;
  featured: boolean;
  expiresAt: string;
};

type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: "Administrador" | "Lider" | "Membro";
  status: "Ativo" | "Pendente" | "Bloqueado";
};

type MemberRecord = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  status: "Membro ativo" | "Visitante" | "Novo convertido" | "Transferencia";
  memberType: "Membro" | "Visitante" | "Congregado" | "Lideranca";
  role: string;
  ministry: string;
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

type MessageAudience = "Todos os membros" | "Aniversariantes da semana" | "Aniversariantes do mes" | "EBD" | "Ministerios" | "Responsaveis Kids";

type MessageRecipient = {
  id: string;
  name: string;
  phone: string;
  group: string;
};

type DigitalCardData = {
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
  ministries: MinistryRecord[];
  audit: AuditItem[];
  notificationReadIds: string[];
};

type RegistrationForm = {
  fullName: string;
  phone: string;
  email: string;
  birthDate: string;
  maritalStatus: string;
  address: string;
  congregationInterest: string;
  registrationType: string;
  ministryRole: string;
  previousChurch: string;
  photoDataUrl: string;
  password: string;
  passwordConfirm: string;
  waterBaptized: boolean;
  holySpiritBaptized: boolean;
  interestedMinistries: string;
  notesOrPrayer: string;
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
  { key: "reports", label: "Relatorios", short: "Relatorios" },
  { key: "settings", label: "Configuracoes", short: "Config" },
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
    },
    {
      id: "notice-2",
      title: "Cadastro de novos alunos EBD",
      body: "Secretaria deve revisar as turmas antes de domingo.",
      status: "Publicado",
      audience: "Secretaria e EBD",
      channel: "Todos",
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
    },
    {
      id: "mural-2",
      title: "Encontro de casais",
      category: "Familia",
      published: true,
      featured: false,
      expiresAt: "2026-09-18",
    },
    {
      id: "mural-3",
      title: "Inscricoes para batismo",
      category: "Secretaria",
      published: false,
      featured: false,
      expiresAt: "2026-09-30",
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

const blankUser: Omit<AccessUser, "id"> = {
  name: "",
  email: "",
  role: "Lider",
  status: "Pendente",
};

const blankMember: Omit<MemberRecord, "id"> = {
  fullName: "",
  phone: "",
  email: "",
  status: "Visitante",
  memberType: "Visitante",
  role: "",
  ministry: "",
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
  "Ministerios",
  "Responsaveis Kids",
];

const messageTemplates = [
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

const blankRegistration: RegistrationForm = {
  fullName: "",
  phone: "",
  email: "",
  birthDate: "",
  maritalStatus: "Solteiro(a)",
  address: "",
  congregationInterest: "",
  registrationType: "Membro novo",
  ministryRole: "",
  previousChurch: "",
  photoDataUrl: "",
  password: "",
  passwordConfirm: "",
  waterBaptized: false,
  holySpiritBaptized: false,
  interestedMinistries: "",
  notesOrPrayer: "",
};

function formatDate(value: string) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
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

function messageFor(text: string, recipientName: string) {
  return text.replaceAll("{nome}", recipientName).replaceAll("{igreja}", "Igreja Gestao");
}

function whatsappUrl(phone: string, text: string, recipientName: string) {
  const number = normalizeWhatsappPhone(phone);
  if (!number) return "#";
  return `https://wa.me/${number}?text=${encodeURIComponent(messageFor(text, recipientName))}`;
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
  };
}

function normalizeMinistry(ministry: Partial<MinistryRecord>): MinistryRecord {
  return {
    ...blankMinistry,
    ...ministry,
    id: ministry.id ?? uid("ministry"),
  };
}

function normalizeAppData(value: Partial<AppData>): AppData {
  return {
    ...initialData,
    ...value,
    careRequests: value.careRequests ?? initialData.careRequests,
    events: (value.events ?? initialData.events).map((event) => normalizeEvent(event)),
    notices: (value.notices ?? initialData.notices).map((notice) => normalizeNotice(notice)),
    mural: value.mural ?? initialData.mural,
    users: value.users ?? initialData.users,
    members: (value.members ?? initialData.members).map((member) => normalizeMember(member)),
    kids: (value.kids ?? initialData.kids).map((kid) => normalizeKid(kid)),
    schoolClasses: value.schoolClasses ?? initialData.schoolClasses,
    ministries: (value.ministries ?? initialData.ministries).map((ministry) => normalizeMinistry(ministry)),
    audit: value.audit ?? initialData.audit,
    notificationReadIds: value.notificationReadIds ?? initialData.notificationReadIds,
  };
}

export default function Home() {
  const [hasSession, setHasSession] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("login");
  const [accessMessage, setAccessMessage] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>(blankRegistration);
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [data, setData] = useState<AppData>(initialData);
  const [careForm, setCareForm] = useState(blankCare);
  const [eventForm, setEventForm] = useState(blankEvent);
  const [noticeForm, setNoticeForm] = useState(blankNotice);
  const [ministryForm, setMinistryForm] = useState(blankMinistry);
  const [userForm, setUserForm] = useState(blankUser);
  const [memberForm, setMemberForm] = useState(blankMember);
  const [kidForm, setKidForm] = useState(blankKid);
  const [muralForm, setMuralForm] = useState(blankMuralItem);
  const [schoolNoticeForm, setSchoolNoticeForm] = useState(blankSchoolNotice);
  const [selectedRequestId, setSelectedRequestId] = useState("care-1");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [registrationLink, setRegistrationLink] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [messageAudience, setMessageAudience] = useState<MessageAudience>("Todos os membros");
  const [messageTemplateId, setMessageTemplateId] = useState("general-invite");
  const [messageText, setMessageText] = useState(messageTemplates[4].text);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;

    try {
      setData(normalizeAppData(JSON.parse(stored) as Partial<AppData>));
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("cadastro") === "novo") {
      setAccessMode("register");
      setHasSession(false);
    }
    setRegistrationLink(`${url.origin}${url.pathname}?cadastro=novo`);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data]);

  const selectedRequest = data.careRequests.find((request) => request.id === selectedRequestId) ?? data.careRequests[0];

  const notifications = useMemo(() => {
    const pendingCare = data.careRequests
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
  }, [data.careRequests, data.events, data.mural]);

  const unreadCount = notifications.filter((notice) => !data.notificationReadIds.includes(notice.id)).length;
  const monthlyBirthdays = data.members.filter((member) => isBirthdayThisMonth(member.birthDate));
  const weeklyBirthdays = monthlyBirthdays.filter((member) => isBirthdayThisWeek(member.birthDate));
  const monthlyKidsBirthdays = data.kids.filter((kid) => isBirthdayThisMonth(kid.birthDate));
  const canCreateUser = Boolean(userForm.name.trim() && userForm.email.trim());
  const canCreateMember = Boolean(memberForm.fullName.trim() && memberForm.phone.trim());
  const canCreateKid = Boolean(kidForm.childName.trim() && kidForm.guardianName.trim() && kidForm.guardianPhone.trim());
  const canCreateMuralItem = Boolean(muralForm.title.trim() && muralForm.expiresAt);
  const canCreateSchoolNotice = Boolean(schoolNoticeForm.classId && schoolNoticeForm.title.trim() && schoolNoticeForm.body.trim());
  const canCreateEvent = Boolean(eventForm.title.trim() && eventForm.date);
  const canCreateNotice = Boolean(noticeForm.title.trim() && noticeForm.body.trim());
  const canCreateMinistry = Boolean(ministryForm.name.trim() && ministryForm.leader.trim());
  const whatsappText = `Ola! Faca seu cadastro na igreja por este link: ${registrationLink}`;
  const whatsappShareLink = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
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

  function readPhoto(event: ChangeEvent<HTMLInputElement>, onReady: (photoDataUrl: string) => void) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onReady(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function log(action: string) {
    setData((current) => ({
      ...current,
      audit: [{ id: uid("audit"), action, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function createCareRequest() {
    if (!careForm.member.trim() || !careForm.summary.trim()) return;

    const now = new Date().toISOString();
    const request: CareRequest = {
      ...careForm,
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
    setCareForm(blankCare);
    setActiveModule("pastoral");
  }

  function updateCareRequest(id: string, patch: Partial<CareRequest>, action: string) {
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
    setData((current) => ({
      ...current,
      mural: current.mural.map((item) => (item.id === id ? { ...item, [field]: !item[field] } : item)),
      audit: [{ id: uid("audit"), action: "Mural atualizado", when: new Date().toISOString() }, ...current.audit],
    }));
  }

  function createUser() {
    if (!userForm.name.trim() || !userForm.email.trim()) return;

    const now = new Date().toISOString();
    const user: AccessUser = { ...userForm, id: uid("user") };

    setData((current) => ({
      ...current,
      users: [user, ...current.users],
      audit: [{ id: uid("audit"), action: `Usuario criado para ${user.name}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setUserForm(blankUser);
  }

  function createMember() {
    if (!memberForm.fullName.trim() || !memberForm.phone.trim()) return;

    const now = new Date().toISOString();
    const member: MemberRecord = { ...memberForm, id: uid("member") };

    setData((current) => ({
      ...current,
      members: [member, ...current.members],
      audit: [{ id: uid("audit"), action: `Membro cadastrado: ${member.fullName}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setMemberForm(blankMember);
  }

  function createKid() {
    if (!canCreateKid) return;

    const now = new Date().toISOString();
    const kid: KidRecord = { ...kidForm, id: uid("kid") };

    setData((current) => ({
      ...current,
      kids: [kid, ...current.kids],
      audit: [{ id: uid("audit"), action: `Crianca cadastrada no Kids: ${kid.childName}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setKidForm(blankKid);
  }

  function createMuralItem() {
    if (!muralForm.title.trim() || !muralForm.expiresAt) return;

    const now = new Date().toISOString();
    const item: MuralItem = { ...muralForm, id: uid("mural") };

    setData((current) => ({
      ...current,
      mural: [item, ...current.mural],
      audit: [{ id: uid("audit"), action: `Item publicado no mural: ${item.title}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setMuralForm(blankMuralItem);
  }

  function createEvent() {
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

  function createNotice() {
    if (!canCreateNotice) return;

    const now = new Date().toISOString();
    const notice: Notice = { ...noticeForm, id: uid("notice") };

    setData((current) => ({
      ...current,
      notices: [notice, ...current.notices],
      audit: [{ id: uid("audit"), action: `Comunicado criado: ${notice.title}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setNoticeForm(blankNotice);
  }

  function createMinistry() {
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
    setKidForm(blankKid);
    setMuralForm(blankMuralItem);
    setSchoolNoticeForm(blankSchoolNotice);
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
      value: data.notices.filter((notice) => notice.status === "Publicado").length.toString(),
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

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage("");
    setHasSession(true);
  }

  function handleLogout() {
    setHasSession(false);
    setNotificationsOpen(false);
    setActiveModule("overview");
    setAccessMode("login");
    setAccessMessage("Voce saiu do sistema com seguranca.");
  }

  async function copyRegistrationLink() {
    if (!registrationLink) return;

    try {
      await navigator.clipboard.writeText(registrationLink);
      setShareFeedback("Link de cadastro copiado.");
    } catch {
      setShareFeedback("Copie o link exibido acima para enviar.");
    }
  }

  function selectMessageTemplate(templateId: string) {
    const template = messageTemplates.find((item) => item.id === templateId);
    setMessageTemplateId(templateId);
    if (template) setMessageText(template.text);
  }

  function openBulkWhatsapp() {
    messageRecipients.slice(0, 12).forEach((recipient, index) => {
      window.setTimeout(() => {
        window.open(whatsappUrl(recipient.phone, messageText, recipient.name), "_blank", "noopener,noreferrer");
      }, index * 450);
    });
    log(`Mensagens preparadas para ${Math.min(messageRecipients.length, 12)} contatos`);
  }

  function memberCardData(member: MemberRecord): DigitalCardData {
    return {
      title: "Carteirinha digital",
      church: "Igreja Gestao",
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
      title: "Carteirinha Kids",
      church: "Igreja Gestao Kids",
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

  function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage("Se o e-mail estiver cadastrado, a administracao recebera o pedido de recuperacao.");
  }

  function handleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (registrationForm.password !== registrationForm.passwordConfirm) {
      setAccessMessage("As senhas precisam ser iguais antes de enviar.");
      return;
    }

    const now = new Date().toISOString();
    const status: MemberRecord["status"] =
      registrationForm.registrationType === "Visitante frequente"
        ? "Visitante"
        : registrationForm.registrationType === "Novo convertido"
          ? "Novo convertido"
          : registrationForm.registrationType === "Transferencia"
            ? "Transferencia"
            : "Membro ativo";
    const memberType: MemberRecord["memberType"] =
      registrationForm.registrationType === "Visitante frequente"
        ? "Visitante"
        : registrationForm.ministryRole.toLowerCase().includes("lider")
          ? "Lideranca"
          : "Membro";
    const member: MemberRecord = {
      id: uid("member"),
      fullName: registrationForm.fullName,
      phone: registrationForm.phone,
      email: registrationForm.email,
      status,
      memberType,
      role: registrationForm.ministryRole,
      ministry: registrationForm.interestedMinistries,
      photoDataUrl: registrationForm.photoDataUrl,
      birthDate: registrationForm.birthDate,
      maritalStatus: registrationForm.maritalStatus,
      address: registrationForm.address,
      congregation: registrationForm.congregationInterest,
      previousChurch: registrationForm.previousChurch,
      waterBaptized: registrationForm.waterBaptized,
      holySpiritBaptized: registrationForm.holySpiritBaptized,
      joinedAt: now.slice(0, 10),
      notes: registrationForm.notesOrPrayer,
    };

    setData((current) => ({
      ...current,
      members: [member, ...current.members],
      audit: [{ id: uid("audit"), action: `Cadastro online recebido: ${member.fullName}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setAccessMessage("Cadastro recebido para analise da administracao.");
    setRegistrationForm(blankRegistration);
  }

  if (!hasSession) {
    return (
      <AccessScreen
        accessMessage={accessMessage}
        loginPasswordVisible={loginPasswordVisible}
        mode={accessMode}
        onLogin={handleLogin}
        onRecover={handleRecover}
        onRegister={handleRegistration}
        onPhotoUpload={readPhoto}
        onSwitchMode={switchAccessMode}
        registrationForm={registrationForm}
        registerPasswordVisible={registerPasswordVisible}
        setLoginPasswordVisible={setLoginPasswordVisible}
        setRegistrationForm={setRegistrationForm}
        setRegisterPasswordVisible={setRegisterPasswordVisible}
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
              <p className="brand-name">Igreja Gestao</p>
              <p className="brand-caption">Painel administrativo</p>
            </div>
          </div>

          <nav className="module-list" aria-label="Modulos do sistema">
            {modules.map((module) => (
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
              <strong>Modo local ativo</strong>
              <span>Dados salvos neste computador</span>
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
              <h1>{modules.find((module) => module.key === activeModule)?.label}</h1>
              <label className="mobile-module-picker">
                Ir para modulo
                <select onChange={(event) => setActiveModule(event.target.value as ModuleKey)} value={activeModule}>
                  {modules.map((module) => (
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
                <span>M</span>
                <div>
                  <strong>marianabsilva1987</strong>
                  <small>Administrador</small>
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

          {activeModule === "overview" && (
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

              <article className="surface share-card">
                <div className="panel-heading">
                  <h2>Link de cadastro</h2>
                  <span>WhatsApp</span>
                </div>
                <p className="body-copy">Envie este link para membros, visitantes e novos convertidos preencherem a ficha online.</p>
                <div className="share-link">{registrationLink || "Preparando link..."}</div>
                {shareFeedback && <div className="action-feedback">{shareFeedback}</div>}
                <div className="detail-actions">
                  <button disabled={!registrationLink} onClick={copyRegistrationLink} type="button">
                    Copiar link
                  </button>
                  <a className={registrationLink ? "whatsapp-link" : "whatsapp-link disabled"} href={whatsappShareLink} rel="noreferrer" target="_blank">
                    Enviar no WhatsApp
                  </a>
                </div>
              </article>

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
                        <strong>{item.title}</strong>
                        <small>{item.category}</small>
                      </div>
                    ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "pastoral" && selectedRequest && (
            <section className="pastoral-layout">
              <article className="surface">
                <div className="panel-heading">
                  <h2>Novo pedido pastoral</h2>
                  <span>Fluxo real</span>
                </div>
                <div className="form-grid">
                  <label>
                    Nome do membro
                    <input
                      onChange={(event) => setCareForm((form) => ({ ...form, member: event.target.value }))}
                      placeholder="Ex.: Maria Oliveira"
                      value={careForm.member}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      onChange={(event) => setCareForm((form) => ({ ...form, phone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={careForm.phone}
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
                    Criar atendimento
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Fila pastoral</h2>
                  <span>{data.careRequests.length} registros</span>
                </div>
                <div className="care-list">
                  {data.careRequests.map((request) => (
                    <button
                      className={request.id === selectedRequest.id ? "care-list-item selected" : "care-list-item"}
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
                </div>
              </article>

              <article className="surface care-detail">
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
              </article>
            </section>
          )}

          {activeModule === "mural" && (
            <section className="content-grid">
              <article className="surface">
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
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Administrar mural</h2>
                  <span>{data.mural.filter((item) => item.published).length} publicados</span>
                </div>
                <div className="table-like">
                  {data.mural.map((item) => (
                    <div className="table-row" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.category} - expira em {formatDate(item.expiresAt)}</small>
                      </div>
                      <label className="switch">
                        Publicado
                        <input checked={item.published} onChange={() => toggleMural(item.id, "published")} type="checkbox" />
                      </label>
                      <label className="switch">
                        Destaque
                        <input checked={item.featured} onChange={() => toggleMural(item.id, "featured")} type="checkbox" />
                      </label>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "events" && (
            <section className="content-grid">
              <article className="surface">
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
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Agenda da igreja</h2>
                  <span>{data.events.length} eventos</span>
                </div>
                <div className="row-list">
                  {data.events.map((event) => (
                    <div className="data-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>
                          {event.time || "Sem horario"} - {event.ministry} - {event.status}
                        </small>
                        <small>{event.location || "Local nao informado"} - {event.responsible || "Sem responsavel"}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "notices" && (
            <section className="content-grid">
              <article className="surface">
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
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Comunicados</h2>
                  <span>{data.notices.length} avisos</span>
                </div>
                <div className="row-list">
                  {data.notices.map((notice) => (
                    <div className="data-row" key={notice.id}>
                      <span className="bullet-mark" />
                      <div>
                        <strong>{notice.title}</strong>
                        <small>
                          {notice.status} - {notice.audience} - {notice.channel}
                        </small>
                        <small>{notice.body}</small>
                      </div>
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
                    <div className="data-row" key={user.id}>
                      <span className="bullet-mark" />
                      <div>
                        <strong>{user.name}</strong>
                        <small>{user.role} - {user.status} - {user.email}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "members" && (
            <section className="content-grid">
              <article className="surface">
                <div className="panel-heading">
                  <h2>Ficha completa</h2>
                  <span>Membro ou visitante</span>
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
                  <label>
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
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setMemberForm((form) => ({ ...form, status: event.target.value as MemberRecord["status"] }))} value={memberForm.status}>
                      <option>Membro ativo</option>
                      <option>Visitante</option>
                      <option>Novo convertido</option>
                      <option>Transferencia</option>
                    </select>
                  </label>
                  <label>
                    Funcao na igreja
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, role: event.target.value }))}
                      placeholder="Ex.: Professor EBD, obreiro, lider"
                      value={memberForm.role}
                    />
                  </label>
                  <label>
                    Ministerio
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, ministry: event.target.value }))}
                      placeholder="Ex.: Louvor"
                      value={memberForm.ministry}
                    />
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
                  <label className="full">
                    Observacoes
                    <textarea
                      onChange={(event) => setMemberForm((form) => ({ ...form, notes: event.target.value }))}
                      placeholder="Historico, acompanhamento, restricoes ou observacoes pastorais"
                      value={memberForm.notes}
                    />
                  </label>
                  <button className="primary-action" disabled={!canCreateMember} onClick={createMember} type="button">
                    Salvar ficha
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Membros cadastrados</h2>
                  <span>{data.members.length} registros</span>
                </div>
                <div className="birthday-grid">
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
                </div>
                <div className="row-list">
                  {data.members.map((member) => {
                    const card = memberCardData(member);

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
                          <button onClick={() => printDigitalCard(card)} type="button">
                            Imprimir/PDF
                          </button>
                          <button className="secondary" onClick={() => downloadDigitalCardImage(card)} type="button">
                            Baixar imagem
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </article>
            </section>
          )}

          {activeModule === "kids" && (
            <section className="content-grid">
              <article className="surface">
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
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Kids cadastrados</h2>
                  <span>{data.kids.length} criancas</span>
                </div>
                <div className="birthday-grid">
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
                </div>
                <div className="row-list">
                  {data.kids.map((kid) => {
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
                          <button onClick={() => printDigitalCard(card)} type="button">
                            Imprimir/PDF
                          </button>
                          <button className="secondary" onClick={() => downloadDigitalCardImage(card)} type="button">
                            Baixar imagem
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
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
              <article className="surface">
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
                </div>
              </article>

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
                      {messageTemplates.map((template) => (
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
                    {data.events.length} eventos, {data.schoolClasses.length} classes EBD, {data.notices.length} comunicados,
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
  onPhotoUpload,
  onRecover,
  onRegister,
  onSwitchMode,
  registrationForm,
  registerPasswordVisible,
  setLoginPasswordVisible,
  setRegistrationForm,
  setRegisterPasswordVisible,
}: {
  accessMessage: string;
  loginPasswordVisible: boolean;
  mode: AccessMode;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onPhotoUpload: (event: ChangeEvent<HTMLInputElement>, onReady: (photoDataUrl: string) => void) => void;
  onRecover: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: AccessMode) => void;
  registrationForm: RegistrationForm;
  registerPasswordVisible: boolean;
  setLoginPasswordVisible: Dispatch<SetStateAction<boolean>>;
  setRegistrationForm: Dispatch<SetStateAction<RegistrationForm>>;
  setRegisterPasswordVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const isLogin = mode === "login";
  const isRecover = mode === "recover";
  const title = isLogin ? "Bem-vindo de volta" : isRecover ? "Recuperar acesso" : "Solicitar cadastro";
  const eyebrow = isLogin || isRecover ? "Area segura" : "Cadastro online";
  const description = isLogin
    ? "Use seu e-mail e senha para acessar o painel correto."
    : isRecover
      ? "Informe seu e-mail para pedir a redefinicao da senha."
      : "Preencha seus dados para a administracao analisar e liberar o acesso.";

  return (
    <main className="access-page">
      <section className="access-intro" aria-label="Apresentacao do sistema">
        <div className="brand-block">
          <div className="brand-mark">IG</div>
          <p className="brand-name">Igreja Gestao</p>
        </div>
        <div>
          <p className="access-kicker">Cuidar - Servir - Conectar</p>
          <h1>Toda a igreja, mais perto.</h1>
          <p>Uma plataforma segura para fortalecer o cuidado com pessoas, ministerios e a missao.</p>
        </div>
        <blockquote>
          <p>"Sirvam uns aos outros, cada um conforme o dom que recebeu."</p>
          <cite>1 Pedro 4:10</cite>
        </blockquote>
      </section>

      <section className="access-panel" aria-label={title}>
        <div className="access-copy">
          <p className="eyebrow">{eyebrow}</p>
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

        {mode === "register" && (
          <form className="access-form registration-form" method="post" onSubmit={onRegister}>
            <div className="photo-uploader full">
              <div className="photo-preview">
                {registrationForm.photoDataUrl ? <img alt="" src={registrationForm.photoDataUrl} /> : <span>Foto</span>}
              </div>
              <label>
                Enviar foto
                <input
                  accept="image/*"
                  onChange={(event) => onPhotoUpload(event, (photoDataUrl) => setRegistrationForm((form) => ({ ...form, photoDataUrl })))}
                  type="file"
                />
              </label>
            </div>
            <label className="full">
              Nome completo
              <input
                autoComplete="name"
                minLength={3}
                name="full_name"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, fullName: event.target.value }))}
                required
                value={registrationForm.fullName}
              />
            </label>
            <label>
              Telefone
              <input
                autoComplete="tel"
                minLength={8}
                name="phone"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, phone: event.target.value }))}
                required
                value={registrationForm.phone}
              />
            </label>
            <label>
              E-mail
              <input
                autoComplete="email"
                name="email"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, email: event.target.value }))}
                required
                type="email"
                value={registrationForm.email}
              />
            </label>
            <label>
              Nascimento
              <input
                autoComplete="bday"
                name="birth_date"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, birthDate: event.target.value }))}
                required
                type="date"
                value={registrationForm.birthDate}
              />
            </label>
            <label>
              Estado civil
              <select
                name="marital_status"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, maritalStatus: event.target.value }))}
                value={registrationForm.maritalStatus}
              >
                <option>Solteiro(a)</option>
                <option>Casado(a)</option>
                <option>Viuvo(a)</option>
                <option>Divorciado(a)</option>
              </select>
            </label>
            <label className="full">
              Endereco
              <input
                autoComplete="street-address"
                name="address"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, address: event.target.value }))}
                value={registrationForm.address}
              />
            </label>
            <label>
              Congregacao de interesse
              <input
                name="congregation_interest"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, congregationInterest: event.target.value }))}
                placeholder="Ex.: Maringa"
                value={registrationForm.congregationInterest}
              />
            </label>
            <label>
              Tipo de cadastro
              <select
                name="registration_type"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, registrationType: event.target.value }))}
                value={registrationForm.registrationType}
              >
                <option>Membro novo</option>
                <option>Novo convertido</option>
                <option>Visitante frequente</option>
                <option>Transferencia</option>
              </select>
            </label>
            <label>
              Funcao ou interesse
              <input
                name="ministry_role"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, ministryRole: event.target.value }))}
                placeholder="Ex.: aluno EBD, obreiro, louvor"
                value={registrationForm.ministryRole}
              />
            </label>
            <label className="full">
              Igreja anterior
              <input
                name="previous_church"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, previousChurch: event.target.value }))}
                value={registrationForm.previousChurch}
              />
            </label>
            <label>
              Criar senha de acesso
              <span className="password-field">
                <input
                  autoComplete="new-password"
                  minLength={10}
                  name="login_password"
                  onChange={(event) => setRegistrationForm((form) => ({ ...form, password: event.target.value }))}
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}"
                  required
                  title="Use pelo menos 10 caracteres, com maiuscula, minuscula, numero e simbolo."
                  type={registerPasswordVisible ? "text" : "password"}
                  value={registrationForm.password}
                />
                <button
                  aria-label={registerPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setRegisterPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {registerPasswordVisible ? "Ocultar" : "Mostrar"}
                </button>
              </span>
              <small>Essa senha sera usada no login depois da aprovacao.</small>
            </label>
            <label>
              Confirmar senha
              <input
                autoComplete="new-password"
                minLength={10}
                name="login_password_confirm"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, passwordConfirm: event.target.value }))}
                required
                type={registerPasswordVisible ? "text" : "password"}
                value={registrationForm.passwordConfirm}
              />
            </label>
            <label className="check-card">
              <input
                checked={registrationForm.waterBaptized}
                name="is_water_baptized"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, waterBaptized: event.target.checked }))}
                type="checkbox"
              />
              Batizado em aguas
            </label>
            <label className="check-card">
              <input
                checked={registrationForm.holySpiritBaptized}
                name="is_holy_spirit_baptized"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, holySpiritBaptized: event.target.checked }))}
                type="checkbox"
              />
              Batizado no Espirito Santo
            </label>
            <label className="full">
              Ministerios de interesse
              <input
                name="interested_ministries"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, interestedMinistries: event.target.value }))}
                placeholder="Louvor, jovens, acao social"
                value={registrationForm.interestedMinistries}
              />
            </label>
            <label className="full">
              Observacao ou pedido de oracao
              <textarea
                name="notes_or_prayer"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, notesOrPrayer: event.target.value }))}
                value={registrationForm.notesOrPrayer}
              />
            </label>
            <button className="access-primary full" type="submit">
              Enviar cadastro
            </button>
          </form>
        )}

        <div className="access-links">
          {!isRecover && (
            <button onClick={() => onSwitchMode("recover")} type="button">
              Esqueci minha senha
            </button>
          )}
          {mode !== "register" && (
            <button onClick={() => onSwitchMode("register")} type="button">
              Fazer cadastro online
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
