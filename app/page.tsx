"use client";

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  absentStudentRows,
  attendanceKey,
  attendanceNoteForMember,
  attendanceSessionForEvent,
  attendanceSessionsForClass,
  attendanceStatusForMember,
  attendanceSummary,
  classNameById,
  eventsForAttendance,
  memberAttendanceHistory,
  membersForAttendanceClass,
} from "./attendance-helpers";
import {
  classWhatsappRecipients,
  messageRecipientsForAudience,
  selectedOrAllRecipients,
} from "./communication-helpers";
import { BirthdaySpotlightPanel } from "./components/BirthdaySpotlightPanel";
import { AgendaPanel } from "./components/AgendaPanel";
import { AssetsPanel } from "./components/AssetsPanel";
import { ClassModulePanel } from "./components/ClassModulePanel";
import { CommunicationPanel } from "./components/CommunicationPanel";
import { DevotionalPanel } from "./components/DevotionalPanel";
import { FinancePanel } from "./components/FinancePanel";
import { GroupsPanel } from "./components/GroupsPanel";
import { KidsPanel } from "./components/KidsPanel";
import { MembersPanel } from "./components/MembersPanel";
import { MuralPanel } from "./components/MuralPanel";
import { NoticesPanel } from "./components/NoticesPanel";
import { PastoralPanel } from "./components/PastoralPanel";
import { PushNotificationControl } from "./components/PushNotificationControl";
import { ReportsPanel } from "./components/ReportsPanel";
import { ResponsiveImage } from "./components/ResponsiveImage";
import { SettingsPanel } from "./components/SettingsPanel";
import { SystemHealthPanel } from "./components/SystemHealthPanel";
import { UsersAccessPanel } from "./components/UsersAccessPanel";
import { VisitorsPanel } from "./components/VisitorsPanel";
import {
  birthdayDateThisYear,
  classNoticeWhatsappText,
  comparablePhone,
  currentDateKey,
  dateAfterDays,
  eventDate,
  formatDate,
  isBirthdayThisMonth,
  isBirthdayThisWeek,
  isEventInWeek,
  isExpiredDate,
  memberGroupLabel,
  memberGroupNames,
  memberMatchesGroup,
  normalizeEmail,
  normalizeSearchText,
  sortMembersByName,
  sortEventsByDate,
  weekRangeWithOffset,
  whatsappUrl,
} from "./app-helpers";
import {
  blankAsset,
  blankCare,
  blankDevotional,
  blankEvent,
  blankKid,
  blankMember,
  blankMemberCredential,
  blankMinistry,
  blankMuralItem,
  blankNotice,
  blankSchoolNotice,
  blankTransaction,
  blankUser,
  blankVisitor,
  createLocalBackupData,
  hasPersistedPayload,
  normalizeAppData as normalizeAppDataWithDefaults,
  normalizeMessageTemplate,
} from "./data-normalization";
import { accessRoleFromMetadata, canAccessModule, canManageModule, isAdministrativeRole, modules, type AccessRole, type ModuleKey } from "./permissions";
import { buildReportDefinition } from "./report-builders";
import { downloadCsv, escapeHtml, printHtmlReport } from "./report-helpers";
import {
  convertVisitorToMemberData,
  approveRegistrationAsMemberData,
  approveRegistrationAsVisitorData,
  createCareRequestData,
  createNoticeData,
  deleteAccessUserData,
  deleteAssetData,
  deleteEventData,
  deleteDevotionalData,
  deleteMemberData,
  deleteMinistryData,
  deleteMuralItemData,
  deleteNoticeData,
  deleteTransactionData,
  deleteVisitorData,
  declineRegistrationRequestData,
  toggleMuralItemData,
  updateAccessUserStatusData,
  updateCareRequestData,
  updateEventStatusData,
  upsertAccessUserData,
  upsertAssetData,
  upsertDevotionalData,
  upsertEventData,
  upsertMemberData,
  upsertMinistryData,
  upsertMuralItemData,
  upsertTransactionData,
  upsertVisitorData,
} from "./system-actions";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client";
import { agendaThemeClass, moduleCoverClass, type ModuleCoverKey } from "./visual-covers";
import type {
  AccessMode,
  AccessUser,
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
  MemberSyncStatus,
  MessageRecipient,
  MessageTemplateItem,
  MinistryRecord,
  MuralImageResult,
  MuralItem,
  Notice,
  PushSummary,
  RegistrationRequest,
  RemoteAppStateResponse,
  ReportKind,
  SaveState,
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
      title: "Agenda de setembro disponivel",
      body: "Lideres ja podem conferir e ajustar a agenda mensal.",
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
  registrationRequests: [],
  members: [
    {
      id: "member-1",
      memberCode: "CDG0001",
      fullName: "Ana Ribeiro",
      fatherName: "",
      motherName: "",
      cpf: "",
      phone: "(11) 98888-1201",
      email: "ana@igreja.com",
      ageGroup: "Adulto",
      age: "35",
      gender: "Feminino",
      status: "Membro ativo",
      memberType: "Membro",
      role: "Lider de familia",
      categories: "Membro",
      ministry: "Familia",
      ministries: ["Familia"],
      ministerialFunction: "Auxiliar oficial",
      schoolClassId: "class-adults",
      discipleshipClassId: "",
      photoDataUrl: "",
      birthDate: "1991-04-12",
      maritalStatus: "Casado(a)",
      education: "Ensino medio completo",
      spouseName: "",
      address: "Rua das Flores, 120",
      zipCode: "",
      city: "",
      neighborhood: "",
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
      createdAt: "2021-03-14",
      notes: "Acompanha novos casais e participa da recepcao.",
    },
    {
      id: "member-2",
      memberCode: "CDG0002",
      fullName: "Carlos Lima",
      fatherName: "",
      motherName: "",
      cpf: "",
      phone: "(21) 97777-5402",
      email: "carlos@igreja.com",
      ageGroup: "Adulto",
      age: "37",
      gender: "Masculino",
      status: "Visitante",
      memberType: "Visitante",
      role: "Sem funcao definida",
      categories: "Visitante",
      ministry: "Recepcao",
      ministries: ["Recepcao"],
      ministerialFunction: "",
      schoolClassId: "",
      discipleshipClassId: "discipleship-new",
      photoDataUrl: "",
      birthDate: "1988-10-08",
      maritalStatus: "Solteiro(a)",
      education: "",
      spouseName: "",
      address: "Av. Central, 900",
      zipCode: "",
      city: "",
      neighborhood: "",
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
      createdAt: "2026-08-22",
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
      notes: "Revisar atividades mensais e ensaio geral.",
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

function isMemberSyncError(result: MemberSyncStatus | { error?: string }): result is { error?: string } {
  return "error" in result;
}

const messageAudiences: MessageAudience[] = [
  "Todos os membros",
  "Aniversariantes da semana",
  "Aniversariantes do mes",
  "EBD",
  "Discipulado",
  "Grupos",
  "Visitantes",
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
    id: "class-notice",
    label: "Classe - aviso",
    text: "Paz, {nome}! Temos um aviso importante para sua classe. Confira a orientacao e confirme leitura. {igreja}.",
  },
];

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

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function firstPhoneDigits(value: string) {
  return onlyDigits(value.split("/")[0] ?? value).replace(/^55/, "");
}

function similarNameScore(first: string, second: string) {
  const firstWords = new Set(normalizeSearchText(first).split(/\s+/).filter((word) => word.length > 2));
  const secondWords = normalizeSearchText(second).split(/\s+/).filter((word) => word.length > 2);
  if (!firstWords.size || !secondWords.length) return 0;
  return secondWords.filter((word) => firstWords.has(word)).length;
}

function suggestedNextStep(request: CareRequest) {
  if (request.status === "Pendente") return "Definir responsavel";
  if (request.status === "Em analise") return "Agendar atendimento";
  if (request.status === "Agendado") return "Registrar retorno";
  return "Arquivado no historico";
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
  return normalizeAppDataWithDefaults(value, initialData);
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
  const [simpleViewEnabled, setSimpleViewEnabled] = useState(false);
  const [muralSpotlightIndex, setMuralSpotlightIndex] = useState(0);
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
  const [memberFormRegistrationId, setMemberFormRegistrationId] = useState<string | null>(null);
  const [visitorForm, setVisitorForm] = useState(blankVisitor);
  const [editingVisitorId, setEditingVisitorId] = useState<string | null>(null);
  const [kidForm, setKidForm] = useState(blankKid);
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
  const [openAttendanceNoteIds, setOpenAttendanceNoteIds] = useState<Record<string, boolean>>({});
  const [selectedRequestId, setSelectedRequestId] = useState("care-1");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [messageAudience, setMessageAudience] = useState<MessageAudience>("Todos os membros");
  const [messageGroupFilter, setMessageGroupFilter] = useState("Todos os grupos");
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
  const [memberSyncLoading, setMemberSyncLoading] = useState(false);
  const [memberSyncStatus, setMemberSyncStatus] = useState<MemberSyncStatus | null>(null);
  const [pushSummary, setPushSummary] = useState<PushSummary | null>(null);
  const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(null);
  const [reportPreviewKind, setReportPreviewKind] = useState<ReportKind>("members");

  const forceAccessLogout = useCallback(async (message: string) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    logoutInProgressRef.current = true;
    setHasSession(false);
    setSessionUserId("");
    setSessionEmail("");
    setSessionRole("Administrador");
    setNotificationsOpen(false);
    setActiveModule("overview");
    setAccessMode("login");
    setRemoteStateReady(true);
    setSaveState("error");
    setAccessMessage(message);
    setSyncStatus(message);
    lastSavedPayloadRef.current = "";

    try {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.auth.signOut();
    } finally {
      logoutInProgressRef.current = false;
    }
  }, []);

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
      if (response.status === 401 || response.status === 403) {
        await forceAccessLogout(result.error ?? "Sua sessao expirou ou seu acesso foi alterado. Entre novamente.");
        return false;
      }

      if (response.status === 409) {
        setSaveState("conflict");
        setRemoteUpdatedAt(result.updatedAt ?? remoteUpdatedAt);
        setSyncStatus("Existe uma versao mais recente na base. Recarregue os dados antes de continuar editando.");
        return false;
      }

      setSaveState("error");
      setSyncStatus(result.error ?? "Nao foi possivel salvar cadastros na base.");
      return false;
    }

    lastSavedPayloadRef.current = JSON.stringify(payloadData);
    const savedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setRemoteUpdatedAt(result.updatedAt ?? new Date().toISOString());
    setLastSavedAt(savedAt);
    setSaveState("saved");
    setSyncStatus(`Salvo agora as ${savedAt}.`);
    return true;
  }, [forceAccessLogout, remoteUpdatedAt]);

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
      if (response.status === 401 || response.status === 403) {
        await forceAccessLogout(result.error ?? "Sua sessao expirou ou seu acesso foi alterado. Entre novamente.");
        return false;
      }

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
  }, [forceAccessLogout, hasSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moduleFromUrl = params.get("module") as ModuleKey | null;
    if (moduleFromUrl && modules.some((module) => module.key === moduleFromUrl)) {
      const timer = window.setTimeout(() => {
        setActiveModule(moduleFromUrl);
      }, 0);
      params.delete("module");
      const nextSearch = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
      return () => {
        window.clearTimeout(timer);
      };
    }

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
        if (response.status === 401 || response.status === 403) {
          await forceAccessLogout(result.error ?? "Sua sessao expirou ou seu acesso foi alterado. Entre novamente.");
          return;
        }

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
  }, [forceAccessLogout, hasSession]);

  useEffect(() => {
    if (!hasSession || !isSupabaseConfigured() || !remoteStateReady) return;
    if (saveState === "conflict") return;

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
  }, [data, hasSession, remoteStateReady, saveRemoteStateNow, saveState]);

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

  const normalizedSessionEmail = normalizeEmail(sessionEmail);
  const currentAccessUser = useMemo(
    () => data.users.find((user) => normalizeEmail(user.email) === normalizedSessionEmail),
    [data.users, normalizedSessionEmail],
  );
  const currentAccessRole = currentAccessUser?.role ?? sessionRole;
  const isAdminView = isAdministrativeRole(currentAccessRole);
  const isSimpleView = simpleViewEnabled && !isAdminView;
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
  const canManageGroups = canManageModule(currentAccessRole, "ministries");
  const canManageNotices = canManageModule(currentAccessRole, "notices");
  const canManageMessages = canManageModule(currentAccessRole, "messages");
  const canManageMural = canManageModule(currentAccessRole, "mural");
  const canManagePastoral = canManageModule(currentAccessRole, "pastoral");
  const canManageFinance = canManageModule(currentAccessRole, "finance");
  const canManageAssets = canManageModule(currentAccessRole, "assets");
  const canManageDevotional = canManageModule(currentAccessRole, "devotional");
  const canManageRegistrationRequests = currentAccessRole === "Administrador" || currentAccessRole === "Secretario";
  const isPushSummary = (value: PushSummary | { error?: string }): value is PushSummary =>
    "configured" in value && "enabledSubscriptions" in value && "checkedAt" in value && "message" in value;
  const loadMemberSyncStatus = useCallback(
    async (refreshMirror = false) => {
      setMemberSyncLoading(true);
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) {
        setMemberSyncLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/member-sync-status", {
          method: refreshMirror ? "POST" : "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = (await response.json()) as MemberSyncStatus | { error?: string };

        if (!response.ok || isMemberSyncError(result)) {
          const errorMessage = isMemberSyncError(result) ? result.error : undefined;
          setMemberSyncStatus({
            status: "Indisponivel",
            jsonTotal: data.members.length,
            tableTotal: 0,
            missingCodeCount: 0,
            duplicateCpfCount: 0,
            duplicatePhoneCount: 0,
            missingInTableCount: 0,
            extraInTableCount: 0,
            checkedAt: new Date().toISOString(),
            message: errorMessage ?? "Nao foi possivel consultar a tabela members.",
          });
          return;
        }

        setMemberSyncStatus(result);
        if (refreshMirror) setSyncStatus("Conferencia dos membros atualizada com o espelho da tabela members.");
      } finally {
        setMemberSyncLoading(false);
      }
    },
    [data.members.length],
  );

  const loadPushSummary = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const token = sessionData.session?.access_token;

    if (!token) return;

    try {
      const response = await fetch("/api/admin/push-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as PushSummary | { error?: string };

      if (!response.ok || !isPushSummary(result)) {
        setPushSummary({
          configured: false,
          enabledSubscriptions: 0,
          checkedAt: new Date().toISOString(),
          message: "Nao foi possivel conferir as notificacoes agora.",
        });
        return;
      }

      setPushSummary(result);
    } catch {
      setPushSummary({
        configured: false,
        enabledSubscriptions: 0,
        checkedAt: new Date().toISOString(),
        message: "Nao foi possivel conferir as notificacoes agora.",
      });
    }
  }, []);

  useEffect(() => {
    if (!hasSession || currentAccessRole !== "Administrador" || !isSupabaseConfigured()) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadMemberSyncStatus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentAccessRole, hasSession, loadMemberSyncStatus, remoteUpdatedAt]);

  useEffect(() => {
    if (!hasSession || !canManageRegistrationRequests || !isSupabaseConfigured()) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadPushSummary();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canManageRegistrationRequests, hasSession, loadPushSummary, remoteUpdatedAt]);

  useEffect(() => {
    if (!hasSession || !canManageMessages) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    async function loadMessageTemplates() {
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) return;

      const response = await fetch("/api/admin/message-templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { templates?: MessageTemplateItem[]; error?: string };

      if (!response.ok) {
        setSyncStatus("Supabase conectado, aguardando login para sincronizar dados.");
        return;
      }

      if (result.templates?.length) {
        const mappedTemplates = result.templates.map((template) => normalizeMessageTemplate(template));
        const defaultTemplate = mappedTemplates.find((template) => template.id === "general_invite") ?? mappedTemplates[0];

        setRemoteMessageTemplates(mappedTemplates);
        setMessageTemplateId(defaultTemplate.id);
        setMessageText(defaultTemplate.text);
        setSyncStatus("Modelos de mensagem carregados do Supabase.");
      }
    }

    void loadMessageTemplates();
  }, [canManageMessages, hasSession]);
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
  const pendingRegistrationRequests = useMemo(
    () =>
      canManageRegistrationRequests
        ? data.registrationRequests.filter((request) => request.status === "Aguardando aprovacao" || request.status === "Em analise")
        : [],
    [canManageRegistrationRequests, data.registrationRequests],
  );
  useEffect(() => {
    if (!hasSession || !canManageRegistrationRequests) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    async function loadRegistrationRequests() {
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionData.session?.access_token;

      if (!token) return;

      const response = await fetch("/api/admin/registration-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { requests?: RegistrationRequest[]; error?: string };

      if (!response.ok || !result.requests) return;

      setData((current) => ({
        ...current,
        registrationRequests: result.requests ?? current.registrationRequests,
      }));
    }

    void loadRegistrationRequests();
  }, [canManageRegistrationRequests, hasSession]);
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
  const upcomingPanelEvents = useMemo(() => {
    const today = eventDate(todayKey) ?? new Date();
    const currentWeekRange = weekRangeWithOffset(0, today);

    return data.events
      .filter((event) => event.date >= todayKey)
      .filter((event) => isEventInWeek(event, currentWeekRange.start, currentWeekRange.end))
      .sort(sortEventsByDate);
  }, [data.events, todayKey]);

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

    const upcomingEvents = upcomingPanelEvents.slice(0, 3).map((event) => ({
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

    const pendingRegistrations = pendingRegistrationRequests.map((request) => ({
      id: `registration-${request.id}`,
      title: `Pre-cadastro: ${request.fullName}`,
      body: `${request.requestedStatus} - ${request.phone}`,
      module: "overview" as ModuleKey,
    }));

    return [...pendingRegistrations, ...pendingCare, ...upcomingEvents, ...publishedMural];
  }, [data.mural, pendingRegistrationRequests, upcomingPanelEvents, visibleCareRequests]);

  const unreadCount = notifications.filter((notice) => !data.notificationReadIds.includes(notice.id)).length;
  const activeNotices = data.notices.filter((notice) => !isExpiredDate(notice.expiresAt));
  const publishedMuralItems = useMemo(
    () => data.mural.filter((item) => item.published).sort((first, second) => Number(second.featured) - Number(first.featured)),
    [data.mural],
  );
  const featuredMuralItem = useMemo(
    () => publishedMuralItems[muralSpotlightIndex % Math.max(publishedMuralItems.length, 1)],
    [muralSpotlightIndex, publishedMuralItems],
  );
  const featuredMuralImage = featuredMuralItem?.imageDataUrl || featuredMuralItem?.bannerUrl || "";
  useEffect(() => {
    if (publishedMuralItems.length <= 1) return;

    const timer = window.setInterval(() => {
      setMuralSpotlightIndex((index) => (index + 1) % publishedMuralItems.length);
    }, 9000);

    return () => window.clearInterval(timer);
  }, [publishedMuralItems.length]);
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
  const absentRows = useMemo(() => absentStudentRows(data.members, data.attendanceSessions), [data.attendanceSessions, data.members]);
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
  const memberDuplicateCandidate = useMemo(() => {
    if (!canManageMembers || editingMemberId) return undefined;

    const cpf = onlyDigits(memberForm.cpf);
    const phone = firstPhoneDigits(memberForm.phone);
    const fullName = memberForm.fullName.trim();

    if (!cpf && !phone && fullName.length < 6) return undefined;

    return data.members.find((member) => {
      const sameCpf = Boolean(cpf && onlyDigits(member.cpf) === cpf);
      const samePhone = Boolean(phone && firstPhoneDigits(member.phone) === phone);
      const similarName = Boolean(fullName.length >= 6 && similarNameScore(member.fullName, fullName) >= 2);
      return sameCpf || samePhone || similarName;
    });
  }, [canManageMembers, data.members, editingMemberId, memberForm.cpf, memberForm.fullName, memberForm.phone]);
  const memberDuplicateWarnings = useMemo(() => {
    if (!canManageMembers || editingMemberId) return [];

    const cpf = onlyDigits(memberForm.cpf);
    const phone = firstPhoneDigits(memberForm.phone);
    const fullName = memberForm.fullName.trim();

    if (!cpf && !phone && fullName.length < 6) return [];

    return data.members
      .filter((member) => {
        const sameCpf = Boolean(cpf && onlyDigits(member.cpf) === cpf);
        const samePhone = Boolean(phone && firstPhoneDigits(member.phone) === phone);
        const similarName = Boolean(fullName.length >= 6 && similarNameScore(member.fullName, fullName) >= 2);
        return sameCpf || samePhone || similarName;
      })
      .slice(0, 3)
      .map((member) => `${member.fullName} (${member.memberCode || "sem codigo"}) ja parece estar cadastrado.`);
  }, [canManageMembers, data.members, editingMemberId, memberForm.cpf, memberForm.fullName, memberForm.phone]);
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
  const selectedReportPreview = buildReportDefinition({ data, kind: reportPreviewKind, weekEvents, monthlyBirthdays, absentRows });
  const roleOptions = useMemo(() => {
    const roles = [...memberRoleOptions];
    memberRolesFromText(memberForm.role).forEach((role) => {
      if (!roles.includes(role)) roles.push(role);
    });
    return roles;
  }, [memberForm.role]);
  const selectedMemberRoles = useMemo(() => memberRolesFromText(memberForm.role), [memberForm.role]);
  const groupOptions = useMemo(() => {
    const groups = new Set(data.ministries.map((group) => group.name.trim()).filter(Boolean));
    memberGroupNames(memberForm).forEach((group) => groups.add(group));
    return Array.from(groups).sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }));
  }, [data.ministries, memberForm]);
  const pastoralResponsibleOptions = useMemo(() => {
    const leaderEmails = new Set(data.users.filter((user) => user.role === "Lider").map((user) => normalizeEmail(user.email)));
    const leaderNames = new Set(data.users.filter((user) => user.role === "Lider").map((user) => normalizeSearchText(user.name)));
    const allowedTerms = ["pastor", "presbitero", "dirigente", "lider"];
    const names = new Set<string>();

    data.members.forEach((member) => {
      const memberText = normalizeSearchText(
        [member.ministerialFunction, member.role, member.categories, member.memberType, member.pastoralStatus].join(" "),
      );
      const hasLeadershipAccess = leaderEmails.has(normalizeEmail(member.email)) || leaderNames.has(normalizeSearchText(member.fullName));
      const hasLeadershipFunction = allowedTerms.some((term) => memberText.includes(term));

      if ((hasLeadershipAccess || hasLeadershipFunction) && member.fullName.trim()) {
        names.add(member.fullName.trim());
      }
    });

    return Array.from(names).sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }));
  }, [data.members, data.users]);
  const searchQuery = normalizeSearchText(globalSearch);
  const filteredMembers = useMemo(
    () =>
      visibleMembers
        .filter((member) => memberStatusFilter === "Todos" || member.status === memberStatusFilter)
        .filter((member) => memberTypeFilter === "Todos" || member.memberType === memberTypeFilter)
        .filter((member) => memberMatchesGroup(member, memberGroupFilter))
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
              member.ageGroup,
              member.age,
              member.gender,
              member.address,
              member.zipCode,
              member.city,
              member.neighborhood,
              member.maritalStatus,
              member.education,
              member.spouseName,
              member.categories,
              member.status,
              member.memberType,
              member.role,
              memberGroupLabel(member),
              member.ministerialFunction,
              schoolClassName,
              discipleshipClassName,
              member.pastoralStatus,
              member.registrationSource,
            ].join(" "),
          ).includes(searchQuery);
        })
        .sort(sortMembersByName),
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
  const nextAgendaEvent = upcomingPanelEvents[0];
  const pendingCareCount = visibleCareRequests.filter((request) => request.status !== "Concluido").length;
  const unassignedCareCount = data.careRequests.filter((request) => !request.responsible && request.status !== "Concluido").length;
  const memberSchoolName = currentMember?.schoolClassId ? classNameById(data.schoolClasses, currentMember.schoolClassId) : "";
  const memberDiscipleshipName = currentMember?.discipleshipClassId ? classNameById(data.discipleshipClasses, currentMember.discipleshipClassId) : "";
  const birthdaySpotlightPanel = (
    <BirthdaySpotlightPanel
      canSendMessages={canManageMessages}
      monthlyBirthdays={monthlyBirthdays}
      onOpenMessages={() => setActiveModule("messages")}
    />
  );
  const messageRecipients = useMemo<MessageRecipient[]>(() => {
    const recipients = messageRecipientsForAudience({
        audience: messageAudience,
        members: data.members,
        visitors: data.visitors,
        kids: data.kids,
        schoolClasses: data.schoolClasses,
        discipleshipClasses: data.discipleshipClasses,
        weeklyBirthdays,
        monthlyBirthdays,
      });

    if (messageAudience !== "Grupos" || messageGroupFilter === "Todos os grupos") return recipients;
    return recipients.filter((recipient) => (recipient.groups ?? [recipient.group]).includes(messageGroupFilter));
  }, [
    data.discipleshipClasses,
    data.kids,
    data.members,
    data.schoolClasses,
    data.visitors,
    messageAudience,
    messageGroupFilter,
    monthlyBirthdays,
    weeklyBirthdays,
  ]);
  const selectedMessageRecipients = useMemo(() => {
    return selectedOrAllRecipients(messageRecipients, selectedMessageRecipientIds);
  }, [messageRecipients, selectedMessageRecipientIds]);

  function openClassWhatsapp(classRecord: SchoolClass, title: string, body: string, area: "EBD" | "Discipulado") {
    if (!requireModuleAccess(area === "EBD" ? "school" : "discipleship", `enviar WhatsApp da ${area}`)) return;

    const recipients = classWhatsappRecipients(data.members, classRecord, area);
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

  function selectedAttendanceEvent(area: AttendanceArea, classId: string) {
    const events = eventsForAttendance(data.events, area);
    const selectedEventId = attendanceEventSelection[attendanceKey(area, classId)] ?? events[0]?.id ?? "";
    return events.find((event) => event.id === selectedEventId) ?? events[0];
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
      const currentRecords = existing?.records ?? membersForAttendanceClass(current.members, area, classRecord.id).map((item) => ({
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
      const baseRecords = existing?.records ?? membersForAttendanceClass(current.members, area, classRecord.id).map((item) => ({
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

  function startAttendanceSession(area: AttendanceArea, classRecord: SchoolClass, event: ChurchEvent) {
    if (!canManageAttendanceClass(classRecord)) {
      setSyncStatus("Apenas o professor da turma ou a administracao pode iniciar a chamada.");
      return;
    }

    const now = new Date().toISOString();
    setData((current) => {
      const existing = current.attendanceSessions.find(
        (session) => session.area === area && session.classId === classRecord.id && session.eventId === event.id,
      );
      if (existing) return current;

      const records = membersForAttendanceClass(current.members, area, classRecord.id).map((member) => ({
        memberId: member.id,
        status: "Presente" as AttendanceStatus,
        note: "",
      }));
      const session: AttendanceSession = {
        id: uid("attendance"),
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
        attendanceSessions: [session, ...current.attendanceSessions],
        audit: [{ id: uid("audit"), action: `Chamada iniciada: ${classRecord.name} - ${event.title}`, when: now }, ...current.audit].slice(0, 12),
      };
    });
    setSyncStatus(`Chamada iniciada para ${classRecord.name}. Ajuste apenas faltas e justificativas.`);
  }

  function printAttendanceSessionPdf(area: AttendanceArea, classRecord: SchoolClass, session: AttendanceSession) {
    const classMembers = membersForAttendanceClass(data.members, area, classRecord.id);
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

  function exportReport(kind: ReportKind, format: "pdf" | "csv") {
    const report = buildReportDefinition({ data, kind, weekEvents, monthlyBirthdays, absentRows });
    const subtitle = `Igreja Conectada - gerado em ${new Date().toLocaleString("pt-BR")}`;

    if (format === "csv") {
      downloadCsv(`${report.title.toLowerCase().replaceAll(" ", "-")}.csv`, report.headers, report.rows);
      log(`CSV gerado: ${report.title}`);
      return;
    }

    if (!printHtmlReport(report.title, subtitle, report.headers, report.rows)) {
      setSyncStatus("Nao foi possivel abrir o relatorio. Libere pop-ups para imprimir ou salvar em PDF.");
      return;
    }
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

    let createdRequestId = "";
    setData((current) => {
      const result = createCareRequestData(current, careForm, memberName, memberPhone, uid);
      createdRequestId = result.request.id;
      return result.data;
    });
    setSelectedRequestId(createdRequestId);
    setCareForm(canManagePastoral ? blankCare : { ...blankCare, member: memberName, phone: memberPhone });
    setActiveModule("pastoral");
  }

  function updateCareRequest(id: string, patch: Partial<CareRequest>, action: string) {
    if (!requireModuleAccess("pastoral", action)) return;

    let requestWasFound = false;
    setData((current) => {
      requestWasFound = current.careRequests.some((request) => request.id === id);
      if (!requestWasFound) return current;
      return updateCareRequestData(current, id, patch, action, uid);
    });

    if (!requestWasFound) {
      setSyncStatus("Nao foi possivel localizar este atendimento. Recarregue os dados da base e tente novamente.");
      return;
    }

    setSelectedRequestId(id);
    setSyncStatus(action);
  }

  function toggleMural(id: string, field: "published" | "featured") {
    if (!requireModuleAccess("mural", "alterar mural")) return;

    setData((current) => toggleMuralItemData(current, id, field, uid));
  }

  async function createUser() {
    if (!requireModuleAccess("users", "criar usuarios")) return;
    if (!userForm.name.trim() || !userForm.email.trim()) return;
    if (!selectedAccessExistingUser && userForm.password.trim().length < 6) {
      setSyncStatus("Informe uma senha inicial com pelo menos 6 caracteres.");
      return;
    }

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

    setData((current) => upsertAccessUserData(current, user, selectedAccessMemberId, isUpdatingAccess, uid));
    setUserForm(blankUser);
    setSelectedAccessMemberId("");
  }

  async function updateAccessUserStatus(user: AccessUser, status: AccessUser["status"]) {
    if (!requireModuleAccess("users", "alterar acessos")) return;

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

    setData((current) => updateAccessUserStatusData(current, user, status, uid));
    setSyncStatus(status === "Bloqueado" ? `Acesso de ${user.name} cancelado.` : `Acesso de ${user.name} reativado.`);
  }

  async function deleteAccessUser(user: AccessUser) {
    if (!requireModuleAccess("users", "excluir acessos")) return;
    if (!window.confirm(`Excluir definitivamente o acesso de ${user.name}?`)) return;

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

    setData((current) => deleteAccessUserData(current, user, uid));
    setSyncStatus(`Acesso de ${user.name} excluido.`);
  }

  async function createMember() {
    if (!memberForm.fullName.trim() || !memberForm.phone.trim()) return;
    if (!canManageMembers && editingMemberId !== currentMember?.id) {
      setSyncStatus("Acesso de membro: voce pode atualizar apenas o seu proprio cadastro.");
      return;
    }

    if (!editingMemberId && canManageMembers) {
      const cpf = onlyDigits(memberForm.cpf);
      const phone = firstPhoneDigits(memberForm.phone);
      const exactDuplicate = data.members.find(
        (member) => Boolean(cpf && onlyDigits(member.cpf) === cpf) || Boolean(phone && firstPhoneDigits(member.phone) === phone),
      );

      if (exactDuplicate) {
        setSyncStatus(`Possivel duplicidade: ${exactDuplicate.fullName} ja possui este CPF ou telefone. Use "Atualizar cadastro existente".`);
        return;
      }
    }

    const isEditing = Boolean(editingMemberId);
    const member: MemberRecord = { ...memberForm, id: editingMemberId ?? uid("member") };
    const reviewedRegistrationId = memberFormRegistrationId;

    if (reviewedRegistrationId) {
      const updated = await updateRegistrationRequestStatus(reviewedRegistrationId, "Aprovado", "Aprovado com edicao da ficha");
      if (!updated) return;
    }

    setData((current) => {
      const nextData = upsertMemberData(current, memberForm, editingMemberId, uid);
      if (!reviewedRegistrationId) return nextData;

      return {
        ...nextData,
        registrationRequests: current.registrationRequests.map((request) =>
          request.id === reviewedRegistrationId
            ? {
                ...request,
                status: "Aprovado",
                reviewedAt: new Date().toISOString(),
                reviewNote: "Aprovado com edicao da ficha",
              }
            : request,
        ),
      };
    });
    setMemberForm(blankMember);
    setEditingMemberId(null);
    setMemberFormRegistrationId(null);
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
    setMemberFormRegistrationId(null);
  }

  async function updateRegistrationRequestStatus(id: string, status: RegistrationRequest["status"], reviewNote: string) {
    if (!isSupabaseConfigured()) return true;

    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const token = sessionData.session?.access_token;

    if (!token) {
      setSyncStatus("Entre com uma conta Supabase antes de revisar pre-cadastros.");
      return false;
    }

    const response = await fetch("/api/admin/registration-requests", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, status, reviewNote }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setSyncStatus(result.error ?? "Nao foi possivel atualizar o pre-cadastro.");
      return false;
    }

    return true;
  }

  async function markRegistrationInReview(request: RegistrationRequest) {
    if (!canManageRegistrationRequests || request.status === "Em analise") return;
    const updated = await updateRegistrationRequestStatus(request.id, "Em analise", "Marcado para analise da administracao");
    if (!updated) return;
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      registrationRequests: current.registrationRequests.map((item) =>
        item.id === request.id
          ? { ...item, status: "Em analise", reviewedAt: now, reviewNote: "Marcado para analise da administracao" }
          : item,
      ),
    }));
    setSyncStatus(`Pre-cadastro de ${request.fullName} marcado como em analise.`);
  }

  function memberFormFromRegistration(request: RegistrationRequest, memberType: MemberRecord["memberType"] = "Membro"): Omit<MemberRecord, "id"> {
    const status = memberType === "Membro" ? "Membro ativo" : request.requestedStatus === "Novo convertido" ? "Novo convertido" : "Visitante";

    return {
      ...blankMember,
      memberCode: "",
      fullName: request.fullName,
      fatherName: request.fatherName,
      motherName: request.motherName,
      cpf: request.cpf,
      phone: request.phone,
      email: request.email,
      gender: request.gender,
      status,
      memberType,
      categories: memberType,
      birthDate: request.birthDate,
      maritalStatus: request.maritalStatus,
      education: request.education,
      spouseName: request.spouseName,
      address: request.address,
      zipCode: request.zipCode,
      city: request.city,
      neighborhood: request.neighborhood,
      registrationSource: request.registrationSource || "Cadastro via link WhatsApp",
      pastoralStatus: "Precisa de contato",
      joinedAt: request.createdAt.slice(0, 10),
      createdAt: request.createdAt,
      notes: request.notes,
    };
  }

  function reviewRegistrationRequest(request: RegistrationRequest) {
    if (!canManageRegistrationRequests) return;
    setMemberForm(memberFormFromRegistration(request));
    setEditingMemberId(null);
    setMemberFormRegistrationId(request.id);
    setMemberFormTab("Dados");
    setActiveModule("members");
    setSyncStatus(`Revise a ficha de ${request.fullName} e salve para aprovar o pre-cadastro.`);
    window.setTimeout(() => {
      document.getElementById("member-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("member-full-name")?.focus();
    }, 0);
  }

  async function approveRegistrationAsMember(request: RegistrationRequest) {
    if (!canManageRegistrationRequests) return;
    const updated = await updateRegistrationRequestStatus(request.id, "Aprovado", "Aprovado como membro");
    if (!updated) return;
    setData((current) => approveRegistrationAsMemberData(current, request, blankMember, uid, "Membro"));
    setSyncStatus(`Pre-cadastro de ${request.fullName} aprovado como membro.`);
  }

  async function approveRegistrationAsVisitor(request: RegistrationRequest) {
    if (!canManageRegistrationRequests) return;
    const updated = await updateRegistrationRequestStatus(request.id, "Aprovado", "Aprovado como visitante");
    if (!updated) return;
    setData((current) => approveRegistrationAsVisitorData(current, request, uid));
    setSyncStatus(`Pre-cadastro de ${request.fullName} aprovado como visitante.`);
  }

  async function declineRegistrationRequest(request: RegistrationRequest) {
    if (!canManageRegistrationRequests) return;
    if (!window.confirm(`Recusar o pre-cadastro de ${request.fullName}?`)) return;
    const updated = await updateRegistrationRequestStatus(request.id, "Recusado", "Recusado pela administracao");
    if (!updated) return;
    setData((current) => declineRegistrationRequestData(current, request, uid));
    setSyncStatus(`Pre-cadastro de ${request.fullName} recusado.`);
  }

  function deleteMember(member: MemberRecord) {
    if (!requireModuleAccess("members", "excluir fichas de membros")) return;
    if (!window.confirm(`Excluir a ficha de ${member.fullName}?`)) return;

    setData((current) => deleteMemberData(current, member, uid));

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

    const visitor: VisitorRecord = { ...visitorForm, id: editingVisitorId ?? uid("visitor") };

    setData((current) => upsertVisitorData(current, visitorForm, editingVisitorId, uid));
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

    setData((current) => deleteVisitorData(current, visitor, uid));
    if (editingVisitorId === visitor.id) {
      setVisitorForm(blankVisitor);
      setEditingVisitorId(null);
    }
  }

  function convertVisitorToMember(visitor: VisitorRecord) {
    if (!requireModuleAccess("members", "converter visitante em membro")) return;

    setData((current) => convertVisitorToMemberData(current, visitor, blankMember, uid));
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
            password: "123456",
          },
    );
  }

  function memberAccessMessage(member: MemberRecord) {
    return [
      "Ola, {nome}! Seu acesso ao Igreja Conectada foi preparado.",
      "Acesse: https://igrejaconectada-kappa.vercel.app",
      `Login: ${memberCredentialForm.email.trim() || member.email}`,
      `Senha inicial: ${memberCredentialForm.password.trim() || "123456"}`,
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

    setMemberCredentialForm((form) => ({ ...form, password: "123456" }));
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

    setData((current) => upsertMuralItemData(current, muralForm, uid));
    setMuralForm(blankMuralItem);
    setMuralImageMessage("");
  }

  function deleteMuralItem(item: MuralItem) {
    if (!requireModuleAccess("mural", "excluir itens do mural")) return;
    if (!window.confirm(`Excluir o item do mural "${item.title}"?`)) return;

    setData((current) => deleteMuralItemData(current, item, uid));
  }

  function createEvent() {
    if (!requireModuleAccess("events", editingEventId ? "editar eventos" : "adicionar eventos")) return;
    if (!canCreateEvent) return;

    setData((current) => upsertEventData(current, eventForm, editingEventId, uid));
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
    setData((current) => updateEventStatusData(current, event, status, uid));
  }

  function deleteEvent(event: ChurchEvent) {
    if (!requireModuleAccess("events", "excluir eventos")) return;
    if (!window.confirm(`Excluir o evento "${event.title}" da agenda?`)) return;

    setData((current) => deleteEventData(current, event, uid));

    if (editingEventId === event.id) {
      cancelEventEdit();
    }
  }

  function createTransaction() {
    if (!requireModuleAccess("finance", editingTransactionId ? "editar lancamento financeiro" : "criar lancamento financeiro")) return;
    if (!canCreateTransaction) return;

    setData((current) => upsertTransactionData(current, transactionForm, editingTransactionId, uid));
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

    setData((current) => deleteTransactionData(current, transaction, uid));
    if (editingTransactionId === transaction.id) {
      setTransactionForm(blankTransaction);
      setEditingTransactionId(null);
    }
  }

  function createAsset() {
    if (!requireModuleAccess("assets", editingAssetId ? "editar patrimonio" : "criar patrimonio")) return;
    if (!canCreateAsset) return;

    setData((current) => upsertAssetData(current, assetForm, editingAssetId, uid));
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

    setData((current) => deleteAssetData(current, asset, uid));
    if (editingAssetId === asset.id) {
      setAssetForm(blankAsset);
      setEditingAssetId(null);
    }
  }

  function createDevotional() {
    if (!requireModuleAccess("devotional", editingDevotionalId ? "editar devocional" : "criar devocional")) return;
    if (!canCreateDevotional) return;

    setData((current) => upsertDevotionalData(current, devotionalForm, editingDevotionalId, uid));
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

    setData((current) => deleteDevotionalData(current, devotional, uid));
    if (editingDevotionalId === devotional.id) {
      setDevotionalForm(blankDevotional);
      setEditingDevotionalId(null);
    }
  }

  function createNotice() {
    if (!requireModuleAccess("notices", "criar comunicados")) return;
    if (!canCreateNotice) return;

    const expiresAt = noticeForm.expiresAt || dateAfterDays(noticeForm.retentionDays);

    setData((current) => createNoticeData(current, noticeForm, expiresAt, uid));
    setNoticeForm(blankNotice);
  }

  function deleteNotice(notice: Notice) {
    if (!requireModuleAccess("notices", "excluir comunicados")) return;
    if (!window.confirm(`Excluir o aviso "${notice.title}"?`)) return;

    setData((current) => deleteNoticeData(current, notice, uid));
  }

  function createMinistry() {
    if (!requireModuleAccess("ministries", "criar grupos")) return;
    if (!canCreateMinistry) return;

    setData((current) => upsertMinistryData(current, ministryForm, editingMinistryId, uid));
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

    setData((current) => deleteMinistryData(current, ministry, uid));

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
    setMuralForm(blankMuralItem);
    setSchoolNoticeForm(blankSchoolNotice);
    setDiscipleshipNoticeForm({ ...blankSchoolNotice, classId: "discipleship-new" });
    setAttendanceEventSelection({});
    setOpenAttendanceNoteIds({});
  }

  async function copyPublicRegistrationLink() {
    const link = `${window.location.origin}/cadastro`;
    await navigator.clipboard.writeText(link);
    setSyncStatus("Link de cadastro copiado. Agora voce pode enviar pelo WhatsApp.");
  }

  function downloadCurrentBackup(reason = "backup-manual") {
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `igreja-conectada-${reason}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSyncStatus("Backup desta tela baixado. Agora voce pode atualizar os dados da base com mais seguranca.");
  }

  const actionHighlights = [
    {
      label: "Pre-cadastros",
      value: pendingRegistrationRequests.length.toString(),
      hint: "aguardando analise",
      module: "overview" as ModuleKey,
      cover: "registrations" as ModuleCoverKey,
    },
    {
      label: "Atencao pastoral",
      value: data.careRequests.filter((request) => !request.responsible && request.status !== "Concluido").length.toString(),
      hint: "sem responsavel",
      module: "pastoral" as ModuleKey,
      cover: "pastoral" as ModuleCoverKey,
    },
    {
      label: "Agenda da semana",
      value: upcomingPanelEvents.length.toString(),
      hint: "encontros restantes",
      module: "events" as ModuleKey,
      cover: "agenda" as ModuleCoverKey,
    },
    {
      label: "Visitantes",
      value: data.visitors.filter((visitor) => visitor.integrationStatus !== "Integrado").length.toString(),
      hint: "em acompanhamento",
      module: "visitors" as ModuleKey,
      cover: "visitors" as ModuleCoverKey,
    },
    {
      label: "Comunicados ativos",
      value: activeNotices.filter((notice) => notice.status === "Publicado").length.toString(),
      hint: "publicados",
      module: "notices" as ModuleKey,
      cover: "notices" as ModuleCoverKey,
    },
    {
      label: "Area Kids",
      value: data.kids.length.toString(),
      hint: "criancas cadastradas",
      module: "kids" as ModuleKey,
      cover: "kids" as ModuleCoverKey,
    },
    {
      label: "Membros",
      value: data.members.length.toString(),
      hint: "cadastros ativos",
      module: "members" as ModuleKey,
      cover: "members" as ModuleCoverKey,
    },
    {
      label: "EBD",
      value: data.schoolClasses.length.toString(),
      hint: "classes organizadas",
      module: "school" as ModuleKey,
      cover: "school" as ModuleCoverKey,
    },
    {
      label: "Discipulado",
      value: data.discipleshipClasses.length.toString(),
      hint: "turmas ativas",
      module: "discipleship" as ModuleKey,
      cover: "discipleship" as ModuleCoverKey,
    },
    {
      label: "Grupos",
      value: data.ministries.length.toString(),
      hint: "grupos cadastrados",
      module: "ministries" as ModuleKey,
      cover: "groups" as ModuleCoverKey,
    },
    {
      label: "Mural",
      value: data.mural.filter((item) => item.published).length.toString(),
      hint: "destaques publicados",
      module: "mural" as ModuleKey,
      cover: "mural" as ModuleCoverKey,
    },
    {
      label: "Comunicacao",
      value: data.messageCampaigns.length.toString(),
      hint: "campanhas registradas",
      module: "messages" as ModuleKey,
      cover: "messages" as ModuleCoverKey,
    },
    {
      label: "Relatorios",
      value: "8",
      hint: "modelos disponiveis",
      module: "reports" as ModuleKey,
      cover: "reports" as ModuleCoverKey,
    },
    {
      label: "Atendimentos",
      value: data.careRequests.filter((request) => request.status !== "Concluido").length.toString(),
      hint: "em acompanhamento",
      module: "pastoral" as ModuleKey,
      cover: "pastoral" as ModuleCoverKey,
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
    const classMembers = membersForAttendanceClass(data.members, area, classRecord.id);
    const events = eventsForAttendance(data.events, area);
    const selectedEvent = selectedAttendanceEvent(area, classRecord.id);
    const session = selectedEvent ? attendanceSessionForEvent(data.attendanceSessions, area, classRecord.id, selectedEvent.id) : undefined;
    const summary = attendanceSummary(session, classMembers);
    const canManage = canManageAttendanceClass(classRecord);
    const currentMemberIsStudent = Boolean(
      currentMember && (area === "school" ? currentMember.schoolClassId === classRecord.id : currentMember.discipleshipClassId === classRecord.id),
    );
    const currentMemberHistory = currentMember ? memberAttendanceHistory(data.attendanceSessions, area, currentMember).filter((item) => item.session.classId === classRecord.id) : [];
    const areaLabel = area === "school" ? "EBD" : "Discipulado";
    const classHistory = attendanceSessionsForClass(data.attendanceSessions, area, classRecord.id);
    const statusOptions: { label: string; status: AttendanceStatus; style: string }[] = [
      { label: "Presente", status: "Presente", style: "present" },
      { label: "Faltou", status: "Falta", style: "absent" },
      { label: "Justificou", status: "Justificado", style: "justified" },
      { label: "Contato", status: "Precisa de contato", style: "contact" },
    ];

    if (!canManage && !currentMemberIsStudent) return null;

    return (
      <div className="credential-panel attendance-panel">
        <div className="panel-heading compact-heading">
          <h2>{canManage ? `Chamada da aula - ${areaLabel}` : "Minha frequencia"}</h2>
          <span>{summary.total} aluno{summary.total === 1 ? "" : "s"}</span>
        </div>

        {canManage ? (
          <div className="attendance-workflow">
            <div className="attendance-class-summary">
              <div>
                <span>Classe</span>
                <strong>{classRecord.name}</strong>
                <small>Professor: {classRecord.teacher || "Nao informado"}</small>
              </div>
              <div>
                <span>Aula selecionada</span>
                <strong>{selectedEvent ? selectedEvent.title : "Nenhuma aula encontrada"}</strong>
                <small>{selectedEvent ? `${formatDate(selectedEvent.date)} - ${selectedEvent.time || "Sem horario"}` : `Crie um evento de ${areaLabel} na agenda.`}</small>
              </div>
              <div className="attendance-score">
                <strong>{summary.percent}%</strong>
                <small>frequencia</small>
              </div>
            </div>

            <div className="attendance-metrics">
              <span><strong>{summary.total}</strong> alunos</span>
              <span><strong>{summary.present}</strong> presentes</span>
              <span><strong>{summary.absent}</strong> faltas</span>
              <span><strong>{summary.justified}</strong> justificadas</span>
              <span><strong>{summary.contact}</strong> contato</span>
            </div>

            <div className="attendance-toolbar">
              <label>
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
              {selectedEvent ? (
                <button className="primary-action" disabled={!classMembers.length || Boolean(session)} onClick={() => startAttendanceSession(area, classRecord, selectedEvent)} type="button">
                  {session ? "Chamada iniciada" : "Iniciar chamada de hoje"}
                </button>
              ) : (
                <button className="primary-action" onClick={() => setActiveModule("events")} type="button">
                  Criar aula na agenda
                </button>
              )}
              {session && (
                <button className="secondary" onClick={() => printAttendanceSessionPdf(area, classRecord, session)} type="button">
                  Salvar PDF
                </button>
              )}
            </div>

            {!classMembers.length && (
              <div className="data-row attendance-empty">
                <span className="bullet-mark" />
                <div>
                  <strong>Nenhum aluno matriculado nesta classe</strong>
                  <small>Vincule alunos a esta classe na ficha de membros para liberar a chamada.</small>
                </div>
              </div>
            )}

            {selectedEvent && classMembers.length > 0 && (
              <div className="attendance-student-grid">
                {classMembers.map((member) => {
                  const status = attendanceStatusForMember(session, member.id);
                  const note = attendanceNoteForMember(session, member.id);
                  const noteKey = `${area}-${classRecord.id}-${selectedEvent.id}-${member.id}`;
                  const noteOpen = Boolean(openAttendanceNoteIds[noteKey]);

                  return (
                    <div className={`attendance-student-card attendance-${status.toLowerCase().replaceAll(" ", "-")}`} key={member.id}>
                      <div className="attendance-student-info">
                        <span>{member.fullName.slice(0, 1)}</span>
                        <div>
                          <strong>{member.fullName}</strong>
                          <small>{member.phone || "Telefone nao informado"} - {member.status}</small>
                        </div>
                      </div>
                      <div className="attendance-status-buttons">
                        {statusOptions.map((option) => (
                          <button
                            className={status === option.status ? `active ${option.style}` : option.style}
                            key={option.status}
                            onClick={() => updateAttendanceRecord(area, classRecord, selectedEvent, member, option.status)}
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <button
                        className="attendance-note-toggle"
                        onClick={() => setOpenAttendanceNoteIds((current) => ({ ...current, [noteKey]: !current[noteKey] }))}
                        type="button"
                      >
                        {note ? "Editar observacao" : "Observacao"}
                      </button>
                      {noteOpen && (
                        <input
                          onChange={(event) => updateAttendanceNote(area, classRecord, selectedEvent, member, event.target.value)}
                          placeholder="Justificativa ou observacao"
                          value={note}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="attendance-history">
              <div className="panel-heading compact-heading">
                <h2>Historico de chamadas</h2>
                <span>{classHistory.length} registro{classHistory.length === 1 ? "" : "s"}</span>
              </div>
              {classHistory.length ? (
                classHistory.map((attendanceSession) => {
                  const sessionSummary = attendanceSummary(attendanceSession, classMembers);
                  return (
                    <div className="data-row attendance-history-row" key={attendanceSession.id}>
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
          <div className="member-attendance-view">
            <div className="attendance-class-summary">
              <div>
                <span>Sua frequencia nesta classe</span>
                <strong>{classRecord.name}</strong>
                <small>{currentMemberHistory.length ? "Ultimas aulas registradas abaixo." : "Sua frequencia ainda nao foi registrada nesta classe."}</small>
              </div>
            </div>
            {currentMemberHistory.length ? (
              currentMemberHistory.map(({ session: attendanceSession, record }) => (
                <div className="data-row attendance-history-row" key={attendanceSession.id}>
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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setSyncStatus("Kids salvo localmente; faca login Supabase para sincronizar.");
      return;
    }

    const response = await fetch("/api/admin/kids-profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(kid),
    });

    setSyncStatus(response.ok ? "Cadastro Kids sincronizado com Supabase." : "Kids salvo localmente; nao foi possivel sincronizar agora.");
  }

  async function saveMessageCampaignToSupabase(recipients: MessageRecipient[]) {
    const supabase = getSupabaseClient();
    if (!supabase || !recipients.length) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSyncStatus("Mensagens abertas localmente; faca login Supabase para registrar campanha.");
      return;
    }

    const response = await fetch("/api/admin/message-campaigns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        audience: messageAudience,
        body: messageText,
        recipients,
      }),
    });

    setSyncStatus(response.ok ? "Campanha registrada no Supabase." : "Mensagens abertas; campanha nao foi salva no Supabase.");
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
    <main className={`min-h-screen bg-[var(--background)] text-[var(--foreground)]${isSimpleView ? " simple-view" : ""}`}>
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
              {saveState === "conflict" && <small>Salvamento pausado para proteger os dados.</small>}
              {(saveState === "error" || saveState === "conflict") && hasSession && isSupabaseConfigured() && (
                <button className="sync-reload-button" onClick={reloadRemoteStateNow} type="button">
                  {saveState === "conflict" ? "Recarregar antes de continuar" : "Recarregar dados da base"}
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
              <PushNotificationControl />
              {!isAdminView && (
                <button
                  className={isSimpleView ? "simple-mode-toggle active" : "simple-mode-toggle"}
                  onClick={() => setSimpleViewEnabled((enabled) => !enabled)}
                  type="button"
                >
                  {isSimpleView ? "Visual normal" : "Visual simples"}
                </button>
              )}
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

          {saveState === "conflict" && (
            <div className="conflict-banner" role="alert">
              <div>
                <strong>Existe uma versao mais recente salva na base.</strong>
                <span>Outro aparelho salvou antes de voce. Para proteger os cadastros, baixe um backup desta tela se precisar e atualize os dados da base.</span>
              </div>
              <div className="conflict-actions">
                <button className="secondary" onClick={() => downloadCurrentBackup("conflito")} type="button">
                  Baixar backup antes
                </button>
                <button onClick={reloadRemoteStateNow} type="button">
                  Atualizar dados da base
                </button>
              </div>
            </div>
          )}

          {activeModule === "overview" && (isAdminView ? (
            <section className="content-grid overview-streaming admin-overview">
              <div className={featuredMuralImage ? "hero-panel streaming-cover mural-hero-cover" : "hero-panel streaming-cover"}>
                {featuredMuralImage && (
                  <div className="mural-hero-background" aria-hidden="true">
                    <ResponsiveImage src={featuredMuralImage} />
                  </div>
                )}
                <p className="eyebrow">Painel inteligente da igreja</p>
                <h2>Prioridades, pessoas e grupos em tempo real.</h2>
                <p>
                  Acompanhe pedidos pastorais, eventos, comunicados e a rotina da igreja em uma central viva,
                  pronta para crescer com dados reais.
                </p>
                {featuredMuralItem && <span className="mural-hero-label">Destaque do mural: {featuredMuralItem.title}</span>}
                <div className="smart-hero-strip" aria-label="Resumo do painel inteligente">
                  <button onClick={() => setActiveModule("events")} type="button">
                    <span>Hoje na igreja</span>
                    <strong>{nextAgendaEvent ? nextAgendaEvent.title : "Sem evento na semana"}</strong>
                    <small>{nextAgendaEvent ? `${formatDate(nextAgendaEvent.date)} - ${nextAgendaEvent.time || "Sem horario"}` : "Cadastre a agenda para aparecer aqui"}</small>
                  </button>
                  <button onClick={() => setActiveModule("members")} type="button">
                    <span>Aniversariantes</span>
                    <strong>{monthlyBirthdays.length}</strong>
                    <small>do mes em destaque</small>
                  </button>
                  <button onClick={() => setActiveModule("overview")} type="button">
                    <span>Pre-cadastros</span>
                    <strong>{pendingRegistrationRequests.length}</strong>
                    <small>aguardando analise</small>
                  </button>
                  <button onClick={() => setActiveModule("pastoral")} type="button">
                    <span>Pastoral</span>
                    <strong>{unassignedCareCount}</strong>
                    <small>sem responsavel</small>
                  </button>
                </div>
                <div className="hero-actions">
                  <button onClick={() => setActiveModule("pastoral")} type="button">
                    Abrir fila pastoral
                  </button>
                  <button className="secondary" onClick={() => setNotificationsOpen(true)} type="button">
                    Ver acoes de hoje
                  </button>
                </div>
              </div>

              <div className="action-strip streaming-rail">
                {actionHighlights.filter((item) => canAccessModule(currentAccessRole, item.module)).map((item) => (
                  <button className={`action-tile ${moduleCoverClass(item.cover)}`} key={item.label} onClick={() => setActiveModule(item.module)} type="button">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.hint}</small>
                  </button>
                ))}
              </div>

              <article className="surface wide streaming-section today-panel">
                <div className="panel-heading">
                  <h2>Hoje na igreja</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Abrir agenda
                  </button>
                </div>
                <div className="today-grid">
                  <div>
                    <span>Proximo compromisso</span>
                    <strong>{nextAgendaEvent ? nextAgendaEvent.title : "Nenhum evento nesta semana"}</strong>
                    <small>{nextAgendaEvent ? `${formatDate(nextAgendaEvent.date)} - ${nextAgendaEvent.location || "Local nao informado"}` : "Quando a agenda for preenchida, o proximo evento aparece aqui."}</small>
                  </div>
                  <div>
                    <span>Mural publicado</span>
                    <strong>{publishedMuralItems.length}</strong>
                    <small>{featuredMuralItem ? featuredMuralItem.title : "Nenhum destaque publicado"}</small>
                  </div>
                  <div>
                    <span>Acoes pendentes</span>
                    <strong>{pendingRegistrationRequests.length + unassignedCareCount}</strong>
                    <small>pre-cadastros e pedidos sem responsavel</small>
                  </div>
                </div>
              </article>

              <article className="surface wide streaming-section priority-panel">
                <div className="panel-heading">
                  <h2>Pendencias importantes</h2>
                  <span>Para revisar primeiro</span>
                </div>
                <div className="priority-grid">
                  <button onClick={() => setActiveModule("overview")} type="button">
                    <strong>{pendingRegistrationRequests.length}</strong>
                    <span>pre-cadastros aguardando</span>
                  </button>
                  <button onClick={() => setActiveModule("pastoral")} type="button">
                    <strong>{unassignedCareCount}</strong>
                    <span>pedidos pastorais sem responsavel</span>
                  </button>
                  <button onClick={() => setActiveModule("visitors")} type="button">
                    <strong>{data.visitors.filter((visitor) => !visitor.contactMade).length}</strong>
                    <span>visitantes sem contato</span>
                  </button>
                </div>
              </article>

              <SystemHealthPanel
                agendaCount={data.events.length}
                canReload={hasSession && isSupabaseConfigured()}
                isSupabaseReady={isSupabaseConfigured()}
                kidsCount={data.kids.length}
                lastSavedAt={lastSavedAt}
                memberSyncLoading={currentAccessRole === "Administrador" ? memberSyncLoading : false}
                memberSyncStatus={currentAccessRole === "Administrador" ? memberSyncStatus : null}
                membersCount={data.members.length}
                onMemberSyncRefresh={currentAccessRole === "Administrador" ? () => loadMemberSyncStatus(true) : undefined}
                onPushSummaryRefresh={canManageRegistrationRequests ? loadPushSummary : undefined}
                onReload={reloadRemoteStateNow}
                pendingRegistrationsCount={pendingRegistrationRequests.length}
                pushSummary={canManageRegistrationRequests ? pushSummary : null}
                saveState={saveState}
                syncStatus={syncStatus}
                visitorsCount={data.visitors.length}
              />

              {canManageRegistrationRequests && (
                <RegistrationRequestsPanel
                  copyPublicRegistrationLink={copyPublicRegistrationLink}
                  onApproveMember={approveRegistrationAsMember}
                  onApproveVisitor={approveRegistrationAsVisitor}
                  onDecline={declineRegistrationRequest}
                  onMarkInReview={markRegistrationInReview}
                  onReview={reviewRegistrationRequest}
                  requests={data.registrationRequests}
                />
              )}

              {birthdaySpotlightPanel}

              {publishedDevotional && (
                <article className="surface wide devotional-card streaming-section">
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

              <article className="surface wide streaming-section agenda-preview">
                <div className="panel-heading">
                  <h2>Agenda da semana</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {upcomingPanelEvents.map((event) => (
                    <div className={`data-row ${agendaThemeClass(event)}`} key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>{event.ministry}</small>
                      </div>
                    </div>
                  ))}
                  {!upcomingPanelEvents.length && <p className="empty-state">Nenhum evento restante para esta semana.</p>}
                </div>
              </article>

              <article className="surface streaming-section mural-preview-panel">
                <div className="panel-heading">
                  <h2>Mural da igreja</h2>
                  <span>{data.mural.filter((item) => item.published).length} de 5 publicados</span>
                </div>
                <div className="mural-stack">
                  {publishedMuralItems
                    .map((item) => (
                      <div className={item.featured ? "mural-card featured" : "mural-card"} key={item.id}>
                        {(item.imageDataUrl || item.bannerUrl) && (
                          <div className="mural-card-media">
                            <ResponsiveImage src={item.imageDataUrl || item.bannerUrl} />
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
            <section className="content-grid overview-streaming member-overview">
              <div className={featuredMuralImage ? "hero-panel streaming-cover mural-hero-cover" : "hero-panel streaming-cover"}>
                {featuredMuralImage && (
                  <div className="mural-hero-background" aria-hidden="true">
                    <ResponsiveImage src={featuredMuralImage} />
                  </div>
                )}
                <p className="eyebrow">Area do membro</p>
                <h2>Bem-vindo, {profileName}.</h2>
                <p>Veja sua ficha, acompanhe a agenda, leia os avisos e envie pedidos de atendimento pastoral ou oracao.</p>
                {featuredMuralItem && <span className="mural-hero-label">Destaque do mural: {featuredMuralItem.title}</span>}
                <div className="smart-hero-strip" aria-label="Resumo da area do membro">
                  <button onClick={() => setActiveModule("events")} type="button">
                    <span>Agenda da igreja</span>
                    <strong>{nextAgendaEvent ? nextAgendaEvent.title : "Nada nesta semana"}</strong>
                    <small>{nextAgendaEvent ? formatDate(nextAgendaEvent.date) : "A secretaria ainda nao publicou evento"}</small>
                  </button>
                  <button onClick={() => setActiveModule("mural")} type="button">
                    <span>Avisos e mural</span>
                    <strong>{publishedMuralItems.length}</strong>
                    <small>{featuredMuralItem ? featuredMuralItem.title : "Nenhum aviso publicado hoje"}</small>
                  </button>
                  <button onClick={() => setActiveModule("pastoral")} type="button">
                    <span>Meus pedidos</span>
                    <strong>{pendingCareCount}</strong>
                    <small>Clique aqui para pedir oracao</small>
                  </button>
                </div>
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

              {isSimpleView && (
                <article className="surface wide simple-shortcuts-panel">
                  <div className="panel-heading">
                    <h2>Acesso facil</h2>
                    <span>Toque em um botao para abrir</span>
                  </div>
                  <div className="simple-shortcuts-grid">
                    <button onClick={() => setActiveModule("members")} type="button">
                      <strong>Minha ficha</strong>
                      <span>Atualizar meus dados</span>
                    </button>
                    <button onClick={() => setActiveModule("events")} type="button">
                      <strong>Agenda da igreja</strong>
                      <span>Ver a semana da igreja</span>
                    </button>
                    <button onClick={() => setActiveModule("mural")} type="button">
                      <strong>Avisos e mural</strong>
                      <span>Ver avisos da igreja</span>
                    </button>
                    <button onClick={() => setActiveModule("pastoral")} type="button">
                      <strong>Pedido de oracao</strong>
                      <span>Clique aqui para pedir oracao</span>
                    </button>
                    <button className="simple-logout" onClick={handleLogout} type="button">
                      <strong>Sair</strong>
                      <span>Encerrar acesso</span>
                    </button>
                  </div>
                </article>
              )}

              <article className="surface wide streaming-section member-home-panel">
                <div className="panel-heading">
                  <h2>Para voce</h2>
                  <span>Informacoes principais do seu acesso</span>
                </div>
                <div className="member-home-grid">
                  <button onClick={() => setActiveModule("events")} type="button">
                    <strong>{nextAgendaEvent ? nextAgendaEvent.title : "Agenda livre"}</strong>
                    <span>{nextAgendaEvent ? `${formatDate(nextAgendaEvent.date)} - ${nextAgendaEvent.time || "Sem horario"}` : "Nenhum evento publicado para esta semana."}</span>
                  </button>
                  <button onClick={() => setActiveModule("mural")} type="button">
                    <strong>{featuredMuralItem ? featuredMuralItem.title : "Avisos da igreja"}</strong>
                    <span>{featuredMuralItem ? featuredMuralItem.category : "Nenhum aviso publicado hoje."}</span>
                  </button>
                  <button onClick={() => setActiveModule("school")} type="button">
                    <strong>{memberSchoolName || "Classe EBD nao vinculada"}</strong>
                    <span>Sua classe ainda nao foi vinculada se aparecer este aviso.</span>
                  </button>
                  <button onClick={() => setActiveModule("discipleship")} type="button">
                    <strong>{memberDiscipleshipName || "Discipulado nao vinculado"}</strong>
                    <span>Acompanhe sua turma e frequencia.</span>
                  </button>
                </div>
              </article>

              {birthdaySpotlightPanel}

              {publishedDevotional && (
                <article className="surface wide devotional-card streaming-section">
                  <div className="panel-heading">
                    <h2>{publishedDevotional.title}</h2>
                    <span>{formatDate(publishedDevotional.publishedAt)}</span>
                  </div>
                  <strong>{publishedDevotional.verse}</strong>
                  <p>{publishedDevotional.body}</p>
                </article>
              )}

              <article className="surface streaming-section member-profile-preview">
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

              <article className="surface streaming-section agenda-preview">
                <div className="panel-heading">
                  <h2>Agenda da semana</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {upcomingPanelEvents.map((event) => (
                    <div className={`data-row ${agendaThemeClass(event)}`} key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>
                          {event.time || "Sem horario"} - {event.ministry} - {event.location || "Local nao informado"}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!upcomingPanelEvents.length && <p className="empty-state">Nenhum evento restante para esta semana.</p>}
                </div>
              </article>

              <article className="surface streaming-section notices-preview">
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

              <article className="surface streaming-section mural-preview-panel">
                <div className="panel-heading">
                  <h2>Mural da igreja</h2>
                  <button onClick={() => setActiveModule("mural")} type="button">
                    Ver mural
                  </button>
                </div>
                <div className="mural-stack">
                  {publishedMuralItems
                    .slice(0, 4)
                    .map((item) => (
                      <div className={item.featured ? "mural-card featured" : "mural-card"} key={item.id}>
                        {(item.imageDataUrl || item.bannerUrl) && (
                          <div className="mural-card-media">
                            <ResponsiveImage src={item.imageDataUrl || item.bannerUrl} />
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
                  {!publishedMuralItems.length && (
                    <p className="empty-state">Nenhum item publicado no mural no momento.</p>
                  )}
                </div>
              </article>

              <article className="surface streaming-section care-preview">
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
            <PastoralPanel
              canManagePastoral={canManagePastoral}
              careForm={careForm}
              careStatusFilter={careStatusFilter}
              createCareRequest={createCareRequest}
              currentMemberName={currentMember?.fullName ?? profileName}
              currentMemberPhone={currentMember?.phone ?? careForm.phone}
              filteredCareRequests={filteredCareRequests}
              memberFormTab={memberFormTab}
              pastoralResponsibleOptions={pastoralResponsibleOptions}
              selectedRequest={selectedRequest}
              setCareForm={setCareForm}
              setCareStatusFilter={setCareStatusFilter}
              setSelectedRequestId={setSelectedRequestId}
              statusFlow={statusFlow}
              updateCareRequest={updateCareRequest}
            />
          )}

          {activeModule === "mural" && (
            <MuralPanel
              activeNotices={activeNotices}
              canCreateMuralItem={canCreateMuralItem}
              canManageMural={canManageMural}
              createMuralItem={createMuralItem}
              deleteMuralItem={deleteMuralItem}
              filteredMuralItems={filteredMuralItems}
              muralForm={muralForm}
              muralImageMessage={muralImageMessage}
              readMuralImage={readMuralImage}
              setMuralForm={setMuralForm}
              toggleMural={toggleMural}
              totalPublishedMuralItems={data.mural.filter((item) => item.published).length}
              weekEvents={weekEvents}
            />
          )}

          {activeModule === "events" && (
            <AgendaPanel
              canCreateEvent={canCreateEvent}
              canManageEvents={canManageEvents}
              cancelEventEdit={cancelEventEdit}
              createEvent={createEvent}
              deleteEvent={deleteEvent}
              duplicateEvent={duplicateEvent}
              editEvent={editEvent}
              editingEventId={editingEventId}
              eventForm={eventForm}
              eventGroupFilter={eventGroupFilter}
              eventStatusFilter={eventStatusFilter}
              exportReport={exportReport}
              groupOptions={groupOptions}
              setEventForm={setEventForm}
              setEventGroupFilter={setEventGroupFilter}
              setEventStatusFilter={setEventStatusFilter}
              setEventWeekOffset={setEventWeekOffset}
              totalEvents={data.events.length}
              updateEventStatus={updateEventStatus}
              weekEvents={weekEvents}
            />
          )}

          {activeModule === "notices" && (
            <NoticesPanel
              activeNotices={activeNotices}
              canCreateNotice={canCreateNotice}
              canManageNotices={canManageNotices}
              createNotice={createNotice}
              deleteNotice={deleteNotice}
              noticeForm={noticeForm}
              setNoticeForm={setNoticeForm}
            />
          )}

          {activeModule === "users" && (
            <UsersAccessPanel
              canCreateUser={canCreateUser}
              createUser={createUser}
              data={data}
              deleteAccessUser={deleteAccessUser}
              selectedAccessExistingUser={selectedAccessExistingUser}
              selectedAccessMember={selectedAccessMember}
              selectedAccessMemberId={selectedAccessMemberId}
              selectAccessMember={selectAccessMember}
              setUserForm={setUserForm}
              updateAccessUserStatus={updateAccessUserStatus}
              userForm={userForm}
            />
          )}

          {activeModule === "visitors" && (
            <VisitorsPanel
              canCreateVisitor={canCreateVisitor}
              canManageMembers={canManageMembers}
              canManageVisitors={canManageVisitors}
              convertVisitorToMember={convertVisitorToMember}
              createVisitor={createVisitor}
              deleteVisitor={deleteVisitor}
              editVisitor={editVisitor}
              editingVisitorId={editingVisitorId}
              exportReport={exportReport}
              filteredVisitors={filteredVisitors}
              setEditingVisitorId={setEditingVisitorId}
              setVisitorContactFilter={setVisitorContactFilter}
              setVisitorForm={setVisitorForm}
              setVisitorStatusFilter={setVisitorStatusFilter}
              visitorContactFilter={visitorContactFilter}
              visitorForm={visitorForm}
              visitorStatusFilter={visitorStatusFilter}
            />
          )}

          {activeModule === "members" && (
            <MembersPanel
              availableMemberFormTabs={availableMemberFormTabs}
              canCreateMember={canCreateMember}
              canManageMembers={canManageMembers}
              canManageUsers={canManageUsers}
              canSaveMemberAccess={canSaveMemberAccess}
              cancelMemberEdit={cancelMemberEdit}
              createMember={createMember}
              currentMember={currentMember}
              data={data}
              deleteMember={deleteMember}
              editMember={editMember}
              editingMemberId={editingMemberId}
              filteredMembers={filteredMembers}
              groupOptions={groupOptions}
              memberAccessMessage={memberAccessMessage}
              memberCredentialForm={memberCredentialForm}
              memberDuplicateCandidate={memberDuplicateCandidate}
              memberDuplicateWarnings={memberDuplicateWarnings}
              memberDiscipleshipFilter={memberDiscipleshipFilter}
              memberForm={memberForm}
              memberFormTab={memberFormTab}
              memberGroupFilter={memberGroupFilter}
              memberPastoralFilter={memberPastoralFilter}
              memberRolesToText={memberRolesToText}
              memberSchoolFilter={memberSchoolFilter}
              memberStatusFilter={memberStatusFilter}
              memberTypeFilter={memberTypeFilter}
              monthlyBirthdays={monthlyBirthdays}
              roleOptions={roleOptions}
              saveMemberAccess={saveMemberAccess}
              selectedMemberRoles={selectedMemberRoles}
              setMemberCredentialForm={setMemberCredentialForm}
              setMemberDiscipleshipFilter={setMemberDiscipleshipFilter}
              setMemberForm={setMemberForm}
              setMemberFormTab={setMemberFormTab}
              setMemberGroupFilter={setMemberGroupFilter}
              setMemberPastoralFilter={setMemberPastoralFilter}
              setMemberSchoolFilter={setMemberSchoolFilter}
              setMemberStatusFilter={setMemberStatusFilter}
              setMemberTypeFilter={setMemberTypeFilter}
              toggleMemberCredentials={toggleMemberCredentials}
              weeklyBirthdays={weeklyBirthdays}
            />
          )}

          {activeModule === "kids" && (
            <KidsPanel
              canCreateKid={canCreateKid}
              canManageKids={canManageKids}
              createKid={createKid}
              deleteKid={deleteKid}
              filteredKids={filteredKids}
              kidClassFilter={kidClassFilter}
              kidForm={kidForm}
              kids={data.kids}
              monthlyKidsBirthdays={monthlyKidsBirthdays}
              readPhoto={readPhoto}
              setKidClassFilter={setKidClassFilter}
              setKidForm={setKidForm}
            />
          )}

          {activeModule === "ministries" && (
            <GroupsPanel
              canCreateMinistry={canCreateMinistry}
              cancelMinistryEdit={cancelMinistryEdit}
              createMinistry={createMinistry}
              deleteMinistry={deleteMinistry}
              editMinistry={editMinistry}
              editingMinistryId={editingMinistryId}
              ministries={data.ministries}
              ministryForm={ministryForm}
              setMinistryForm={setMinistryForm}
            />
          )}

          {activeModule === "school" && (
            <ClassModulePanel
              areaLabel="EBD"
              canCreateNotice={canCreateSchoolNotice}
              canManage={canManageModule(currentAccessRole, "school")}
              classes={data.schoolClasses}
              createNotice={createSchoolNotice}
              members={data.members}
              noticeForm={schoolNoticeForm}
              noticeTitle="Novo aviso da EBD"
              openClassWhatsapp={openClassWhatsapp}
              renderAttendancePanel={(classRecord) => renderAttendancePanel("school", classRecord)}
              setNoticeForm={setSchoolNoticeForm}
              title="Classes da EBD"
              whatsappPlaceholder="Ex.: Material da proxima aula"
            />
          )}

          {activeModule === "discipleship" && (
            <ClassModulePanel
              areaLabel="Discipulado"
              canCreateNotice={canCreateDiscipleshipNotice}
              canManage={canManageModule(currentAccessRole, "discipleship")}
              classes={data.discipleshipClasses}
              createNotice={createDiscipleshipNotice}
              members={data.members}
              noticeForm={discipleshipNoticeForm}
              noticeTitle="Novo aviso do Discipulado"
              openClassWhatsapp={openClassWhatsapp}
              renderAttendancePanel={(classRecord) => renderAttendancePanel("discipleship", classRecord)}
              setNoticeForm={setDiscipleshipNoticeForm}
              title="Classes do Discipulado"
              whatsappPlaceholder="Ex.: Encontro de acompanhamento"
            />
          )}

          {activeModule === "messages" && (
            <CommunicationPanel
              availableMessageTemplates={availableMessageTemplates}
              customTemplateLabel={customTemplateLabel}
              customTemplateText={customTemplateText}
              data={data}
              messageAudience={messageAudience}
              messageAudiences={messageAudiences}
              messageBatchLimit={messageBatchLimit}
              messageGroupFilter={messageGroupFilter}
              groupOptions={groupOptions}
              messageRecipients={messageRecipients}
              messageTemplateId={messageTemplateId}
              messageText={messageText}
              openBulkWhatsapp={openBulkWhatsapp}
              saveCustomMessageTemplate={saveCustomMessageTemplate}
              selectMessageTemplate={selectMessageTemplate}
              selectedMessageRecipientIds={selectedMessageRecipientIds}
              selectedMessageRecipients={selectedMessageRecipients}
              setCustomTemplateLabel={setCustomTemplateLabel}
              setCustomTemplateText={setCustomTemplateText}
              setMessageAudience={setMessageAudience}
              setMessageBatchLimit={setMessageBatchLimit}
              setMessageGroupFilter={setMessageGroupFilter}
              setMessageText={setMessageText}
              setSelectedMessageRecipientIds={setSelectedMessageRecipientIds}
            />
          )}

          {activeModule === "finance" && (
            <FinancePanel
              canCreateTransaction={canCreateTransaction}
              canManageFinance={canManageFinance}
              createTransaction={createTransaction}
              deleteTransaction={deleteTransaction}
              editTransaction={editTransaction}
              editingTransactionId={editingTransactionId}
              exportReport={exportReport}
              filteredTransactions={filteredTransactions}
              financeTypeFilter={financeTypeFilter}
              members={data.members}
              setEditingTransactionId={setEditingTransactionId}
              setFinanceTypeFilter={setFinanceTypeFilter}
              setTransactionForm={setTransactionForm}
              transactionForm={transactionForm}
              transactions={data.transactions}
            />
          )}

          {activeModule === "assets" && (
            <AssetsPanel
              assetConditionFilter={assetConditionFilter}
              assetForm={assetForm}
              canCreateAsset={canCreateAsset}
              canManageAssets={canManageAssets}
              createAsset={createAsset}
              deleteAsset={deleteAsset}
              editAsset={editAsset}
              editingAssetId={editingAssetId}
              exportReport={exportReport}
              filteredAssets={filteredAssets}
              setAssetConditionFilter={setAssetConditionFilter}
              setAssetForm={setAssetForm}
              setEditingAssetId={setEditingAssetId}
            />
          )}

          {activeModule === "devotional" && (
            <DevotionalPanel
              canCreateDevotional={canCreateDevotional}
              canManageDevotional={canManageDevotional}
              createDevotional={createDevotional}
              deleteDevotional={deleteDevotional}
              devotionalForm={devotionalForm}
              devotionals={data.devotionals}
              editDevotional={editDevotional}
              editingDevotionalId={editingDevotionalId}
              setDevotionalForm={setDevotionalForm}
              setEditingDevotionalId={setEditingDevotionalId}
            />
          )}

          {activeModule === "reports" && (
            <ReportsPanel
              absentRows={absentRows}
              currentAccessRole={currentAccessRole}
              data={data}
              exportReport={exportReport}
              monthlyBirthdays={monthlyBirthdays}
              reportPreviewKind={reportPreviewKind}
              selectedReportPreview={selectedReportPreview}
              setReportPreviewKind={setReportPreviewKind}
              weekEvents={weekEvents}
            />
          )}

          {activeModule === "settings" && (
            <SettingsPanel
              activeNotices={activeNotices}
              data={data}
              log={log}
              monthlyBirthdays={monthlyBirthdays}
              monthlyKidsBirthdays={monthlyKidsBirthdays}
              resetLocalData={resetLocalData}
            />
          )}

        </section>
      </div>
    </main>
  );
}

function RegistrationRequestsPanel({
  copyPublicRegistrationLink,
  onApproveMember,
  onApproveVisitor,
  onDecline,
  onMarkInReview,
  onReview,
  requests,
}: {
  copyPublicRegistrationLink: () => void | Promise<void>;
  onApproveMember: (request: RegistrationRequest) => void;
  onApproveVisitor: (request: RegistrationRequest) => void;
  onDecline: (request: RegistrationRequest) => void;
  onMarkInReview: (request: RegistrationRequest) => void;
  onReview: (request: RegistrationRequest) => void;
  requests: RegistrationRequest[];
}) {
  const [statusFilter, setStatusFilter] = useState<RegistrationRequest["status"] | "Ativos" | "Todos">("Ativos");
  const visibleRequests = requests.filter((request) => {
    if (statusFilter === "Todos") return true;
    if (statusFilter === "Ativos") return request.status === "Aguardando aprovacao" || request.status === "Em analise";
    return request.status === statusFilter;
  });
  const activeRequests = requests.filter((request) => request.status === "Aguardando aprovacao" || request.status === "Em analise");
  const statusOptions: Array<{ label: string; value: RegistrationRequest["status"] | "Ativos" | "Todos" }> = [
    { label: "Ativos", value: "Ativos" },
    { label: "Todos", value: "Todos" },
    { label: "Aguardando", value: "Aguardando aprovacao" },
    { label: "Em analise", value: "Em analise" },
    { label: "Aprovados", value: "Aprovado" },
    { label: "Recusados", value: "Recusado" },
  ];

  return (
    <article className="surface wide streaming-section registration-queue-panel" id="registration-queue-panel">
      <div className="panel-heading">
        <div>
          <h2>Pre-cadastros</h2>
          <span>{activeRequests.length} ficha{activeRequests.length === 1 ? "" : "s"} em andamento</span>
        </div>
        <button className="secondary" onClick={copyPublicRegistrationLink} type="button">
          Copiar link de cadastro
        </button>
      </div>

      <div className="registration-status-tabs">
        {statusOptions.map((option) => {
          const total =
            option.value === "Todos"
              ? requests.length
              : option.value === "Ativos"
                ? activeRequests.length
              : requests.filter((request) => request.status === option.value).length;

          return (
            <button
              className={statusFilter === option.value ? "active" : ""}
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              type="button"
            >
              {option.label}
              <span>{total}</span>
            </button>
          );
        })}
      </div>

      {visibleRequests.length ? (
        <div className="registration-request-grid">
          {visibleRequests.map((request) => (
            <div className="registration-request-card" key={request.id}>
              <div>
                <p className="eyebrow">{request.requestedStatus}</p>
                <strong>{request.fullName}</strong>
                <span className={`status-chip ${request.status.toLowerCase().replaceAll(" ", "-")}`}>
                  {request.status}
                </span>
                <small>{request.phone} - {request.email || "E-mail nao informado"}</small>
                <small>
                  {request.city || "Cidade nao informada"} {request.neighborhood ? `- ${request.neighborhood}` : ""}
                </small>
                <small>Enviado em {formatDate(request.createdAt.slice(0, 10))}</small>
              </div>
              {request.notes && <p>{request.notes}</p>}
              <div className="card-actions">
                {request.status === "Aguardando aprovacao" && (
                  <button className="secondary" onClick={() => onMarkInReview(request)} type="button">
                    Marcar em analise
                  </button>
                )}
                {(request.status === "Aguardando aprovacao" || request.status === "Em analise") && (
                  <>
                    <button onClick={() => onReview(request)} type="button">
                      Editar ficha
                    </button>
                    <button className="secondary" onClick={() => onApproveMember(request)} type="button">
                      Aprovar membro
                    </button>
                    <button className="secondary" onClick={() => onApproveVisitor(request)} type="button">
                      Aprovar visitante
                    </button>
                    <button className="danger-action" onClick={() => onDecline(request)} type="button">
                      Recusar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Nenhum pre-cadastro neste filtro. Use o link para receber novas fichas pelo WhatsApp.</p>
      )}
    </article>
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
