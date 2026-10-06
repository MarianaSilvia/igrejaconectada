import { birthdayDateThisYear, birthdayLabel, formatDate, memberGroupLabel } from "./app-helpers";
import { classNameById } from "./attendance-helpers";
import type { AppData, ChurchEvent, MemberRecord, ReportKind } from "./types";

export type ReportDateRange = {
  startDate: string;
  endDate: string;
};

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
  dateRange?: ReportDateRange;
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

function careStatusLabel(status: string) {
  if (status === "Em analise") return "Em análise";
  if (status === "Concluido") return "Concluído";
  return status;
}

function registrationStatusLabel(status: string) {
  if (status === "Aguardando aprovacao") return "Aguardando aprovação";
  if (status === "Em analise") return "Em análise";
  return status;
}

function hasDateRange(dateRange?: ReportDateRange) {
  return Boolean(dateRange?.startDate || dateRange?.endDate);
}

function dateFromKey(value: string) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(value: string, dateRange?: ReportDateRange) {
  if (!hasDateRange(dateRange)) return true;
  const date = dateFromKey(value);
  if (!date) return false;

  const start = dateRange?.startDate ? dateFromKey(dateRange.startDate) : null;
  const end = dateRange?.endDate ? dateFromKey(dateRange.endDate) : null;

  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function isBirthdayInRange(value: string, dateRange?: ReportDateRange) {
  if (!hasDateRange(dateRange)) return true;
  const date = birthdayDateThisYear(value);
  if (!date) return false;

  const start = dateRange?.startDate ? dateFromKey(dateRange.startDate) : null;
  const end = dateRange?.endDate ? dateFromKey(dateRange.endDate) : null;

  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function buildReportDefinition({ data, kind, weekEvents, monthlyBirthdays, absentRows, congregationScope = "Todas", dateRange }: ReportDefinitionParams): ReportDefinition {
  const scopedByCongregation = congregationScope && congregationScope !== "Todas";
  const scopedByDate = hasDateRange(dateRange);
  const belongsToScope = (congregation?: string) => !scopedByCongregation || congregation === congregationScope;
  const scopedMembers = data.members.filter((member) => belongsToScope(member.congregation));
  const scopedMemberIds = new Set(scopedMembers.map((member) => member.id));
  const reportMembers = scopedByDate ? scopedMembers.filter((member) => isDateInRange(member.createdAt || member.joinedAt, dateRange)) : scopedMembers;
  const scopedVisitors = data.visitors.filter(
    (visitor) => belongsToScope(visitor.congregation) && (!scopedByDate || isDateInRange(visitor.firstVisitDate || visitor.returnDate, dateRange)),
  );
  const scopedKids = data.kids.filter((kid) => belongsToScope(kid.congregation));
  const eventSource = scopedByDate ? data.events : weekEvents;
  const scopedEvents = eventSource.filter((event) => belongsToScope(event.congregation) && isDateInRange(event.date, dateRange));
  const birthdaySource = scopedByDate ? scopedMembers : monthlyBirthdays;
  const scopedBirthdays = birthdaySource.filter((member) => belongsToScope(member.congregation) && isBirthdayInRange(member.birthDate, dateRange));
  const scopedRegistrations = data.registrationRequests.filter(
    (request) => belongsToScope(request.congregation) && (!scopedByDate || isDateInRange(request.createdAt, dateRange)),
  );
  const scopedCareRequests = data.careRequests.filter((request) => belongsToScope(request.congregation));
  const scopedMessageCampaigns = data.messageCampaigns.filter(
    (campaign) => belongsToScope(campaign.congregation) && (!scopedByDate || isDateInRange(campaign.createdAt, dateRange)),
  );
  const scopedAbsentRows = scopedByCongregation
    ? absentRows.filter(([name]) => scopedMembers.some((member) => member.fullName === String(name)))
    : absentRows;
  const scopedAttendanceSessions = data.attendanceSessions
    .map((session) => ({
      ...session,
      records: scopedByCongregation ? session.records.filter((record) => scopedMemberIds.has(record.memberId)) : session.records,
    }))
    .filter((session) => (!scopedByCongregation || session.records.length > 0) && isDateInRange(session.date, dateRange));
  const attendanceRecords = scopedAttendanceSessions.flatMap((session) => session.records);
  const presentAttendanceRecords = attendanceRecords.filter((record) => record.status === "Presente");
  const schoolStudents = scopedMembers.filter((member) => member.schoolClassId);
  const discipleshipStudents = scopedMembers.filter((member) => member.discipleshipClassId);
  const classRosterRows = (classes: AppData["schoolClasses"], area: "school" | "discipleship") =>
    classes.flatMap((classRecord) => {
      const students = scopedMembers
        .filter((member) => (area === "school" ? member.schoolClassId === classRecord.id : member.discipleshipClassId === classRecord.id))
        .sort((first, second) => first.fullName.localeCompare(second.fullName, "pt-BR"));

      if (!students.length) {
        return [[classRecord.name, classRecord.teacher || "Não informado", "Sem alunos matriculados", "", "", "", classRecord.nextLesson || "Não informada"]];
      }

      return students.map((member) => [
        classRecord.name,
        classRecord.teacher || "Não informado",
        member.fullName,
        member.memberCode,
        member.phone,
        member.status,
        classRecord.nextLesson || "Não informada",
      ]);
    });
  const classAttendanceSummaryRows = (classes: AppData["schoolClasses"], area: "school" | "discipleship") =>
    classes.map((classRecord) => {
      const students = scopedMembers.filter((member) => (area === "school" ? member.schoolClassId === classRecord.id : member.discipleshipClassId === classRecord.id));
      const studentIds = new Set(students.map((member) => member.id));
      const sessions = scopedAttendanceSessions.filter((session) => session.area === area && session.classId === classRecord.id);
      const records = sessions.flatMap((session) => session.records).filter((record) => studentIds.has(record.memberId));
      const present = records.filter((record) => record.status === "Presente").length;
      const absences = records.filter((record) => record.status === "Falta").length;
      const justified = records.filter((record) => record.status === "Justificado").length;
      const contact = records.filter((record) => record.status === "Precisa de contato").length;
      const lastSession = sessions.map((session) => session.date).sort().at(-1);

      return [
        area === "school" ? "EBD" : "Discipulado",
        classRecord.name,
        classRecord.teacher || "Não informado",
        students.length,
        sessions.length,
        present,
        absences,
        justified,
        contact,
        percentage(present, records.length),
        lastSession ? formatDate(lastSession) : "Sem chamada",
        classRecord.nextLesson || "Não informada",
      ];
    });
  const membersCreatedThisMonth = scopedByDate
    ? scopedMembers.filter((member) => isDateInRange(member.createdAt || member.joinedAt, dateRange))
    : scopedMembers.filter((member) => monthKey(member.createdAt || member.joinedAt) === currentMonthKey());
  const scopedTransactions = scopedByDate ? data.transactions.filter((transaction) => isDateInRange(transaction.date, dateRange)) : data.transactions;

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
      rows: reportMembers.map((member) => [
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
      headers: ["Data", "Horário", "Evento", "Grupo", "Local", "Responsável", "Descrição", "Inscrição", "Publicação", "Status"],
      rows: scopedEvents.map((event) => [
        formatDate(event.date),
        event.time || "Sem horário",
        event.title,
        event.ministry,
        event.location,
        event.responsible,
        event.description,
        event.registrationUrl,
        event.published ? "Público" : "Interno",
        event.status,
      ]),
    },
    registrationRequests: {
      title: "Pré-cadastros",
      headers: ["Criado em", "Nome", "Telefone", "E-mail", "Congregação", "Tipo solicitado", "Origem", "Status", "Consentimento", "Revisado em", "Observação"],
      rows: scopedRegistrations.map((request) => [
        formatDate(request.createdAt.slice(0, 10)),
        request.fullName,
        request.phone,
        request.email,
        request.congregation || "Não informada",
        request.requestedStatus,
        request.registrationSource,
        registrationStatusLabel(request.status),
        request.privacyConsent ? `Aceito em ${formatDate(request.privacyConsentAt.slice(0, 10))}` : "Pendente",
        request.reviewedAt ? formatDate(request.reviewedAt.slice(0, 10)) : "Sem revisão",
        request.reviewNote || request.notes,
      ]),
    },
    careRequests: {
      title: "Atendimentos pastorais",
      headers: ["Criado em", "Membro", "Telefone", "Categoria", "Congregação", "Status", "Responsável", "Agenda", "Resumo", "Retorno"],
      rows: scopedCareRequests
        .filter((request) => !scopedByDate || isDateInRange(request.createdAt, dateRange) || isDateInRange(request.scheduleDate, dateRange))
        .map((request) => [
          formatDate(request.createdAt.slice(0, 10)),
          request.member,
          request.phone,
          request.category,
          request.congregation || "Não informada",
          careStatusLabel(request.status),
          request.responsible || "Sem responsável",
          request.scheduleDate ? `${formatDate(request.scheduleDate)} ${request.scheduleTime || ""}`.trim() : "Sem agenda",
          request.summary,
          request.returnNote,
        ]),
    },
    messageCampaigns: {
      title: "Campanhas de comunicação",
      headers: ["Criado em", "Público", "Congregação", "Destinatários", "Modelo", "Mensagem"],
      rows: scopedMessageCampaigns.map((campaign) => [
        formatDate(campaign.createdAt.slice(0, 10)),
        campaign.audience,
        campaign.congregation || "Não informada",
        campaign.recipientCount,
        campaign.templateId || "Modelo manual",
        campaign.text,
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
    schoolRoster: {
      title: "Turmas EBD - alunos e professores",
      headers: ["Classe", "Professor", "Aluno", "Código", "Telefone", "Status", "Próxima lição"],
      rows: classRosterRows(data.schoolClasses, "school"),
    },
    discipleshipRoster: {
      title: "Turmas Discipulado - alunos e professores",
      headers: ["Turma", "Professor", "Aluno", "Código", "Telefone", "Status", "Próxima lição"],
      rows: classRosterRows(data.discipleshipClasses, "discipleship"),
    },
    classAttendanceSummary: {
      title: "Frequência por turma",
      headers: ["Área", "Turma", "Professor", "Alunos", "Chamadas", "Presenças", "Faltas", "Justificadas", "Precisa contato", "Presença", "Última chamada", "Próxima lição"],
      rows: [...classAttendanceSummaryRows(data.schoolClasses, "school"), ...classAttendanceSummaryRows(data.discipleshipClasses, "discipleship")],
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
      rows: scopedTransactions.map((transaction) => [
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
