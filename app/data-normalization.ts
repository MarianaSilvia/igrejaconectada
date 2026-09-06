import { dateAfterDays, isExpiredDate, replaceLegacyMinistryText } from "./app-helpers";
import type {
  AccessUserForm,
  AppData,
  AssetRecord,
  AttendanceSession,
  CareRequest,
  ChurchEvent,
  DevotionalRecord,
  KidRecord,
  MemberRecord,
  MessageTemplateItem,
  MinistryRecord,
  MuralItem,
  Notice,
  ScheduleRecord,
  SchoolClass,
  TransactionRecord,
  VisitorRecord,
} from "./types";

export const blankCare: Omit<CareRequest, "id" | "createdAt" | "updatedAt"> = {
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

export const blankEvent: Omit<ChurchEvent, "id"> = {
  title: "",
  date: "",
  time: "",
  ministry: "Todos",
  location: "",
  responsible: "",
  recurrence: "Unico",
  status: "Programado",
};

export const blankNotice: Omit<Notice, "id"> = {
  title: "",
  body: "",
  status: "Publicado",
  audience: "Toda igreja",
  channel: "Todos",
  retentionDays: 3,
  expiresAt: "",
};

export const blankMinistry: Omit<MinistryRecord, "id"> = {
  name: "",
  leader: "",
  assistant: "",
  meetingDay: "",
  volunteers: 0,
  status: "Ativo",
  notes: "",
};

export const blankUser: AccessUserForm = {
  name: "",
  email: "",
  password: "",
  role: "Lider",
  status: "Pendente",
};

export const blankMember: Omit<MemberRecord, "id"> = {
  authUserId: "",
  fullName: "",
  fatherName: "",
  motherName: "",
  cpf: "",
  phone: "",
  email: "",
  ageGroup: "",
  age: "",
  gender: "",
  status: "Visitante",
  memberType: "Visitante",
  role: "",
  categories: "",
  ministry: "",
  schoolClassId: "",
  discipleshipClassId: "",
  photoDataUrl: "",
  birthDate: "",
  maritalStatus: "Solteiro(a)",
  education: "",
  spouseName: "",
  address: "",
  zipCode: "",
  city: "",
  neighborhood: "",
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
  createdAt: "",
  notes: "",
};

export const blankVisitor: Omit<VisitorRecord, "id"> = {
  fullName: "",
  phone: "",
  firstVisitDate: "",
  returnDate: "",
  invitedBy: "",
  contactMade: false,
  integrationStatus: "Primeira visita",
  notes: "",
};

export const blankMemberCredential = {
  memberId: "",
  email: "",
  password: "",
};

export const blankKid: Omit<KidRecord, "id"> = {
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

export const blankSchedule: Omit<ScheduleRecord, "id"> = {
  date: "",
  serviceType: "",
  group: "",
  functionName: "",
  assignedTo: "",
  phone: "",
  confirmationStatus: "Pendente",
  notes: "",
};

export const blankTransaction: Omit<TransactionRecord, "id"> = {
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

export const blankAsset: Omit<AssetRecord, "id"> = {
  name: "",
  category: "",
  location: "",
  responsible: "",
  condition: "Bom",
  lastMaintenance: "",
  notes: "",
};

export const blankDevotional: Omit<DevotionalRecord, "id"> = {
  title: "",
  verse: "",
  body: "",
  status: "Rascunho",
  publishedAt: "",
};

export const blankMuralItem: Omit<MuralItem, "id"> = {
  title: "",
  category: "Secretaria",
  published: true,
  featured: false,
  expiresAt: "",
  imageDataUrl: "",
  bannerUrl: "",
  socialUrl: "",
};

export const blankSchoolNotice = {
  classId: "class-adults",
  title: "",
  body: "",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeMessageTemplate(template: MessageTemplateItem): MessageTemplateItem {
  return {
    ...template,
    label: replaceLegacyMinistryText(template.label),
    text: replaceLegacyMinistryText(template.text),
    audience: template.audience ? replaceLegacyMinistryText(template.audience) : template.audience,
  };
}

export function normalizeMember(member: Partial<MemberRecord>): MemberRecord {
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
    ageGroup: member.ageGroup ?? "",
    age: member.age ?? "",
    gender: member.gender ?? "",
    categories: member.categories ?? "",
    education: member.education ?? "",
    spouseName: member.spouseName ?? "",
    zipCode: member.zipCode ?? "",
    city: member.city ?? "",
    neighborhood: member.neighborhood ?? "",
    createdAt: member.createdAt ?? member.joinedAt ?? "",
    registrationSource: member.registrationSource ?? "",
    pastoralStatus: member.pastoralStatus ?? "Sem acompanhamento definido",
    memberVisibleNotes: member.memberVisibleNotes ?? "",
  };
}

export function normalizeKid(kid: Partial<KidRecord>): KidRecord {
  return {
    ...blankKid,
    ...kid,
    id: kid.id ?? uid("kid"),
  };
}

export function normalizeEvent(event: Partial<ChurchEvent>): ChurchEvent {
  return {
    ...blankEvent,
    ...event,
    id: event.id ?? uid("event"),
    recurrence: event.recurrence ?? "Unico",
  };
}

export function normalizeNotice(notice: Partial<Notice>): Notice {
  return {
    ...blankNotice,
    ...notice,
    id: notice.id ?? uid("notice"),
    retentionDays: notice.retentionDays ?? 3,
    expiresAt: notice.expiresAt ?? dateAfterDays(notice.retentionDays ?? 3),
  };
}

export function normalizeMinistry(ministry: Partial<MinistryRecord>): MinistryRecord {
  return {
    ...blankMinistry,
    ...ministry,
    id: ministry.id ?? uid("ministry"),
  };
}

export function normalizeVisitor(visitor: Partial<VisitorRecord>): VisitorRecord {
  return {
    ...blankVisitor,
    ...visitor,
    id: visitor.id ?? uid("visitor"),
  };
}

export function normalizeSchedule(schedule: Partial<ScheduleRecord>): ScheduleRecord {
  return {
    ...blankSchedule,
    ...schedule,
    id: schedule.id ?? uid("schedule"),
  };
}

export function normalizeTransaction(transaction: Partial<TransactionRecord>): TransactionRecord {
  return {
    ...blankTransaction,
    ...transaction,
    id: transaction.id ?? uid("transaction"),
    amount: Number(transaction.amount ?? 0),
  };
}

export function normalizeAsset(asset: Partial<AssetRecord>): AssetRecord {
  return {
    ...blankAsset,
    ...asset,
    id: asset.id ?? uid("asset"),
  };
}

export function normalizeDevotional(devotional: Partial<DevotionalRecord>): DevotionalRecord {
  return {
    ...blankDevotional,
    ...devotional,
    id: devotional.id ?? uid("devotional"),
  };
}

export function visitorsFromMembers(members: MemberRecord[]): VisitorRecord[] {
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

export function normalizeMuralItem(item: Partial<MuralItem>): MuralItem {
  return {
    ...blankMuralItem,
    ...item,
    id: item.id ?? uid("mural"),
  };
}

export function normalizeAttendanceSession(session: Partial<AttendanceSession>): AttendanceSession {
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

export function normalizeDiscipleshipClasses(classes: SchoolClass[] | undefined, initialClasses: SchoolClass[]) {
  const currentClasses = classes ?? initialClasses;
  const byId = new Map(currentClasses.map((item) => [item.id, item]));

  return initialClasses.map((template) => {
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

export function normalizeAppData(value: Partial<AppData>, initialData: AppData): AppData {
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
    discipleshipClasses: normalizeDiscipleshipClasses(value.discipleshipClasses, initialData.discipleshipClasses),
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

export function createLocalBackupData(data: AppData): AppData {
  return {
    ...data,
    mural: data.mural.map((item) => ({ ...item, imageDataUrl: "" })),
    members: data.members.map((member) => ({ ...member, photoDataUrl: "" })),
    kids: data.kids.map((kid) => ({ ...kid, photoDataUrl: "" })),
  };
}

export function hasPersistedPayload(value: Partial<AppData> | null | undefined) {
  if (!value) return false;
  return Object.keys(value).some((key) => Array.isArray(value[key as keyof AppData]));
}
