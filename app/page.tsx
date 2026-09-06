"use client";

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  birthdayDateThisYear,
  birthdayLabel,
  classNoticeWhatsappText,
  comparablePhone,
  currentDateKey,
  dateAfterDays,
  eventDate,
  formatDate,
  formatDateTime,
  isBirthdayThisMonth,
  isBirthdayThisWeek,
  isEventInWeek,
  isExpiredDate,
  messageFor,
  normalizeEmail,
  normalizeSearchText,
  normalizeWhatsappPhone,
  replaceLegacyMinistryText,
  sortEventsByDate,
  weekRangeWithOffset,
  whatsappUrl,
} from "./app-helpers";
import { accessRoleFromMetadata, canAccessModule, canManageModule, isAdministrativeRole, modules, type AccessRole, type ModuleKey } from "./permissions";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client";
import type {
  AccessMode,
  AccessUser,
  AccessUserForm,
  AppData,
  AssetRecord,
  AttendanceArea,
  AttendanceSession,
  AttendanceStatus,
  CareRequest,
  CareStatus,
  ChurchEvent,
  DevotionalRecord,
  KidRecord,
  MemberFormTab,
  MemberRecord,
  MessageAudience,
  MessageCampaign,
  MessageRecipient,
  MessageTemplateItem,
  MinistryRecord,
  MuralImageResult,
  MuralItem,
  Notice,
  RemoteAppStateResponse,
  ReportKind,
  SaveState,
  ScheduleRecord,
  SchoolClass,
  TransactionRecord,
  VisitorRecord,
} from "./types";

const storageKey = "igreja-gestao-local-v1";
const photoCacheKey = "igreja-conectada-photo-cache-v1";

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
      recurrence: "Unico",
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
      recurrence: "Unico",
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
      recurrence: "Unico",
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
      fatherName: "",
      motherName: "",
      cpf: "",
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
      conversionDate: "",
      baptismDate: "",
      registrationSource: "Cadastro interno",
      pastoralStatus: "Acompanhamento regular",
      memberVisibleNotes: "Participa da classe de adultos.",
      waterBaptized: true,
      holySpiritBaptized: true,
      joinedAt: "2021-03-14",
      notes: "Acompanha novos casais e participa da recepcao.",
    },
    {
      id: "member-2",
      fullName: "Carlos Lima",
      fatherName: "",
      motherName: "",
      cpf: "",
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
      conversionDate: "",
      baptismDate: "",
      registrationSource: "Visita presencial",
      pastoralStatus: "Precisa de contato",
      memberVisibleNotes: "Bem-vindo ao acompanhamento da igreja.",
      waterBaptized: false,
      holySpiritBaptized: false,
      joinedAt: "2026-08-22",
      notes: "Solicitou visita pastoral para conhecer melhor a igreja.",
    },
  ],
  visitors: [
    {
      id: "visitor-1",
      fullName: "Carlos Lima",
      phone: "(21) 97777-5402",
      firstVisitDate: "2026-08-22",
      returnDate: "",
      invitedBy: "Recepcao",
      contactMade: false,
      integrationStatus: "Em acompanhamento",
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
  schedules: [
    {
      id: "schedule-1",
      date: "2026-09-06",
      serviceType: "Culto da familia",
      group: "Louvor",
      functionName: "Dirigente",
      assignedTo: "Ana Ribeiro",
      phone: "(11) 98888-1201",
      confirmationStatus: "Confirmado",
      notes: "Chegar 30 minutos antes para alinhamento.",
    },
  ],
  transactions: [
    {
      id: "transaction-1",
      date: "2026-09-06",
      type: "Oferta",
      category: "Culto",
      description: "Oferta do culto da familia",
      amount: 0,
      method: "Dinheiro/Pix",
      status: "Pendente",
      memberName: "",
      notes: "Modulo inicial preparado para a tesouraria.",
    },
  ],
  assets: [
    {
      id: "asset-1",
      name: "Microfone principal",
      category: "Som",
      location: "Templo principal",
      responsible: "Equipe de midia",
      condition: "Bom",
      lastMaintenance: "",
      notes: "Cadastro inicial para controle de patrimonio.",
    },
  ],
  devotionals: [
    {
      id: "devotional-1",
      title: "Palavra do dia",
      verse: "Salmo 23:1",
      body: "O Senhor e o nosso pastor. Hoje, caminhe com confianca, cuidado e gratidao.",
      status: "Publicado",
      publishedAt: "2026-09-06",
    },
  ],
  audit: [
    { id: "audit-1", action: "Central de notificacoes criada", when: "2026-09-02T15:10:00.000Z" },
    { id: "audit-2", action: "Modulo de backup validado", when: "2026-09-02T14:42:00.000Z" },
  ],
  attendanceSessions: [],
  messageTemplates: [],
  messageCampaigns: [],
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
  recurrence: "Unico",
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
  fatherName: "",
  motherName: "",
  cpf: "",
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
  conversionDate: "",
  baptismDate: "",
  registrationSource: "",
  pastoralStatus: "Sem acompanhamento definido",
  memberVisibleNotes: "",
  waterBaptized: false,
  holySpiritBaptized: false,
  joinedAt: "",
  notes: "",
};

const blankVisitor: Omit<VisitorRecord, "id"> = {
  fullName: "",
  phone: "",
  firstVisitDate: "",
  returnDate: "",
  invitedBy: "",
  contactMade: false,
  integrationStatus: "Primeira visita",
  notes: "",
};

const memberRoleOptions = [
  "Professor",
  "Dirigente",
  "Vice-dirigente",
  "Lider da igreja",
  "Vice-lider da igreja",
  "Pastor",
  "Secretaria",
  "Vice-secretaria",
  "Tesoureiro",
  "Vice-tesoureiro",
  "Professor das criancas",
  "Maestro",
  "Vice-maestro",
];

function memberRolesFromText(value: string) {
  return value
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
}

function memberRolesToText(values: string[]) {
  return values.map((role) => role.trim()).filter(Boolean).join(", ");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

const blankSchedule: Omit<ScheduleRecord, "id"> = {
  date: "",
  serviceType: "",
  group: "",
  functionName: "",
  assignedTo: "",
  phone: "",
  confirmationStatus: "Pendente",
  notes: "",
};

const blankTransaction: Omit<TransactionRecord, "id"> = {
  date: "",
  type: "Entrada",
  category: "",
  description: "",
  amount: 0,
  method: "Pix",
  status: "Pendente",
  memberName: "",
  notes: "",
};

const blankAsset: Omit<AssetRecord, "id"> = {
  name: "",
  category: "",
  location: "",
  responsible: "",
  condition: "Bom",
  lastMaintenance: "",
  notes: "",
};

const blankDevotional: Omit<DevotionalRecord, "id"> = {
  title: "",
  verse: "",
  body: "",
  status: "Rascunho",
  publishedAt: "",
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
  "Grupos",
  "Visitantes",
  "Escalas",
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
    label: "Grupo - comunicado",
    text: "Paz, {nome}! Temos um comunicado importante para o seu grupo. Por favor, confirme leitura e disponibilidade. {igreja}.",
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
  {
    id: "visitor-follow-up",
    label: "Visitante - acompanhamento",
    text: "Paz, {nome}! Foi uma alegria receber voce. Queremos caminhar com sua familia e estamos a disposicao para ajudar. {igreja}.",
  },
  {
    id: "absence-follow-up",
    label: "Faltoso - cuidado",
    text: "Paz, {nome}! Sentimos sua falta na aula. Estamos orando por voce e queremos saber se podemos ajudar em algo. {igreja}.",
  },
  {
    id: "schedule-confirmation",
    label: "Escala - confirmar servico",
    text: "Paz, {nome}! Voce esta na escala desta semana. Por favor, confirme sua disponibilidade e horario de chegada. {igreja}.",
  },
  {
    id: "class-notice",
    label: "Classe - aviso",
    text: "Paz, {nome}! Temos um aviso importante para sua classe. Confira a orientacao e confirme leitura. {igreja}.",
  },
];

function hasPersistedPayload(value: Partial<AppData> | null | undefined) {
  if (!value) return false;
  return Object.keys(value).some((key) => Array.isArray(value[key as keyof AppData]));
}

type PhotoCache = {
  members: Record<string, string>;
  kids: Record<string, string>;
};

function emptyPhotoCache(): PhotoCache {
  return { members: {}, kids: {} };
}

function loadPhotoCache(): PhotoCache {
  if (typeof window === "undefined") return emptyPhotoCache();

  try {
    const stored = window.localStorage.getItem(photoCacheKey);
    if (!stored) return emptyPhotoCache();
    const parsed = JSON.parse(stored) as Partial<PhotoCache>;
    return {
      members: parsed.members ?? {},
      kids: parsed.kids ?? {},
    };
  } catch {
    window.localStorage.removeItem(photoCacheKey);
    return emptyPhotoCache();
  }
}

function savePhotoCache(data: AppData) {
  if (typeof window === "undefined") return;

  const cache: PhotoCache = {
    members: {},
    kids: Object.fromEntries(data.kids.filter((kid) => kid.photoDataUrl).map((kid) => [kid.id, kid.photoDataUrl])),
  };

  try {
    window.localStorage.setItem(photoCacheKey, JSON.stringify(cache));
  } catch {
    // Se o navegador negar espaco, o salvamento remoto continua sendo a fonte principal.
  }
}

function mergePhotoCache(data: AppData, cache: PhotoCache) {
  return {
    ...data,
    members: data.members.map((member) => ({
      ...member,
      photoDataUrl: "",
    })),
    kids: data.kids.map((kid) => ({
      ...kid,
      photoDataUrl: kid.photoDataUrl || cache.kids[kid.id] || "",
    })),
  };
}

function isApprovedAccessStatus(value: unknown) {
  if (!value) return true;
  const status = String(value).toLowerCase();
  return status === "approved" || status === "ativo" || status === "active";
}

function accessRoleForSession(users: AccessUser[], email: string, metadata: Record<string, unknown> | undefined) {
  return (
    users.find((user) => normalizeEmail(user.email) === normalizeEmail(email))?.role ??
    accessRoleFromMetadata(metadata?.church_gp_role ?? metadata?.role)
  );
}

function normalizeMessageTemplate(template: MessageTemplateItem): MessageTemplateItem {
  return {
    ...template,
    label: replaceLegacyMinistryText(template.label),
    text: replaceLegacyMinistryText(template.text),
    audience: template.audience ? replaceLegacyMinistryText(template.audience) : template.audience,
  };
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
    photoDataUrl: "",
    conversionDate: member.conversionDate ?? "",
    baptismDate: member.baptismDate ?? "",
    registrationSource: member.registrationSource ?? "",
    pastoralStatus: member.pastoralStatus ?? "Sem acompanhamento definido",
    memberVisibleNotes: member.memberVisibleNotes ?? "",
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
    recurrence: event.recurrence ?? "Unico",
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

function normalizeVisitor(visitor: Partial<VisitorRecord>): VisitorRecord {
  return {
    ...blankVisitor,
    ...visitor,
    id: visitor.id ?? uid("visitor"),
  };
}

function normalizeSchedule(schedule: Partial<ScheduleRecord>): ScheduleRecord {
  return {
    ...blankSchedule,
    ...schedule,
    id: schedule.id ?? uid("schedule"),
  };
}

function normalizeTransaction(transaction: Partial<TransactionRecord>): TransactionRecord {
  return {
    ...blankTransaction,
    ...transaction,
    id: transaction.id ?? uid("transaction"),
    amount: Number(transaction.amount ?? 0),
  };
}

function normalizeAsset(asset: Partial<AssetRecord>): AssetRecord {
  return {
    ...blankAsset,
    ...asset,
    id: asset.id ?? uid("asset"),
  };
}

function normalizeDevotional(devotional: Partial<DevotionalRecord>): DevotionalRecord {
  return {
    ...blankDevotional,
    ...devotional,
    id: devotional.id ?? uid("devotional"),
  };
}

function visitorsFromMembers(members: MemberRecord[]): VisitorRecord[] {
  return members
    .filter((member) => member.memberType === "Visitante" || member.status === "Visitante" || member.status === "Novo convertido")
    .map((member) => ({
      id: `visitor-${member.id}`,
      fullName: member.fullName,
      phone: member.phone,
      firstVisitDate: member.joinedAt,
      returnDate: "",
      invitedBy: member.registrationSource,
      contactMade: member.pastoralStatus !== "Precisa de contato",
      integrationStatus: member.status === "Novo convertido" ? "Em acompanhamento" : "Primeira visita",
      notes: member.notes,
    }));
}

function normalizeMuralItem(item: Partial<MuralItem>): MuralItem {
  return {
    ...blankMuralItem,
    ...item,
    id: item.id ?? uid("mural"),
  };
}

function normalizeAttendanceSession(session: Partial<AttendanceSession>): AttendanceSession {
  return {
    id: session.id ?? uid("attendance"),
    area: session.area ?? "school",
    classId: session.classId ?? "",
    eventId: session.eventId ?? "",
    date: session.date ?? "",
    title: session.title ?? "",
    teacher: session.teacher ?? "",
    records: session.records ?? [],
    updatedAt: session.updatedAt ?? new Date().toISOString(),
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

async function optimizeProfilePhoto(file: File): Promise<MuralImageResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const originalDataUrl = await readImageFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nao foi possivel preparar a foto.");

  context.drawImage(image, 0, 0, width, height);
  const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.68);
  const chosenDataUrl = optimizedDataUrl.length < originalDataUrl.length ? optimizedDataUrl : originalDataUrl;
  const approxKb = Math.round((chosenDataUrl.length * 3) / 4 / 1024);

  if (approxKb > 180) {
    throw new Error("Foto muito grande. Escolha uma foto menor ou recorte antes de enviar.");
  }

  return {
    dataUrl: chosenDataUrl,
    message: `Foto carregada e otimizada (${approxKb} KB).`,
  };
}

function normalizeAppData(value: Partial<AppData>): AppData {
  const normalizedMembers = (value.members ?? initialData.members).map((member) => normalizeMember(member));
  const normalizedVisitors = value.visitors?.length
    ? value.visitors.map((visitor) => normalizeVisitor(visitor))
    : visitorsFromMembers(normalizedMembers);

  return {
    ...initialData,
    ...value,
    careRequests: value.careRequests ?? initialData.careRequests,
    events: (value.events ?? initialData.events).map((event) => normalizeEvent(event)),
    notices: (value.notices ?? initialData.notices).map((notice) => normalizeNotice(notice)).filter((notice) => !isExpiredDate(notice.expiresAt)),
    mural: (value.mural ?? initialData.mural).map((item) => normalizeMuralItem(item)),
    users: value.users ?? initialData.users,
    members: normalizedMembers,
    visitors: normalizedVisitors,
    kids: (value.kids ?? initialData.kids).map((kid) => normalizeKid(kid)),
    schoolClasses: value.schoolClasses ?? initialData.schoolClasses,
    discipleshipClasses: normalizeDiscipleshipClasses(value.discipleshipClasses),
    ministries: (value.ministries ?? initialData.ministries).map((ministry) => normalizeMinistry(ministry)),
    schedules: (value.schedules ?? initialData.schedules).map((schedule) => normalizeSchedule(schedule)),
    attendanceSessions: (value.attendanceSessions ?? initialData.attendanceSessions).map((session) =>
      normalizeAttendanceSession(session),
    ),
    messageTemplates: (value.messageTemplates ?? initialData.messageTemplates).map((template) => normalizeMessageTemplate(template)),
    messageCampaigns: value.messageCampaigns ?? initialData.messageCampaigns,
    transactions: (value.transactions ?? initialData.transactions).map((transaction) => normalizeTransaction(transaction)),
    assets: (value.assets ?? initialData.assets).map((asset) => normalizeAsset(asset)),
    devotionals: (value.devotionals ?? initialData.devotionals).map((devotional) => normalizeDevotional(devotional)),
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
  const logoutInProgressRef = useRef(false);
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
      return mergePhotoCache(normalizeAppData(JSON.parse(stored) as Partial<AppData>), loadPhotoCache());
    } catch {
      window.localStorage.removeItem(storageKey);
      return initialData;
    }
  });
  const [careForm, setCareForm] = useState(blankCare);
  const [eventForm, setEventForm] = useState(blankEvent);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [noticeForm, setNoticeForm] = useState(blankNotice);
  const [ministryForm, setMinistryForm] = useState(blankMinistry);
  const [editingMinistryId, setEditingMinistryId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState(blankUser);
  const [selectedAccessMemberId, setSelectedAccessMemberId] = useState("");
  const [memberForm, setMemberForm] = useState(blankMember);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberFormTab, setMemberFormTab] = useState<MemberFormTab>("Dados");
  const [memberCredentialForm, setMemberCredentialForm] = useState(blankMemberCredential);
  const [visitorForm, setVisitorForm] = useState(blankVisitor);
  const [editingVisitorId, setEditingVisitorId] = useState<string | null>(null);
  const [kidForm, setKidForm] = useState(blankKid);
  const [scheduleForm, setScheduleForm] = useState(blankSchedule);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [transactionForm, setTransactionForm] = useState(blankTransaction);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState(blankAsset);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [devotionalForm, setDevotionalForm] = useState(blankDevotional);
  const [editingDevotionalId, setEditingDevotionalId] = useState<string | null>(null);
  const [muralForm, setMuralForm] = useState(blankMuralItem);
  const [muralImageMessage, setMuralImageMessage] = useState("");
  const [schoolNoticeForm, setSchoolNoticeForm] = useState(blankSchoolNotice);
  const [discipleshipNoticeForm, setDiscipleshipNoticeForm] = useState({ ...blankSchoolNotice, classId: "discipleship-new" });
  const [attendanceEventSelection, setAttendanceEventSelection] = useState<Record<string, string>>({});
  const [selectedRequestId, setSelectedRequestId] = useState("care-1");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [messageAudience, setMessageAudience] = useState<MessageAudience>("Todos os membros");
  const [messageTemplateId, setMessageTemplateId] = useState("general-invite");
  const [messageText, setMessageText] = useState(messageTemplates[4].text);
  const [selectedMessageRecipientIds, setSelectedMessageRecipientIds] = useState<string[]>([]);
  const [messageBatchLimit, setMessageBatchLimit] = useState(8);
  const [customTemplateLabel, setCustomTemplateLabel] = useState("");
  const [customTemplateText, setCustomTemplateText] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState("Todos");
  const [memberTypeFilter, setMemberTypeFilter] = useState("Todos");
  const [memberGroupFilter, setMemberGroupFilter] = useState("Todos");
  const [visitorStatusFilter, setVisitorStatusFilter] = useState("Todos");
  const [careStatusFilter, setCareStatusFilter] = useState("Todos");
  const [kidClassFilter, setKidClassFilter] = useState("Todos");
  const [eventWeekOffset, setEventWeekOffset] = useState(0);
  const [eventGroupFilter, setEventGroupFilter] = useState("Todos");
  const [eventStatusFilter, setEventStatusFilter] = useState("Todos");
  const [scheduleGroupFilter, setScheduleGroupFilter] = useState("Todos");
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0);
  const [scheduleServiceFilter, setScheduleServiceFilter] = useState("Todos");
  const [scheduleFunctionFilter, setScheduleFunctionFilter] = useState("Todos");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("Todos");
  const [memberSchoolFilter, setMemberSchoolFilter] = useState("Todos");
  const [memberDiscipleshipFilter, setMemberDiscipleshipFilter] = useState("Todos");
  const [memberPastoralFilter, setMemberPastoralFilter] = useState("Todos");
  const [visitorContactFilter, setVisitorContactFilter] = useState("Todos");
  const [financeTypeFilter, setFinanceTypeFilter] = useState("Todos");
  const [assetConditionFilter, setAssetConditionFilter] = useState("Todos");
  const [remoteMessageTemplates, setRemoteMessageTemplates] = useState<MessageTemplateItem[]>([]);
  const [remoteStateReady, setRemoteStateReady] = useState(!isSupabaseConfigured());
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured() ? "Supabase pronto para login." : "Modo local: configure o Supabase no Vercel.");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(null);
  const [reportPreviewKind, setReportPreviewKind] = useState<ReportKind>("members");

  const saveRemoteStateNow = useCallback(async (payloadData: AppData) => {
    if (!isSupabaseConfigured()) return false;

    setSaveState("saving");
    setSyncStatus("Salvando alteracoes na Supabase...");
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const token = sessionData.session?.access_token;

    if (!token) {
      setSaveState("error");
      setSyncStatus("Sessao expirada. Entre novamente para salvar cadastros na base.");
      return false;
    }

    const response = await fetch("/api/admin/app-state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ payload: payloadData, baseUpdatedAt: remoteUpdatedAt }),
    });
    const result = (await response.json()) as { error?: string; updatedAt?: string };

    if (!response.ok) {
      setSaveState("error");
      setSyncStatus(
        response.status === 409
          ? "Outra pessoa salvou alteracoes antes de voce. Atualize a pagina para carregar a versao mais recente antes de continuar."
          : result.error ?? "Nao foi possivel salvar cadastros na base.",
      );
      return false;
    }

    lastSavedPayloadRef.current = JSON.stringify(payloadData);
    const savedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setRemoteUpdatedAt(result.updatedAt ?? new Date().toISOString());
    setLastSavedAt(savedAt);
    setSaveState("saved");
    setSyncStatus(`Salvo agora as ${savedAt}.`);
    return true;
  }, [remoteUpdatedAt]);

  const reloadRemoteStateNow = useCallback(async () => {
    if (!hasSession || !isSupabaseConfigured()) return false;

    setSaveState("saving");
    setSyncStatus("Recarregando dados mais recentes da Supabase...");
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const token = sessionData.session?.access_token;

    if (!token) {
      setSaveState("error");
      setSyncStatus("Sessao expirada. Entre novamente para recarregar dados da base.");
      return false;
    }

    const response = await fetch("/api/admin/app-state", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as RemoteAppStateResponse;

    if (!response.ok) {
      setSaveState("error");
      setSyncStatus(result.error ?? "Nao foi possivel recarregar cadastros da base.");
      return false;
    }

    const normalizedRemoteData = normalizeAppData(result.payload ?? {});
    const remoteData = mergePhotoCache(normalizedRemoteData, loadPhotoCache());
    lastSavedPayloadRef.current = JSON.stringify(normalizedRemoteData);
    setData(remoteData);
    setRemoteUpdatedAt(result.updatedAt ?? null);
    const savedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setLastSavedAt(savedAt);
    setSaveState("saved");
    setRemoteStateReady(true);
    setSyncStatus("Dados mais recentes carregados da base Supabase.");
    return true;
  }, [hasSession]);

  useEffect(() => {
    if (window.location.search.includes("cadastro=novo")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (hasSession || !isSupabaseConfigured() || logoutInProgressRef.current) return;

    let cancelled = false;

    async function restoreSupabaseSession() {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const session = sessionData.session;

      if (cancelled) return;

      if (!session?.user) {
        setRemoteStateReady(true);
        return;
      }

      const metadata = session.user.app_metadata ?? {};
      const accessStatus = metadata.church_gp_access ?? metadata.status;

      if (!isApprovedAccessStatus(accessStatus)) {
        await supabase?.auth.signOut();
        if (!cancelled) {
          setRemoteStateReady(true);
          setAccessMessage("Seu acesso ainda nao esta ativo. Fale com a administracao.");
        }
        return;
      }

      const restoredEmail = normalizeEmail(session.user.email ?? "");
      setSessionUserId(session.user.id);
      setSessionEmail(restoredEmail);
      setSessionRole(accessRoleForSession(data.users, restoredEmail, metadata));
      setAccessMessage("");
      setAccessMode("login");
      setRemoteStateReady(false);
      setSyncStatus("Sessao restaurada. Cadastros serao carregados da base Supabase.");
      setHasSession(true);
    }

    void restoreSupabaseSession();

    return () => {
      cancelled = true;
    };
  }, [data.users, hasSession]);

  useEffect(() => {
    savePhotoCache(data);

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
        const normalizedRemoteData = normalizeAppData(result.payload ?? {});
        const remoteData = mergePhotoCache(normalizedRemoteData, loadPhotoCache());
        lastSavedPayloadRef.current = JSON.stringify(normalizedRemoteData);
        setLastSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
        setRemoteUpdatedAt(result.updatedAt ?? null);
        setSaveState("saved");
        setData(remoteData);
        setSyncStatus("Cadastros carregados da base Supabase.");
      } else {
        setRemoteUpdatedAt(result.updatedAt ?? null);
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

    setSaveState("saving");
    setSyncStatus("Salvando alteracoes...");

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      await saveRemoteStateNow(data);
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [data, hasSession, remoteStateReady, saveRemoteStateNow]);

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
          const mappedTemplates = templates.map((template) => normalizeMessageTemplate({
              id: template.id,
              label: template.label ?? "",
              text: template.body ?? "",
              audience: template.audience ?? undefined,
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
  const canManageUsers = canManageModule(currentAccessRole, "users");
  const canManageMembers = canManageModule(currentAccessRole, "members");
  const canManageVisitors = canManageModule(currentAccessRole, "visitors");
  const canManageKids = canManageModule(currentAccessRole, "kids");
  const canManageEvents = canManageModule(currentAccessRole, "events");
  const canManageSchedules = canManageModule(currentAccessRole, "schedules");
  const canManageGroups = canManageModule(currentAccessRole, "ministries");
  const canManageNotices = canManageModule(currentAccessRole, "notices");
  const canManageMessages = canManageModule(currentAccessRole, "messages");
  const canManageMural = canManageModule(currentAccessRole, "mural");
  const canManagePastoral = canManageModule(currentAccessRole, "pastoral");
  const canManageFinance = canManageModule(currentAccessRole, "finance");
  const canManageAssets = canManageModule(currentAccessRole, "assets");
  const canManageDevotional = canManageModule(currentAccessRole, "devotional");
  const visibleModules = useMemo(
    () => modules.filter((module) => canAccessModule(currentAccessRole, module.key)),
    [currentAccessRole],
  );
  const visibleMembers = useMemo(
    () => (canManageMembers ? data.members : currentMember ? [currentMember] : []),
    [canManageMembers, currentMember, data.members],
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
  const [todayKey, setTodayKey] = useState(currentDateKey);
  const currentLongDate = useMemo(
    () => new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(eventDate(todayKey) ?? new Date()),
    [todayKey],
  );
  const selectedWeekRange = useMemo(() => {
    const today = eventDate(todayKey) ?? new Date();
    return weekRangeWithOffset(eventWeekOffset, today);
  }, [eventWeekOffset, todayKey]);
  const selectedScheduleWeekRange = useMemo(() => {
    const today = eventDate(todayKey) ?? new Date();
    return weekRangeWithOffset(scheduleWeekOffset, today);
  }, [scheduleWeekOffset, todayKey]);
  const weekEvents = useMemo(() => {
    return data.events
      .filter((event) => isEventInWeek(event, selectedWeekRange.start, selectedWeekRange.end))
      .filter((event) => eventGroupFilter === "Todos" || event.ministry === eventGroupFilter)
      .filter((event) => eventStatusFilter === "Todos" || event.status === eventStatusFilter)
      .filter((event) => {
        const query = normalizeSearchText(globalSearch);
        if (!query) return true;
        return normalizeSearchText([event.title, event.ministry, event.location, event.responsible, event.status].join(" ")).includes(query);
      })
      .sort(sortEventsByDate);
  }, [data.events, eventGroupFilter, eventStatusFilter, globalSearch, selectedWeekRange]);

  useEffect(() => {
    const timer = window.setInterval(() => setTodayKey(currentDateKey()), 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canAccessModule(currentAccessRole, activeModule)) {
      const timer = window.setTimeout(() => setActiveModule("overview"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeModule, currentAccessRole]);

  const notifications = useMemo(() => {
    const pendingCare = visibleCareRequests
      .filter((request) => request.status !== "Concluido")
      .map((request) => ({
        id: `care-${request.id}-${request.status}`,
        title: `${request.member}: ${suggestedNextStep(request)}`,
        body: request.category,
        module: "pastoral" as ModuleKey,
      }));

    const upcomingEvents = weekEvents.slice(0, 3).map((event) => ({
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
  }, [data.mural, visibleCareRequests, weekEvents]);

  const unreadCount = notifications.filter((notice) => !data.notificationReadIds.includes(notice.id)).length;
  const activeNotices = data.notices.filter((notice) => !isExpiredDate(notice.expiresAt));
  const monthlyBirthdays = useMemo(
    () =>
      data.members
        .filter((member) => isBirthdayThisMonth(member.birthDate))
        .sort((first, second) => {
          const firstDate = birthdayDateThisYear(first.birthDate)?.getTime() ?? 0;
          const secondDate = birthdayDateThisYear(second.birthDate)?.getTime() ?? 0;
          return firstDate - secondDate;
        }),
    [data.members],
  );
  const weeklyBirthdays = useMemo(
    () => monthlyBirthdays.filter((member) => isBirthdayThisWeek(member.birthDate)),
    [monthlyBirthdays],
  );
  const monthlyKidsBirthdays = useMemo(
    () => data.kids.filter((kid) => isBirthdayThisMonth(kid.birthDate)),
    [data.kids],
  );
  const selectedAccessMember = useMemo(
    () => data.members.find((member) => member.id === selectedAccessMemberId),
    [data.members, selectedAccessMemberId],
  );
  const selectedAccessExistingUser = useMemo(
    () =>
      selectedAccessMember
        ? data.users.find(
            (user) => normalizeEmail(user.email) === normalizeEmail(selectedAccessMember.email) || user.id === selectedAccessMember.authUserId,
          )
        : undefined,
    [data.users, selectedAccessMember],
  );
  const canCreateUser = Boolean(
    canManageUsers &&
      userForm.name.trim() &&
      userForm.email.trim() &&
      (selectedAccessExistingUser || userForm.password.trim().length >= 6),
  );
  const canCreateMember = Boolean(memberForm.fullName.trim() && memberForm.phone.trim()) && (canManageMembers || editingMemberId === currentMember?.id);
  const canCreateVisitor = canManageVisitors && Boolean(visitorForm.fullName.trim() && visitorForm.phone.trim());
  const canSaveMemberAccess = Boolean(
    canManageUsers &&
      memberCredentialForm.memberId &&
      memberCredentialForm.email.trim() &&
      (!memberCredentialForm.password.trim() || memberCredentialForm.password.trim().length >= 6),
  );
  const canCreateKid = canManageKids && Boolean(kidForm.childName.trim() && kidForm.guardianName.trim() && kidForm.guardianPhone.trim());
  const canCreateMuralItem = canManageMural && Boolean(muralForm.title.trim() && muralForm.expiresAt);
  const canCreateSchoolNotice = canManageModule(currentAccessRole, "school") && Boolean(schoolNoticeForm.classId && schoolNoticeForm.title.trim() && schoolNoticeForm.body.trim());
  const canCreateDiscipleshipNotice = Boolean(
    canManageModule(currentAccessRole, "discipleship") && discipleshipNoticeForm.classId && discipleshipNoticeForm.title.trim() && discipleshipNoticeForm.body.trim(),
  );
  const canCreateEvent = canManageEvents && Boolean(eventForm.title.trim() && eventForm.date);
  const canCreateSchedule = canManageSchedules && Boolean(scheduleForm.date && scheduleForm.serviceType.trim() && scheduleForm.assignedTo.trim());
  const canCreateNotice = canManageNotices && Boolean(noticeForm.title.trim() && noticeForm.body.trim());
  const canCreateMinistry = canManageGroups && Boolean(ministryForm.name.trim() && ministryForm.leader.trim());
  const canCreateTransaction = canManageFinance && Boolean(transactionForm.date && transactionForm.category.trim() && transactionForm.description.trim());
  const canCreateAsset = canManageAssets && Boolean(assetForm.name.trim() && assetForm.category.trim());
  const canCreateDevotional = canManageDevotional && Boolean(devotionalForm.title.trim() && devotionalForm.body.trim());
  const availableMemberFormTabs = useMemo<MemberFormTab[]>(
    () => [
      "Dados",
      "Igreja",
      "Classes",
      ...(canManageMembers ? (["Observacoes"] as MemberFormTab[]) : []),
      ...(canManageUsers ? (["Acesso"] as MemberFormTab[]) : []),
    ],
    [canManageMembers, canManageUsers],
  );
  useEffect(() => {
    if (!availableMemberFormTabs.includes(memberFormTab)) {
      const timer = window.setTimeout(() => setMemberFormTab("Dados"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [availableMemberFormTabs, memberFormTab]);
  const availableMessageTemplates = useMemo(() => {
    const templates = [
      ...data.messageTemplates,
      ...remoteMessageTemplates,
      ...messageTemplates.map(normalizeMessageTemplate),
    ];

    return templates.filter((template, index, list) => list.findIndex((item) => item.id === template.id) === index);
  }, [data.messageTemplates, remoteMessageTemplates]);
  const selectedReportPreview = reportDefinition(reportPreviewKind);
  const roleOptions = useMemo(() => {
    const roles = [...memberRoleOptions];
    memberRolesFromText(memberForm.role).forEach((role) => {
      if (!roles.includes(role)) roles.push(role);
    });
    return roles;
  }, [memberForm.role]);
  const selectedMemberRoles = useMemo(() => memberRolesFromText(memberForm.role), [memberForm.role]);
  const groupOptions = useMemo(() => {
    const groups = data.ministries.map((group) => group.name).filter(Boolean);
    if (memberForm.ministry.trim() && !groups.includes(memberForm.ministry.trim())) {
      groups.push(memberForm.ministry.trim());
    }
    return groups;
  }, [data.ministries, memberForm.ministry]);
  const searchQuery = normalizeSearchText(globalSearch);
  const filteredMembers = useMemo(
    () =>
      visibleMembers
        .filter((member) => memberStatusFilter === "Todos" || member.status === memberStatusFilter)
        .filter((member) => memberTypeFilter === "Todos" || member.memberType === memberTypeFilter)
        .filter((member) => memberGroupFilter === "Todos" || member.ministry === memberGroupFilter)
        .filter((member) => memberSchoolFilter === "Todos" || member.schoolClassId === memberSchoolFilter)
        .filter((member) => memberDiscipleshipFilter === "Todos" || member.discipleshipClassId === memberDiscipleshipFilter)
        .filter((member) => memberPastoralFilter === "Todos" || member.pastoralStatus === memberPastoralFilter)
        .filter((member) => {
          if (!searchQuery) return true;
          const schoolClassName = classNameById(data.schoolClasses, member.schoolClassId);
          const discipleshipClassName = classNameById(data.discipleshipClasses, member.discipleshipClassId);
          return normalizeSearchText(
            [
              member.fullName,
              member.phone,
              member.email,
              member.cpf,
              member.status,
              member.memberType,
              member.role,
              member.ministry,
              schoolClassName,
              discipleshipClassName,
              member.pastoralStatus,
              member.registrationSource,
            ].join(" "),
          ).includes(searchQuery);
        }),
    [data.discipleshipClasses, data.schoolClasses, memberDiscipleshipFilter, memberGroupFilter, memberPastoralFilter, memberSchoolFilter, memberStatusFilter, memberTypeFilter, searchQuery, visibleMembers],
  );
  const filteredVisitors = useMemo(
    () =>
      data.visitors
        .filter(() => canManageVisitors)
        .filter((visitor) => visitorStatusFilter === "Todos" || visitor.integrationStatus === visitorStatusFilter)
        .filter((visitor) => visitorContactFilter === "Todos" || (visitorContactFilter === "Contato feito" ? visitor.contactMade : !visitor.contactMade))
        .filter((visitor) => {
          if (!searchQuery) return true;
          return normalizeSearchText([visitor.fullName, visitor.phone, visitor.invitedBy, visitor.integrationStatus, visitor.notes].join(" ")).includes(searchQuery);
        }),
    [canManageVisitors, data.visitors, searchQuery, visitorContactFilter, visitorStatusFilter],
  );
  const filteredKids = useMemo(
    () =>
      visibleKids
        .filter((kid) => kidClassFilter === "Todos" || kid.className === kidClassFilter || kid.ageGroup === kidClassFilter)
        .filter((kid) => {
          if (!searchQuery) return true;
          return normalizeSearchText([kid.childName, kid.className, kid.ageGroup, kid.guardianName, kid.guardianPhone, kid.guardianEmail].join(" ")).includes(searchQuery);
        }),
    [kidClassFilter, searchQuery, visibleKids],
  );
  const filteredCareRequests = useMemo(
    () =>
      visibleCareRequests
        .filter((request) => careStatusFilter === "Todos" || request.status === careStatusFilter)
        .filter((request) => {
          if (!searchQuery) return true;
          return normalizeSearchText([request.member, request.phone, request.category, request.status, request.responsible, request.summary].join(" ")).includes(searchQuery);
        }),
    [careStatusFilter, searchQuery, visibleCareRequests],
  );
  const filteredMuralItems = useMemo(
    () =>
      (canManageMural ? data.mural : data.mural.filter((item) => item.published)).filter((item) => {
        if (!searchQuery) return true;
        return normalizeSearchText([item.title, item.category, item.socialUrl].join(" ")).includes(searchQuery);
      }),
    [canManageMural, data.mural, searchQuery],
  );
  const filteredSchedules = useMemo(
    () =>
      data.schedules
        .filter(() => canAccessModule(currentAccessRole, "schedules"))
        .filter((schedule) => {
          const date = eventDate(schedule.date);
          return Boolean(date && date >= selectedScheduleWeekRange.start && date <= selectedScheduleWeekRange.end);
        })
        .filter((schedule) => scheduleGroupFilter === "Todos" || schedule.group === scheduleGroupFilter)
        .filter((schedule) => scheduleServiceFilter === "Todos" || schedule.serviceType === scheduleServiceFilter)
        .filter((schedule) => scheduleFunctionFilter === "Todos" || schedule.functionName === scheduleFunctionFilter)
        .filter((schedule) => scheduleStatusFilter === "Todos" || schedule.confirmationStatus === scheduleStatusFilter)
        .filter((schedule) => {
          if (!searchQuery) return true;
          return normalizeSearchText([schedule.serviceType, schedule.group, schedule.functionName, schedule.assignedTo, schedule.phone, schedule.confirmationStatus].join(" ")).includes(searchQuery);
        })
        .sort((first, second) => `${first.date} ${first.serviceType}`.localeCompare(`${second.date} ${second.serviceType}`)),
    [currentAccessRole, data.schedules, scheduleFunctionFilter, scheduleGroupFilter, scheduleServiceFilter, scheduleStatusFilter, searchQuery, selectedScheduleWeekRange],
  );
  const filteredTransactions = useMemo(
    () =>
      data.transactions
        .filter(() => canAccessModule(currentAccessRole, "finance"))
        .filter((transaction) => financeTypeFilter === "Todos" || transaction.type === financeTypeFilter)
        .filter((transaction) => {
          if (!searchQuery) return true;
          return normalizeSearchText([transaction.type, transaction.category, transaction.description, transaction.memberName, transaction.method, transaction.status].join(" ")).includes(searchQuery);
        })
        .sort((first, second) => second.date.localeCompare(first.date)),
    [currentAccessRole, data.transactions, financeTypeFilter, searchQuery],
  );
  const filteredAssets = useMemo(
    () =>
      data.assets
        .filter(() => canAccessModule(currentAccessRole, "assets"))
        .filter((asset) => assetConditionFilter === "Todos" || asset.condition === assetConditionFilter)
        .filter((asset) => {
          if (!searchQuery) return true;
          return normalizeSearchText([asset.name, asset.category, asset.location, asset.responsible, asset.condition, asset.notes].join(" ")).includes(searchQuery);
        }),
    [assetConditionFilter, currentAccessRole, data.assets, searchQuery],
  );
  const publishedDevotional = useMemo(
    () =>
      data.devotionals
        .filter((devotional) => devotional.status === "Publicado")
        .sort((first, second) => second.publishedAt.localeCompare(first.publishedAt))[0],
    [data.devotionals],
  );
  const birthdaySpotlightPanel = (
    <article className="surface birthday-spotlight wide">
      <div className="panel-heading">
        <div>
          <h2>Aniversariantes do mes</h2>
          <span>{monthlyBirthdays.length ? `${monthlyBirthdays.length} pessoas para celebrar` : "Nenhum aniversario neste mes"}</span>
        </div>
        {canManageMessages && (
          <button onClick={() => setActiveModule("messages")} type="button">
            Enviar mensagem
          </button>
        )}
      </div>
      {monthlyBirthdays.length ? (
        <div className="birthday-spotlight-list">
          {monthlyBirthdays.slice(0, 8).map((member) => (
            <div className="birthday-person-card" key={member.id}>
              <div className="birthday-person-photo">
                {member.fullName.slice(0, 1)}
              </div>
              <div>
                <strong>{member.fullName}</strong>
                <small>{birthdayLabel(member.birthDate)}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Assim que houver aniversariantes cadastrados neste mes, eles aparecem aqui com nome em destaque.</p>
      )}
    </article>
  );
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
      return data.members
        .filter((member) => member.schoolClassId && normalizeWhatsappPhone(member.phone))
        .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: classNameById(data.schoolClasses, member.schoolClassId) }));
    }
    if (messageAudience === "Discipulado") {
      return data.members
        .filter((member) => member.discipleshipClassId && normalizeWhatsappPhone(member.phone))
        .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: classNameById(data.discipleshipClasses, member.discipleshipClassId) }));
    }
    if (messageAudience === "Grupos") {
      return memberRecipients.filter((recipient) => Boolean(recipient.group && recipient.group !== "Visitante"));
    }
    if (messageAudience === "Visitantes") {
      return data.visitors
        .filter((visitor) => normalizeWhatsappPhone(visitor.phone))
        .map((visitor) => ({ id: visitor.id, name: visitor.fullName, phone: visitor.phone, group: visitor.integrationStatus }));
    }
    if (messageAudience === "Escalas") {
      return data.schedules
        .filter((schedule) => normalizeWhatsappPhone(schedule.phone))
        .map((schedule) => ({ id: schedule.id, name: schedule.assignedTo, phone: schedule.phone, group: `${schedule.serviceType} - ${schedule.functionName}` }));
    }
    return data.kids
      .filter((kid) => normalizeWhatsappPhone(kid.guardianPhone))
      .map((kid) => ({
        id: kid.id,
        name: kid.guardianName,
        phone: kid.guardianPhone,
        group: kid.childName,
      }));
  }, [data.discipleshipClasses, data.kids, data.members, data.schedules, data.schoolClasses, data.visitors, messageAudience, monthlyBirthdays, weeklyBirthdays]);
  const selectedMessageRecipients = useMemo(() => {
    const selected = messageRecipients.filter((recipient) => selectedMessageRecipientIds.includes(recipient.id));
    return selected.length ? selected : messageRecipients;
  }, [messageRecipients, selectedMessageRecipientIds]);

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
    if (!requireModuleAccess(area === "EBD" ? "school" : "discipleship", `enviar WhatsApp da ${area}`)) return;

    const recipients = classWhatsappRecipients(classRecord, area);
    const className = classRecord.name;
    const text = classNoticeWhatsappText(className, title, body);

    if (!recipients.length || !text.trim()) {
      setSyncStatus(`Nenhum contato de WhatsApp encontrado para ${className}. Vincule membros pela funcao, grupo ou observacoes.`);
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

  function attendanceKey(area: AttendanceArea, classId: string) {
    return `${area}-${classId}`;
  }

  function eventsForAttendance(area: AttendanceArea) {
    const areaWords =
      area === "school"
        ? ["ebd", "escola biblica", "biblica"]
        : ["discipulado", "batismo", "novo convertido", "novos convertidos"];

    return data.events.filter((event) => {
      const eventText = normalizeSearchText([event.title, event.ministry, event.location, event.responsible].join(" "));
      return areaWords.some((word) => eventText.includes(word));
    });
  }

  function membersForAttendanceClass(area: AttendanceArea, classId: string) {
    return data.members.filter((member) => (area === "school" ? member.schoolClassId === classId : member.discipleshipClassId === classId));
  }

  function attendanceSessionsForClass(area: AttendanceArea, classId: string) {
    return data.attendanceSessions
      .filter((session) => session.area === area && session.classId === classId)
      .sort((first, second) => second.date.localeCompare(first.date));
  }

  function selectedAttendanceEvent(area: AttendanceArea, classId: string) {
    const events = eventsForAttendance(area);
    const selectedEventId = attendanceEventSelection[attendanceKey(area, classId)] ?? events[0]?.id ?? "";
    return events.find((event) => event.id === selectedEventId) ?? events[0];
  }

  function attendanceSessionForEvent(area: AttendanceArea, classId: string, eventId: string) {
    return data.attendanceSessions.find((session) => session.area === area && session.classId === classId && session.eventId === eventId);
  }

  function attendanceStatusForMember(session: AttendanceSession | undefined, memberId: string): AttendanceStatus {
    return session?.records.find((record) => record.memberId === memberId)?.status ?? "Presente";
  }

  function attendanceNoteForMember(session: AttendanceSession | undefined, memberId: string) {
    return session?.records.find((record) => record.memberId === memberId)?.note ?? "";
  }

  function attendanceSummary(session: AttendanceSession | undefined, members: MemberRecord[]) {
    if (!session) return { present: 0, absent: 0, justified: 0, contact: 0, total: members.length, percent: 0 };

    const records = members.map((member) => attendanceStatusForMember(session, member.id));
    const present = records.filter((status) => status === "Presente").length;
    const absent = records.filter((status) => status === "Falta").length;
    const justified = records.filter((status) => status === "Justificado").length;
    const contact = records.filter((status) => status === "Precisa de contato").length;
    const percent = members.length ? Math.round(((present + justified) / members.length) * 100) : 0;

    return { present, absent, justified, contact, total: members.length, percent };
  }

  function canManageAttendanceClass(classRecord: SchoolClass) {
    if (currentAccessRole === "Administrador" || currentAccessRole === "Secretario") return true;
    if (currentAccessRole === "Lider") return true;
    const hasTeacherAccess = /professor/i.test(currentMember?.role ?? "");
    if (currentAccessRole !== "Professor" && !hasTeacherAccess) return false;

    const teacherText = normalizeSearchText(classRecord.teacher);
    const memberName = normalizeSearchText(currentMember?.fullName ?? "");
    const accessName = normalizeSearchText(currentAccessUser?.name ?? "");
    return Boolean((memberName && teacherText.includes(memberName)) || (accessName && teacherText.includes(accessName)));
  }

  function updateAttendanceRecord(area: AttendanceArea, classRecord: SchoolClass, event: ChurchEvent, member: MemberRecord, status: AttendanceStatus) {
    if (!canManageAttendanceClass(classRecord)) {
      setSyncStatus("Apenas o professor da turma ou a administracao pode registrar a chamada.");
      return;
    }

    const now = new Date().toISOString();
    setData((current) => {
      const existing = current.attendanceSessions.find(
        (session) => session.area === area && session.classId === classRecord.id && session.eventId === event.id,
      );
      const currentRecords = existing?.records ?? membersForAttendanceClass(area, classRecord.id).map((item) => ({
        memberId: item.id,
        status: "Presente" as AttendanceStatus,
        note: "",
      }));
      const hasRecord = currentRecords.some((record) => record.memberId === member.id);
      const records = (hasRecord ? currentRecords : [...currentRecords, { memberId: member.id, status: "Presente" as AttendanceStatus, note: "" }]).map(
        (record) => (record.memberId === member.id ? { ...record, status } : record),
      );
      const session: AttendanceSession = {
        id: existing?.id ?? uid("attendance"),
        area,
        classId: classRecord.id,
        eventId: event.id,
        date: event.date,
        title: event.title,
        teacher: classRecord.teacher,
        records,
        updatedAt: now,
      };

      return {
        ...current,
        attendanceSessions: existing
          ? current.attendanceSessions.map((item) => (item.id === existing.id ? session : item))
          : [session, ...current.attendanceSessions],
        audit: [{ id: uid("audit"), action: `Chamada atualizada: ${classRecord.name} - ${event.title}`, when: now }, ...current.audit].slice(0, 12),
      };
    });
    setSyncStatus(`Chamada atualizada para ${classRecord.name}.`);
  }

  function updateAttendanceNote(area: AttendanceArea, classRecord: SchoolClass, event: ChurchEvent, member: MemberRecord, note: string) {
    if (!canManageAttendanceClass(classRecord)) {
      setSyncStatus("Apenas o professor da turma ou a administracao pode justificar faltas.");
      return;
    }

    const now = new Date().toISOString();
    setData((current) => {
      const existing = current.attendanceSessions.find(
        (session) => session.area === area && session.classId === classRecord.id && session.eventId === event.id,
      );
      const baseRecords = existing?.records ?? membersForAttendanceClass(area, classRecord.id).map((item) => ({
        memberId: item.id,
        status: "Presente" as AttendanceStatus,
        note: "",
      }));
      const hasRecord = baseRecords.some((record) => record.memberId === member.id);
      const records = (hasRecord ? baseRecords : [...baseRecords, { memberId: member.id, status: "Justificado" as AttendanceStatus, note: "" }]).map(
        (record) => (record.memberId === member.id ? { ...record, note } : record),
      );
      const session: AttendanceSession = {
        id: existing?.id ?? uid("attendance"),
        area,
        classId: classRecord.id,
        eventId: event.id,
        date: event.date,
        title: event.title,
        teacher: classRecord.teacher,
        records,
        updatedAt: now,
      };

      return {
        ...current,
        attendanceSessions: existing
          ? current.attendanceSessions.map((item) => (item.id === existing.id ? session : item))
          : [session, ...current.attendanceSessions],
      };
    });
  }

  function memberAttendanceHistory(area: AttendanceArea, member: MemberRecord) {
    const classId = area === "school" ? member.schoolClassId : member.discipleshipClassId;
    if (!classId) return [];

    return data.attendanceSessions
      .filter((session) => session.area === area && session.classId === classId)
      .map((session) => ({
        session,
        record: session.records.find((item) => item.memberId === member.id),
      }))
      .sort((first, second) => second.session.date.localeCompare(first.session.date));
  }

  function printAttendanceSessionPdf(area: AttendanceArea, classRecord: SchoolClass, session: AttendanceSession) {
    const classMembers = membersForAttendanceClass(area, classRecord.id);
    const summary = attendanceSummary(session, classMembers);
    const areaLabel = area === "school" ? "Escola Dominical" : "Discipulado";
    const rows = classMembers
      .map((member, index) => {
        const status = attendanceStatusForMember(session, member.id);
        const note = attendanceNoteForMember(session, member.id);
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(member.fullName)}</td>
            <td>${escapeHtml(member.phone || "Nao informado")}</td>
            <td>${escapeHtml(status)}</td>
            <td>${escapeHtml(note || "-")}</td>
          </tr>
        `;
      })
      .join("");
    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");

    if (!reportWindow) {
      setSyncStatus("Nao foi possivel abrir o PDF. Libere pop-ups para salvar o historico.");
      return;
    }

    reportWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Historico da aula - ${escapeHtml(classRecord.name)}</title>
          <style>
            * { box-sizing: border-box; }
            body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
            header { border-bottom: 3px solid #0f766e; margin-bottom: 24px; padding-bottom: 16px; }
            h1 { font-size: 24px; margin: 0 0 8px; }
            h2 { font-size: 16px; margin: 24px 0 10px; }
            p { margin: 4px 0; }
            .meta, .summary { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); margin: 18px 0; }
            .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
            .box strong { display: block; font-size: 18px; margin-top: 4px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
            footer { color: #6b7280; font-size: 11px; margin-top: 24px; }
            @media print { body { margin: 18mm; } button { display: none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Salvar em PDF / Imprimir</button>
          <header>
            <h1>Historico da aula - ${escapeHtml(areaLabel)}</h1>
            <p>Igreja Conectada</p>
          </header>
          <section class="meta">
            <div class="box">Classe<strong>${escapeHtml(classRecord.name)}</strong></div>
            <div class="box">Aula<strong>${escapeHtml(session.title)}</strong></div>
            <div class="box">Data<strong>${escapeHtml(formatDate(session.date))}</strong></div>
            <div class="box">Professor<strong>${escapeHtml(session.teacher || classRecord.teacher || "Nao informado")}</strong></div>
          </section>
          <section class="summary">
            <div class="box">Alunos<strong>${summary.total}</strong></div>
            <div class="box">Presentes<strong>${summary.present}</strong></div>
            <div class="box">Faltas<strong>${summary.absent}</strong></div>
            <div class="box">Justificadas<strong>${summary.justified}</strong></div>
          </section>
          <h2>Lista de frequencia</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Aluno</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Observacao</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">Nenhum aluno matriculado nesta classe.</td></tr>'}</tbody>
          </table>
          <footer>Relatorio gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}.</footer>
          <script>
            window.addEventListener("load", () => setTimeout(() => window.print(), 250));
          </script>
        </body>
      </html>
    `);
    reportWindow.document.close();
    setSyncStatus(`Historico em PDF preparado para ${classRecord.name}.`);
  }

  function csvValue(value: unknown) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
    const content = [headers, ...rows].map((row) => row.map(csvValue).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printHtmlReport(title: string, subtitle: string, headers: string[], rows: unknown[][]) {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");

    if (!reportWindow) {
      setSyncStatus("Nao foi possivel abrir o relatorio. Libere pop-ups para imprimir ou salvar em PDF.");
      return;
    }

    const bodyRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`).join("");
    const headRows = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");

    reportWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            body { color: #111827; font-family: Arial, sans-serif; margin: 30px; }
            header { border-bottom: 3px solid #0f766e; margin-bottom: 20px; padding-bottom: 12px; }
            h1 { font-size: 24px; margin: 0 0 6px; }
            p { color: #4b5563; margin: 0; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
            button { margin-bottom: 16px; padding: 10px 14px; }
            @media print { body { margin: 18mm; } button { display: none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Salvar em PDF / Imprimir</button>
          <header>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>
          </header>
          <table>
            <thead><tr>${headRows}</tr></thead>
            <tbody>${bodyRows || `<tr><td colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody>
          </table>
        </body>
      </html>
    `);
    reportWindow.document.close();
  }

  function memberReportRows() {
    return data.members.map((member) => [
      member.fullName,
      member.memberType,
      member.status,
      member.phone,
      member.email,
      member.ministry || "Sem grupo",
      classNameById(data.schoolClasses, member.schoolClassId) || "Nao matriculado",
      classNameById(data.discipleshipClasses, member.discipleshipClassId) || "Nao matriculado",
      member.pastoralStatus || "Sem acompanhamento definido",
    ]);
  }

  function absentStudentRows() {
    return data.members
      .map((member) => {
        const records = data.attendanceSessions
          .flatMap((session) => session.records.map((record) => ({ session, record })))
          .filter(({ record }) => record.memberId === member.id)
          .sort((first, second) => second.session.date.localeCompare(first.session.date));
        const recentMisses = records.slice(0, 3).filter(({ record }) => record.status === "Falta" || record.status === "Precisa de contato").length;
        const monthMisses = records.filter(({ session, record }) => {
          const date = eventDate(session.date);
          const now = new Date();
          return Boolean(date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() && (record.status === "Falta" || record.status === "Precisa de contato"));
        }).length;

        return { member, recentMisses, monthMisses, lastStatus: records[0]?.record.status ?? "Sem chamada" };
      })
      .filter((item) => item.recentMisses >= 2 || item.monthMisses >= 3 || item.lastStatus === "Precisa de contato")
      .map(({ member, recentMisses, monthMisses, lastStatus }) => [member.fullName, member.phone, lastStatus, recentMisses, monthMisses]);
  }

  function agendaWeekRows() {
    return weekEvents.map((event) => [formatDate(event.date), event.time || "Sem horario", event.title, event.ministry, event.location, event.responsible, event.status]);
  }

  function visitorReportRows() {
    return data.visitors.map((visitor) => [
      visitor.fullName,
      visitor.phone,
      formatDate(visitor.firstVisitDate),
      formatDate(visitor.returnDate),
      visitor.invitedBy || "Nao informado",
      visitor.contactMade ? "Contato feito" : "Pendente",
      visitor.integrationStatus,
      visitor.notes,
    ]);
  }

  function scheduleReportRows() {
    return data.schedules.map((schedule) => [
      formatDate(schedule.date),
      schedule.serviceType,
      schedule.group || "Sem grupo",
      schedule.functionName,
      schedule.assignedTo,
      schedule.phone,
      schedule.confirmationStatus,
      schedule.notes,
    ]);
  }

  function financeReportRows() {
    return data.transactions.map((transaction) => [
      formatDate(transaction.date),
      transaction.type,
      transaction.category,
      transaction.description,
      transaction.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      transaction.method,
      transaction.status,
      transaction.memberName || "Nao vinculado",
      transaction.notes,
    ]);
  }

  function assetReportRows() {
    return data.assets.map((asset) => [
      asset.name,
      asset.category,
      asset.location || "Sem local",
      asset.responsible || "Sem responsavel",
      asset.condition,
      formatDate(asset.lastMaintenance),
      asset.notes,
    ]);
  }

  function reportDefinition(kind: ReportKind) {
    const reports: Record<ReportKind, { title: string; headers: string[]; rows: unknown[][] }> = {
      members: {
        title: "Membros por tipo",
        headers: ["Nome", "Tipo", "Status", "Telefone", "E-mail", "Grupo", "EBD", "Discipulado", "Situacao pastoral"],
        rows: memberReportRows(),
      },
      visitors: {
        title: "Visitantes",
        headers: ["Nome", "Telefone", "Primeira visita", "Retorno", "Convidado por", "Contato", "Integracao", "Observacoes"],
        rows: visitorReportRows(),
      },
      birthdays: {
        title: "Aniversariantes do mes",
        headers: ["Nome", "Data", "Telefone", "Grupo"],
        rows: monthlyBirthdays.map((member) => [member.fullName, birthdayLabel(member.birthDate), member.phone, member.ministry || "Sem grupo"]),
      },
      kids: {
        title: "Criancas cadastradas",
        headers: ["Crianca", "Nascimento", "Faixa", "Turma", "Responsavel", "Telefone"],
        rows: data.kids.map((kid) => [kid.childName, formatDate(kid.birthDate), kid.ageGroup, kid.className, kid.guardianName, kid.guardianPhone]),
      },
      agenda: {
        title: "Agenda semanal",
        headers: ["Data", "Horario", "Evento", "Grupo", "Local", "Responsavel", "Status"],
        rows: agendaWeekRows(),
      },
      schedules: {
        title: "Escalas",
        headers: ["Data", "Culto", "Grupo", "Funcao", "Pessoa", "WhatsApp", "Status", "Observacoes"],
        rows: scheduleReportRows(),
      },
      attendance: {
        title: "Presenca EBD e Discipulado",
        headers: ["Data", "Area", "Classe", "Aula", "Aluno", "Status", "Observacao"],
        rows: data.attendanceSessions.flatMap((session) =>
          session.records.map((record) => {
            const member = data.members.find((item) => item.id === record.memberId);
            const classes = session.area === "school" ? data.schoolClasses : data.discipleshipClasses;
            return [
              formatDate(session.date),
              session.area === "school" ? "EBD" : "Discipulado",
              classNameById(classes, session.classId),
              session.title,
              member?.fullName ?? record.memberId,
              record.status,
              record.note,
            ];
          }),
        ),
      },
      absences: {
        title: "Faltosos recentes",
        headers: ["Nome", "WhatsApp", "Ultimo status", "Faltas recentes", "Faltas no mes"],
        rows: absentStudentRows(),
      },
      finance: {
        title: "Financeiro",
        headers: ["Data", "Tipo", "Categoria", "Descricao", "Valor", "Metodo", "Status", "Membro", "Observacoes"],
        rows: financeReportRows(),
      },
      assets: {
        title: "Patrimonio",
        headers: ["Item", "Categoria", "Local", "Responsavel", "Estado", "Ultima manutencao", "Observacoes"],
        rows: assetReportRows(),
      },
    };

    return reports[kind];
  }

  function exportReport(kind: ReportKind, format: "pdf" | "csv") {
    const report = reportDefinition(kind);
    const subtitle = `Igreja Conectada - gerado em ${new Date().toLocaleString("pt-BR")}`;

    if (format === "csv") {
      downloadCsv(`${report.title.toLowerCase().replaceAll(" ", "-")}.csv`, report.headers, report.rows);
      log(`CSV gerado: ${report.title}`);
      return;
    }

    printHtmlReport(report.title, subtitle, report.headers, report.rows);
    log(`PDF preparado: ${report.title}`);
  }

  function readPhoto(event: ChangeEvent<HTMLInputElement>, onReady: (photoDataUrl: string) => void) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSyncStatus("Preparando foto...");
    void optimizeProfilePhoto(file)
      .then((result) => {
        onReady(result.dataUrl);
        setSyncStatus(result.message);
      })
      .catch((error) => {
        setSyncStatus(error instanceof Error ? error.message : "Nao foi possivel carregar a foto selecionada.");
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

  function requireModuleAccess(moduleKey: ModuleKey, action: string) {
    if (canManageModule(currentAccessRole, moduleKey)) return true;
    setSyncStatus(`${currentAccessRole}: ${action} nao esta liberado para este perfil.`);
    return false;
  }

  function selectAccessMember(memberId: string) {
    setSelectedAccessMemberId(memberId);
    const member = data.members.find((item) => item.id === memberId);
    if (!member) {
      setUserForm(blankUser);
      return;
    }

    const existingAccess = data.users.find(
      (user) => normalizeEmail(user.email) === normalizeEmail(member.email) || user.id === member.authUserId,
    );

    setUserForm((form) => ({
      ...form,
      name: member.fullName,
      email: member.email,
      role: existingAccess?.role ?? "Lider",
      status: existingAccess?.status ?? "Ativo",
    }));
    setSyncStatus(`Membro selecionado para acesso administrativo: ${member.fullName}.`);
  }

  function createCareRequest() {
    const memberName = canManagePastoral ? careForm.member.trim() : currentMember?.fullName ?? profileName;
    const memberPhone = canManagePastoral ? careForm.phone.trim() : currentMember?.phone ?? careForm.phone.trim();
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
    setCareForm(canManagePastoral ? blankCare : { ...blankCare, member: memberName, phone: memberPhone });
    setActiveModule("pastoral");
  }

  function updateCareRequest(id: string, patch: Partial<CareRequest>, action: string) {
    if (!requireModuleAccess("pastoral", action)) return;

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
    if (!requireModuleAccess("mural", "alterar mural")) return;

    setData((current) => ({
      ...current,
      mural: current.mural.map((item) => (item.id === id ? { ...item, [field]: !item[field] } : item)),
      audit: [{ id: uid("audit"), action: "Mural atualizado", when: new Date().toISOString() }, ...current.audit],
    }));
  }

  async function createUser() {
    if (!requireModuleAccess("users", "criar usuarios")) return;
    if (!userForm.name.trim() || !userForm.email.trim()) return;
    if (!selectedAccessExistingUser && userForm.password.trim().length < 6) {
      setSyncStatus("Informe uma senha inicial com pelo menos 6 caracteres.");
      return;
    }

    const now = new Date().toISOString();
    const existingAccess = selectedAccessExistingUser ?? data.users.find((item) => normalizeEmail(item.email) === normalizeEmail(userForm.email));
    const isUpdatingAccess = Boolean(existingAccess);
    const user: AccessUser = {
      id: existingAccess?.id ?? uid("user"),
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
        method: isUpdatingAccess ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...userForm,
          userId: existingAccess?.id,
          currentEmail: existingAccess?.email,
        }),
      });
      const result = (await response.json()) as { id?: string; error?: string };

      if (!response.ok) {
        setSyncStatus(result.error ?? "Nao foi possivel criar o acesso no Supabase.");
        return;
      }

      user.id = result.id ?? user.id;
      setSyncStatus(isUpdatingAccess ? `Acesso Supabase atualizado para ${user.name}.` : `Acesso Supabase criado para ${user.name}.`);
    }

    setData((current) => ({
      ...current,
      users: isUpdatingAccess ? current.users.map((item) => (item.id === user.id ? user : item)) : [user, ...current.users],
      members: selectedAccessMemberId
        ? current.members.map((member) =>
            member.id === selectedAccessMemberId ? { ...member, email: user.email, authUserId: user.id, role: user.role } : member,
          )
        : current.members,
      audit: [
        { id: uid("audit"), action: isUpdatingAccess ? `Acesso promovido: ${user.name}` : `Usuario criado para ${user.name}`, when: now },
        ...current.audit,
      ].slice(0, 12),
    }));
    setUserForm(blankUser);
    setSelectedAccessMemberId("");
  }

  async function updateAccessUserStatus(user: AccessUser, status: AccessUser["status"]) {
    if (!requireModuleAccess("users", "alterar acessos")) return;
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
    if (!requireModuleAccess("users", "excluir acessos")) return;
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
    if (!canManageMembers && editingMemberId !== currentMember?.id) {
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
      visitors:
        member.memberType === "Visitante" || member.status === "Visitante" || member.status === "Novo convertido"
          ? [
              {
                id: `visitor-${member.id}`,
                fullName: member.fullName,
                phone: member.phone,
                firstVisitDate: member.joinedAt || currentDateKey(),
                returnDate: "",
                invitedBy: member.registrationSource,
                contactMade: member.pastoralStatus !== "Precisa de contato",
                integrationStatus: member.status === "Novo convertido" ? "Em acompanhamento" : "Primeira visita",
                notes: member.notes,
              },
              ...current.visitors.filter((visitor) => visitor.id !== `visitor-${member.id}`),
            ]
          : current.visitors,
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
    if (!canManageMembers && member.id !== currentMember?.id) {
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
    if (!requireModuleAccess("members", "excluir fichas de membros")) return;
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

  function createVisitor() {
    if (!requireModuleAccess("visitors", editingVisitorId ? "editar visitante" : "cadastrar visitante")) return;
    if (!canCreateVisitor) return;

    const now = new Date().toISOString();
    const visitor: VisitorRecord = { ...visitorForm, id: editingVisitorId ?? uid("visitor") };

    setData((current) => ({
      ...current,
      visitors: editingVisitorId
        ? current.visitors.map((item) => (item.id === editingVisitorId ? visitor : item))
        : [visitor, ...current.visitors],
      audit: [
        { id: uid("audit"), action: editingVisitorId ? `Visitante atualizado: ${visitor.fullName}` : `Visitante cadastrado: ${visitor.fullName}`, when: now },
        ...current.audit,
      ].slice(0, 12),
    }));
    setVisitorForm(blankVisitor);
    setEditingVisitorId(null);
    setSyncStatus(editingVisitorId ? `Visitante ${visitor.fullName} atualizado.` : `Visitante ${visitor.fullName} cadastrado.`);
  }

  function editVisitor(visitor: VisitorRecord) {
    if (!requireModuleAccess("visitors", "editar visitante")) return;
    const { id, ...form } = visitor;
    setVisitorForm(form);
    setEditingVisitorId(id);
    setSyncStatus(`Editando visitante ${visitor.fullName}.`);
  }

  function deleteVisitor(visitor: VisitorRecord) {
    if (!requireModuleAccess("visitors", "excluir visitante")) return;
    if (!window.confirm(`Excluir o acompanhamento de ${visitor.fullName}?`)) return;

    setData((current) => ({
      ...current,
      visitors: current.visitors.filter((item) => item.id !== visitor.id),
      audit: [{ id: uid("audit"), action: `Visitante excluido: ${visitor.fullName}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    if (editingVisitorId === visitor.id) {
      setVisitorForm(blankVisitor);
      setEditingVisitorId(null);
    }
  }

  function convertVisitorToMember(visitor: VisitorRecord) {
    if (!requireModuleAccess("members", "converter visitante em membro")) return;

    const now = new Date().toISOString();
    const member: MemberRecord = {
      ...blankMember,
      id: uid("member"),
      fullName: visitor.fullName,
      phone: visitor.phone,
      status: "Membro ativo",
      memberType: "Membro",
      registrationSource: "Visitante integrado",
      pastoralStatus: "Integrado",
      joinedAt: visitor.returnDate || visitor.firstVisitDate || currentDateKey(),
      notes: visitor.notes,
    };

    setData((current) => ({
      ...current,
      members: [member, ...current.members],
      visitors: current.visitors.map((item) =>
        item.id === visitor.id ? { ...item, integrationStatus: "Integrado", contactMade: true, returnDate: item.returnDate || currentDateKey() } : item,
      ),
      audit: [{ id: uid("audit"), action: `Visitante integrado como membro: ${visitor.fullName}`, when: now }, ...current.audit].slice(0, 12),
    }));
    setSyncStatus(`${visitor.fullName} foi enviado para o cadastro de membros.`);
  }

  function toggleMemberCredentials(member: MemberRecord) {
    if (!requireModuleAccess("users", "alterar login e senha de membros")) return;
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
    if (!requireModuleAccess("users", "criar ou alterar login de membros")) return;
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
    if (!requireModuleAccess("kids", "cadastrar Kids")) return;
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
    if (!requireModuleAccess("kids", "excluir cadastro Kids")) return;
    if (!window.confirm(`Excluir o cadastro Kids de ${kid.childName}?`)) return;

    setData((current) => ({
      ...current,
      kids: current.kids.filter((item) => item.id !== kid.id),
      audit: [{ id: uid("audit"), action: `Cadastro Kids excluido: ${kid.childName}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    setSyncStatus(`Cadastro Kids de ${kid.childName} excluido.`);
  }

  function createMuralItem() {
    if (!requireModuleAccess("mural", "criar itens do mural")) return;
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
    if (!requireModuleAccess("mural", "excluir itens do mural")) return;
    if (!window.confirm(`Excluir o item do mural "${item.title}"?`)) return;

    setData((current) => ({
      ...current,
      mural: current.mural.filter((muralItem) => muralItem.id !== item.id),
      audit: [{ id: uid("audit"), action: `Item excluido do mural: ${item.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function recurringEventsFrom(event: ChurchEvent) {
    if (event.recurrence === "Unico" || !event.date) return [event];

    const total = event.recurrence === "Semanal" ? 4 : 3;
    return Array.from({ length: total }, (_, index) => {
      const date = eventDate(event.date);
      if (!date) return event;
      if (event.recurrence === "Semanal") date.setDate(date.getDate() + index * 7);
      if (event.recurrence === "Mensal") date.setMonth(date.getMonth() + index);
      return {
        ...event,
        id: index === 0 ? event.id : uid("event"),
        date: date.toISOString().slice(0, 10),
      };
    });
  }

  function createEvent() {
    if (!requireModuleAccess("events", editingEventId ? "editar eventos" : "adicionar eventos")) return;
    if (!canCreateEvent) return;

    const now = new Date().toISOString();
    const event: ChurchEvent = { ...eventForm, id: editingEventId ?? uid("event") };
    const eventsToAdd = editingEventId ? [event] : recurringEventsFrom(event);

    setData((current) => ({
      ...current,
      events: editingEventId
        ? current.events.map((item) => (item.id === editingEventId ? event : item))
        : [...eventsToAdd, ...current.events],
      attendanceSessions: editingEventId
        ? current.attendanceSessions.map((session) =>
            session.eventId === editingEventId
              ? { ...session, date: event.date, title: event.title, updatedAt: now }
              : session,
          )
        : current.attendanceSessions,
      audit: [
        {
          id: uid("audit"),
          action: editingEventId ? `Evento atualizado na agenda: ${event.title}` : `Evento adicionado na agenda: ${event.title}`,
          when: now,
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setEventForm(blankEvent);
    setEditingEventId(null);
  }

  function editEvent(event: ChurchEvent) {
    if (!requireModuleAccess("events", "editar eventos")) return;
    setEventForm({
      title: event.title,
      date: event.date,
      time: event.time,
      ministry: event.ministry,
      location: event.location,
      responsible: event.responsible,
      recurrence: event.recurrence,
      status: event.status,
    });
    setEditingEventId(event.id);
    setSyncStatus(`Evento selecionado para edicao: ${event.title}.`);
  }

  function duplicateEvent(event: ChurchEvent) {
    if (!requireModuleAccess("events", "duplicar eventos")) return;
    setEventForm({
      title: `${event.title} - copia`,
      date: event.date,
      time: event.time,
      ministry: event.ministry,
      location: event.location,
      responsible: event.responsible,
      recurrence: "Unico",
      status: "Programado",
    });
    setEditingEventId(null);
    setSyncStatus(`Evento duplicado no formulario: ${event.title}. Ajuste a data e salve.`);
    window.setTimeout(() => document.querySelector(".editing-surface, .surface")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function cancelEventEdit() {
    setEventForm(blankEvent);
    setEditingEventId(null);
  }

  function updateEventStatus(event: ChurchEvent, status: ChurchEvent["status"]) {
    if (!requireModuleAccess("events", "alterar eventos")) return;
    setData((current) => ({
      ...current,
      events: current.events.map((item) => (item.id === event.id ? { ...item, status } : item)),
      audit: [{ id: uid("audit"), action: `Evento ${status.toLowerCase()}: ${event.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function deleteEvent(event: ChurchEvent) {
    if (!requireModuleAccess("events", "excluir eventos")) return;
    if (!window.confirm(`Excluir o evento "${event.title}" da agenda?`)) return;

    setData((current) => ({
      ...current,
      events: current.events.filter((item) => item.id !== event.id),
      audit: [{ id: uid("audit"), action: `Evento excluido da agenda: ${event.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));

    if (editingEventId === event.id) {
      cancelEventEdit();
    }
  }

  function createSchedule() {
    if (!requireModuleAccess("schedules", editingScheduleId ? "editar escala" : "criar escala")) return;
    if (!canCreateSchedule) return;

    const now = new Date().toISOString();
    const schedule: ScheduleRecord = { ...scheduleForm, id: editingScheduleId ?? uid("schedule") };

    setData((current) => ({
      ...current,
      schedules: editingScheduleId
        ? current.schedules.map((item) => (item.id === editingScheduleId ? schedule : item))
        : [schedule, ...current.schedules],
      audit: [
        { id: uid("audit"), action: editingScheduleId ? `Escala atualizada: ${schedule.serviceType}` : `Escala criada: ${schedule.serviceType}`, when: now },
        ...current.audit,
      ].slice(0, 12),
    }));
    setScheduleForm(blankSchedule);
    setEditingScheduleId(null);
    setSyncStatus(editingScheduleId ? "Escala atualizada." : "Escala cadastrada.");
  }

  function editSchedule(schedule: ScheduleRecord) {
    if (!requireModuleAccess("schedules", "editar escala")) return;
    const { id, ...form } = schedule;
    setScheduleForm(form);
    setEditingScheduleId(id);
    setSyncStatus(`Editando escala de ${schedule.serviceType}.`);
  }

  function deleteSchedule(schedule: ScheduleRecord) {
    if (!requireModuleAccess("schedules", "excluir escala")) return;
    if (!window.confirm(`Excluir a escala de ${schedule.serviceType} para ${schedule.assignedTo}?`)) return;

    setData((current) => ({
      ...current,
      schedules: current.schedules.filter((item) => item.id !== schedule.id),
      audit: [{ id: uid("audit"), action: `Escala excluida: ${schedule.serviceType}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    if (editingScheduleId === schedule.id) {
      setScheduleForm(blankSchedule);
      setEditingScheduleId(null);
    }
  }

  function createTransaction() {
    if (!requireModuleAccess("finance", editingTransactionId ? "editar lancamento financeiro" : "criar lancamento financeiro")) return;
    if (!canCreateTransaction) return;

    const transaction: TransactionRecord = {
      ...transactionForm,
      id: editingTransactionId ?? uid("transaction"),
      amount: Number(transactionForm.amount || 0),
    };

    setData((current) => ({
      ...current,
      transactions: editingTransactionId
        ? current.transactions.map((item) => (item.id === editingTransactionId ? transaction : item))
        : [transaction, ...current.transactions],
      audit: [
        {
          id: uid("audit"),
          action: editingTransactionId ? `Lancamento financeiro atualizado: ${transaction.description}` : `Lancamento financeiro criado: ${transaction.description}`,
          when: new Date().toISOString(),
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setTransactionForm(blankTransaction);
    setEditingTransactionId(null);
    setSyncStatus(editingTransactionId ? "Lancamento financeiro atualizado." : "Lancamento financeiro cadastrado.");
  }

  function editTransaction(transaction: TransactionRecord) {
    if (!requireModuleAccess("finance", "editar lancamento financeiro")) return;
    const { id, ...form } = transaction;
    setTransactionForm(form);
    setEditingTransactionId(id);
    setSyncStatus(`Editando lancamento financeiro: ${transaction.description}.`);
  }

  function deleteTransaction(transaction: TransactionRecord) {
    if (!requireModuleAccess("finance", "excluir lancamento financeiro")) return;
    if (!window.confirm(`Excluir o lancamento "${transaction.description}"?`)) return;

    setData((current) => ({
      ...current,
      transactions: current.transactions.filter((item) => item.id !== transaction.id),
      audit: [{ id: uid("audit"), action: `Lancamento financeiro excluido: ${transaction.description}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    if (editingTransactionId === transaction.id) {
      setTransactionForm(blankTransaction);
      setEditingTransactionId(null);
    }
  }

  function createAsset() {
    if (!requireModuleAccess("assets", editingAssetId ? "editar patrimonio" : "criar patrimonio")) return;
    if (!canCreateAsset) return;

    const asset: AssetRecord = { ...assetForm, id: editingAssetId ?? uid("asset") };

    setData((current) => ({
      ...current,
      assets: editingAssetId ? current.assets.map((item) => (item.id === editingAssetId ? asset : item)) : [asset, ...current.assets],
      audit: [
        {
          id: uid("audit"),
          action: editingAssetId ? `Patrimonio atualizado: ${asset.name}` : `Patrimonio cadastrado: ${asset.name}`,
          when: new Date().toISOString(),
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setAssetForm(blankAsset);
    setEditingAssetId(null);
    setSyncStatus(editingAssetId ? "Patrimonio atualizado." : "Patrimonio cadastrado.");
  }

  function editAsset(asset: AssetRecord) {
    if (!requireModuleAccess("assets", "editar patrimonio")) return;
    const { id, ...form } = asset;
    setAssetForm(form);
    setEditingAssetId(id);
    setSyncStatus(`Editando patrimonio: ${asset.name}.`);
  }

  function deleteAsset(asset: AssetRecord) {
    if (!requireModuleAccess("assets", "excluir patrimonio")) return;
    if (!window.confirm(`Excluir o patrimonio "${asset.name}"?`)) return;

    setData((current) => ({
      ...current,
      assets: current.assets.filter((item) => item.id !== asset.id),
      audit: [{ id: uid("audit"), action: `Patrimonio excluido: ${asset.name}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    if (editingAssetId === asset.id) {
      setAssetForm(blankAsset);
      setEditingAssetId(null);
    }
  }

  function createDevotional() {
    if (!requireModuleAccess("devotional", editingDevotionalId ? "editar devocional" : "criar devocional")) return;
    if (!canCreateDevotional) return;

    const devotional: DevotionalRecord = {
      ...devotionalForm,
      id: editingDevotionalId ?? uid("devotional"),
      publishedAt: devotionalForm.publishedAt || currentDateKey(),
    };

    setData((current) => ({
      ...current,
      devotionals: editingDevotionalId
        ? current.devotionals.map((item) => (item.id === editingDevotionalId ? devotional : item))
        : [devotional, ...current.devotionals],
      audit: [
        {
          id: uid("audit"),
          action: editingDevotionalId ? `Devocional atualizado: ${devotional.title}` : `Devocional cadastrado: ${devotional.title}`,
          when: new Date().toISOString(),
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setDevotionalForm(blankDevotional);
    setEditingDevotionalId(null);
    setSyncStatus(editingDevotionalId ? "Devocional atualizado." : "Devocional cadastrado.");
  }

  function editDevotional(devotional: DevotionalRecord) {
    if (!requireModuleAccess("devotional", "editar devocional")) return;
    const { id, ...form } = devotional;
    setDevotionalForm(form);
    setEditingDevotionalId(id);
    setSyncStatus(`Editando devocional: ${devotional.title}.`);
  }

  function deleteDevotional(devotional: DevotionalRecord) {
    if (!requireModuleAccess("devotional", "excluir devocional")) return;
    if (!window.confirm(`Excluir o devocional "${devotional.title}"?`)) return;

    setData((current) => ({
      ...current,
      devotionals: current.devotionals.filter((item) => item.id !== devotional.id),
      audit: [{ id: uid("audit"), action: `Devocional excluido: ${devotional.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    if (editingDevotionalId === devotional.id) {
      setDevotionalForm(blankDevotional);
      setEditingDevotionalId(null);
    }
  }

  function createNotice() {
    if (!requireModuleAccess("notices", "criar comunicados")) return;
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
    if (!requireModuleAccess("notices", "excluir comunicados")) return;
    if (!window.confirm(`Excluir o aviso "${notice.title}"?`)) return;

    setData((current) => ({
      ...current,
      notices: current.notices.filter((item) => item.id !== notice.id),
      audit: [{ id: uid("audit"), action: `Aviso excluido: ${notice.title}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function createMinistry() {
    if (!requireModuleAccess("ministries", "criar grupos")) return;
    if (!canCreateMinistry) return;

    const now = new Date().toISOString();
    const previousMinistry = editingMinistryId ? data.ministries.find((ministry) => ministry.id === editingMinistryId) : undefined;
    const ministry: MinistryRecord = { ...ministryForm, id: editingMinistryId ?? uid("ministry") };

    setData((current) => ({
      ...current,
      ministries: editingMinistryId
        ? current.ministries.map((item) => (item.id === editingMinistryId ? ministry : item))
        : [ministry, ...current.ministries],
      members: previousMinistry?.name && previousMinistry.name !== ministry.name
        ? current.members.map((member) => (member.ministry === previousMinistry.name ? { ...member, ministry: ministry.name } : member))
        : current.members,
      events: previousMinistry?.name && previousMinistry.name !== ministry.name
        ? current.events.map((event) => (event.ministry === previousMinistry.name ? { ...event, ministry: ministry.name } : event))
        : current.events,
      audit: [
        {
          id: uid("audit"),
          action: editingMinistryId ? `Grupo atualizado: ${ministry.name}` : `Grupo cadastrado: ${ministry.name}`,
          when: now,
        },
        ...current.audit,
      ].slice(0, 12),
    }));
    setMinistryForm(blankMinistry);
    setEditingMinistryId(null);
  }

  function editMinistry(ministry: MinistryRecord) {
    if (!requireModuleAccess("ministries", "editar grupos")) return;
    setMinistryForm({
      name: ministry.name,
      leader: ministry.leader,
      assistant: ministry.assistant,
      meetingDay: ministry.meetingDay,
      volunteers: ministry.volunteers,
      status: ministry.status,
      notes: ministry.notes,
    });
    setEditingMinistryId(ministry.id);
    setSyncStatus(`Grupo selecionado para edicao: ${ministry.name}.`);
  }

  function cancelMinistryEdit() {
    setMinistryForm(blankMinistry);
    setEditingMinistryId(null);
  }

  function deleteMinistry(ministry: MinistryRecord) {
    if (!requireModuleAccess("ministries", "excluir grupos")) return;
    if (!window.confirm(`Excluir o grupo "${ministry.name}"? Os membros vinculados ficarao sem grupo definido.`)) return;

    setData((current) => ({
      ...current,
      ministries: current.ministries.filter((item) => item.id !== ministry.id),
      members: current.members.map((member) => (member.ministry === ministry.name ? { ...member, ministry: "" } : member)),
      events: current.events.map((event) => (event.ministry === ministry.name ? { ...event, ministry: "Todos" } : event)),
      audit: [{ id: uid("audit"), action: `Grupo excluido: ${ministry.name}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));

    if (editingMinistryId === ministry.id) {
      cancelMinistryEdit();
    }
  }

  function createSchoolNotice() {
    if (!requireModuleAccess("school", "enviar avisos da EBD")) return;
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
    if (!requireModuleAccess("discipleship", "enviar avisos do discipulado")) return;
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
    setEditingEventId(null);
    setNoticeForm(blankNotice);
    setMinistryForm(blankMinistry);
    setUserForm(blankUser);
    setMemberForm(blankMember);
    setEditingMemberId(null);
    setMemberFormTab("Dados");
    setMemberCredentialForm(blankMemberCredential);
    setVisitorForm(blankVisitor);
    setEditingVisitorId(null);
    setKidForm(blankKid);
    setScheduleForm(blankSchedule);
    setEditingScheduleId(null);
    setMuralForm(blankMuralItem);
    setSchoolNoticeForm(blankSchoolNotice);
    setDiscipleshipNoticeForm({ ...blankSchoolNotice, classId: "discipleship-new" });
    setAttendanceEventSelection({});
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
      value: weekEvents.length.toString(),
      hint: "encontros desta semana",
      module: "events" as ModuleKey,
    },
    {
      label: "Visitantes",
      value: data.visitors.filter((visitor) => visitor.integrationStatus !== "Integrado").length.toString(),
      hint: "em acompanhamento",
      module: "visitors" as ModuleKey,
    },
    {
      label: "Escalas",
      value: data.schedules.length.toString(),
      hint: "pessoas escaladas",
      module: "schedules" as ModuleKey,
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
      const metadata = authData.user?.app_metadata ?? {};
      const accessStatus = metadata.church_gp_access ?? metadata.status;
      if (!isApprovedAccessStatus(accessStatus)) {
        await supabase.auth.signOut();
        setAccessMessage("Seu acesso ainda nao esta ativo. Fale com a administracao.");
        return;
      }
      resolvedUserId = authData.user?.id ?? "";
      resolvedRole = accessRoleForSession(data.users, authData.user?.email ?? loginEmail, metadata);
      setRemoteStateReady(false);
      setSyncStatus("Sessao Supabase ativa. Novos dados serao sincronizados.");
    }

    setSessionUserId(resolvedUserId);
    setSessionEmail(loginEmail);
    setSessionRole(resolvedRole);
    setHasSession(true);
  }

  function handleLogout() {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const dataToSave = data;
    setHasSession(false);
    setSessionUserId("");
    setSessionEmail("");
    setSessionRole("Administrador");
    setNotificationsOpen(false);
    setActiveModule("overview");
    setAccessMode("login");
    setRemoteStateReady(true);
    lastSavedPayloadRef.current = "";
    setAccessMessage("Voce saiu do sistema com seguranca.");

    void (async () => {
      try {
        if (hasSession && isSupabaseConfigured()) {
          await saveRemoteStateNow(dataToSave);
        }

        const supabase = getSupabaseClient();
        if (supabase) await supabase.auth.signOut();
      } catch {
        setSyncStatus("Voce saiu do sistema. Se havia alguma alteracao pendente, confira a base no proximo acesso.");
      } finally {
        logoutInProgressRef.current = false;
      }
    })();
  }

  function selectMessageTemplate(templateId: string) {
    const template = availableMessageTemplates.find((item) => item.id === templateId);
    setMessageTemplateId(templateId);
    if (template) setMessageText(template.text);
  }

  function saveCustomMessageTemplate() {
    if (!canManageMessages || !customTemplateLabel.trim() || !customTemplateText.trim()) return;

    const template: MessageTemplateItem = {
      id: uid("template"),
      label: customTemplateLabel.trim(),
      text: customTemplateText.trim(),
      audience: messageAudience,
    };

    setData((current) => ({
      ...current,
      messageTemplates: [template, ...current.messageTemplates].slice(0, 30),
      audit: [{ id: uid("audit"), action: `Modelo WhatsApp criado: ${template.label}`, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
    setMessageTemplateId(template.id);
    setMessageText(template.text);
    setCustomTemplateLabel("");
    setCustomTemplateText("");
    setSyncStatus(`Modelo "${template.label}" salvo para uso nesta comunicacao.`);
  }

  function openBulkWhatsapp() {
    if (!requireModuleAccess("messages", "enviar mensagens em massa")) return;

    const recipients = selectedMessageRecipients.slice(0, messageBatchLimit);

    recipients.forEach((recipient, index) => {
      window.setTimeout(() => {
        window.open(whatsappUrl(recipient.phone, messageText, recipient.name), "_blank", "noopener,noreferrer");
      }, index * 450);
    });
    const campaign: MessageCampaign = {
      id: uid("campaign"),
      audience: messageAudience,
      templateId: messageTemplateId,
      text: messageText,
      recipientCount: recipients.length,
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      messageCampaigns: [campaign, ...current.messageCampaigns].slice(0, 20),
      audit: [{ id: uid("audit"), action: `Campanha WhatsApp aberta para ${recipients.length} contatos`, when: campaign.createdAt }, ...current.audit].slice(0, 12),
    }));
    void saveMessageCampaignToSupabase(recipients);
    setSyncStatus(`Lote WhatsApp preparado para ${recipients.length} contatos selecionados.`);
  }

  function renderAttendancePanel(area: AttendanceArea, classRecord: SchoolClass) {
    const classMembers = membersForAttendanceClass(area, classRecord.id);
    const events = eventsForAttendance(area);
    const selectedEvent = selectedAttendanceEvent(area, classRecord.id);
    const session = selectedEvent ? attendanceSessionForEvent(area, classRecord.id, selectedEvent.id) : undefined;
    const summary = attendanceSummary(session, classMembers);
    const canManage = canManageAttendanceClass(classRecord);
    const currentMemberIsStudent = Boolean(
      currentMember && (area === "school" ? currentMember.schoolClassId === classRecord.id : currentMember.discipleshipClassId === classRecord.id),
    );
    const currentMemberHistory = currentMember ? memberAttendanceHistory(area, currentMember).filter((item) => item.session.classId === classRecord.id) : [];
    const areaLabel = area === "school" ? "EBD" : "Discipulado";

    if (!canManage && !currentMemberIsStudent) return null;

    return (
      <div className="credential-panel">
        <div className="panel-heading compact-heading">
          <h2>{canManage ? `Chamada da aula - ${areaLabel}` : "Minha frequencia"}</h2>
          <span>{summary.total} aluno{summary.total === 1 ? "" : "s"}</span>
        </div>

        {canManage ? (
          <div className="form-grid">
            <label className="full">
              Aula da agenda
              <select
                disabled={!events.length}
                onChange={(event) =>
                  setAttendanceEventSelection((current) => ({
                    ...current,
                    [attendanceKey(area, classRecord.id)]: event.target.value,
                  }))
                }
                value={selectedEvent?.id ?? ""}
              >
                {events.length ? (
                  events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {formatDate(event.date)} - {event.title}
                    </option>
                  ))
                ) : (
                  <option value="">Crie um evento de {areaLabel} na agenda</option>
                )}
              </select>
            </label>

            <div className="message-preview full">
              <strong>
                {summary.present} presentes, {summary.absent} faltas, {summary.justified} justificadas
              </strong>
              <span>{session ? `${summary.percent}% de frequencia registrada` : "Selecione a aula e marque os alunos para iniciar a chamada."}</span>
            </div>

            <div className="row-list full">
              {!classMembers.length && (
                <div className="data-row">
                  <span className="bullet-mark" />
                  <div>
                    <strong>Nenhum aluno matriculado</strong>
                    <small>Vincule alunos a esta classe na ficha de membros.</small>
                  </div>
                </div>
              )}

              {selectedEvent &&
                classMembers.map((member) => (
                  <div className="data-row access-user-row" key={member.id}>
                    <div>
                      <strong>{member.fullName}</strong>
                      <small>{member.phone} - {member.status}</small>
                    </div>
                    <select
                      onChange={(event) =>
                        updateAttendanceRecord(area, classRecord, selectedEvent, member, event.target.value as AttendanceStatus)
                      }
                      value={attendanceStatusForMember(session, member.id)}
                    >
                        <option>Presente</option>
                        <option>Falta</option>
                        <option>Justificado</option>
                        <option>Precisa de contato</option>
                      </select>
                    <input
                      onChange={(event) => updateAttendanceNote(area, classRecord, selectedEvent, member, event.target.value)}
                      placeholder="Justificativa ou observacao"
                      value={attendanceNoteForMember(session, member.id)}
                    />
                  </div>
                ))}
            </div>

            <div className="row-list full">
              <strong>Historico da turma</strong>
              {attendanceSessionsForClass(area, classRecord.id).length ? (
                attendanceSessionsForClass(area, classRecord.id).map((attendanceSession) => {
                  const sessionSummary = attendanceSummary(attendanceSession, classMembers);
                  return (
                    <div className="data-row access-user-row" key={attendanceSession.id}>
                      <span className="date-box">{formatDate(attendanceSession.date)}</span>
                      <div>
                        <strong>{attendanceSession.title}</strong>
                        <small>
                          {sessionSummary.present} presentes - {sessionSummary.absent} faltas - {sessionSummary.justified} justificadas
                        </small>
                        <small>{sessionSummary.percent}% de frequencia</small>
                      </div>
                      <div className="row-actions">
                        <button className="secondary" onClick={() => printAttendanceSessionPdf(area, classRecord, attendanceSession)} type="button">
                          Salvar PDF
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="empty-state">Nenhuma chamada registrada para esta classe.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="row-list">
            {currentMemberHistory.length ? (
              currentMemberHistory.map(({ session: attendanceSession, record }) => (
                <div className="data-row" key={attendanceSession.id}>
                  <span className="date-box">{formatDate(attendanceSession.date)}</span>
                  <div>
                    <strong>{attendanceSession.title}</strong>
                    <small>{record?.status ?? "Nao registrado"}</small>
                    {record?.note && <small>{record.note}</small>}
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">Sua frequencia ainda nao foi registrada nesta classe.</p>
            )}
          </div>
        )}
      </div>
    );
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

  async function saveMessageCampaignToSupabase(recipients: MessageRecipient[]) {
    const supabase = getSupabaseClient();
    if (!supabase || !recipients.length) return;

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
      recipient_count: recipients.length,
      created_by: user.id,
    });

    if (campaignError) {
      setSyncStatus("Mensagens abertas; campanha nao foi salva no Supabase.");
      return;
    }

    const { error: recipientsError } = await supabase.from("message_recipients").insert(
      recipients.map((recipient) => ({
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
            <span className={`status-dot ${saveState}`} />
            <div>
              <strong>{isSupabaseConfigured() ? "Supabase preparado" : "Modo local ativo"}</strong>
              <span>{syncStatus}</span>
              {lastSavedAt && <small>Ultimo salvamento: {lastSavedAt}</small>}
              {saveState === "error" && hasSession && isSupabaseConfigured() && (
                <button className="sync-reload-button" onClick={reloadRemoteStateNow} type="button">
                  Recarregar dados da base
                </button>
              )}
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
          {canAccessModule(currentAccessRole, "pastoral") && <button
            className={activeModule === "pastoral" ? "active" : ""}
            onClick={() => setActiveModule("pastoral")}
            type="button"
          >
            Pastoral
          </button>}
          {canAccessModule(currentAccessRole, "members") && <button
            className={activeModule === "members" ? "active" : ""}
            onClick={() => setActiveModule("members")}
            type="button"
          >
            Membros
          </button>}
          {canAccessModule(currentAccessRole, "events") && <button
            className={activeModule === "events" ? "active" : ""}
            onClick={() => setActiveModule("events")}
            type="button"
          >
            Agenda
          </button>}
          {canAccessModule(currentAccessRole, "visitors") && <button
            className={activeModule === "visitors" ? "active" : ""}
            onClick={() => setActiveModule("visitors")}
            type="button"
          >
            Visitas
          </button>}
          {canAccessModule(currentAccessRole, "schedules") && <button
            className={activeModule === "schedules" ? "active" : ""}
            onClick={() => setActiveModule("schedules")}
            type="button"
          >
            Escalas
          </button>}
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
              <p className="eyebrow">{currentLongDate}</p>
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
                <input
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder="Buscar membro, evento ou pedido"
                  type="search"
                  value={globalSearch}
                />
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
                <h2>Prioridades, pessoas e grupos em tempo real.</h2>
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
                {actionHighlights.filter((item) => canAccessModule(currentAccessRole, item.module)).map((item) => (
                  <button className="action-tile" key={item.label} onClick={() => setActiveModule(item.module)} type="button">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.hint}</small>
                  </button>
                ))}
              </div>

              {birthdaySpotlightPanel}

              {publishedDevotional && (
                <article className="surface wide devotional-card">
                  <div className="panel-heading">
                    <h2>{publishedDevotional.title}</h2>
                    <span>{formatDate(publishedDevotional.publishedAt)}</span>
                  </div>
                  <strong>{publishedDevotional.verse}</strong>
                  <p>{publishedDevotional.body}</p>
                  {canManageDevotional && (
                    <button className="secondary" onClick={() => setActiveModule("devotional")} type="button">
                      Gerenciar palavra
                    </button>
                  )}
                </article>
              )}

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Agenda da semana</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {weekEvents.map((event) => (
                    <div className="data-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>{event.ministry}</small>
                      </div>
                    </div>
                  ))}
                  {!weekEvents.length && <p className="empty-state">Nenhum evento cadastrado para esta semana.</p>}
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

              {birthdaySpotlightPanel}

              {publishedDevotional && (
                <article className="surface wide devotional-card">
                  <div className="panel-heading">
                    <h2>{publishedDevotional.title}</h2>
                    <span>{formatDate(publishedDevotional.publishedAt)}</span>
                  </div>
                  <strong>{publishedDevotional.verse}</strong>
                  <p>{publishedDevotional.body}</p>
                </article>
              )}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Minha ficha</h2>
                  <span>{currentMember ? "Cadastro localizado" : "Sem vinculo"}</span>
                </div>
                {currentMember ? (
                  <div className="data-row member-row">
                    <div className="member-avatar">
                      {currentMember.fullName.slice(0, 1)}
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
                  <h2>Agenda da semana</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {weekEvents.map((event) => (
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
                  {!weekEvents.length && <p className="empty-state">Nenhum evento cadastrado para esta semana.</p>}
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
                  <span>{filteredCareRequests.length} registros</span>
                </div>
                <div className="row-list">
                  {filteredCareRequests.length ? (
                    filteredCareRequests.map((request) => (
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
                  <h2>{canManagePastoral ? "Novo pedido pastoral" : "Solicitar atendimento ou oracao"}</h2>
                  <span>{canManagePastoral ? "Fluxo real" : "Pedido pessoal"}</span>
                </div>
                <div className="form-grid" data-current-member-tab={memberFormTab}>
                  <label>
                    Nome do membro
                    <input
                      disabled={!canManagePastoral}
                      onChange={(event) => setCareForm((form) => ({ ...form, member: event.target.value }))}
                      placeholder="Ex.: Maria Oliveira"
                      value={canManagePastoral ? careForm.member : currentMember?.fullName ?? profileName}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      disabled={!canManagePastoral}
                      onChange={(event) => setCareForm((form) => ({ ...form, phone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={canManagePastoral ? careForm.phone : currentMember?.phone ?? careForm.phone}
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
                    {canManagePastoral ? "Criar atendimento" : "Enviar pedido"}
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>{canManagePastoral ? "Fila pastoral" : "Meus pedidos"}</h2>
                  <span>{filteredCareRequests.length} registros</span>
                </div>
                {canManagePastoral && (
                  <div className="filter-bar">
                    <label>
                      Status
                      <select onChange={(event) => setCareStatusFilter(event.target.value)} value={careStatusFilter}>
                        <option>Todos</option>
                        {statusFlow.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <div className="care-list">
                  {filteredCareRequests.map((request) => (
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
                  {!filteredCareRequests.length && <p className="empty-state">Nenhum pedido registrado para este filtro.</p>}
                </div>
              </article>

              {canManagePastoral && selectedRequest && <article className="surface care-detail">
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
              {canManageMural && <article className="surface">
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
                  <h2>{canManageMural ? "Administrar mural" : "Mural da igreja"}</h2>
                  <span>
                    {canManageMural
                      ? `${data.mural.filter((item) => item.published).length} publicados`
                      : `${data.mural.filter((item) => item.published).length + activeNotices.filter((notice) => notice.status === "Publicado").length + data.events.length} itens gerais`}
                  </span>
                </div>
                <div className="table-like">
                  {filteredMuralItems.map((item) => (
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
                      {canManageMural && <label className="switch">
                        Publicado
                        <input checked={item.published} onChange={() => toggleMural(item.id, "published")} type="checkbox" />
                      </label>}
                      {canManageMural && <label className="switch">
                        Destaque
                        <input checked={item.featured} onChange={() => toggleMural(item.id, "featured")} type="checkbox" />
                      </label>}
                      {canManageMural && <button className="danger-action" onClick={() => deleteMuralItem(item)} type="button">
                        Excluir
                      </button>}
                    </div>
                  ))}
                  {!canManageMural && !filteredMuralItems.length && (
                    <div className="data-row">
                      <span className="bullet-mark" />
                      <div>
                        <strong>Nenhum banner publicado</strong>
                        <small>Quando a administracao publicar fotos, imagens ou banners, eles aparecem aqui.</small>
                      </div>
                    </div>
                  )}
                  {!canManageMural && activeNotices.filter((notice) => notice.status === "Publicado").map((notice) => (
                    <div className="table-row" key={`notice-${notice.id}`}>
                      <div>
                        <strong>{notice.title}</strong>
                        <small>Aviso - {notice.audience} - {notice.channel}</small>
                        <small>{notice.body}</small>
                      </div>
                    </div>
                  ))}
                  {!canManageMural && weekEvents.map((event) => (
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
                  {!canManageMural &&
                    !data.mural.filter((item) => item.published).length &&
                    !activeNotices.filter((notice) => notice.status === "Publicado").length &&
                    !weekEvents.length && (
                      <p className="empty-state">Nenhum aviso, banner ou evento publicado no momento.</p>
                    )}
                </div>
              </article>
            </section>
          )}

          {activeModule === "events" && (
            <section className="content-grid">
              {canManageEvents && <article className="surface">
                <div className="panel-heading">
                  <h2>{editingEventId ? "Editar evento" : "Novo evento"}</h2>
                  <span>{editingEventId ? "Atualizando agenda" : "Agenda"}</span>
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
                    Grupo
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
                  <label>
                    Repeticao
                    <select
                      onChange={(event) => setEventForm((form) => ({ ...form, recurrence: event.target.value as ChurchEvent["recurrence"] }))}
                      value={eventForm.recurrence}
                    >
                      <option>Unico</option>
                      <option>Semanal</option>
                      <option>Mensal</option>
                    </select>
                  </label>
                  <div className="form-actions full">
                    <button className="primary-action" disabled={!canCreateEvent} onClick={createEvent} type="button">
                      {editingEventId ? "Atualizar evento" : "Adicionar evento"}
                    </button>
                    {editingEventId && (
                      <button className="secondary" onClick={cancelEventEdit} type="button">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </article>}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Agenda da semana</h2>
                  <span>{weekEvents.length} de {data.events.length} eventos</span>
                </div>
                <div className="filter-bar">
                  <button className="secondary" onClick={() => setEventWeekOffset((offset) => offset - 1)} type="button">
                    Semana anterior
                  </button>
                  <button className="secondary" onClick={() => setEventWeekOffset(0)} type="button">
                    Semana atual
                  </button>
                  <button className="secondary" onClick={() => setEventWeekOffset((offset) => offset + 1)} type="button">
                    Proxima semana
                  </button>
                  <label>
                    Grupo
                    <select onChange={(event) => setEventGroupFilter(event.target.value)} value={eventGroupFilter}>
                      <option>Todos</option>
                      {groupOptions.map((group) => (
                        <option key={group}>{group}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setEventStatusFilter(event.target.value)} value={eventStatusFilter}>
                      <option>Todos</option>
                      <option>Programado</option>
                      <option>Confirmado</option>
                      <option>Concluido</option>
                    </select>
                  </label>
                  <button className="secondary" onClick={() => exportReport("agenda", "pdf")} type="button">
                    Imprimir semana
                  </button>
                </div>
                <div className="row-list">
                  {weekEvents.map((event) => (
                    <div className="data-row access-user-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>
                          {event.time || "Sem horario"} - {event.ministry} - {event.status}
                        </small>
                        <small>{event.location || "Local nao informado"} - {event.responsible || "Sem responsavel"}</small>
                      </div>
                      {canManageEvents && <div className="row-actions">
                        <button className="secondary" onClick={() => editEvent(event)} type="button">
                          Editar
                        </button>
                        <button className="secondary" onClick={() => duplicateEvent(event)} type="button">
                          Duplicar
                        </button>
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
                  {!weekEvents.length && <p className="empty-state">Nenhum evento cadastrado para esta semana.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "schedules" && (
            <section className="content-grid">
              {canManageSchedules && (
                <article className={editingScheduleId ? "surface editing-surface" : "surface"}>
                  <div className="panel-heading">
                    <h2>{editingScheduleId ? "Editar escala" : "Nova escala"}</h2>
                    <span>Culto, grupo e funcao</span>
                  </div>
                  <div className="form-grid">
                    <label>
                      Data
                      <input
                        onChange={(event) => setScheduleForm((form) => ({ ...form, date: event.target.value }))}
                        type="date"
                        value={scheduleForm.date}
                      />
                    </label>
                    <label>
                      Culto ou evento
                      <input
                        onChange={(event) => setScheduleForm((form) => ({ ...form, serviceType: event.target.value }))}
                        placeholder="Ex.: Culto da familia"
                        value={scheduleForm.serviceType}
                      />
                    </label>
                    <label>
                      Grupo
                      <select onChange={(event) => setScheduleForm((form) => ({ ...form, group: event.target.value }))} value={scheduleForm.group}>
                        <option value="">Sem grupo definido</option>
                        {groupOptions.map((group) => (
                          <option key={group}>{group}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Funcao
                      <select
                        onChange={(event) => setScheduleForm((form) => ({ ...form, functionName: event.target.value }))}
                        value={scheduleForm.functionName}
                      >
                        <option value="">Selecione</option>
                        {memberRoleOptions.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                        <option>Recepcao</option>
                        <option>Pregador</option>
                        <option>Louvor</option>
                        <option>Midia</option>
                      </select>
                    </label>
                    <label>
                      Selecionar membro
                      <select
                        onChange={(event) => {
                          const member = data.members.find((item) => item.id === event.target.value);
                          if (!member) return;
                          setScheduleForm((form) => ({
                            ...form,
                            assignedTo: member.fullName,
                            phone: member.phone,
                            group: form.group || member.ministry,
                          }));
                        }}
                        value={data.members.find((member) => member.fullName === scheduleForm.assignedTo && member.phone === scheduleForm.phone)?.id ?? ""}
                      >
                        <option value="">Preencher manualmente</option>
                        {data.members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Pessoa escalada
                      <input
                        onChange={(event) => setScheduleForm((form) => ({ ...form, assignedTo: event.target.value }))}
                        placeholder="Nome do membro ou voluntario"
                        value={scheduleForm.assignedTo}
                      />
                    </label>
                    <label>
                      WhatsApp
                      <input
                        onChange={(event) => setScheduleForm((form) => ({ ...form, phone: event.target.value }))}
                        placeholder="(00) 00000-0000"
                        value={scheduleForm.phone}
                      />
                    </label>
                    <label>
                      Status
                      <select
                        onChange={(event) => setScheduleForm((form) => ({ ...form, confirmationStatus: event.target.value as ScheduleRecord["confirmationStatus"] }))}
                        value={scheduleForm.confirmationStatus}
                      >
                        <option>Pendente</option>
                        <option>Confirmado</option>
                        <option>Substituir</option>
                      </select>
                    </label>
                    <label className="full">
                      Observacoes
                      <textarea
                        onChange={(event) => setScheduleForm((form) => ({ ...form, notes: event.target.value }))}
                        placeholder="Horario de chegada, roupa, substituicao ou orientacao"
                        value={scheduleForm.notes}
                      />
                    </label>
                    <div className="form-actions full">
                      <button className="primary-action" disabled={!canCreateSchedule} onClick={createSchedule} type="button">
                        {editingScheduleId ? "Atualizar escala" : "Salvar escala"}
                      </button>
                      {editingScheduleId && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setScheduleForm(blankSchedule);
                            setEditingScheduleId(null);
                          }}
                          type="button"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )}

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Escalas cadastradas</h2>
                  <span>{filteredSchedules.length} registros</span>
                </div>
                <div className="filter-bar">
                  <div className="week-switcher">
                    <button className="secondary" onClick={() => setScheduleWeekOffset((offset) => offset - 1)} type="button">
                      Semana anterior
                    </button>
                    <span>{formatDate(selectedScheduleWeekRange.start.toISOString().slice(0, 10))} a {formatDate(selectedScheduleWeekRange.end.toISOString().slice(0, 10))}</span>
                    <button className="secondary" onClick={() => setScheduleWeekOffset((offset) => offset + 1)} type="button">
                      Proxima semana
                    </button>
                  </div>
                  <label>
                    Grupo
                    <select onChange={(event) => setScheduleGroupFilter(event.target.value)} value={scheduleGroupFilter}>
                      <option>Todos</option>
                      {groupOptions.map((group) => (
                        <option key={group}>{group}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Culto
                    <select onChange={(event) => setScheduleServiceFilter(event.target.value)} value={scheduleServiceFilter}>
                      <option>Todos</option>
                      {Array.from(new Set(data.schedules.map((schedule) => schedule.serviceType).filter(Boolean))).map((serviceType) => (
                        <option key={serviceType}>{serviceType}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Funcao
                    <select onChange={(event) => setScheduleFunctionFilter(event.target.value)} value={scheduleFunctionFilter}>
                      <option>Todos</option>
                      {Array.from(new Set(data.schedules.map((schedule) => schedule.functionName).filter(Boolean))).map((functionName) => (
                        <option key={functionName}>{functionName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setScheduleStatusFilter(event.target.value)} value={scheduleStatusFilter}>
                      <option>Todos</option>
                      <option>Pendente</option>
                      <option>Confirmado</option>
                      <option>Substituir</option>
                    </select>
                  </label>
                  <button className="secondary" onClick={() => exportReport("schedules", "pdf")} type="button">
                    PDF
                  </button>
                  <button className="secondary" onClick={() => exportReport("schedules", "csv")} type="button">
                    Excel
                  </button>
                </div>
                <div className="row-list">
                  {filteredSchedules.map((schedule) => (
                    <div className="data-row access-user-row" key={schedule.id}>
                      <span className="date-box">{formatDate(schedule.date)}</span>
                      <div>
                        <strong>{schedule.assignedTo}</strong>
                        <small>
                          {schedule.serviceType} - {schedule.functionName || "Funcao nao informada"} - {schedule.group || "Sem grupo"}
                        </small>
                        <small>{schedule.confirmationStatus} - {schedule.phone || "Sem WhatsApp"}</small>
                        {schedule.notes && <small>{schedule.notes}</small>}
                      </div>
                      <div className="row-actions">
                        {schedule.phone && (
                          <a className="whatsapp-link" href={whatsappUrl(schedule.phone, "Paz, {nome}! Voce esta escalado(a). Por favor confirme sua disponibilidade. {igreja}.", schedule.assignedTo)} rel="noreferrer" target="_blank">
                            WhatsApp
                          </a>
                        )}
                        {canManageSchedules && (
                          <button className="secondary" onClick={() => editSchedule(schedule)} type="button">
                            Editar
                          </button>
                        )}
                        {canManageSchedules && (
                          <button className="danger-action" onClick={() => deleteSchedule(schedule)} type="button">
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!filteredSchedules.length && <p className="empty-state">Nenhuma escala encontrada para este filtro.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "notices" && (
            <section className="content-grid">
              {canManageNotices && <article className="surface">
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
                      {canManageNotices && <div className="row-actions">
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
                    Selecionar membro cadastrado
                    <select onChange={(event) => selectAccessMember(event.target.value)} value={selectedAccessMemberId}>
                      <option value="">Criar acesso sem vincular membro</option>
                      {data.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName} - {member.email || "sem e-mail"} - {member.memberType}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedAccessMember && (
                    <div className="selected-member-access full">
                      <div className="member-avatar">
                        {selectedAccessMember.fullName.slice(0, 1)}
                      </div>
                      <div>
                        <strong>{selectedAccessMember.fullName}</strong>
                        <small>
                          {selectedAccessMember.memberType} - {selectedAccessMember.status} - {selectedAccessMember.phone}
                        </small>
                        <small>
                          {selectedAccessExistingUser
                            ? `Acesso existente: ${selectedAccessExistingUser.role} - sera atualizado`
                            : "Pronto para virar acesso administrativo"}
                        </small>
                      </div>
                    </div>
                  )}
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
                    {selectedAccessExistingUser ? "Nova senha (opcional)" : "Senha inicial"}
                    <input
                      autoComplete="new-password"
                      minLength={6}
                      onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))}
                      placeholder={selectedAccessExistingUser ? "Preencha somente se quiser trocar" : "Minimo de 6 caracteres"}
                      type="password"
                      value={userForm.password}
                    />
                  </label>
                  <label>
                    Perfil
                    <select onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as AccessUser["role"] }))} value={userForm.role}>
                      <option>Administrador</option>
                      <option>Lider</option>
                      <option>Professor</option>
                      <option>Secretario</option>
                      <option>Tesoureiro</option>
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
                    {selectedAccessExistingUser ? "Atualizar acesso" : "Adicionar usuario"}
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

          {activeModule === "visitors" && (
            <section className="content-grid">
              {canManageVisitors && (
                <article className={editingVisitorId ? "surface editing-surface" : "surface"}>
                  <div className="panel-heading">
                    <h2>{editingVisitorId ? "Editar visitante" : "Novo visitante"}</h2>
                    <span>Acompanhamento</span>
                  </div>
                  <div className="form-grid">
                    <label className="full">
                      Nome completo
                      <input
                        onChange={(event) => setVisitorForm((form) => ({ ...form, fullName: event.target.value }))}
                        placeholder="Ex.: Joao Pereira"
                        value={visitorForm.fullName}
                      />
                    </label>
                    <label>
                      WhatsApp
                      <input
                        onChange={(event) => setVisitorForm((form) => ({ ...form, phone: event.target.value }))}
                        placeholder="(00) 00000-0000"
                        value={visitorForm.phone}
                      />
                    </label>
                    <label>
                      Primeira visita
                      <input
                        onChange={(event) => setVisitorForm((form) => ({ ...form, firstVisitDate: event.target.value }))}
                        type="date"
                        value={visitorForm.firstVisitDate}
                      />
                    </label>
                    <label>
                      Retorno
                      <input
                        onChange={(event) => setVisitorForm((form) => ({ ...form, returnDate: event.target.value }))}
                        type="date"
                        value={visitorForm.returnDate}
                      />
                    </label>
                    <label>
                      Convidado por
                      <input
                        onChange={(event) => setVisitorForm((form) => ({ ...form, invitedBy: event.target.value }))}
                        placeholder="Nome, grupo ou evento"
                        value={visitorForm.invitedBy}
                      />
                    </label>
                    <label>
                      Integracao
                      <select
                        onChange={(event) => setVisitorForm((form) => ({ ...form, integrationStatus: event.target.value as VisitorRecord["integrationStatus"] }))}
                        value={visitorForm.integrationStatus}
                      >
                        <option>Primeira visita</option>
                        <option>Retornou</option>
                        <option>Em acompanhamento</option>
                        <option>Integrado</option>
                      </select>
                    </label>
                    <label className="check-card">
                      <input
                        checked={visitorForm.contactMade}
                        onChange={(event) => setVisitorForm((form) => ({ ...form, contactMade: event.target.checked }))}
                        type="checkbox"
                      />
                      Contato feito
                    </label>
                    <label className="full">
                      Observacoes
                      <textarea
                        onChange={(event) => setVisitorForm((form) => ({ ...form, notes: event.target.value }))}
                        placeholder="Primeira impressao, necessidade pastoral, retorno ou decisao"
                        value={visitorForm.notes}
                      />
                    </label>
                    <div className="form-actions full">
                      <button className="primary-action" disabled={!canCreateVisitor} onClick={createVisitor} type="button">
                        {editingVisitorId ? "Atualizar visitante" : "Salvar visitante"}
                      </button>
                      {editingVisitorId && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setVisitorForm(blankVisitor);
                            setEditingVisitorId(null);
                          }}
                          type="button"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )}

              <article className="surface">
                <div className="panel-heading">
                  <h2>Visitantes em acompanhamento</h2>
                  <span>{filteredVisitors.length} registros</span>
                </div>
                <div className="filter-bar">
                  <label>
                    Status
                    <select onChange={(event) => setVisitorStatusFilter(event.target.value)} value={visitorStatusFilter}>
                      <option>Todos</option>
                      <option>Primeira visita</option>
                      <option>Retornou</option>
                      <option>Em acompanhamento</option>
                      <option>Integrado</option>
                    </select>
                  </label>
                  <label>
                    Contato
                    <select onChange={(event) => setVisitorContactFilter(event.target.value)} value={visitorContactFilter}>
                      <option>Todos</option>
                      <option>Contato pendente</option>
                      <option>Contato feito</option>
                    </select>
                  </label>
                  <button className="secondary" onClick={() => exportReport("visitors", "pdf")} type="button">
                    PDF
                  </button>
                  <button className="secondary" onClick={() => exportReport("visitors", "csv")} type="button">
                    Excel
                  </button>
                </div>
                <div className="row-list">
                  {filteredVisitors.map((visitor) => (
                    <div className="data-row access-user-row" key={visitor.id}>
                      <span className="date-box">{formatDate(visitor.firstVisitDate)}</span>
                      <div>
                        <strong>{visitor.fullName}</strong>
                        <small>
                          {visitor.integrationStatus} - {visitor.contactMade ? "contato feito" : "contato pendente"} - {visitor.phone}
                        </small>
                        <small>Convidado por: {visitor.invitedBy || "Nao informado"}</small>
                        {visitor.notes && <small>{visitor.notes}</small>}
                      </div>
                      <div className="row-actions">
                        <a className="whatsapp-link" href={whatsappUrl(visitor.phone, "Paz, {nome}! Ficamos felizes com sua visita. Podemos ajudar em algo?", visitor.fullName)} rel="noreferrer" target="_blank">
                          WhatsApp
                        </a>
                        {canManageVisitors && (
                          <button className="secondary" onClick={() => editVisitor(visitor)} type="button">
                            Editar
                          </button>
                        )}
                        {canManageMembers && visitor.integrationStatus !== "Integrado" && (
                          <button className="secondary" onClick={() => convertVisitorToMember(visitor)} type="button">
                            Integrar
                          </button>
                        )}
                        {canManageVisitors && (
                          <button className="danger-action" onClick={() => deleteVisitor(visitor)} type="button">
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!filteredVisitors.length && <p className="empty-state">Nenhum visitante encontrado para este filtro.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "members" && (
            <section className="content-grid">
              {canManageMembers || editingMemberId === currentMember?.id ? (
              <article className={editingMemberId ? "surface editing-surface" : "surface"} id="member-form-panel">
                <div className="panel-heading">
                  <h2>{editingMemberId ? "Editar ficha" : "Ficha completa"}</h2>
                  <span>{canManageMembers ? (editingMemberId ? "Atualizando cadastro" : "Membro ou visitante") : "Meu cadastro"}</span>
                </div>
                <div className="form-grid">
                  <div className="member-form-tabs full" role="tablist" aria-label="Secoes do cadastro">
                    {availableMemberFormTabs.map((tab) => (
                      <button
                        className={memberFormTab === tab ? "active" : ""}
                        key={tab}
                        onClick={() => setMemberFormTab(tab)}
                        type="button"
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <div className="member-section-banner full">
                    <strong>{memberFormTab}</strong>
                    <small>
                      {memberFormTab === "Dados" && "Revise nome, filiacao, CPF, contato, nascimento e endereco."}
                      {memberFormTab === "Igreja" && "Revise tipo, status, funcoes, grupo, congregacao, datas espirituais e batismos."}
                      {memberFormTab === "Classes" && "Revise matricula na EBD e no Discipulado."}
                      {memberFormTab === "Observacoes" && "Revise observacoes visiveis ao membro e registros internos."}
                      {memberFormTab === "Acesso" && "O login e senha sao enviados pelo card do membro ja salvo."}
                    </small>
                  </div>
                  <div className="member-access-note full" data-member-section="Acesso">
                    <strong>Acesso do membro</strong>
                    <small>O login e a senha ficam no card do cadastro ja salvo, com envio pelo WhatsApp e link do sistema.</small>
                  </div>
                  <label className="full" data-member-section="Dados">
                    Nome completo
                    <input
                      id="member-full-name"
                      onChange={(event) => setMemberForm((form) => ({ ...form, fullName: event.target.value }))}
                      placeholder="Ex.: Maria Oliveira"
                      value={memberForm.fullName}
                    />
                  </label>
                  <label data-member-section="Dados">
                    Nome do pai
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, fatherName: event.target.value }))}
                      placeholder="Nome completo do pai"
                      value={memberForm.fatherName}
                    />
                  </label>
                  <label data-member-section="Dados">
                    Nome da mae
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, motherName: event.target.value }))}
                      placeholder="Nome completo da mae"
                      value={memberForm.motherName}
                    />
                  </label>
                  <label data-member-section="Dados">
                    CPF
                    <input
                      inputMode="numeric"
                      onChange={(event) => setMemberForm((form) => ({ ...form, cpf: event.target.value }))}
                      placeholder="000.000.000-00"
                      value={memberForm.cpf}
                    />
                  </label>
                  <label data-member-section="Dados">
                    Telefone
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, phone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={memberForm.phone}
                    />
                  </label>
                  <label data-member-section="Dados">
                    E-mail
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, email: event.target.value }))}
                      placeholder="membro@email.com"
                      type="email"
                      value={memberForm.email}
                    />
                  </label>
                  {canManageMembers && <label data-member-section="Igreja">
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
                  {canManageMembers && <label data-member-section="Igreja">
                    Status
                    <select onChange={(event) => setMemberForm((form) => ({ ...form, status: event.target.value as MemberRecord["status"] }))} value={memberForm.status}>
                      <option>Membro ativo</option>
                      <option>Visitante</option>
                      <option>Novo convertido</option>
                      <option>Transferencia</option>
                    </select>
                  </label>}
                  {canManageMembers && <label data-member-section="Igreja">
                    Funcao na igreja
                    <select
                      className="multi-select"
                      multiple
                      onChange={(event) =>
                        setMemberForm((form) => ({
                          ...form,
                          role: memberRolesToText(Array.from(event.target.selectedOptions, (option) => option.value)),
                        }))
                      }
                      size={7}
                      value={selectedMemberRoles}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <small className="form-hint">No computador, segure Ctrl para marcar mais de uma funcao; no celular, toque nas funcoes desejadas.</small>
                  </label>}
                  {canManageMembers && <label data-member-section="Igreja">
                    Grupo
                    <select
                      onChange={(event) => setMemberForm((form) => ({ ...form, ministry: event.target.value }))}
                      value={memberForm.ministry}
                    >
                      <option value="">Sem grupo definido</option>
                      {groupOptions.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </label>}
                  <label data-member-section="Classes">
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
                  <label data-member-section="Classes">
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
                  <label data-member-section="Dados">
                    Nascimento
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, birthDate: event.target.value }))}
                      type="date"
                      value={memberForm.birthDate}
                    />
                  </label>
                  <label data-member-section="Dados">
                    Estado civil
                    <select onChange={(event) => setMemberForm((form) => ({ ...form, maritalStatus: event.target.value }))} value={memberForm.maritalStatus}>
                      <option>Solteiro(a)</option>
                      <option>Casado(a)</option>
                      <option>Viuvo(a)</option>
                      <option>Divorciado(a)</option>
                    </select>
                  </label>
                  <label data-member-section="Igreja">
                    Congregacao
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, congregation: event.target.value }))}
                      placeholder="Ex.: Sede"
                      value={memberForm.congregation}
                    />
                  </label>
                  <label data-member-section="Igreja">
                    Desde
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, joinedAt: event.target.value }))}
                      type="date"
                      value={memberForm.joinedAt}
                    />
                  </label>
                  <label className="full" data-member-section="Dados">
                    Endereco
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, address: event.target.value }))}
                      placeholder="Rua, numero, bairro e cidade"
                      value={memberForm.address}
                    />
                  </label>
                  <label className="full" data-member-section="Igreja">
                    Igreja anterior
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, previousChurch: event.target.value }))}
                      placeholder="Opcional"
                      value={memberForm.previousChurch}
                    />
                  </label>
                  <label data-member-section="Igreja">
                    Data de conversao
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, conversionDate: event.target.value }))}
                      type="date"
                      value={memberForm.conversionDate}
                    />
                  </label>
                  <label data-member-section="Igreja">
                    Data de batismo
                    <input
                      onChange={(event) => setMemberForm((form) => ({ ...form, baptismDate: event.target.value }))}
                      type="date"
                      value={memberForm.baptismDate}
                    />
                  </label>
                  <label data-member-section="Igreja">
                    Origem do cadastro
                    <select
                      onChange={(event) => setMemberForm((form) => ({ ...form, registrationSource: event.target.value }))}
                      value={memberForm.registrationSource}
                    >
                      <option value="">Nao informado</option>
                      <option>Cadastro interno</option>
                      <option>Visita presencial</option>
                      <option>Indicacao</option>
                      <option>Evento</option>
                      <option>Transferencia</option>
                    </select>
                  </label>
                  {canManageMembers && <label data-member-section="Igreja">
                    Situacao pastoral
                    <select
                      onChange={(event) => setMemberForm((form) => ({ ...form, pastoralStatus: event.target.value }))}
                      value={memberForm.pastoralStatus}
                    >
                      <option>Sem acompanhamento definido</option>
                      <option>Acompanhamento regular</option>
                      <option>Precisa de contato</option>
                      <option>Em discipulado</option>
                      <option>Integrado</option>
                    </select>
                  </label>}
                  <label className="full" data-member-section="Observacoes">
                    Observacao visivel ao membro
                    <textarea
                      onChange={(event) => setMemberForm((form) => ({ ...form, memberVisibleNotes: event.target.value }))}
                      placeholder="Mensagem ou orientacao que o membro pode visualizar"
                      value={memberForm.memberVisibleNotes}
                    />
                  </label>
                  <label className="check-card" data-member-section="Igreja">
                    <input
                      checked={memberForm.waterBaptized}
                      onChange={(event) => setMemberForm((form) => ({ ...form, waterBaptized: event.target.checked }))}
                      type="checkbox"
                    />
                    Batizado em aguas
                  </label>
                  <label className="check-card" data-member-section="Igreja">
                    <input
                      checked={memberForm.holySpiritBaptized}
                      onChange={(event) => setMemberForm((form) => ({ ...form, holySpiritBaptized: event.target.checked }))}
                      type="checkbox"
                    />
                    Batizado no Espirito Santo
                  </label>
                  {canManageMembers && <label className="full" data-member-section="Observacoes">
                    Observacoes internas
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
                  <h2>{canManageMembers ? "Membros cadastrados" : "Meu cadastro"}</h2>
                  <span>{filteredMembers.length} registro{filteredMembers.length === 1 ? "" : "s"}</span>
                </div>
                {canManageMembers && (
                  <div className="filter-bar">
                    <label>
                      Status
                      <select onChange={(event) => setMemberStatusFilter(event.target.value)} value={memberStatusFilter}>
                        <option>Todos</option>
                        <option>Membro ativo</option>
                        <option>Visitante</option>
                        <option>Novo convertido</option>
                        <option>Transferencia</option>
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select onChange={(event) => setMemberTypeFilter(event.target.value)} value={memberTypeFilter}>
                        <option>Todos</option>
                        <option>Membro</option>
                        <option>Visitante</option>
                        <option>Congregado</option>
                        <option>Lideranca</option>
                      </select>
                    </label>
                    <label>
                      Grupo
                      <select onChange={(event) => setMemberGroupFilter(event.target.value)} value={memberGroupFilter}>
                        <option>Todos</option>
                        {groupOptions.map((group) => (
                          <option key={group}>{group}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Classe EBD
                      <select onChange={(event) => setMemberSchoolFilter(event.target.value)} value={memberSchoolFilter}>
                        <option>Todos</option>
                        {data.schoolClasses.map((schoolClass) => (
                          <option key={schoolClass.id} value={schoolClass.id}>
                            {schoolClass.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Discipulado
                      <select onChange={(event) => setMemberDiscipleshipFilter(event.target.value)} value={memberDiscipleshipFilter}>
                        <option>Todos</option>
                        {data.discipleshipClasses.map((discipleshipClass) => (
                          <option key={discipleshipClass.id} value={discipleshipClass.id}>
                            {discipleshipClass.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Situacao pastoral
                      <select onChange={(event) => setMemberPastoralFilter(event.target.value)} value={memberPastoralFilter}>
                        <option>Todos</option>
                        <option>Sem acompanhamento definido</option>
                        <option>Acompanhamento regular</option>
                        <option>Precisa de contato</option>
                        <option>Em discipulado</option>
                        <option>Integrado</option>
                      </select>
                    </label>
                  </div>
                )}
                {canManageMembers && <div className="birthday-grid">
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
                  {filteredMembers.map((member) => {
                    const schoolClassName = classNameById(data.schoolClasses, member.schoolClassId);
                    const discipleshipClassName = classNameById(data.discipleshipClasses, member.discipleshipClassId);

                    return (
                    <div className="member-record" key={member.id}>
                      <div className="data-row member-row">
                        <div className="member-avatar">
                          {member.fullName.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{member.fullName}</strong>
                          <small>
                            {member.memberType} - {member.status} - {member.role || "Sem funcao"} - {member.phone}
                          </small>
                          <small>CPF: {member.cpf || "Nao informado"}</small>
                          {(member.fatherName || member.motherName) && (
                            <small>
                              Filiacao: {member.fatherName || "Pai nao informado"} / {member.motherName || "Mae nao informada"}
                            </small>
                          )}
                          <small>
                            {member.ministry || "Sem grupo"} - {member.congregation || "Congregacao nao informada"} - Aniv. {birthdayLabel(member.birthDate)}
                          </small>
                          <small>
                            EBD: {schoolClassName || "Nao matriculado"} - Discipulado: {discipleshipClassName || "Nao matriculado"}
                          </small>
                          <small>
                            Origem: {member.registrationSource || "Nao informada"} - Situacao: {member.pastoralStatus || "Sem acompanhamento definido"}
                          </small>
                          {(member.conversionDate || member.baptismDate) && (
                            <small>
                              Conversao: {formatDate(member.conversionDate)} - Batismo: {formatDate(member.baptismDate)}
                            </small>
                          )}
                          {member.memberVisibleNotes && <small>Nota ao membro: {member.memberVisibleNotes}</small>}
                        </div>
                      </div>
                      <div className="record-actions">
                        <button className="secondary" onClick={() => editMember(member)} type="button">
                          Editar ficha
                        </button>
                        {canManageUsers && <button className="secondary" onClick={() => toggleMemberCredentials(member)} type="button">
                          Login e senha
                        </button>}
                        {canManageMembers && <button className="danger-action" onClick={() => deleteMember(member)} type="button">
                          Excluir ficha
                        </button>}
                      </div>
                      {canManageUsers && memberCredentialForm.memberId === member.id && (
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
                  {!filteredMembers.length && <p className="empty-state">Nenhuma ficha encontrada para este filtro.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "kids" && (
            <section className="content-grid">
              {canManageKids && <article className="surface">
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
                  <h2>{canManageKids ? "Kids cadastrados" : "Area Kids vinculada"}</h2>
                  <span>{filteredKids.length} crianca{filteredKids.length === 1 ? "" : "s"}</span>
                </div>
                {canManageKids && (
                  <div className="filter-bar">
                    <label>
                      Turma ou faixa
                      <select onChange={(event) => setKidClassFilter(event.target.value)} value={kidClassFilter}>
                        <option>Todos</option>
                        {Array.from(new Set(data.kids.flatMap((kid) => [kid.ageGroup, kid.className]).filter(Boolean))).map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {canManageKids && <div className="birthday-grid">
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
                  {filteredKids.map((kid) => (
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
                      <div className="record-actions">
                        {canManageKids && <button className="danger-action" onClick={() => deleteKid(kid)} type="button">
                          Excluir cadastro
                        </button>}
                      </div>
                    </div>
                  ))}
                  {!filteredKids.length && <p className="empty-state">Nenhum cadastro Kids encontrado para este filtro.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "ministries" && (
            <section className="content-grid">
              <article className="surface">
                <div className="panel-heading">
                  <h2>{editingMinistryId ? "Editar grupo" : "Novo grupo"}</h2>
                  <span>{editingMinistryId ? "Atualizando equipe" : "Equipe"}</span>
                </div>
                <div className="form-grid">
                  <label className="full">
                    Nome do grupo
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
                  <div className="form-actions full">
                    <button className="primary-action" disabled={!canCreateMinistry} onClick={createMinistry} type="button">
                      {editingMinistryId ? "Atualizar grupo" : "Adicionar grupo"}
                    </button>
                    {editingMinistryId && (
                      <button className="secondary" onClick={cancelMinistryEdit} type="button">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Grupos</h2>
                  <span>{data.ministries.length} grupo{data.ministries.length === 1 ? "" : "s"}</span>
                </div>
                <div className="row-list">
                  {data.ministries.map((ministry) => (
                    <div className="member-record" key={ministry.id}>
                      <div className="data-row">
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
                      <div className="record-actions">
                        <button className="secondary" onClick={() => editMinistry(ministry)} type="button">
                          Editar grupo
                        </button>
                        <button className="danger-action" onClick={() => deleteMinistry(ministry)} type="button">
                          Excluir grupo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "school" && (
            <section className="content-grid">
              {canManageModule(currentAccessRole, "school") && <article className="surface">
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
                        {canManageModule(currentAccessRole, "school") && <small>{classWhatsappRecipients(schoolClass, "EBD").length} contatos de WhatsApp encontrados</small>}
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
                        {renderAttendancePanel("school", schoolClass)}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "discipleship" && (
            <section className="content-grid">
              {canManageModule(currentAccessRole, "discipleship") && <article className="surface">
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
                        {canManageModule(currentAccessRole, "discipleship") && <small>{classWhatsappRecipients(discipleshipClass, "Discipulado").length} contatos de WhatsApp encontrados</small>}
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
                        {renderAttendancePanel("discipleship", discipleshipClass)}
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
                    <select
                      onChange={(event) => {
                        setMessageAudience(event.target.value as MessageAudience);
                        setSelectedMessageRecipientIds([]);
                      }}
                      value={messageAudience}
                    >
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
                  <label>
                    Limite por lote
                    <input
                      min={1}
                      max={20}
                      onChange={(event) => setMessageBatchLimit(Number(event.target.value))}
                      type="number"
                      value={messageBatchLimit}
                    />
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
                    <strong>Previa individual</strong>
                    <small>{selectedMessageRecipients.length} selecionado{selectedMessageRecipients.length === 1 ? "" : "s"} de {messageRecipients.length} contato{messageRecipients.length === 1 ? "" : "s"}</small>
                    <span>{selectedMessageRecipients[0] ? messageFor(messageText, selectedMessageRecipients[0].name) : "Nenhum contato encontrado para este publico."}</span>
                  </div>
                  <div className="form-actions full">
                    <button className="primary-action" disabled={!selectedMessageRecipients.length || !messageText.trim()} onClick={openBulkWhatsapp} type="button">
                      Abrir lote selecionado
                    </button>
                    <button className="secondary" onClick={() => setSelectedMessageRecipientIds(messageRecipients.map((recipient) => recipient.id))} type="button">
                      Selecionar todos
                    </button>
                  </div>
                  <label className="full">
                    Nome do novo modelo
                    <input
                      onChange={(event) => setCustomTemplateLabel(event.target.value)}
                      placeholder="Ex.: Convite culto de domingo"
                      value={customTemplateLabel}
                    />
                  </label>
                  <label className="full">
                    Texto do novo modelo
                    <textarea
                      onChange={(event) => setCustomTemplateText(event.target.value)}
                      placeholder="Use {nome} para personalizar."
                      value={customTemplateText}
                    />
                  </label>
                  <button className="secondary full" disabled={!customTemplateLabel.trim() || !customTemplateText.trim()} onClick={saveCustomMessageTemplate} type="button">
                    Salvar modelo
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Lista de envio</h2>
                  <span>{selectedMessageRecipients.length} no lote atual</span>
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
                        <small>Cadastre telefone nos membros, professores, grupos ou responsaveis Kids.</small>
                      </div>
                    </div>
                  ) : (
                    messageRecipients.map((recipient) => (
                      <div className="data-row message-row" key={`${recipient.id}-${recipient.phone}`}>
                        <input
                          checked={selectedMessageRecipientIds.includes(recipient.id)}
                          onChange={(event) =>
                            setSelectedMessageRecipientIds((current) =>
                              event.target.checked ? Array.from(new Set([...current, recipient.id])) : current.filter((id) => id !== recipient.id),
                            )
                          }
                          type="checkbox"
                        />
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

              <article className="surface">
                <div className="panel-heading">
                  <h2>Historico de campanhas</h2>
                  <span>{data.messageCampaigns.length} registros</span>
                </div>
                <div className="row-list">
                  {data.messageCampaigns.map((campaign) => (
                    <div className="data-row" key={campaign.id}>
                      <span className="date-box">{campaign.recipientCount}</span>
                      <div>
                        <strong>{campaign.audience}</strong>
                        <small>{formatDateTime(campaign.createdAt)} - modelo {campaign.templateId}</small>
                        <small>{campaign.text.slice(0, 120)}</small>
                      </div>
                    </div>
                  ))}
                  {!data.messageCampaigns.length && <p className="empty-state">Nenhuma campanha registrada ainda.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "finance" && (
            <section className="content-grid">
              {canManageFinance && (
                <article className={editingTransactionId ? "surface editing-surface" : "surface"}>
                  <div className="panel-heading">
                    <h2>{editingTransactionId ? "Editar lancamento" : "Novo lancamento"}</h2>
                    <span>Tesouraria inicial</span>
                  </div>
                  <div className="form-grid">
                    <label>
                      Data
                      <input onChange={(event) => setTransactionForm((form) => ({ ...form, date: event.target.value }))} type="date" value={transactionForm.date} />
                    </label>
                    <label>
                      Tipo
                      <select onChange={(event) => setTransactionForm((form) => ({ ...form, type: event.target.value as TransactionRecord["type"] }))} value={transactionForm.type}>
                        <option>Entrada</option>
                        <option>Saida</option>
                        <option>Dizimo</option>
                        <option>Oferta</option>
                      </select>
                    </label>
                    <label>
                      Categoria
                      <input onChange={(event) => setTransactionForm((form) => ({ ...form, category: event.target.value }))} placeholder="Ex.: Culto, manutencao, missao" value={transactionForm.category} />
                    </label>
                    <label>
                      Valor
                      <input min={0} onChange={(event) => setTransactionForm((form) => ({ ...form, amount: Number(event.target.value) }))} step="0.01" type="number" value={transactionForm.amount} />
                    </label>
                    <label className="full">
                      Descricao
                      <input onChange={(event) => setTransactionForm((form) => ({ ...form, description: event.target.value }))} placeholder="Resumo do lancamento" value={transactionForm.description} />
                    </label>
                    <label>
                      Metodo
                      <select onChange={(event) => setTransactionForm((form) => ({ ...form, method: event.target.value }))} value={transactionForm.method}>
                        <option>Pix</option>
                        <option>Dinheiro</option>
                        <option>Cartao</option>
                        <option>Transferencia</option>
                      </select>
                    </label>
                    <label>
                      Status
                      <select onChange={(event) => setTransactionForm((form) => ({ ...form, status: event.target.value as TransactionRecord["status"] }))} value={transactionForm.status}>
                        <option>Pendente</option>
                        <option>Confirmado</option>
                      </select>
                    </label>
                    <label>
                      Membro vinculado
                      <select onChange={(event) => setTransactionForm((form) => ({ ...form, memberName: event.target.value }))} value={transactionForm.memberName}>
                        <option value="">Nao vinculado</option>
                        {data.members.map((member) => (
                          <option key={member.id} value={member.fullName}>
                            {member.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="full">
                      Observacoes
                      <textarea onChange={(event) => setTransactionForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Observacoes internas da tesouraria" value={transactionForm.notes} />
                    </label>
                    <div className="form-actions full">
                      <button className="primary-action" disabled={!canCreateTransaction} onClick={createTransaction} type="button">
                        {editingTransactionId ? "Atualizar lancamento" : "Salvar lancamento"}
                      </button>
                      {editingTransactionId && (
                        <button className="secondary" onClick={() => { setTransactionForm(blankTransaction); setEditingTransactionId(null); }} type="button">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )}

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Resumo financeiro</h2>
                  <span>{filteredTransactions.length} lancamentos</span>
                </div>
                <div className="stats-row">
                  <div className="stat-card">
                    <small>Entradas</small>
                    <strong>{data.transactions.filter((item) => item.type !== "Saida").reduce((sum, item) => sum + item.amount, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                  </div>
                  <div className="stat-card">
                    <small>Saidas</small>
                    <strong>{data.transactions.filter((item) => item.type === "Saida").reduce((sum, item) => sum + item.amount, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                  </div>
                </div>
                <div className="filter-bar">
                  <label>
                    Tipo
                    <select onChange={(event) => setFinanceTypeFilter(event.target.value)} value={financeTypeFilter}>
                      <option>Todos</option>
                      <option>Entrada</option>
                      <option>Saida</option>
                      <option>Dizimo</option>
                      <option>Oferta</option>
                    </select>
                  </label>
                  <button className="secondary" onClick={() => exportReport("finance", "pdf")} type="button">
                    PDF
                  </button>
                  <button className="secondary" onClick={() => exportReport("finance", "csv")} type="button">
                    Excel
                  </button>
                </div>
                <div className="row-list">
                  {filteredTransactions.map((transaction) => (
                    <div className="data-row access-user-row" key={transaction.id}>
                      <span className="date-box">{formatDate(transaction.date)}</span>
                      <div>
                        <strong>{transaction.description}</strong>
                        <small>{transaction.type} - {transaction.category} - {transaction.status}</small>
                        <small>{transaction.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} - {transaction.method}</small>
                      </div>
                      {canManageFinance && (
                        <div className="row-actions">
                          <button className="secondary" onClick={() => editTransaction(transaction)} type="button">
                            Editar
                          </button>
                          <button className="danger-action" onClick={() => deleteTransaction(transaction)} type="button">
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!filteredTransactions.length && <p className="empty-state">Nenhum lancamento encontrado para este filtro.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "assets" && (
            <section className="content-grid">
              {canManageAssets && (
                <article className={editingAssetId ? "surface editing-surface" : "surface"}>
                  <div className="panel-heading">
                    <h2>{editingAssetId ? "Editar patrimonio" : "Novo patrimonio"}</h2>
                    <span>Equipamentos e bens</span>
                  </div>
                  <div className="form-grid">
                    <label className="full">
                      Item
                      <input onChange={(event) => setAssetForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ex.: Teclado, caixa de som, cadeira" value={assetForm.name} />
                    </label>
                    <label>
                      Categoria
                      <input onChange={(event) => setAssetForm((form) => ({ ...form, category: event.target.value }))} placeholder="Som, musica, moveis" value={assetForm.category} />
                    </label>
                    <label>
                      Local
                      <input onChange={(event) => setAssetForm((form) => ({ ...form, location: event.target.value }))} placeholder="Templo, sala Kids, secretaria" value={assetForm.location} />
                    </label>
                    <label>
                      Responsavel
                      <input onChange={(event) => setAssetForm((form) => ({ ...form, responsible: event.target.value }))} placeholder="Pessoa ou equipe" value={assetForm.responsible} />
                    </label>
                    <label>
                      Estado
                      <select onChange={(event) => setAssetForm((form) => ({ ...form, condition: event.target.value as AssetRecord["condition"] }))} value={assetForm.condition}>
                        <option>Novo</option>
                        <option>Bom</option>
                        <option>Manutencao</option>
                        <option>Baixado</option>
                      </select>
                    </label>
                    <label>
                      Ultima manutencao
                      <input onChange={(event) => setAssetForm((form) => ({ ...form, lastMaintenance: event.target.value }))} type="date" value={assetForm.lastMaintenance} />
                    </label>
                    <label className="full">
                      Observacoes
                      <textarea onChange={(event) => setAssetForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Estado de conservacao, manutencao, compra ou observacao" value={assetForm.notes} />
                    </label>
                    <div className="form-actions full">
                      <button className="primary-action" disabled={!canCreateAsset} onClick={createAsset} type="button">
                        {editingAssetId ? "Atualizar patrimonio" : "Salvar patrimonio"}
                      </button>
                      {editingAssetId && (
                        <button className="secondary" onClick={() => { setAssetForm(blankAsset); setEditingAssetId(null); }} type="button">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )}

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Patrimonio cadastrado</h2>
                  <span>{filteredAssets.length} itens</span>
                </div>
                <div className="filter-bar">
                  <label>
                    Estado
                    <select onChange={(event) => setAssetConditionFilter(event.target.value)} value={assetConditionFilter}>
                      <option>Todos</option>
                      <option>Novo</option>
                      <option>Bom</option>
                      <option>Manutencao</option>
                      <option>Baixado</option>
                    </select>
                  </label>
                  <button className="secondary" onClick={() => exportReport("assets", "pdf")} type="button">
                    PDF
                  </button>
                  <button className="secondary" onClick={() => exportReport("assets", "csv")} type="button">
                    Excel
                  </button>
                </div>
                <div className="row-list">
                  {filteredAssets.map((asset) => (
                    <div className="data-row access-user-row" key={asset.id}>
                      <span className="status-chip">{asset.condition}</span>
                      <div>
                        <strong>{asset.name}</strong>
                        <small>{asset.category} - {asset.location || "Sem local"} - {asset.responsible || "Sem responsavel"}</small>
                        <small>{asset.lastMaintenance ? `Manutencao: ${formatDate(asset.lastMaintenance)}` : "Sem manutencao registrada"}</small>
                        {asset.notes && <small>{asset.notes}</small>}
                      </div>
                      {canManageAssets && (
                        <div className="row-actions">
                          <button className="secondary" onClick={() => editAsset(asset)} type="button">
                            Editar
                          </button>
                          <button className="danger-action" onClick={() => deleteAsset(asset)} type="button">
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!filteredAssets.length && <p className="empty-state">Nenhum item de patrimonio encontrado para este filtro.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "devotional" && (
            <section className="content-grid">
              {canManageDevotional && (
                <article className={editingDevotionalId ? "surface editing-surface" : "surface"}>
                  <div className="panel-heading">
                    <h2>{editingDevotionalId ? "Editar devocional" : "Nova palavra"}</h2>
                    <span>Painel do membro</span>
                  </div>
                  <div className="form-grid">
                    <label className="full">
                      Titulo
                      <input onChange={(event) => setDevotionalForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex.: Palavra do dia" value={devotionalForm.title} />
                    </label>
                    <label>
                      Versiculo
                      <input onChange={(event) => setDevotionalForm((form) => ({ ...form, verse: event.target.value }))} placeholder="Ex.: Salmo 23:1" value={devotionalForm.verse} />
                    </label>
                    <label>
                      Publicacao
                      <input onChange={(event) => setDevotionalForm((form) => ({ ...form, publishedAt: event.target.value }))} type="date" value={devotionalForm.publishedAt} />
                    </label>
                    <label>
                      Status
                      <select onChange={(event) => setDevotionalForm((form) => ({ ...form, status: event.target.value as DevotionalRecord["status"] }))} value={devotionalForm.status}>
                        <option>Publicado</option>
                        <option>Rascunho</option>
                        <option>Arquivado</option>
                      </select>
                    </label>
                    <label className="full">
                      Mensagem
                      <textarea onChange={(event) => setDevotionalForm((form) => ({ ...form, body: event.target.value }))} placeholder="Texto que aparece no painel do membro" value={devotionalForm.body} />
                    </label>
                    <div className="form-actions full">
                      <button className="primary-action" disabled={!canCreateDevotional} onClick={createDevotional} type="button">
                        {editingDevotionalId ? "Atualizar palavra" : "Salvar palavra"}
                      </button>
                      {editingDevotionalId && (
                        <button className="secondary" onClick={() => { setDevotionalForm(blankDevotional); setEditingDevotionalId(null); }} type="button">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )}

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Devocionais</h2>
                  <span>{data.devotionals.length} registros</span>
                </div>
                <div className="row-list">
                  {data.devotionals.map((devotional) => (
                    <div className="data-row access-user-row" key={devotional.id}>
                      <span className="date-box">{formatDate(devotional.publishedAt)}</span>
                      <div>
                        <strong>{devotional.title}</strong>
                        <small>{devotional.verse || "Sem versiculo"} - {devotional.status}</small>
                        <small>{devotional.body}</small>
                      </div>
                      {canManageDevotional && (
                        <div className="row-actions">
                          <button className="secondary" onClick={() => editDevotional(devotional)} type="button">
                            Editar
                          </button>
                          <button className="danger-action" onClick={() => deleteDevotional(devotional)} type="button">
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!data.devotionals.length && <p className="empty-state">Nenhuma palavra cadastrada ainda.</p>}
                </div>
              </article>
            </section>
          )}

          {activeModule === "reports" && (
            <section className="content-grid">
              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Relatorios operacionais</h2>
                  <span>PDF e Excel/CSV</span>
                </div>
                <div className="report-grid">
                  {[
                    ["members", "Membros por tipo", `${data.members.length} cadastros`],
                    ["visitors", "Visitantes", `${data.visitors.length} acompanhamentos`],
                    ["birthdays", "Aniversariantes", `${monthlyBirthdays.length} no mes`],
                    ["kids", "Area Kids", `${data.kids.length} criancas`],
                    ["agenda", "Agenda semanal", `${weekEvents.length} eventos na semana`],
                    ["schedules", "Escalas", `${data.schedules.length} pessoas escaladas`],
                    ["attendance", "Presenca EBD/Discipulado", `${data.attendanceSessions.length} chamadas`],
                    ["absences", "Faltosos recentes", `${absentStudentRows().length} alertas`],
                    ["finance", "Financeiro", `${data.transactions.length} lancamentos`],
                    ["assets", "Patrimonio", `${data.assets.length} itens`],
                  ].filter(([kind]) => {
                    if (kind === "finance") return canAccessModule(currentAccessRole, "finance");
                    if (kind === "assets") return canAccessModule(currentAccessRole, "assets");
                    return true;
                  }).map(([kind, title, count]) => (
                    <div className="report-card" key={kind}>
                      <strong>{title}</strong>
                      <small>{count}</small>
                      <div className="row-actions">
                        <button className="secondary" onClick={() => setReportPreviewKind(kind as ReportKind)} type="button">
                          Previa
                        </button>
                        <button className="secondary" onClick={() => exportReport(kind as ReportKind, "pdf")} type="button">
                          PDF
                        </button>
                        <button className="secondary" onClick={() => exportReport(kind as ReportKind, "csv")} type="button">
                          Excel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Previa do relatorio</h2>
                  <span>{selectedReportPreview.title}</span>
                </div>
                <div className="preview-table">
                  <div className="preview-row preview-head" style={{ gridTemplateColumns: `repeat(${selectedReportPreview.headers.length}, minmax(120px, 1fr))` }}>
                    {selectedReportPreview.headers.map((header) => (
                      <strong key={header}>{header}</strong>
                    ))}
                  </div>
                  {selectedReportPreview.rows.slice(0, 6).map((row, index) => (
                    <div className="preview-row" key={`${reportPreviewKind}-${index}`} style={{ gridTemplateColumns: `repeat(${selectedReportPreview.headers.length}, minmax(120px, 1fr))` }}>
                      {row.map((cell, cellIndex) => (
                        <span key={`${reportPreviewKind}-${index}-${cellIndex}`}>{String(cell ?? "")}</span>
                      ))}
                    </div>
                  ))}
                  {!selectedReportPreview.rows.length && <p className="empty-state">Nenhum dado encontrado para este relatorio.</p>}
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Previa de faltosos</h2>
                  <span>{absentStudentRows().length} alertas</span>
                </div>
                <div className="row-list">
                  {absentStudentRows().map(([name, phone, status, recent, month]) => (
                    <div className="data-row" key={`${name}-${phone}`}>
                      <span className="date-box">{month}</span>
                      <div>
                        <strong>{name}</strong>
                        <small>{status} - {recent} faltas recentes - {month} no mes</small>
                      </div>
                      <a className="whatsapp-link" href={whatsappUrl(String(phone), "Ola, {nome}! Sentimos sua falta na aula. Podemos ajudar em algo?", String(name))} rel="noreferrer" target="_blank">
                        WhatsApp
                      </a>
                    </div>
                  ))}
                  {!absentStudentRows().length && <p className="empty-state">Nenhum aluno em alerta de falta no momento.</p>}
                </div>
              </article>
            </section>
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
                    {data.visitors.length} visitantes, {data.schedules.length} escalas,
                    {" "}
                    {monthlyKidsBirthdays.length} aniversariantes Kids no mes, {data.users.length} usuarios,
                    {" "}
                    {data.careRequests.length} atendimentos,
                    {" "}
                    {data.events.length} eventos, {data.schoolClasses.length} classes EBD,
                    {" "}
                    {data.discipleshipClasses.length} classes Discipulado, {activeNotices.length} comunicados ativos,
                    {" "}
                    {data.mural.length} itens de mural, {data.transactions.length} lancamentos financeiros,
                    {" "}
                    {data.assets.length} itens de patrimonio, {data.devotionals.length} devocionais e {data.audit.length} auditorias.
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
          <p>Uma plataforma segura para fortalecer o cuidado com pessoas, grupos e a missao.</p>
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
