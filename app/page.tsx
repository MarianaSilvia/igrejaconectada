"use client";

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";

type ModuleKey =
  | "overview"
  | "users"
  | "members"
  | "events"
  | "ministries"
  | "notices"
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
  { key: "events", label: "Agenda", short: "Agenda" },
  { key: "ministries", label: "Ministerios", short: "Ministerios" },
  { key: "notices", label: "Comunicados", short: "Avisos" },
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
  const [muralForm, setMuralForm] = useState(blankMuralItem);
  const [schoolNoticeForm, setSchoolNoticeForm] = useState(blankSchoolNotice);
  const [selectedRequestId, setSelectedRequestId] = useState("care-1");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
  const canCreateUser = Boolean(userForm.name.trim() && userForm.email.trim());
  const canCreateMember = Boolean(memberForm.fullName.trim() && memberForm.phone.trim());
  const canCreateMuralItem = Boolean(muralForm.title.trim() && muralForm.expiresAt);
  const canCreateSchoolNotice = Boolean(schoolNoticeForm.classId && schoolNoticeForm.title.trim() && schoolNoticeForm.body.trim());
  const canCreateEvent = Boolean(eventForm.title.trim() && eventForm.date);
  const canCreateNotice = Boolean(noticeForm.title.trim() && noticeForm.body.trim());
  const canCreateMinistry = Boolean(ministryForm.name.trim() && ministryForm.leader.trim());

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
                <div className="row-list">
                  {data.members.map((member) => (
                    <div className="data-row member-row" key={member.id}>
                      <div className="member-avatar">
                        {member.photoDataUrl ? <img alt="" src={member.photoDataUrl} /> : member.fullName.slice(0, 1)}
                      </div>
                      <div>
                        <strong>{member.fullName}</strong>
                        <small>
                          {member.memberType} - {member.status} - {member.role || "Sem funcao"} - {member.phone}
                        </small>
                        <small>{member.ministry || "Sem ministerio"} - {member.congregation || "Congregacao nao informada"}</small>
                      </div>
                    </div>
                  ))}
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

          {activeModule === "reports" && (
            <SimpleModule
              action={() => log("Relatorio operacional gerado")}
              button="Gerar registro"
              description="Resumo local para acompanhar operacao antes da integracao final."
              rows={[
                `${data.careRequests.length} atendimentos pastorais`,
                `${data.members.length} membros cadastrados`,
                `${data.users.length} usuarios com acesso`,
                `${data.schoolClasses.length} classes EBD`,
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
                    {data.members.length} membros, {data.users.length} usuarios, {data.careRequests.length} atendimentos,
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
