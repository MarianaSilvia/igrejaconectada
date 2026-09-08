import type { AccessRole } from "./permissions";

export type AccessMode = "login" | "recover";

export type CareStatus = "Pendente" | "Em analise" | "Agendado" | "Concluido";

export type CareRequest = {
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

export type ChurchEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  ministry: string;
  location: string;
  responsible: string;
  recurrence: "Unico" | "Semanal" | "Mensal";
  status: "Programado" | "Confirmado" | "Concluido";
};

export type AttendanceArea = "school" | "discipleship";

export type AttendanceStatus = "Presente" | "Falta" | "Justificado" | "Precisa de contato";
export type SaveState = "idle" | "saving" | "saved" | "error";
export type MemberFormTab = "Dados" | "Igreja" | "Classes" | "Observacoes" | "Acesso";

export type AttendanceRecord = {
  memberId: string;
  status: AttendanceStatus;
  note: string;
};

export type AttendanceSession = {
  id: string;
  area: AttendanceArea;
  classId: string;
  eventId: string;
  date: string;
  title: string;
  teacher: string;
  records: AttendanceRecord[];
  updatedAt: string;
};

export type Notice = {
  id: string;
  title: string;
  body: string;
  status: "Publicado" | "Rascunho";
  audience: string;
  channel: "App" | "WhatsApp" | "Mural" | "Todos";
  retentionDays: number;
  expiresAt: string;
};

export type MuralItem = {
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

export type MuralImageResult = {
  dataUrl: string;
  message: string;
};

export type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: AccessRole;
  status: "Ativo" | "Pendente" | "Bloqueado";
};

export type AccessUserForm = Omit<AccessUser, "id"> & {
  password: string;
};

export type MemberRecord = {
  id: string;
  authUserId?: string;
  memberCode: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  cpf: string;
  phone: string;
  email: string;
  ageGroup: string;
  age: string;
  gender: string;
  status: "Membro ativo" | "Visitante" | "Novo convertido" | "Transferencia";
  memberType: "Membro" | "Visitante" | "Congregado" | "Lideranca";
  role: string;
  categories: string;
  ministry: string;
  schoolClassId: string;
  discipleshipClassId: string;
  photoDataUrl: string;
  birthDate: string;
  maritalStatus: string;
  education: string;
  spouseName: string;
  address: string;
  zipCode: string;
  city: string;
  neighborhood: string;
  congregation: string;
  previousChurch: string;
  conversionDate: string;
  baptismDate: string;
  registrationSource: string;
  pastoralStatus: string;
  memberVisibleNotes: string;
  waterBaptized: boolean;
  holySpiritBaptized: boolean;
  joinedAt: string;
  createdAt: string;
  notes: string;
};

export type RegistrationRequest = {
  id: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  cpf: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  zipCode: string;
  city: string;
  neighborhood: string;
  maritalStatus: string;
  education: string;
  spouseName: string;
  requestedStatus: "Visitante" | "Novo convertido" | "Membro ativo";
  registrationSource: string;
  notes: string;
  status: "Aguardando aprovacao" | "Em analise" | "Aprovado" | "Recusado";
  createdAt: string;
  reviewedAt: string;
  reviewNote: string;
};

export type VisitorRecord = {
  id: string;
  fullName: string;
  phone: string;
  firstVisitDate: string;
  returnDate: string;
  invitedBy: string;
  contactMade: boolean;
  integrationStatus: "Primeira visita" | "Retornou" | "Em acompanhamento" | "Integrado";
  notes: string;
};

export type KidRecord = {
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

export type MessageAudience =
  | "Todos os membros"
  | "Aniversariantes da semana"
  | "Aniversariantes do mes"
  | "EBD"
  | "Discipulado"
  | "Grupos"
  | "Visitantes"
  | "Escalas"
  | "Responsaveis Kids";

export type MessageRecipient = {
  id: string;
  name: string;
  phone: string;
  group: string;
};

export type MessageTemplateItem = {
  id: string;
  label: string;
  text: string;
  audience?: string;
  isBirthday?: boolean;
};

export type MessageCampaign = {
  id: string;
  audience: MessageAudience;
  templateId: string;
  text: string;
  recipientCount: number;
  createdAt: string;
};

export type SchoolClass = {
  id: string;
  name: string;
  teacher: string;
  students: number;
  nextLesson: string;
  notices: Notice[];
};

export type MinistryRecord = {
  id: string;
  name: string;
  leader: string;
  assistant: string;
  meetingDay: string;
  volunteers: number;
  status: "Ativo" | "Em formacao" | "Pausado";
  notes: string;
};

export type ScheduleRecord = {
  id: string;
  date: string;
  serviceType: string;
  group: string;
  functionName: string;
  assignedTo: string;
  phone: string;
  confirmationStatus: "Pendente" | "Confirmado" | "Substituir";
  notes: string;
};

export type ReportKind =
  | "members"
  | "visitors"
  | "birthdays"
  | "kids"
  | "agenda"
  | "schedules"
  | "attendance"
  | "absences"
  | "finance"
  | "assets";

export type TransactionRecord = {
  id: string;
  date: string;
  type: "Entrada" | "Saida" | "Dizimo" | "Oferta";
  category: string;
  description: string;
  amount: number;
  method: string;
  status: "Pendente" | "Confirmado";
  memberName: string;
  notes: string;
};

export type AssetRecord = {
  id: string;
  name: string;
  category: string;
  location: string;
  responsible: string;
  condition: "Novo" | "Bom" | "Manutencao" | "Baixado";
  lastMaintenance: string;
  notes: string;
};

export type DevotionalRecord = {
  id: string;
  title: string;
  verse: string;
  body: string;
  status: "Publicado" | "Rascunho" | "Arquivado";
  publishedAt: string;
};

export type AuditItem = {
  id: string;
  action: string;
  when: string;
};

export type AppData = {
  careRequests: CareRequest[];
  events: ChurchEvent[];
  notices: Notice[];
  mural: MuralItem[];
  users: AccessUser[];
  members: MemberRecord[];
  registrationRequests: RegistrationRequest[];
  visitors: VisitorRecord[];
  kids: KidRecord[];
  schoolClasses: SchoolClass[];
  discipleshipClasses: SchoolClass[];
  ministries: MinistryRecord[];
  schedules: ScheduleRecord[];
  attendanceSessions: AttendanceSession[];
  messageTemplates: MessageTemplateItem[];
  messageCampaigns: MessageCampaign[];
  transactions: TransactionRecord[];
  assets: AssetRecord[];
  devotionals: DevotionalRecord[];
  audit: AuditItem[];
  notificationReadIds: string[];
};

export type RemoteAppStateResponse = {
  payload?: Partial<AppData> | null;
  updatedAt?: string | null;
  error?: string;
};
