import { ageFromBirthDate, ageGroupFromBirthDate, currentDateKey, eventDate, isExpiredDate, memberGroupNames } from "./app-helpers";
import { nextMemberCode } from "./data-normalization";
import type {
  AccessUser,
  AppData,
  AssetRecord,
  CareRequest,
  ChurchEvent,
  DevotionalRecord,
  MemberRecord,
  MinistryRecord,
  MuralItem,
  Notice,
  RegistrationRequest,
  TransactionRecord,
  VisitorRecord,
} from "./types";

type IdFactory = (prefix: string) => string;
type MemberForm = Omit<MemberRecord, "id">;
type VisitorForm = Omit<VisitorRecord, "id">;
type EventForm = Omit<ChurchEvent, "id">;
type CareForm = Omit<CareRequest, "id" | "createdAt" | "updatedAt">;
type MuralForm = Omit<MuralItem, "id">;
type NoticeForm = Omit<Notice, "id">;
type MinistryForm = Omit<MinistryRecord, "id">;
type TransactionForm = Omit<TransactionRecord, "id">;
type AssetForm = Omit<AssetRecord, "id">;
type DevotionalForm = Omit<DevotionalRecord, "id">;

function auditItem(createId: IdFactory, action: string, when = new Date().toISOString()) {
  return { id: createId("audit"), action, when };
}

function visitorFromMember(member: MemberRecord, today: string): VisitorRecord {
  return {
    id: `visitor-${member.id}`,
    fullName: member.fullName,
    phone: member.phone,
    firstVisitDate: member.joinedAt || today,
    returnDate: "",
    invitedBy: member.registrationSource,
    contactMade: member.pastoralStatus !== "Precisa de contato",
    integrationStatus: member.status === "Novo convertido" ? "Em acompanhamento" : "Primeira visita",
    notes: member.notes,
  };
}

function memberFromRegistration(request: RegistrationRequest, blankMember: MemberForm, createId: IdFactory, memberType: MemberRecord["memberType"]): MemberRecord {
  const now = new Date().toISOString();
  const status = memberType === "Membro" ? "Membro ativo" : request.requestedStatus === "Novo convertido" ? "Novo convertido" : "Visitante";

  return {
    ...blankMember,
    id: createId("member"),
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
    createdAt: request.createdAt || now,
    notes: request.notes,
  };
}

function visitorFromRegistration(request: RegistrationRequest, createId: IdFactory): VisitorRecord {
  return {
    id: createId("visitor"),
    fullName: request.fullName,
    phone: request.phone,
    firstVisitDate: request.createdAt.slice(0, 10),
    returnDate: "",
    invitedBy: request.registrationSource || "Cadastro via link WhatsApp",
    contactMade: false,
    integrationStatus: request.requestedStatus === "Novo convertido" ? "Em acompanhamento" : "Primeira visita",
    notes: request.notes,
  };
}

export function upsertMemberData(data: AppData, form: MemberForm, editingMemberId: string | null, createId: IdFactory): AppData {
  const now = new Date().toISOString();
  const existingMember = editingMemberId ? data.members.find((item) => item.id === editingMemberId) : undefined;
  const automaticAge = ageFromBirthDate(form.birthDate);
  const automaticAgeGroup = ageGroupFromBirthDate(form.birthDate);
  const ministries = memberGroupNames(form);
  const member: MemberRecord = {
    ...form,
    id: editingMemberId ?? createId("member"),
    memberCode: form.memberCode || existingMember?.memberCode || nextMemberCode(data.members),
    ministry: ministries[0] ?? "",
    ministries,
    ministerialFunction: form.ministerialFunction || "",
    age: automaticAge || form.age,
    ageGroup: automaticAgeGroup || form.ageGroup,
    createdAt: form.createdAt || now,
  };
  const shouldTrackAsVisitor = member.memberType === "Visitante" || member.status === "Visitante" || member.status === "Novo convertido";

  return {
    ...data,
    members: editingMemberId ? data.members.map((item) => (item.id === editingMemberId ? member : item)) : [member, ...data.members],
    visitors: shouldTrackAsVisitor
      ? [visitorFromMember(member, currentDateKey()), ...data.visitors.filter((visitor) => visitor.id !== `visitor-${member.id}`)]
      : data.visitors,
    audit: [
      auditItem(createId, editingMemberId ? `Ficha atualizada: ${member.fullName}` : `Membro cadastrado: ${member.fullName}`, now),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function approveRegistrationAsMemberData(
  data: AppData,
  request: RegistrationRequest,
  blankMember: MemberForm,
  createId: IdFactory,
  memberType: MemberRecord["memberType"] = "Membro",
): AppData {
  const now = new Date().toISOString();
  const member = memberFromRegistration(request, blankMember, createId, memberType);
  const withMember = upsertMemberData(data, member, null, createId);

  return {
    ...withMember,
    registrationRequests: data.registrationRequests.map((item) =>
      item.id === request.id ? { ...item, status: "Aprovado", reviewedAt: now, reviewNote: `Aprovado como ${memberType}` } : item,
    ),
    audit: [auditItem(createId, `Pre-cadastro aprovado: ${request.fullName}`, now), ...withMember.audit].slice(0, 12),
  };
}

export function approveRegistrationAsVisitorData(data: AppData, request: RegistrationRequest, createId: IdFactory): AppData {
  const now = new Date().toISOString();
  const visitor = visitorFromRegistration(request, createId);

  return {
    ...data,
    visitors: [visitor, ...data.visitors],
    registrationRequests: data.registrationRequests.map((item) =>
      item.id === request.id ? { ...item, status: "Aprovado", reviewedAt: now, reviewNote: "Aprovado como visitante" } : item,
    ),
    audit: [auditItem(createId, `Pre-cadastro aprovado como visitante: ${request.fullName}`, now), ...data.audit].slice(0, 12),
  };
}

export function declineRegistrationRequestData(data: AppData, request: RegistrationRequest, createId: IdFactory): AppData {
  const now = new Date().toISOString();

  return {
    ...data,
    registrationRequests: data.registrationRequests.map((item) =>
      item.id === request.id ? { ...item, status: "Recusado", reviewedAt: now, reviewNote: "Recusado pela administracao" } : item,
    ),
    audit: [auditItem(createId, `Pre-cadastro recusado: ${request.fullName}`, now), ...data.audit].slice(0, 12),
  };
}

export function deleteMemberData(data: AppData, member: MemberRecord, createId: IdFactory): AppData {
  return {
    ...data,
    members: data.members.filter((item) => item.id !== member.id),
    audit: [auditItem(createId, `Ficha excluida: ${member.fullName}`), ...data.audit].slice(0, 12),
  };
}

export function upsertVisitorData(data: AppData, form: VisitorForm, editingVisitorId: string | null, createId: IdFactory): AppData {
  const visitor: VisitorRecord = { ...form, id: editingVisitorId ?? createId("visitor") };
  return {
    ...data,
    visitors: editingVisitorId ? data.visitors.map((item) => (item.id === editingVisitorId ? visitor : item)) : [visitor, ...data.visitors],
    audit: [
      auditItem(createId, editingVisitorId ? `Visitante atualizado: ${visitor.fullName}` : `Visitante cadastrado: ${visitor.fullName}`),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function deleteVisitorData(data: AppData, visitor: VisitorRecord, createId: IdFactory): AppData {
  return {
    ...data,
    visitors: data.visitors.filter((item) => item.id !== visitor.id),
    audit: [auditItem(createId, `Visitante excluido: ${visitor.fullName}`), ...data.audit].slice(0, 12),
  };
}

export function convertVisitorToMemberData(data: AppData, visitor: VisitorRecord, blankMember: MemberForm, createId: IdFactory): AppData {
  const now = new Date().toISOString();
  const member: MemberRecord = {
    ...blankMember,
    id: createId("member"),
    memberCode: nextMemberCode(data.members),
    fullName: visitor.fullName,
    phone: visitor.phone,
    status: "Membro ativo",
    memberType: "Membro",
    registrationSource: "Visitante integrado",
    pastoralStatus: "Integrado",
    joinedAt: visitor.returnDate || visitor.firstVisitDate || currentDateKey(),
    createdAt: now,
    notes: visitor.notes,
  };

  return {
    ...data,
    members: [member, ...data.members],
    visitors: data.visitors.map((item) =>
      item.id === visitor.id ? { ...item, integrationStatus: "Integrado", contactMade: true, returnDate: item.returnDate || currentDateKey() } : item,
    ),
    audit: [auditItem(createId, `Visitante integrado como membro: ${visitor.fullName}`, now), ...data.audit].slice(0, 12),
  };
}

export function recurringEventsFrom(event: ChurchEvent, createId: IdFactory) {
  if (event.recurrence === "Unico" || !event.date) return [event];

  const total = event.recurrence === "Semanal" ? 4 : 3;
  return Array.from({ length: total }, (_, index) => {
    const date = eventDate(event.date);
    if (!date) return event;
    if (event.recurrence === "Semanal") date.setDate(date.getDate() + index * 7);
    if (event.recurrence === "Mensal") date.setMonth(date.getMonth() + index);
    return {
      ...event,
      id: index === 0 ? event.id : createId("event"),
      date: date.toISOString().slice(0, 10),
    };
  });
}

export function upsertEventData(data: AppData, form: EventForm, editingEventId: string | null, createId: IdFactory): AppData {
  const now = new Date().toISOString();
  const event: ChurchEvent = { ...form, id: editingEventId ?? createId("event") };
  const eventsToAdd = editingEventId ? [event] : recurringEventsFrom(event, createId);

  return {
    ...data,
    events: editingEventId ? data.events.map((item) => (item.id === editingEventId ? event : item)) : [...eventsToAdd, ...data.events],
    attendanceSessions: editingEventId
      ? data.attendanceSessions.map((session) =>
          session.eventId === editingEventId ? { ...session, date: event.date, title: event.title, updatedAt: now } : session,
        )
      : data.attendanceSessions,
    audit: [
      auditItem(createId, editingEventId ? `Evento atualizado na agenda: ${event.title}` : `Evento adicionado na agenda: ${event.title}`, now),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function updateEventStatusData(data: AppData, event: ChurchEvent, status: ChurchEvent["status"], createId: IdFactory): AppData {
  return {
    ...data,
    events: data.events.map((item) => (item.id === event.id ? { ...item, status } : item)),
    audit: [auditItem(createId, `Evento ${status.toLowerCase()}: ${event.title}`), ...data.audit].slice(0, 12),
  };
}

export function deleteEventData(data: AppData, event: ChurchEvent, createId: IdFactory): AppData {
  return {
    ...data,
    events: data.events.filter((item) => item.id !== event.id),
    audit: [auditItem(createId, `Evento excluido da agenda: ${event.title}`), ...data.audit].slice(0, 12),
  };
}

export function createCareRequestData(
  data: AppData,
  form: CareForm,
  memberName: string,
  memberPhone: string,
  createId: IdFactory,
): { data: AppData; request: CareRequest } {
  const now = new Date().toISOString();
  const request: CareRequest = {
    ...form,
    member: memberName,
    phone: memberPhone,
    id: createId("care"),
    createdAt: now,
    updatedAt: now,
  };

  return {
    request,
    data: {
      ...data,
      careRequests: [request, ...data.careRequests],
      audit: [auditItem(createId, `Pedido pastoral criado para ${request.member}`, now), ...data.audit].slice(0, 12),
    },
  };
}

export function updateCareRequestData(data: AppData, id: string, patch: Partial<CareRequest>, action: string, createId: IdFactory): AppData {
  const now = new Date().toISOString();
  return {
    ...data,
    careRequests: data.careRequests.map((request) => (request.id === id ? { ...request, ...patch, updatedAt: now } : request)),
    audit: [auditItem(createId, action, now), ...data.audit].slice(0, 12),
  };
}

export function deleteCareRequestData(data: AppData, request: CareRequest, createId: IdFactory): AppData {
  return {
    ...data,
    careRequests: data.careRequests.filter((item) => item.id !== request.id),
    audit: [auditItem(createId, `Atendimento pastoral excluido: ${request.member}`), ...data.audit].slice(0, 12),
  };
}

export function upsertMuralItemData(data: AppData, form: MuralForm, createId: IdFactory): AppData {
  const item: MuralItem = { ...form, id: createId("mural") };
  return {
    ...data,
    mural: [item, ...data.mural],
    audit: [auditItem(createId, `Item publicado no mural: ${item.title}`), ...data.audit].slice(0, 12),
  };
}

export function toggleMuralItemData(data: AppData, id: string, field: "published" | "featured", createId: IdFactory): AppData {
  return {
    ...data,
    mural: data.mural.map((item) => (item.id === id ? { ...item, [field]: !item[field] } : item)),
    audit: [auditItem(createId, "Mural atualizado"), ...data.audit].slice(0, 12),
  };
}

export function deleteMuralItemData(data: AppData, item: MuralItem, createId: IdFactory): AppData {
  return {
    ...data,
    mural: data.mural.filter((muralItem) => muralItem.id !== item.id),
    audit: [auditItem(createId, `Item excluido do mural: ${item.title}`), ...data.audit].slice(0, 12),
  };
}

export function createNoticeData(data: AppData, form: NoticeForm, expiresAt: string, createId: IdFactory): AppData {
  const notice: Notice = { ...form, expiresAt, id: createId("notice") };
  return {
    ...data,
    notices: [notice, ...data.notices.filter((item) => !isExpiredDate(item.expiresAt))],
    audit: [auditItem(createId, `Comunicado criado: ${notice.title}`), ...data.audit].slice(0, 12),
  };
}

export function deleteNoticeData(data: AppData, notice: Notice, createId: IdFactory): AppData {
  return {
    ...data,
    notices: data.notices.filter((item) => item.id !== notice.id),
    audit: [auditItem(createId, `Aviso excluido: ${notice.title}`), ...data.audit].slice(0, 12),
  };
}

export function upsertMinistryData(
  data: AppData,
  form: MinistryForm,
  editingMinistryId: string | null,
  createId: IdFactory,
): AppData {
  const previousMinistry = editingMinistryId ? data.ministries.find((ministry) => ministry.id === editingMinistryId) : undefined;
  const ministry: MinistryRecord = { ...form, id: editingMinistryId ?? createId("ministry") };
  const renameMemberGroup = (member: MemberRecord) => {
    if (!previousMinistry?.name || previousMinistry.name === ministry.name) return member;
    const ministries = memberGroupNames(member).map((group) => (group === previousMinistry.name ? ministry.name : group));
    return { ...member, ministry: ministries[0] ?? "", ministries };
  };

  return {
    ...data,
    ministries: editingMinistryId ? data.ministries.map((item) => (item.id === editingMinistryId ? ministry : item)) : [ministry, ...data.ministries],
    members: data.members.map(renameMemberGroup),
    events:
      previousMinistry?.name && previousMinistry.name !== ministry.name
        ? data.events.map((event) => (event.ministry === previousMinistry.name ? { ...event, ministry: ministry.name } : event))
        : data.events,
    audit: [
      auditItem(createId, editingMinistryId ? `Grupo atualizado: ${ministry.name}` : `Grupo cadastrado: ${ministry.name}`),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function deleteMinistryData(data: AppData, ministry: MinistryRecord, createId: IdFactory): AppData {
  return {
    ...data,
    ministries: data.ministries.filter((item) => item.id !== ministry.id),
    members: data.members.map((member) => {
      const ministries = memberGroupNames(member).filter((group) => group !== ministry.name);
      return { ...member, ministry: ministries[0] ?? "", ministries };
    }),
    events: data.events.map((event) => (event.ministry === ministry.name ? { ...event, ministry: "Todos" } : event)),
    audit: [auditItem(createId, `Grupo excluido: ${ministry.name}`), ...data.audit].slice(0, 12),
  };
}

export function upsertTransactionData(
  data: AppData,
  form: TransactionForm,
  editingTransactionId: string | null,
  createId: IdFactory,
): AppData {
  const transaction: TransactionRecord = { ...form, id: editingTransactionId ?? createId("transaction"), amount: Number(form.amount || 0) };
  return {
    ...data,
    transactions: editingTransactionId
      ? data.transactions.map((item) => (item.id === editingTransactionId ? transaction : item))
      : [transaction, ...data.transactions],
    audit: [
      auditItem(
        createId,
        editingTransactionId ? `Lancamento financeiro atualizado: ${transaction.description}` : `Lancamento financeiro criado: ${transaction.description}`,
      ),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function deleteTransactionData(data: AppData, transaction: TransactionRecord, createId: IdFactory): AppData {
  return {
    ...data,
    transactions: data.transactions.filter((item) => item.id !== transaction.id),
    audit: [auditItem(createId, `Lancamento financeiro excluido: ${transaction.description}`), ...data.audit].slice(0, 12),
  };
}

export function upsertAssetData(data: AppData, form: AssetForm, editingAssetId: string | null, createId: IdFactory): AppData {
  const asset: AssetRecord = { ...form, id: editingAssetId ?? createId("asset") };
  return {
    ...data,
    assets: editingAssetId ? data.assets.map((item) => (item.id === editingAssetId ? asset : item)) : [asset, ...data.assets],
    audit: [auditItem(createId, editingAssetId ? `Patrimonio atualizado: ${asset.name}` : `Patrimonio cadastrado: ${asset.name}`), ...data.audit].slice(0, 12),
  };
}

export function deleteAssetData(data: AppData, asset: AssetRecord, createId: IdFactory): AppData {
  return {
    ...data,
    assets: data.assets.filter((item) => item.id !== asset.id),
    audit: [auditItem(createId, `Patrimonio excluido: ${asset.name}`), ...data.audit].slice(0, 12),
  };
}

export function upsertDevotionalData(
  data: AppData,
  form: DevotionalForm,
  editingDevotionalId: string | null,
  createId: IdFactory,
): AppData {
  const devotional: DevotionalRecord = {
    ...form,
    id: editingDevotionalId ?? createId("devotional"),
    publishedAt: form.publishedAt || currentDateKey(),
  };
  return {
    ...data,
    devotionals: editingDevotionalId
      ? data.devotionals.map((item) => (item.id === editingDevotionalId ? devotional : item))
      : [devotional, ...data.devotionals],
    audit: [
      auditItem(createId, editingDevotionalId ? `Devocional atualizado: ${devotional.title}` : `Devocional cadastrado: ${devotional.title}`),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function deleteDevotionalData(data: AppData, devotional: DevotionalRecord, createId: IdFactory): AppData {
  return {
    ...data,
    devotionals: data.devotionals.filter((item) => item.id !== devotional.id),
    audit: [auditItem(createId, `Devocional excluido: ${devotional.title}`), ...data.audit].slice(0, 12),
  };
}

export function upsertAccessUserData(
  data: AppData,
  user: AccessUser,
  selectedAccessMemberId: string,
  isUpdatingAccess: boolean,
  createId: IdFactory,
): AppData {
  return {
    ...data,
    users: isUpdatingAccess ? data.users.map((item) => (item.id === user.id ? user : item)) : [user, ...data.users],
    members: selectedAccessMemberId
      ? data.members.map((member) =>
          member.id === selectedAccessMemberId ? { ...member, email: user.email, authUserId: user.id, role: user.role } : member,
        )
      : data.members,
    audit: [auditItem(createId, isUpdatingAccess ? `Acesso promovido: ${user.name}` : `Usuario criado para ${user.name}`), ...data.audit].slice(0, 12),
  };
}

export function updateAccessUserStatusData(data: AppData, user: AccessUser, status: AccessUser["status"], createId: IdFactory): AppData {
  return {
    ...data,
    users: data.users.map((item) => (item.id === user.id ? { ...item, status } : item)),
    audit: [auditItem(createId, `Acesso ${status.toLowerCase()}: ${user.name}`), ...data.audit].slice(0, 12),
  };
}

export function deleteAccessUserData(data: AppData, user: AccessUser, createId: IdFactory): AppData {
  return {
    ...data,
    users: data.users.filter((item) => item.id !== user.id),
    members: data.members.map((member) =>
      member.authUserId === user.id || member.email.toLowerCase() === user.email.toLowerCase() ? { ...member, authUserId: "" } : member,
    ),
    audit: [auditItem(createId, `Acesso excluido: ${user.name}`), ...data.audit].slice(0, 12),
  };
}
