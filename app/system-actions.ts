import { currentDateKey, eventDate } from "./app-helpers";
import type { AppData, ChurchEvent, MemberRecord, ScheduleRecord, VisitorRecord } from "./types";

type IdFactory = (prefix: string) => string;
type MemberForm = Omit<MemberRecord, "id">;
type VisitorForm = Omit<VisitorRecord, "id">;
type EventForm = Omit<ChurchEvent, "id">;
type ScheduleForm = Omit<ScheduleRecord, "id">;

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

export function upsertMemberData(data: AppData, form: MemberForm, editingMemberId: string | null, createId: IdFactory): AppData {
  const now = new Date().toISOString();
  const member: MemberRecord = { ...form, id: editingMemberId ?? createId("member") };
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
    fullName: visitor.fullName,
    phone: visitor.phone,
    status: "Membro ativo",
    memberType: "Membro",
    registrationSource: "Visitante integrado",
    pastoralStatus: "Integrado",
    joinedAt: visitor.returnDate || visitor.firstVisitDate || currentDateKey(),
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

export function upsertScheduleData(data: AppData, form: ScheduleForm, editingScheduleId: string | null, createId: IdFactory): AppData {
  const schedule: ScheduleRecord = { ...form, id: editingScheduleId ?? createId("schedule") };
  return {
    ...data,
    schedules: editingScheduleId ? data.schedules.map((item) => (item.id === editingScheduleId ? schedule : item)) : [schedule, ...data.schedules],
    audit: [
      auditItem(createId, editingScheduleId ? `Escala atualizada: ${schedule.serviceType}` : `Escala criada: ${schedule.serviceType}`),
      ...data.audit,
    ].slice(0, 12),
  };
}

export function deleteScheduleData(data: AppData, schedule: ScheduleRecord, createId: IdFactory): AppData {
  return {
    ...data,
    schedules: data.schedules.filter((item) => item.id !== schedule.id),
    audit: [auditItem(createId, `Escala excluida: ${schedule.serviceType}`), ...data.audit].slice(0, 12),
  };
}
