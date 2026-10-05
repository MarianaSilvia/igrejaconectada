import { birthdayLabel, formatDate, memberGroupLabel } from "./app-helpers";
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

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function monthKey(value: string) {
  return value ? value.slice(0, 7) : "";
}

function percentage(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function buildReportDefinition({ data, kind, weekEvents, monthlyBirthdays, absentRows }: ReportDefinitionParams): ReportDefinition {
  const attendanceRecords = data.attendanceSessions.flatMap((session) => session.records);
  const presentAttendanceRecords = attendanceRecords.filter((record) => record.status === "Presente");
  const schoolStudents = data.members.filter((member) => member.schoolClassId);
  const discipleshipStudents = data.members.filter((member) => member.discipleshipClassId);
  const membersCreatedThisMonth = data.members.filter((member) => monthKey(member.createdAt || member.joinedAt) === currentMonthKey());

  const reports: Record<ReportKind, ReportDefinition> = {
    members: {
      title: "Membros por tipo",
      headers: [
        "Código",
        "Nome completo",
        "Data de nascimento",
        "Telefones",
        "Faixa etária",
        "Idade",
        "Sexo",
        "Endereço",
        "CEP",
        "Cidade",
        "Bairro",
        "CPF",
        "Estado civil",
        "Escolaridade",
        "Nome do cônjuge",
        "Data de batismo",
        "Criado em",
        "Cargos",
        "Categorias",
        "Tipo",
        "Status",
        "Grupos",
        "Função ministerial",
        "EBD",
        "Discipulado",
        "Situação pastoral",
      ],
      rows: data.members.map((member) => [
        member.memberCode,
        member.fullName,
        formatDate(member.birthDate),
        member.phone,
        member.ageGroup,
        member.age,
        member.gender,
        member.address,
        member.zipCode,
        member.city,
        member.neighborhood,
        member.cpf,
        member.maritalStatus,
        member.education,
        member.spouseName,
        formatDate(member.baptismDate),
        formatDate(member.createdAt.slice(0, 10)),
        member.role,
        member.categories,
        member.memberType,
        member.status,
        memberGroupLabel(member),
        member.ministerialFunction || "Não informada",
        classNameById(data.schoolClasses, member.schoolClassId) || "Não matriculado",
        classNameById(data.discipleshipClasses, member.discipleshipClassId) || "Não matriculado",
        member.pastoralStatus || "Sem acompanhamento definido",
      ]),
    },
    visitors: {
      title: "Visitantes",
      headers: ["Nome", "Telefone", "Primeira visita", "Retorno", "Convidado por", "Contato", "Integração", "Observações"],
      rows: data.visitors.map((visitor) => [
        visitor.fullName,
        visitor.phone,
        formatDate(visitor.firstVisitDate),
        formatDate(visitor.returnDate),
        visitor.invitedBy || "Não informado",
        visitor.contactMade ? "Contato feito" : "Pendente",
        visitor.integrationStatus,
        visitor.notes,
      ]),
    },
    birthdays: {
      title: "Aniversariantes do mês",
      headers: ["Nome", "Data", "Telefone", "Grupos"],
      rows: monthlyBirthdays.map((member) => [member.fullName, birthdayLabel(member.birthDate), member.phone, memberGroupLabel(member)]),
    },
    kids: {
      title: "Crianças cadastradas",
      headers: ["Criança", "Nascimento", "Faixa", "Turma", "Responsável", "Telefone"],
      rows: data.kids.map((kid) => [kid.childName, formatDate(kid.birthDate), kid.ageGroup, kid.className, kid.guardianName, kid.guardianPhone]),
    },
    agenda: {
      title: "Agenda semanal",
      headers: ["Data", "Horário", "Evento", "Grupo", "Local", "Responsável", "Status"],
      rows: weekEvents.map((event) => [
        formatDate(event.date),
        event.time || "Sem horário",
        event.title,
        event.ministry,
        event.location,
        event.responsible,
        event.status,
      ]),
    },
    attendance: {
      title: "Presença EBD e Discipulado",
      headers: ["Data", "Área", "Classe", "Aula", "Aluno", "Status", "Observação"],
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
      headers: ["Nome", "WhatsApp", "Último status", "Faltas recentes", "Faltas no mês"],
      rows: absentRows,
    },
    newMembers: {
      title: "Novos membros do mês",
      headers: ["Código", "Nome", "Tipo", "Status", "Congregação", "Grupos", "Criado em", "Telefone"],
      rows: membersCreatedThisMonth.map((member) => [
        member.memberCode,
        member.fullName,
        member.memberType,
        member.status,
        member.congregation || "Não informada",
        memberGroupLabel(member),
        formatDate((member.createdAt || member.joinedAt).slice(0, 10)),
        member.phone,
      ]),
    },
    followUpStudents: {
      title: "Alunos em acompanhamento",
      headers: ["Nome", "WhatsApp", "Último status", "Faltas recentes", "Faltas no mês", "Orientação"],
      rows: absentRows.map(([name, phone, status, recent, month]) => [
        name,
        phone,
        status,
        recent,
        month,
        Number(month) >= 3 ? "Priorizar contato pastoral/professor" : "Enviar lembrete e acompanhar próxima aula",
      ]),
    },
    indicators: {
      title: "Indicadores gerais",
      headers: ["Indicador", "Valor", "Detalhe"],
      rows: [
        ["Membros cadastrados", data.members.length, `${data.members.filter((member) => member.status === "Membro ativo").length} ativos`],
        ["Novos membros do mês", membersCreatedThisMonth.length, "Com base na data de criação do cadastro"],
        ["Pré-cadastros aguardando análise", data.registrationRequests.filter((request) => request.status === "Aguardando aprovacao").length, "Fila de secretaria"],
        ["Visitantes em acompanhamento", data.visitors.filter((visitor) => visitor.integrationStatus === "Em acompanhamento").length, "Visitantes ainda em cuidado"],
        ["Eventos da semana", weekEvents.length, "Agenda dos próximos dias"],
        ["Aniversariantes do mês", monthlyBirthdays.length, "Membros com aniversário no mês atual"],
        ["Alunos EBD", schoolStudents.length, `${data.schoolClasses.length} classes cadastradas`],
        ["Alunos Discipulado", discipleshipStudents.length, `${data.discipleshipClasses.length} classes cadastradas`],
        ["Chamadas registradas", data.attendanceSessions.length, `${attendanceRecords.length} presenças/faltas lançadas`],
        ["Taxa de presença registrada", percentage(presentAttendanceRecords.length, attendanceRecords.length), `${presentAttendanceRecords.length} presenças de ${attendanceRecords.length} registros`],
        ["Alunos em alerta de falta", absentRows.length, "Baseado nos faltosos recentes"],
        ["Pedidos pastorais pendentes", data.careRequests.filter((request) => request.status !== "Concluido").length, "Atendimentos ainda abertos"],
      ],
    },
    finance: {
      title: "Financeiro",
      headers: ["Data", "Tipo", "Categoria", "Descrição", "Valor", "Método", "Status", "Membro", "Observações"],
      rows: data.transactions.map((transaction) => [
        formatDate(transaction.date),
        transaction.type,
        transaction.category,
        transaction.description,
        transaction.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        transaction.method,
        transaction.status,
        transaction.memberName || "Não vinculado",
        transaction.notes,
      ]),
    },
    assets: {
      title: "Patrimônio",
      headers: ["Item", "Categoria", "Local", "Responsável", "Estado", "Última manutenção", "Observações"],
      rows: data.assets.map((asset) => [
        asset.name,
        asset.category,
        asset.location || "Sem local",
        asset.responsible || "Sem responsável",
        asset.condition,
        formatDate(asset.lastMaintenance),
        asset.notes,
      ]),
    },
  };

  return reports[kind];
}
