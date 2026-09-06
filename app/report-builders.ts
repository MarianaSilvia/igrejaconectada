import { birthdayLabel, formatDate } from "./app-helpers";
import { classNameById } from "./attendance-helpers";
import type { AppData, ChurchEvent, MemberRecord, ReportKind } from "./types";

export type ReportDefinition = {
  title: string;
  headers: string[];
  rows: unknown[][];
};

type ReportDefinitionParams = {
  data: AppData;
  kind: ReportKind;
  weekEvents: ChurchEvent[];
  monthlyBirthdays: MemberRecord[];
  absentRows: unknown[][];
};

export function buildReportDefinition({ data, kind, weekEvents, monthlyBirthdays, absentRows }: ReportDefinitionParams): ReportDefinition {
  const reports: Record<ReportKind, ReportDefinition> = {
    members: {
      title: "Membros por tipo",
      headers: ["Nome", "Tipo", "Status", "Telefone", "E-mail", "Grupo", "EBD", "Discipulado", "Situacao pastoral"],
      rows: data.members.map((member) => [
        member.fullName,
        member.memberType,
        member.status,
        member.phone,
        member.email,
        member.ministry || "Sem grupo",
        classNameById(data.schoolClasses, member.schoolClassId) || "Nao matriculado",
        classNameById(data.discipleshipClasses, member.discipleshipClassId) || "Nao matriculado",
        member.pastoralStatus || "Sem acompanhamento definido",
      ]),
    },
    visitors: {
      title: "Visitantes",
      headers: ["Nome", "Telefone", "Primeira visita", "Retorno", "Convidado por", "Contato", "Integracao", "Observacoes"],
      rows: data.visitors.map((visitor) => [
        visitor.fullName,
        visitor.phone,
        formatDate(visitor.firstVisitDate),
        formatDate(visitor.returnDate),
        visitor.invitedBy || "Nao informado",
        visitor.contactMade ? "Contato feito" : "Pendente",
        visitor.integrationStatus,
        visitor.notes,
      ]),
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
      rows: weekEvents.map((event) => [
        formatDate(event.date),
        event.time || "Sem horario",
        event.title,
        event.ministry,
        event.location,
        event.responsible,
        event.status,
      ]),
    },
    schedules: {
      title: "Escalas",
      headers: ["Data", "Culto", "Grupo", "Funcao", "Pessoa", "WhatsApp", "Status", "Observacoes"],
      rows: data.schedules.map((schedule) => [
        formatDate(schedule.date),
        schedule.serviceType,
        schedule.group || "Sem grupo",
        schedule.functionName,
        schedule.assignedTo,
        schedule.phone,
        schedule.confirmationStatus,
        schedule.notes,
      ]),
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
      rows: absentRows,
    },
    finance: {
      title: "Financeiro",
      headers: ["Data", "Tipo", "Categoria", "Descricao", "Valor", "Metodo", "Status", "Membro", "Observacoes"],
      rows: data.transactions.map((transaction) => [
        formatDate(transaction.date),
        transaction.type,
        transaction.category,
        transaction.description,
        transaction.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        transaction.method,
        transaction.status,
        transaction.memberName || "Nao vinculado",
        transaction.notes,
      ]),
    },
    assets: {
      title: "Patrimonio",
      headers: ["Item", "Categoria", "Local", "Responsavel", "Estado", "Ultima manutencao", "Observacoes"],
      rows: data.assets.map((asset) => [
        asset.name,
        asset.category,
        asset.location || "Sem local",
        asset.responsible || "Sem responsavel",
        asset.condition,
        formatDate(asset.lastMaintenance),
        asset.notes,
      ]),
    },
  };

  return reports[kind];
}
