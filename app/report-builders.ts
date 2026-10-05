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
  congregationScope?: string;
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

export function buildReportDefinition({ data, kind, weekEvents, monthlyBirthdays, absentRows, congregationScope = "Todas" }: ReportDefinitionParams): ReportDefinition {
  const scopedByCongregation = congregationScope && congregationScope !== "Todas";
  const belongsToScope = (congregation?: string) => !scopedByCongregation || congregation === congregationScope;
  const scopedMembers = data.members.filter((member) => belongsToScope(member.congregation));
  const scopedMemberIds = new Set(scopedMembers.map((member) => member.id));
  const scopedVisitors = data.visitors.filter((visitor) => belongsToScope(visitor.congregation));
  const scopedKids = data.kids.filter((kid) => belongsToScope(kid.congregation));
  const scopedEvents = weekEvents.filter((event) => belongsToScope(event.congregation));
  const scopedBirthdays = monthlyBirthdays.filter((member) => belongsToScope(member.congregation));
  const scopedRegistrations = data.registrationRequests.filter((request) => belongsToScope(request.congregation));
  const scopedCareRequests = data.careRequests.filter((request) => belongsToScope(request.congregation));
  const scopedAbsentRows = scopedByCongregation
    ? absentRows.filter(([name]) => scopedMembers.some((member) => member.fullName === String(name)))
    : absentRows;
  const scopedAttendanceSessions = data.attendanceSessions
    .map((session) => ({
      ...session,
      records: scopedByCongregation ? session.records.filter((record) => scopedMemberIds.has(record.memberId)) : session.records,
    }))
    .filter((session) => !scopedByCongregation || session.records.length > 0);
  const attendanceRecords = scopedAttendanceSessions.flatMap((session) => session.records);
  const presentAttendanceRecords = attendanceRecords.filter((record) => record.status === "Presente");
  const schoolStudents = scopedMembers.filter((member) => member.schoolClassId);
  const discipleshipStudents = scopedMembers.filter((member) => member.discipleshipClassId);
  const membersCreatedThisMonth = scopedMembers.filter((member) => monthKey(member.createdAt || member.joinedAt) === currentMonthKey());

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
      rows: scopedMembers.map((member) => [
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
      rows: scopedVisitors.map((visitor) => [
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
      rows: scopedBirthdays.map((member) => [member.fullName, birthdayLabel(member.birthDate), member.phone, memberGroupLabel(member)]),
    },
    kids: {
      title: "Crianças cadastradas",
      headers: ["Criança", "Nascimento", "Faixa", "Turma", "Responsável", "Telefone"],
      rows: scopedKids.map((kid) => [kid.childName, formatDate(kid.birthDate), kid.ageGroup, kid.className, kid.guardianName, kid.guardianPhone]),
    },
    agenda: {
      title: "Agenda semanal",
      headers: ["Data", "Horário", "Evento", "Grupo", "Local", "Responsável", "Status"],
      rows: scopedEvents.map((event) => [
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
      rows: scopedAttendanceSessions.flatMap((session) =>
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
      rows: scopedAbsentRows,
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
      rows: scopedAbsentRows.map(([name, phone, status, recent, month]) => [
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
        ["Membros cadastrados", scopedMembers.length, `${scopedMembers.filter((member) => member.status === "Membro ativo").length} ativos`],
        ["Novos membros do mês", membersCreatedThisMonth.length, "Com base na data de criação do cadastro"],
        ["Pré-cadastros aguardando análise", scopedRegistrations.filter((request) => request.status === "Aguardando aprovacao").length, "Fila de secretaria"],
        ["Visitantes em acompanhamento", scopedVisitors.filter((visitor) => visitor.integrationStatus === "Em acompanhamento").length, "Visitantes ainda em cuidado"],
        ["Eventos da semana", scopedEvents.length, "Agenda dos próximos dias"],
        ["Aniversariantes do mês", scopedBirthdays.length, "Membros com aniversário no mês atual"],
        ["Alunos EBD", schoolStudents.length, `${data.schoolClasses.length} classes cadastradas`],
        ["Alunos Discipulado", discipleshipStudents.length, `${data.discipleshipClasses.length} classes cadastradas`],
        ["Chamadas registradas", scopedAttendanceSessions.length, `${attendanceRecords.length} presenças/faltas lançadas`],
        ["Taxa de presença registrada", percentage(presentAttendanceRecords.length, attendanceRecords.length), `${presentAttendanceRecords.length} presenças de ${attendanceRecords.length} registros`],
        ["Alunos em alerta de falta", scopedAbsentRows.length, "Baseado nos faltosos recentes"],
        ["Pedidos pastorais pendentes", scopedCareRequests.filter((request) => request.status !== "Concluido").length, "Atendimentos ainda abertos"],
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
