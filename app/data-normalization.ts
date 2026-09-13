import { ageFromBirthDate, ageGroupFromBirthDate, dateAfterDays, isExpiredDate, memberGroupNames, replaceLegacyMinistryText } from "./app-helpers";
import { globalCongregationScope, normalizeCongregationScope } from "./congregation-scope";
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
  RegistrationRequest,
  SchoolClass,
  TransactionRecord,
  VisitorRecord,
} from "./types";

export const blankCare: Omit<CareRequest, "id" | "createdAt" | "updatedAt"> = {
  congregation: "",
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
  congregation: "",
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
  congregation: globalCongregationScope,
  title: "",
  body: "",
  status: "Publicado",
  audience: "Toda igreja",
  channel: "Todos",
  retentionDays: 3,
  expiresAt: "",
};

export const blankMinistry: Omit<MinistryRecord, "id"> = {
  congregation: "",
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
  password: "123456",
  role: "Lider",
  status: "Pendente",
  congregationScope: globalCongregationScope,
};

export const blankMember: Omit<MemberRecord, "id"> = {
  authUserId: "",
  memberCode: "",
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
  ministries: [],
  ministerialFunction: "",
  schoolClassId: "",
  discipleshipClassId: "",
  photoDataUrl: "",
  photoUrl: "",
  photoFileKey: "",
  photoConsent: false,
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
  congregation: "",
  fullName: "",
  phone: "",
  firstVisitDate: "",
  returnDate: "",
  invitedBy: "",
  contactMade: false,
  integrationStatus: "Primeira visita",
  notes: "",
};

export const blankRegistrationRequest: Omit<RegistrationRequest, "id" | "createdAt" | "reviewedAt" | "reviewNote"> = {
  congregation: "",
  fullName: "",
  fatherName: "",
  motherName: "",
  cpf: "",
  phone: "",
  email: "",
  birthDate: "",
  gender: "",
  address: "",
  zipCode: "",
  city: "",
  neighborhood: "",
  maritalStatus: "Solteiro(a)",
  education: "",
  spouseName: "",
  requestedStatus: "Visitante",
  registrationSource: "Cadastro via link WhatsApp",
  notes: "",
  status: "Aguardando aprovacao",
};

export const blankMemberCredential = {
  memberId: "",
  email: "",
  password: "123456",
};

export const blankKid: Omit<KidRecord, "id"> = {
  congregation: "",
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
  congregation: globalCongregationScope,
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

const memberCodePrefix = "CDG";

function memberCodeNumber(memberCode: string | undefined) {
  const match = memberCode?.trim().toUpperCase().match(/^CDG(\d+)$/);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function formatMemberCode(sequence: number) {
  return `${memberCodePrefix}${String(sequence).padStart(4, "0")}`;
}

export function nextMemberCode(members: Pick<MemberRecord, "memberCode">[]) {
  const lastSequence = members.reduce((highest, member) => Math.max(highest, memberCodeNumber(member.memberCode)), 0);
  return formatMemberCode(lastSequence + 1);
}

function ensureMemberCodes(members: MemberRecord[]) {
  let nextSequence = members.reduce((highest, member) => Math.max(highest, memberCodeNumber(member.memberCode)), 0) + 1;

  return members.map((member) => {
    if (member.memberCode?.trim()) return member;
    const memberCode = formatMemberCode(nextSequence);
    nextSequence += 1;
    return { ...member, memberCode };
  });
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
  const automaticAge = ageFromBirthDate(member.birthDate ?? "");
  const automaticAgeGroup = ageGroupFromBirthDate(member.birthDate ?? "");
  const ministries = memberGroupNames({
    ministry: member.ministry ?? "",
    ministries: Array.isArray(member.ministries) ? member.ministries : [],
  } as Pick<MemberRecord, "ministry" | "ministries">);

  return {
    ...blankMember,
    ...member,
    id: member.id ?? uid("member"),
    memberCode: member.memberCode ?? "",
    status,
    memberType,
    ministry: ministries[0] ?? "",
    ministries,
    ministerialFunction: member.ministerialFunction ?? "",
    photoDataUrl: "",
    photoUrl: member.photoUrl ?? "",
    photoFileKey: member.photoFileKey ?? "",
    photoConsent: member.photoConsent === true,
    conversionDate: member.conversionDate ?? "",
    baptismDate: member.baptismDate ?? "",
    ageGroup: automaticAgeGroup || member.ageGroup || "",
    age: automaticAge || member.age || "",
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

function normalizeAccessUser(user: Partial<AppData["users"][number]>): AppData["users"][number] {
  return {
    id: user.id ?? uid("user"),
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "Membro",
    status: user.status ?? "Ativo",
    congregationScope: normalizeCongregationScope(user.congregationScope),
  };
}

export function normalizeRegistrationRequest(request: Partial<RegistrationRequest>): RegistrationRequest {
  return {
    ...blankRegistrationRequest,
    ...request,
    id: request.id ?? uid("registration"),
    congregation: request.congregation ?? "",
    requestedStatus: request.requestedStatus ?? "Visitante",
    status: request.status ?? "Aguardando aprovacao",
    createdAt: request.createdAt ?? new Date().toISOString(),
    reviewedAt: request.reviewedAt ?? "",
    reviewNote: request.reviewNote ?? "",
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
      congregation: member.congregation,
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

type LegacyAppData = Partial<AppData> & { schedules?: unknown };

export function normalizeAppData(value: LegacyAppData, initialData: AppData): AppData {
  const safeValue = { ...value };
  delete safeValue.schedules;
  const normalizedMembers = ensureMemberCodes((safeValue.members ?? initialData.members).map((member) => normalizeMember(member)));
  const normalizedVisitors = safeValue.visitors?.length
    ? safeValue.visitors.map((visitor) => normalizeVisitor(visitor))
    : visitorsFromMembers(normalizedMembers);

  return {
    ...initialData,
    ...safeValue,
    careRequests: safeValue.careRequests ?? initialData.careRequests,
    events: (safeValue.events ?? initialData.events).map((event) => normalizeEvent(event)),
    notices: (safeValue.notices ?? initialData.notices).map((notice) => normalizeNotice(notice)).filter((notice) => !isExpiredDate(notice.expiresAt)),
    mural: (safeValue.mural ?? initialData.mural).map((item) => normalizeMuralItem(item)),
    users: (safeValue.users ?? initialData.users).map((user) => normalizeAccessUser(user)),
    members: normalizedMembers,
    registrationRequests: (safeValue.registrationRequests ?? initialData.registrationRequests ?? []).map((request) =>
      normalizeRegistrationRequest(request),
    ),
    visitors: normalizedVisitors,
    kids: (safeValue.kids ?? initialData.kids).map((kid) => normalizeKid(kid)),
    schoolClasses: safeValue.schoolClasses ?? initialData.schoolClasses,
    discipleshipClasses: normalizeDiscipleshipClasses(safeValue.discipleshipClasses, initialData.discipleshipClasses),
    ministries: (safeValue.ministries ?? initialData.ministries).map((ministry) => normalizeMinistry(ministry)),
    attendanceSessions: (safeValue.attendanceSessions ?? initialData.attendanceSessions).map((session) =>
      normalizeAttendanceSession(session),
    ),
    messageTemplates: (safeValue.messageTemplates ?? initialData.messageTemplates).map((template) => normalizeMessageTemplate(template)),
    messageCampaigns: safeValue.messageCampaigns ?? initialData.messageCampaigns,
    transactions: (safeValue.transactions ?? initialData.transactions).map((transaction) => normalizeTransaction(transaction)),
    assets: (safeValue.assets ?? initialData.assets).map((asset) => normalizeAsset(asset)),
    devotionals: (safeValue.devotionals ?? initialData.devotionals).map((devotional) => normalizeDevotional(devotional)),
    audit: safeValue.audit ?? initialData.audit,
    notificationReadIds: safeValue.notificationReadIds ?? initialData.notificationReadIds,
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
