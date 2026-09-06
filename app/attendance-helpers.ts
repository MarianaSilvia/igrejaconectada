import { eventDate, normalizeSearchText } from "./app-helpers";
import type { AttendanceArea, AttendanceSession, AttendanceStatus, ChurchEvent, MemberRecord, SchoolClass } from "./types";

export type ClassNoticeArea = "EBD" | "Discipulado";

export function classNameById(classes: SchoolClass[], classId: string) {
  return classes.find((item) => item.id === classId)?.name ?? "";
}

export function attendanceKey(area: AttendanceArea, classId: string) {
  return `${area}-${classId}`;
}

export function eventsForAttendance(events: ChurchEvent[], area: AttendanceArea) {
  const areaWords =
    area === "school"
      ? ["ebd", "escola biblica", "biblica"]
      : ["discipulado", "batismo", "novo convertido", "novos convertidos"];

  return events.filter((event) => {
    const eventText = normalizeSearchText([event.title, event.ministry, event.location, event.responsible].join(" "));
    return areaWords.some((word) => eventText.includes(word));
  });
}

export function membersForAttendanceClass(members: MemberRecord[], area: AttendanceArea, classId: string) {
  return members.filter((member) => (area === "school" ? member.schoolClassId === classId : member.discipleshipClassId === classId));
}

export function attendanceSessionsForClass(sessions: AttendanceSession[], area: AttendanceArea, classId: string) {
  return sessions
    .filter((session) => session.area === area && session.classId === classId)
    .sort((first, second) => second.date.localeCompare(first.date));
}

export function attendanceSessionForEvent(sessions: AttendanceSession[], area: AttendanceArea, classId: string, eventId: string) {
  return sessions.find((session) => session.area === area && session.classId === classId && session.eventId === eventId);
}

export function attendanceStatusForMember(session: AttendanceSession | undefined, memberId: string): AttendanceStatus {
  return session?.records.find((record) => record.memberId === memberId)?.status ?? "Presente";
}

export function attendanceNoteForMember(session: AttendanceSession | undefined, memberId: string) {
  return session?.records.find((record) => record.memberId === memberId)?.note ?? "";
}

export function attendanceSummary(session: AttendanceSession | undefined, members: MemberRecord[]) {
  if (!session) return { present: 0, absent: 0, justified: 0, contact: 0, total: members.length, percent: 0 };

  const records = members.map((member) => attendanceStatusForMember(session, member.id));
  const present = records.filter((status) => status === "Presente").length;
  const absent = records.filter((status) => status === "Falta").length;
  const justified = records.filter((status) => status === "Justificado").length;
  const contact = records.filter((status) => status === "Precisa de contato").length;
  const percent = members.length ? Math.round(((present + justified) / members.length) * 100) : 0;

  return { present, absent, justified, contact, total: members.length, percent };
}

export function memberAttendanceHistory(sessions: AttendanceSession[], area: AttendanceArea, member: MemberRecord) {
  const classId = area === "school" ? member.schoolClassId : member.discipleshipClassId;
  if (!classId) return [];

  return sessions
    .filter((session) => session.area === area && session.classId === classId)
    .map((session) => ({
      session,
      record: session.records.find((item) => item.memberId === member.id),
    }))
    .sort((first, second) => second.session.date.localeCompare(first.session.date));
}

export function absentStudentRows(members: MemberRecord[], sessions: AttendanceSession[]) {
  return members
    .map((member) => {
      const records = sessions
        .flatMap((session) => session.records.map((record) => ({ session, record })))
        .filter(({ record }) => record.memberId === member.id)
        .sort((first, second) => second.session.date.localeCompare(first.session.date));
      const recentMisses = records.slice(0, 3).filter(({ record }) => record.status === "Falta" || record.status === "Precisa de contato").length;
      const monthMisses = records.filter(({ session, record }) => {
        const date = eventDate(session.date);
        const now = new Date();
        return Boolean(
          date &&
            date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear() &&
            (record.status === "Falta" || record.status === "Precisa de contato"),
        );
      }).length;

      return { member, recentMisses, monthMisses, lastStatus: records[0]?.record.status ?? "Sem chamada" };
    })
    .filter((item) => item.recentMisses >= 2 || item.monthMisses >= 3 || item.lastStatus === "Precisa de contato")
    .map(({ member, recentMisses, monthMisses, lastStatus }) => [member.fullName, member.phone, lastStatus, recentMisses, monthMisses]);
}
