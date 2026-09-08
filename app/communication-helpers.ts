import { birthdayLabel, normalizeSearchText, normalizeWhatsappPhone } from "./app-helpers";
import { classNameById, type ClassNoticeArea } from "./attendance-helpers";
import type { KidRecord, MemberRecord, MessageAudience, MessageRecipient, SchoolClass, VisitorRecord } from "./types";

type MessageRecipientParams = {
  audience: MessageAudience;
  members: MemberRecord[];
  visitors: VisitorRecord[];
  kids: KidRecord[];
  schoolClasses: SchoolClass[];
  discipleshipClasses: SchoolClass[];
  weeklyBirthdays: MemberRecord[];
  monthlyBirthdays: MemberRecord[];
};

export function messageRecipientsForAudience({
  audience,
  members,
  visitors,
  kids,
  schoolClasses,
  discipleshipClasses,
  weeklyBirthdays,
  monthlyBirthdays,
}: MessageRecipientParams): MessageRecipient[] {
  const memberRecipients = members
    .filter((member) => normalizeWhatsappPhone(member.phone))
    .map((member) => ({
      id: member.id,
      name: member.fullName,
      phone: member.phone,
      group: member.ministry || member.memberType,
    }));

  if (audience === "Todos os membros") return memberRecipients;
  if (audience === "Aniversariantes da semana") {
    return weeklyBirthdays
      .filter((member) => normalizeWhatsappPhone(member.phone))
      .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: birthdayLabel(member.birthDate) }));
  }
  if (audience === "Aniversariantes do mes") {
    return monthlyBirthdays
      .filter((member) => normalizeWhatsappPhone(member.phone))
      .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: birthdayLabel(member.birthDate) }));
  }
  if (audience === "EBD") {
    return members
      .filter((member) => member.schoolClassId && normalizeWhatsappPhone(member.phone))
      .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: classNameById(schoolClasses, member.schoolClassId) }));
  }
  if (audience === "Discipulado") {
    return members
      .filter((member) => member.discipleshipClassId && normalizeWhatsappPhone(member.phone))
      .map((member) => ({ id: member.id, name: member.fullName, phone: member.phone, group: classNameById(discipleshipClasses, member.discipleshipClassId) }));
  }
  if (audience === "Grupos") {
    return memberRecipients.filter((recipient) => Boolean(recipient.group && recipient.group !== "Visitante"));
  }
  if (audience === "Visitantes") {
    return visitors
      .filter((visitor) => normalizeWhatsappPhone(visitor.phone))
      .map((visitor) => ({ id: visitor.id, name: visitor.fullName, phone: visitor.phone, group: visitor.integrationStatus }));
  }
  return kids
    .filter((kid) => normalizeWhatsappPhone(kid.guardianPhone))
    .map((kid) => ({
      id: kid.id,
      name: kid.guardianName,
      phone: kid.guardianPhone,
      group: kid.childName,
    }));
}

export function selectedOrAllRecipients(recipients: MessageRecipient[], selectedIds: string[]) {
  const selected = recipients.filter((recipient) => selectedIds.includes(recipient.id));
  return selected.length ? selected : recipients;
}

export function classWhatsappRecipients(members: MemberRecord[], classRecord: SchoolClass, area: ClassNoticeArea): MessageRecipient[] {
  const className = classRecord.name;
  const classText = normalizeSearchText(className);
  const classWords = classText.split(/\s+/).filter((word) => word.length > 3);
  const areaWords =
    area === "EBD"
      ? ["ebd", "escola biblica", "biblica", "professor"]
      : ["discipulado", "discipulado 1", "discipulado 2", "discipulador", "novo convertido", "novos convertidos", "batismo"];

  return members
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
