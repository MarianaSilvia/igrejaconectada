"use client";

import { useState } from "react";
import type { AccessRole, ModuleKey } from "../permissions";
import type { AppData, ChurchEvent, MemberRecord, RegistrationRequest } from "../types";
import { dateAfterDays, formatDate, sortEventsByDate } from "../app-helpers";
import { escapeHtml, printHtmlDocument } from "../report-helpers";

type AbsenceAlert = (string | number)[];

type IntelligencePanelProps = {
  absentRows: AbsenceAlert[];
  currentAccessRole: AccessRole;
  data: AppData;
  monthlyBirthdays: MemberRecord[];
  onOpenModule: (module: ModuleKey) => void;
  pendingRegistrationRequests: RegistrationRequest[];
  upcomingPanelEvents: ChurchEvent[];
};

type ActionTask = {
  count: number;
  description: string;
  module: ModuleKey;
  priority: "high" | "medium" | "low";
  title: string;
};

type CommunicationSuggestion = {
  audience: string;
  module: ModuleKey;
  text: string;
  title: string;
};

type WeeklyPlanItem = {
  action: string;
  due: string;
  module: ModuleKey;
  owner: string;
  priority: "high" | "medium" | "low";
  title: string;
};

type FormationClassStat = {
  area: "EBD" | "Discipulado";
  attendanceRate: string;
  classId: string;
  className: string;
  presentRecords: number;
  sessions: number;
  students: number;
  teacher: string;
  totalRecords: number;
};

type QuickAnswer = {
  answer: string;
  module: ModuleKey;
  question: string;
};

type AutomationSuggestion = {
  description: string;
  module: ModuleKey;
  readiness: "Pronta" | "Revisar dados" | "Configurar";
  title: string;
};

type GovernanceItem = {
  count: number;
  description: string;
  module: ModuleKey;
  status: "Em dia" | "Atenção" | "Revisar";
  title: string;
};

type CongregationSummary = {
  birthdays: number;
  events: number;
  members: number;
  name: string;
  pastoralPending: number;
  visitors: number;
};

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
  style: "percent",
});

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function percentage(value: number, total: number) {
  if (!total) return "0%";
  return percentFormatter.format(value / total);
}

function recordMonth(value: string) {
  return value ? value.slice(0, 7) : "";
}

function isMissingMemberData(member: MemberRecord) {
  return !member.phone || !member.email || !member.congregation || !member.birthDate || !member.ministries?.length;
}

function congregationName(value: string | undefined) {
  return value?.trim() || "Sem congregação definida";
}

function congregationKey(value: string | undefined) {
  return congregationName(value).toLowerCase();
}

function matchesCongregation(value: string | undefined, selectedCongregation: string) {
  return selectedCongregation === "Todas" || congregationKey(value) === congregationKey(selectedCongregation);
}

function buildCongregationOptions(data: AppData) {
  const options = new Set<string>();
  data.members.forEach((member) => options.add(congregationName(member.congregation)));
  data.visitors.forEach((visitor) => options.add(congregationName(visitor.congregation)));
  data.careRequests.forEach((request) => options.add(congregationName(request.congregation)));
  data.events.forEach((event) => options.add(congregationName(event.congregation)));
  data.registrationRequests.forEach((request) => options.add(congregationName(request.congregation)));
  return ["Todas", ...[...options].sort((first, second) => first.localeCompare(second))];
}

function scopedDataForCongregation(data: AppData, selectedCongregation: string): AppData {
  if (selectedCongregation === "Todas") return data;

  const members = data.members.filter((member) => matchesCongregation(member.congregation, selectedCongregation));
  const memberIds = new Set(members.map((member) => member.id));

  return {
    ...data,
    attendanceSessions: data.attendanceSessions
      .map((session) => ({
        ...session,
        records: session.records.filter((record) => memberIds.has(record.memberId)),
      }))
      .filter((session) => session.records.length > 0),
    careRequests: data.careRequests.filter((request) => matchesCongregation(request.congregation, selectedCongregation)),
    events: data.events.filter((event) => matchesCongregation(event.congregation, selectedCongregation)),
    kids: data.kids.filter((kid) => matchesCongregation(kid.congregation, selectedCongregation)),
    members,
    ministries: data.ministries.filter((ministry) => matchesCongregation(ministry.congregation, selectedCongregation)),
    mural: data.mural.filter((item) => matchesCongregation(item.congregation, selectedCongregation)),
    notices: data.notices.filter((notice) => matchesCongregation(notice.congregation, selectedCongregation)),
    registrationRequests: data.registrationRequests.filter((request) => matchesCongregation(request.congregation, selectedCongregation)),
    visitors: data.visitors.filter((visitor) => matchesCongregation(visitor.congregation, selectedCongregation)),
  };
}

function attendanceCounts(data: AppData) {
  const records = data.attendanceSessions.flatMap((session) => session.records);
  const present = records.filter((record) => record.status === "Presente").length;
  const absent = records.filter((record) => record.status === "Falta").length;
  const contact = records.filter((record) => record.status === "Precisa de contato").length;

  return {
    absent,
    contact,
    present,
    total: records.length,
  };
}

function formationStats(
  area: FormationClassStat["area"],
  classes: AppData["schoolClasses"],
  members: MemberRecord[],
  data: AppData,
): FormationClassStat[] {
  const attendanceArea = area === "EBD" ? "school" : "discipleship";

  return classes
    .map((classRecord) => {
      const classMembers = members.filter((member) =>
        attendanceArea === "school" ? member.schoolClassId === classRecord.id : member.discipleshipClassId === classRecord.id,
      );
      const memberIds = new Set(classMembers.map((member) => member.id));
      const sessions = data.attendanceSessions.filter((session) => session.area === attendanceArea && session.classId === classRecord.id);
      const records = sessions.flatMap((session) => session.records).filter((record) => memberIds.has(record.memberId));
      const presentRecords = records.filter((record) => record.status === "Presente").length;

      return {
        area,
        attendanceRate: percentage(presentRecords, records.length),
        classId: classRecord.id,
        className: classRecord.name,
        presentRecords,
        sessions: sessions.length,
        students: classMembers.length,
        teacher: classRecord.teacher || "Sem professor definido",
        totalRecords: records.length,
      };
    })
    .filter((item) => item.students > 0 || item.sessions > 0);
}

function buildQuickAnswers({
  attendance,
  data,
  discipleshipStudents,
  formationLowAttendance,
  newMembersThisMonth,
  panelAbsentRows,
  pendingCare,
  pendingRegistrationRequests,
  schoolStudents,
  upcomingPanelEvents,
  visitorsInFollowUp,
}: {
  attendance: ReturnType<typeof attendanceCounts>;
  data: AppData;
  discipleshipStudents: number;
  formationLowAttendance: FormationClassStat[];
  newMembersThisMonth: MemberRecord[];
  panelAbsentRows: AbsenceAlert[];
  pendingCare: number;
  pendingRegistrationRequests: number;
  schoolStudents: number;
  upcomingPanelEvents: ChurchEvent[];
  visitorsInFollowUp: number;
}): QuickAnswer[] {
  const nextEvent = [...upcomingPanelEvents].sort(sortEventsByDate)[0];
  const lowAttendanceNames = formationLowAttendance.slice(0, 3).map((item) => item.className).join(", ");
  const registrationWaiting = data.registrationRequests.filter((request) => request.status === "Aguardando aprovacao").length;
  const registrationInReview = data.registrationRequests.filter((request) => request.status === "Em analise").length;
  const openCareRequests = data.careRequests.filter((request) => request.status !== "Concluido");
  const unassignedCare = openCareRequests.filter((request) => !request.responsible).length;
  const unscheduledCare = openCareRequests.filter((request) => !request.scheduleDate).length;

  return [
    {
      answer: `Há ${pendingRegistrationRequests} pré-cadastro${pendingRegistrationRequests === 1 ? "" : "s"} pendente${pendingRegistrationRequests === 1 ? "" : "s"}: ${registrationWaiting} aguardando aprovação e ${registrationInReview} em análise. Revise primeiro quem já enviou consentimento e telefone válido.`,
      module: "overview",
      question: "Como está a fila de pré-cadastros?",
    },
    {
      answer: `Existem ${pendingCare} atendimento${pendingCare === 1 ? "" : "s"} pastoral${pendingCare === 1 ? "" : "is"} em aberto. Desses, ${unassignedCare} estão sem responsável e ${unscheduledCare} ainda não têm agenda definida.`,
      module: "pastoral",
      question: "Como está o atendimento pastoral?",
    },
    {
      answer: nextEvent
        ? `O próximo evento registrado é "${nextEvent.title}", em ${formatDate(nextEvent.date)}${nextEvent.time ? ` às ${nextEvent.time}` : ""}.`
        : "Não há evento próximo registrado nesta visão. Cadastre a agenda para alimentar o painel e a página pública.",
      module: "events",
      question: "Qual é o próximo evento?",
    },
    {
      answer: `A formação tem ${schoolStudents} aluno${schoolStudents === 1 ? "" : "s"} na EBD e ${discipleshipStudents} no Discipulado. A frequência registrada está em ${percentage(attendance.present, attendance.total)}.`,
      module: "school",
      question: "Como está a EBD e o Discipulado?",
    },
    {
      answer: formationLowAttendance.length
        ? `${formationLowAttendance.length} turma${formationLowAttendance.length === 1 ? "" : "s"} aparece${formationLowAttendance.length === 1 ? "" : "m"} com presença abaixo de 75%: ${lowAttendanceNames}.`
        : "Nenhuma turma com chamadas registradas aparece abaixo de 75% de presença nesta visão.",
      module: formationLowAttendance[0]?.area === "Discipulado" ? "discipleship" : "school",
      question: "Quais turmas precisam de acompanhamento?",
    },
    {
      answer: panelAbsentRows.length
        ? `${panelAbsentRows.length} aluno${panelAbsentRows.length === 1 ? "" : "s"} está${panelAbsentRows.length === 1 ? "" : "ão"} com alerta de faltas recorrentes. Abra Presença para revisar os nomes e observações.`
        : "Não há alerta de faltas recorrentes neste momento.",
      module: "school",
      question: "Tem alguém faltando muito?",
    },
    {
      answer: `Neste mês entraram ${newMembersThisMonth.length} novo${newMembersThisMonth.length === 1 ? "" : "s"} cadastro${newMembersThisMonth.length === 1 ? "" : "s"}, há ${visitorsInFollowUp} visitante${visitorsInFollowUp === 1 ? "" : "s"} em acompanhamento e ${data.members.length} pessoa${data.members.length === 1 ? "" : "s"} cadastrada${data.members.length === 1 ? "" : "s"} nesta visão.`,
      module: "members",
      question: "Como está o crescimento?",
    },
  ];
}

function copyQuickAnswersText(answers: QuickAnswer[], scopeLabel: string) {
  return [
    `Perguntas rápidas - ${scopeLabel}`,
    "",
    ...answers.flatMap((answer) => [`${answer.question}`, answer.answer, ""]),
  ].join("\n").trim();
}

function buildInsights({
  absentRows,
  data,
  monthlyBirthdays,
  pendingRegistrationRequests,
  upcomingPanelEvents,
}: Pick<IntelligencePanelProps, "absentRows" | "data" | "monthlyBirthdays" | "pendingRegistrationRequests" | "upcomingPanelEvents">) {
  const unassignedCare = data.careRequests.filter((request) => !request.responsible && request.status !== "Concluido");
  const visitorsWithoutContact = data.visitors.filter((visitor) => !visitor.contactMade && visitor.integrationStatus !== "Integrado");
  const incompleteMembers = data.members.filter(isMissingMemberData);
  const unpublishedMural = data.mural.filter((item) => !item.published);
  const attendance = attendanceCounts(data);
  const insights = [];

  if (pendingRegistrationRequests.length) {
    insights.push({
      level: "high",
      title: `${pendingRegistrationRequests.length} pré-cadastro${pendingRegistrationRequests.length === 1 ? "" : "s"} aguardando decisão`,
      text: "A secretaria deve analisar primeiro para liberar acesso e evitar fila acumulada.",
    });
  }

  if (unassignedCare.length) {
    insights.push({
      level: "high",
      title: `${unassignedCare.length} atendimento${unassignedCare.length === 1 ? "" : "s"} sem responsável`,
      text: "Defina líder ou pastor responsável para que o pedido não fique parado.",
    });
  }

  if (visitorsWithoutContact.length) {
    insights.push({
      level: "medium",
      title: `${visitorsWithoutContact.length} visitante${visitorsWithoutContact.length === 1 ? "" : "s"} sem contato registrado`,
      text: "Boa oportunidade para fortalecer acolhimento e integração.",
    });
  }

  if (absentRows.length || attendance.contact) {
    insights.push({
      level: "medium",
      title: "Acompanhamento de frequência precisa de atenção",
      text: `${absentRows.length} aluno${absentRows.length === 1 ? "" : "s"} com faltas recorrentes e ${attendance.contact} marcação${attendance.contact === 1 ? "" : "ões"} de contato.`,
    });
  }

  if (incompleteMembers.length) {
    insights.push({
      level: "low",
      title: `${incompleteMembers.length} ficha${incompleteMembers.length === 1 ? "" : "s"} com dados incompletos`,
      text: "Atualize telefone, e-mail, congregação, aniversário e grupos para melhorar relatórios e comunicação.",
    });
  }

  if (monthlyBirthdays.length) {
    insights.push({
      level: "low",
      title: `${monthlyBirthdays.length} aniversariante${monthlyBirthdays.length === 1 ? "" : "s"} neste mês`,
      text: "Use comunicação e mural para aproximar a igreja desses membros.",
    });
  }

  if (!upcomingPanelEvents.length) {
    insights.push({
      level: "medium",
      title: "Agenda da semana sem eventos futuros",
      text: "Cadastre os próximos encontros para alimentar painel, mural público e visão do membro.",
    });
  }

  if (unpublishedMural.length) {
    insights.push({
      level: "low",
      title: `${unpublishedMural.length} mural${unpublishedMural.length === 1 ? "" : "ais"} em rascunho`,
      text: "Revise os itens prontos e publique apenas o que estiver seguro para todos verem.",
    });
  }

  return insights.slice(0, 6);
}

function buildActionTasks({
  absentRows,
  data,
  pendingRegistrationRequests,
  upcomingPanelEvents,
}: Pick<IntelligencePanelProps, "absentRows" | "data" | "pendingRegistrationRequests" | "upcomingPanelEvents">): ActionTask[] {
  const pendingCare = data.careRequests.filter((request) => request.status !== "Concluido");
  const unassignedCare = pendingCare.filter((request) => !request.responsible);
  const visitorsWithoutContact = data.visitors.filter((visitor) => !visitor.contactMade && visitor.integrationStatus !== "Integrado");
  const incompleteMembers = data.members.filter(isMissingMemberData);
  const unpublishedMural = data.mural.filter((item) => !item.published);
  const activeNotices = data.notices.filter((notice) => notice.status === "Publicado");

  const tasks: ActionTask[] = [
    {
      count: pendingRegistrationRequests.length,
      description: "Analisar, aprovar como membro/visitante ou recusar com observação.",
      module: "overview",
      priority: "high",
      title: "Pré-cadastros aguardando",
    },
    {
      count: unassignedCare.length,
      description: "Definir responsável e avançar o atendimento pastoral.",
      module: "pastoral",
      priority: "high",
      title: "Atendimentos sem responsável",
    },
    {
      count: visitorsWithoutContact.length,
      description: "Registrar contato, retorno ou integração do visitante.",
      module: "visitors",
      priority: "medium",
      title: "Visitantes sem contato",
    },
    {
      count: absentRows.length,
      description: "Ver alunos com faltas recorrentes ou necessidade de contato.",
      module: "reports",
      priority: "medium",
      title: "Frequência para acompanhar",
    },
    {
      count: incompleteMembers.length,
      description: "Completar fichas para melhorar busca, relatórios e comunicação.",
      module: "members",
      priority: "low",
      title: "Fichas incompletas",
    },
    {
      count: upcomingPanelEvents.length ? 0 : 1,
      description: "Cadastrar próximos eventos para alimentar o painel e a agenda pública.",
      module: "events",
      priority: "medium",
      title: "Agenda sem próximos eventos",
    },
    {
      count: unpublishedMural.length,
      description: "Revisar rascunhos e publicar somente os avisos prontos.",
      module: "mural",
      priority: "low",
      title: "Murais em rascunho",
    },
    {
      count: activeNotices.length ? 0 : 1,
      description: "Publicar um comunicado ativo para manter os membros informados.",
      module: "notices",
      priority: "low",
      title: "Sem comunicado publicado",
    },
  ];

  return tasks.filter((task) => task.count > 0);
}

function healthScoreForTasks(tasks: ActionTask[]) {
  const score = tasks.reduce((currentScore, task) => {
    const weight = task.priority === "high" ? 18 : task.priority === "medium" ? 10 : 5;
    return currentScore - Math.min(task.count, 5) * weight;
  }, 100);

  return Math.max(0, Math.min(100, score));
}

function healthLabel(score: number) {
  if (score >= 85) return "Muito boa";
  if (score >= 70) return "Boa";
  if (score >= 50) return "Atenção";
  return "Crítica";
}

function copyActionTasksText(tasks: ActionTask[], scopeLabel: string) {
  if (!tasks.length) return `Central de pendências - ${scopeLabel}\n\nNenhuma pendência administrativa principal encontrada.`;

  return [
    `Central de pendências - ${scopeLabel}`,
    "",
    ...tasks.map((task, index) => {
      const priority = task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa";
      return `${index + 1}. ${task.title}\nQuantidade: ${task.count}\nPrioridade: ${priority}\nOrientação: ${task.description}`;
    }),
  ].join("\n\n");
}

function copyCommunicationSuggestionsText(suggestions: CommunicationSuggestion[], scopeLabel: string) {
  if (!suggestions.length) return `Sugestões de comunicação - ${scopeLabel}\n\nNenhuma sugestão de comunicação necessária agora.`;

  return [
    `Sugestões de comunicação - ${scopeLabel}`,
    "",
    ...suggestions.map((suggestion, index) => `${index + 1}. ${suggestion.title}\nPúblico: ${suggestion.audience}\n${suggestion.text}`),
  ].join("\n\n");
}

function copyExecutiveSummaryText({
  actionTasks,
  attendance,
  data,
  healthScore,
  pendingCare,
  pendingRegistrationRequests,
  quickAnswers,
  scopeLabel,
  upcomingPanelEvents,
  visitorsInFollowUp,
}: {
  actionTasks: ActionTask[];
  attendance: ReturnType<typeof attendanceCounts>;
  data: AppData;
  healthScore: number;
  pendingCare: number;
  pendingRegistrationRequests: number;
  quickAnswers: QuickAnswer[];
  scopeLabel: string;
  upcomingPanelEvents: ChurchEvent[];
  visitorsInFollowUp: number;
}) {
  const firstTasks = actionTasks.slice(0, 4).map((task, index) => `${index + 1}. ${task.title}: ${task.count} - ${task.description}`);
  const firstAnswers = quickAnswers.slice(0, 3).map((answer) => `${answer.question}\n${answer.answer}`);

  return [
    `Resumo executivo - ${scopeLabel}`,
    "",
    `Saúde operacional: ${healthScore}/100 (${healthLabel(healthScore)})`,
    `Membros cadastrados: ${data.members.length}`,
    `Pré-cadastros pendentes: ${pendingRegistrationRequests}`,
    `Visitantes em acompanhamento: ${visitorsInFollowUp}`,
    `Atendimentos pastorais: ${pendingCare}`,
    `Eventos próximos: ${upcomingPanelEvents.length}`,
    `Frequência registrada: ${percentage(attendance.present, attendance.total)}`,
    "",
    "Pendências principais:",
    ...(firstTasks.length ? firstTasks : ["Nenhuma pendência administrativa principal encontrada."]),
    "",
    "Perguntas rápidas:",
    ...(firstAnswers.length ? firstAnswers : ["Nenhuma resposta automática disponível neste escopo."]),
  ].join("\n");
}

function buildCommunicationSuggestions({
  data,
  monthlyBirthdays,
  pendingRegistrationRequests,
  upcomingPanelEvents,
}: Pick<IntelligencePanelProps, "data" | "monthlyBirthdays" | "pendingRegistrationRequests" | "upcomingPanelEvents">): CommunicationSuggestion[] {
  const visitorsWithoutContact = data.visitors.filter((visitor) => !visitor.contactMade && visitor.integrationStatus !== "Integrado");
  const unassignedCare = data.careRequests.filter((request) => !request.responsible && request.status !== "Concluido");
  const nextEvent = [...upcomingPanelEvents].sort(sortEventsByDate)[0];
  const suggestions: CommunicationSuggestion[] = [];

  if (nextEvent) {
    suggestions.push({
      audience: "Membros e congregação",
      module: "events",
      title: "Lembrete da agenda",
      text: `A paz do Senhor! Passando para lembrar: ${nextEvent.title} será em ${formatDate(nextEvent.date)}, ${nextEvent.time || "horário a confirmar"}, em ${nextEvent.location || "local a confirmar"}. Contamos com sua presença!`,
    });
  }

  if (monthlyBirthdays.length) {
    const names = monthlyBirthdays.slice(0, 5).map((member) => member.fullName).join(", ");
    suggestions.push({
      audience: "Aniversariantes do mês",
      module: "messages",
      title: "Mensagem para aniversariantes",
      text: `A Igreja Conectada deseja um mês abençoado aos aniversariantes: ${names}${monthlyBirthdays.length > 5 ? " e demais irmãos" : ""}. Que Deus continue guiando cada família com graça e paz.`,
    });
  }

  if (visitorsWithoutContact.length) {
    suggestions.push({
      audience: "Equipe de acolhimento",
      module: "visitors",
      title: "Lembrete de acolhimento",
      text: `Equipe, temos ${visitorsWithoutContact.length} visitante${visitorsWithoutContact.length === 1 ? "" : "s"} sem contato registrado. Vamos revisar a lista e fazer o acompanhamento com carinho ainda esta semana.`,
    });
  }

  if (pendingRegistrationRequests.length) {
    suggestions.push({
      audience: "Secretaria",
      module: "overview",
      title: "Pré-cadastros pendentes",
      text: `Secretaria, existem ${pendingRegistrationRequests.length} pré-cadastro${pendingRegistrationRequests.length === 1 ? "" : "s"} aguardando análise. Por favor, revise para liberar o acesso dos membros no sistema.`,
    });
  }

  if (unassignedCare.length) {
    suggestions.push({
      audience: "Liderança pastoral",
      module: "pastoral",
      title: "Atendimento pastoral pendente",
      text: `Liderança, temos ${unassignedCare.length} pedido${unassignedCare.length === 1 ? "" : "s"} pastoral${unassignedCare.length === 1 ? "" : "is"} sem responsável definido. Vamos encaminhar para que ninguém fique sem retorno.`,
    });
  }

  return suggestions.slice(0, 5);
}

function buildCongregationSummary({
  data,
  monthlyBirthdays,
  upcomingPanelEvents,
}: Pick<IntelligencePanelProps, "data" | "monthlyBirthdays" | "upcomingPanelEvents">): CongregationSummary[] {
  const summaries = new Map<string, CongregationSummary>();

  function ensureSummary(name: string | undefined) {
    const key = congregationName(name);
    const existing = summaries.get(key);
    if (existing) return existing;
    const summary: CongregationSummary = {
      birthdays: 0,
      events: 0,
      members: 0,
      name: key,
      pastoralPending: 0,
      visitors: 0,
    };
    summaries.set(key, summary);
    return summary;
  }

  data.members.forEach((member) => {
    ensureSummary(member.congregation).members += 1;
  });

  monthlyBirthdays.forEach((member) => {
    ensureSummary(member.congregation).birthdays += 1;
  });

  data.visitors
    .filter((visitor) => visitor.integrationStatus !== "Integrado")
    .forEach((visitor) => {
      ensureSummary(visitor.congregation).visitors += 1;
    });

  data.careRequests
    .filter((request) => request.status !== "Concluido")
    .forEach((request) => {
      ensureSummary(request.congregation).pastoralPending += 1;
    });

  upcomingPanelEvents.forEach((event) => {
    ensureSummary(event.congregation).events += 1;
  });

  return [...summaries.values()].sort((first, second) => second.members - first.members || first.name.localeCompare(second.name));
}

function ownerForTask(task: ActionTask) {
  if (task.module === "overview") return "Secretaria";
  if (task.module === "pastoral") return "Pastores e liderança";
  if (task.module === "visitors") return "Acolhimento";
  if (task.module === "members") return "Secretaria";
  if (task.module === "events") return "Secretaria / agenda";
  if (task.module === "mural" || task.module === "notices") return "Comunicação";
  if (task.module === "reports") return "Professores / liderança";
  return "Administração";
}

function dueForPriority(priority: ActionTask["priority"], index: number) {
  if (priority === "high") return index === 0 ? "Hoje" : "Até 24h";
  if (priority === "medium") return "Até 48h";
  return "Nesta semana";
}

function buildWeeklyPlan(actionTasks: ActionTask[], upcomingPanelEvents: ChurchEvent[]): WeeklyPlanItem[] {
  const taskItems = actionTasks.slice(0, 6).map((task, index) => ({
    action: task.description,
    due: dueForPriority(task.priority, index),
    module: task.module,
    owner: ownerForTask(task),
    priority: task.priority,
    title: task.title,
  }));

  const eventItems = [...upcomingPanelEvents]
    .sort(sortEventsByDate)
    .slice(0, 2)
    .map((event) => ({
      action: `${event.title} em ${formatDate(event.date)}${event.time ? `, ${event.time}` : ""}. Conferir responsável, local e divulgação.`,
      due: "Antes do evento",
      module: "events" as ModuleKey,
      owner: event.responsible || event.ministry || "Agenda",
      priority: "low" as const,
      title: "Preparar próximo evento",
    }));

  return [...taskItems, ...eventItems].slice(0, 8);
}

function copyWeeklyPlanText(plan: WeeklyPlanItem[]) {
  return plan
    .map((item, index) => `${index + 1}. ${item.title} - ${item.owner} - ${item.due}\n${item.action}`)
    .join("\n\n");
}

function buildAutomationSuggestions({
  data,
  monthlyBirthdays,
  pendingRegistrationRequests,
  upcomingPanelEvents,
}: Pick<IntelligencePanelProps, "data" | "monthlyBirthdays" | "pendingRegistrationRequests" | "upcomingPanelEvents">): AutomationSuggestion[] {
  const approvedDevotionals = data.devotionals.filter((devotional) => devotional.status === "Aprovado" || devotional.status === "Publicado");
  const visitorsWithoutContact = data.visitors.filter((visitor) => !visitor.contactMade && visitor.integrationStatus !== "Integrado");
  const pendingCare = data.careRequests.filter((request) => request.status !== "Concluido");
  const publishedMural = data.mural.filter((item) => item.published);
  const communicationTemplates = data.messageTemplates.length;

  return [
    {
      description:
        approvedDevotionals.length >= 7
          ? "Há devocionais suficientes para preparar uma semana automática."
          : "Cadastre ou aprove pelo menos 7 devocionais para manter a semana completa.",
      module: "devotional",
      readiness: approvedDevotionals.length >= 7 ? "Pronta" : "Revisar dados",
      title: "Devocional semanal automático",
    },
    {
      description:
        monthlyBirthdays.length && communicationTemplates
          ? "Pode gerar mensagens mensais para aniversariantes usando modelos existentes."
          : "Cadastre modelos de mensagem e mantenha aniversários preenchidos nas fichas.",
      module: "messages",
      readiness: monthlyBirthdays.length && communicationTemplates ? "Pronta" : "Revisar dados",
      title: "Lembrete de aniversariantes",
    },
    {
      description:
        visitorsWithoutContact.length
          ? "Existem visitantes que podem receber acompanhamento pela equipe."
          : "Sem visitantes pendentes agora; mantenha o registro de contato atualizado.",
      module: "visitors",
      readiness: visitorsWithoutContact.length ? "Pronta" : "Revisar dados",
      title: "Acompanhamento de visitantes",
    },
    {
      description:
        upcomingPanelEvents.length
          ? "A agenda possui eventos próximos para gerar lembretes manuais ou automáticos."
          : "Cadastre eventos futuros para liberar lembretes úteis.",
      module: "events",
      readiness: upcomingPanelEvents.length ? "Pronta" : "Revisar dados",
      title: "Lembrete de agenda",
    },
    {
      description:
        pendingCare.length
          ? "Pedidos pastorais em aberto podem gerar lembretes internos para responsáveis."
          : "Sem pedidos pastorais pendentes no momento.",
      module: "pastoral",
      readiness: pendingCare.length ? "Pronta" : "Revisar dados",
      title: "Lembrete pastoral",
    },
    {
      description:
        publishedMural.length
          ? "Murais publicados podem alimentar compartilhamentos e avisos rápidos."
          : "Publique pelo menos um mural para automatizar divulgação.",
      module: "mural",
      readiness: publishedMural.length ? "Pronta" : "Configurar",
      title: "Divulgação de mural",
    },
    {
      description:
        pendingRegistrationRequests.length
          ? "Pré-cadastros pendentes podem gerar alerta para a secretaria."
          : "Sem fila de pré-cadastro no momento.",
      module: "overview",
      readiness: pendingRegistrationRequests.length ? "Pronta" : "Revisar dados",
      title: "Alerta de pré-cadastro",
    },
  ];
}

function buildGovernanceItems({
  data,
}: Pick<IntelligencePanelProps, "data">): GovernanceItem[] {
  const incompleteMembers = data.members.filter(isMissingMemberData);
  const membersWithoutPhotoConsent = data.members.filter((member) => member.photoUrl && !member.photoConsent);
  const registrationsWithoutConsent = data.registrationRequests.filter((request) => !request.privacyConsent);
  const registrationsMissingContact = data.registrationRequests.filter((request) => request.status !== "Aprovado" && (!request.phone || !request.email));
  const pendingOrBlockedUsers = data.users.filter((user) => user.status !== "Ativo");
  const publicMuralWithExternalLink = data.mural.filter((item) => item.published && item.socialUrl);
  const membersWithoutCongregation = data.members.filter((member) => !member.congregation);
  const careWithSensitiveNotes = data.careRequests.filter((request) => request.summary.length > 120 || request.returnNote.length > 120);
  const openCareRequests = data.careRequests.filter((request) => request.status !== "Concluido");
  const careWithoutOwnerOrSchedule = openCareRequests.filter((request) => !request.responsible || !request.scheduleDate);
  const todayKey = dateAfterDays(0);
  const upcomingEvents = data.events.filter((event) => event.date >= todayKey && event.status !== "Concluido");
  const internalUpcomingEvents = upcomingEvents.filter((event) => !event.published);
  const publicEventsMissingDetails = upcomingEvents.filter((event) => event.published && (!event.location || !event.description));
  const registrationEventsMissingDetails = upcomingEvents.filter((event) => event.registrationUrl && (!event.description || !event.location || !event.published));

  return [
    {
      count: incompleteMembers.length,
      description: "Fichas incompletas podem prejudicar relatórios, comunicação e isolamento por congregação.",
      module: "members",
      status: incompleteMembers.length ? "Atenção" : "Em dia",
      title: "Qualidade cadastral",
    },
    {
      count: membersWithoutPhotoConsent.length,
      description: "Há membros com foto cadastrada sem autorização marcada para exibição.",
      module: "members",
      status: membersWithoutPhotoConsent.length ? "Revisar" : "Em dia",
      title: "Consentimento de foto",
    },
    {
      count: registrationsWithoutConsent.length,
      description: "Pré-cadastros sem aceite de privacidade devem ser revisados antes da aprovação.",
      module: "overview",
      status: registrationsWithoutConsent.length ? "Revisar" : "Em dia",
      title: "Consentimento LGPD",
    },
    {
      count: registrationsMissingContact.length,
      description: "Pré-cadastros pendentes sem telefone ou e-mail dificultam confirmação, login e retorno da secretaria.",
      module: "overview",
      status: registrationsMissingContact.length ? "Atenção" : "Em dia",
      title: "Contato no pré-cadastro",
    },
    {
      count: pendingOrBlockedUsers.length,
      description: "Acessos pendentes ou bloqueados precisam ser conferidos periodicamente.",
      module: "users",
      status: pendingOrBlockedUsers.length ? "Atenção" : "Em dia",
      title: "Perfis de acesso",
    },
    {
      count: membersWithoutCongregation.length,
      description: "Cadastros sem congregação dificultam a separação segura entre congregações.",
      module: "members",
      status: membersWithoutCongregation.length ? "Atenção" : "Em dia",
      title: "Congregação obrigatória",
    },
    {
      count: publicMuralWithExternalLink.length,
      description: "Murais públicos com link externo devem ser revisados antes de compartilhamento.",
      module: "mural",
      status: publicMuralWithExternalLink.length ? "Atenção" : "Em dia",
      title: "Links públicos do mural",
    },
    {
      count: careWithSensitiveNotes.length,
      description: "Atendimentos podem conter dados sensíveis; mantenha acesso restrito e texto objetivo.",
      module: "pastoral",
      status: careWithSensitiveNotes.length ? "Revisar" : "Em dia",
      title: "Notas pastorais sensíveis",
    },
    {
      count: careWithoutOwnerOrSchedule.length,
      description: "Pedidos pastorais abertos precisam ter responsável e agenda para não ficarem parados na fila.",
      module: "pastoral",
      status: careWithoutOwnerOrSchedule.length ? "Atenção" : "Em dia",
      title: "Encaminhamento pastoral",
    },
    {
      count: internalUpcomingEvents.length,
      description: "Eventos futuros marcados como internos não aparecem na agenda pública nem nos links de compartilhamento.",
      module: "events",
      status: internalUpcomingEvents.length ? "Atenção" : "Em dia",
      title: "Agenda pública",
    },
    {
      count: publicEventsMissingDetails.length,
      description: "Eventos públicos sem local ou descrição ficam menos claros para membros e visitantes.",
      module: "events",
      status: publicEventsMissingDetails.length ? "Atenção" : "Em dia",
      title: "Detalhes da agenda",
    },
    {
      count: registrationEventsMissingDetails.length,
      description: "Eventos com inscrição precisam estar públicos e com local/descrição para evitar dúvidas no compartilhamento.",
      module: "events",
      status: registrationEventsMissingDetails.length ? "Revisar" : "Em dia",
      title: "Inscrições da agenda",
    },
  ];
}

function countByLabel<T>(items: T[], labelForItem: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = labelForItem(item).trim() || "Não informado";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));
}

function printExecutiveSummary({
  actionTasks,
  attendance,
  communicationSuggestions,
  data,
  formationClassStats,
  formationLowAttendance,
  healthScore,
  insights,
  monthlyBirthdays,
  pendingCare,
  pendingRegistrationRequests,
  quickAnswers,
  scopeLabel,
  schoolStudents,
  discipleshipStudents,
  upcomingPanelEvents,
  visitorsInFollowUp,
}: {
  actionTasks: ActionTask[];
  attendance: ReturnType<typeof attendanceCounts>;
  communicationSuggestions: CommunicationSuggestion[];
  data: AppData;
  formationClassStats: FormationClassStat[];
  formationLowAttendance: number;
  healthScore: number;
  insights: { level: string; text: string; title: string }[];
  monthlyBirthdays: MemberRecord[];
  pendingCare: number;
  pendingRegistrationRequests: number;
  quickAnswers: QuickAnswer[];
  scopeLabel: string;
  schoolStudents: number;
  discipleshipStudents: number;
  upcomingPanelEvents: ChurchEvent[];
  visitorsInFollowUp: number;
}) {
  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  const taskRows = actionTasks
    .map(
      (task) => `
        <tr>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(String(task.count))}</td>
          <td>${escapeHtml(task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa")}</td>
          <td>${escapeHtml(task.description)}</td>
        </tr>
      `,
    )
    .join("");
  const insightRows = insights
    .map((insight) => `<li><strong>${escapeHtml(insight.title)}</strong><span>${escapeHtml(insight.text)}</span></li>`)
    .join("");
  const quickAnswerRows = quickAnswers
    .map((answer) => `<li><strong>${escapeHtml(answer.question)}</strong><span>${escapeHtml(answer.answer)}</span></li>`)
    .join("");
  const communicationRows = communicationSuggestions
    .map(
      (suggestion) => `
        <tr>
          <td>${escapeHtml(suggestion.title)}</td>
          <td>${escapeHtml(suggestion.audience)}</td>
          <td>${escapeHtml(suggestion.text)}</td>
        </tr>
      `,
    )
    .join("");
  const eventRows = upcomingPanelEvents
    .slice(0, 7)
    .map(
      (event) => `
        <tr>
          <td>${escapeHtml(formatDate(event.date))}</td>
          <td>${escapeHtml(event.time || "Sem horário")}</td>
          <td>${escapeHtml(event.title)}</td>
          <td>${escapeHtml(event.ministry || "Sem grupo")}</td>
        </tr>
      `,
    )
    .join("");
  const formationRows = formationClassStats
    .slice(0, 10)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.area)}</td>
          <td>${escapeHtml(item.className)}</td>
          <td>${escapeHtml(item.teacher)}</td>
          <td>${escapeHtml(String(item.students))}</td>
          <td>${escapeHtml(String(item.sessions))}</td>
          <td>${escapeHtml(item.attendanceRate)}</td>
        </tr>
      `,
    )
    .join("");

  return printHtmlDocument(
    "Resumo executivo - Inteligência",
    `
      <style>
        .executive-score { align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; display: flex; gap: 18px; margin: 18px 0; padding: 18px; }
        .executive-score strong { color: #1d4ed8; font-size: 46px; line-height: 1; }
        .executive-grid { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 16px 0; }
        .executive-card { border: 1px solid #dbe3ef; border-radius: 12px; padding: 12px; }
        .executive-card span { color: #64748b; display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .executive-card strong { display: block; font-size: 20px; margin-top: 4px; }
        .executive-table { border-collapse: collapse; margin-top: 10px; width: 100%; }
        .executive-table th, .executive-table td { border: 1px solid #dbe3ef; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
        .executive-table th { background: #f8fafc; }
        .executive-list { display: grid; gap: 10px; margin: 10px 0; padding-left: 18px; }
        .executive-list span { color: #475569; display: block; margin-top: 3px; }
        @media print { .executive-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      </style>
      <p class="eyebrow">Resumo gerado em ${escapeHtml(today)}</p>
      <h1>Resumo executivo da igreja</h1>
      <p class="doc-text"><strong>Escopo:</strong> ${escapeHtml(scopeLabel)}</p>
      <div class="executive-score">
        <strong>${healthScore}</strong>
        <div>
          <h2>Saúde operacional: ${escapeHtml(healthLabel(healthScore))}</h2>
          <p class="doc-text">Pontuação calculada pelas pendências abertas, agenda, visitantes, pré-cadastros, pastoral e qualidade dos cadastros.</p>
        </div>
      </div>
      <div class="executive-grid">
        <div class="executive-card"><span>Membros</span><strong>${data.members.length}</strong></div>
        <div class="executive-card"><span>Pré-cadastros</span><strong>${pendingRegistrationRequests}</strong></div>
        <div class="executive-card"><span>Visitantes</span><strong>${visitorsInFollowUp}</strong></div>
        <div class="executive-card"><span>Pastoral</span><strong>${pendingCare}</strong></div>
        <div class="executive-card"><span>Agenda</span><strong>${upcomingPanelEvents.length}</strong></div>
        <div class="executive-card"><span>Aniversariantes</span><strong>${monthlyBirthdays.length}</strong></div>
        <div class="executive-card"><span>Frequência</span><strong>${percentage(attendance.present, attendance.total)}</strong></div>
        <div class="executive-card"><span>Chamadas</span><strong>${data.attendanceSessions.length}</strong></div>
        <div class="executive-card"><span>Alunos EBD</span><strong>${schoolStudents}</strong></div>
        <div class="executive-card"><span>Alunos Discipulado</span><strong>${discipleshipStudents}</strong></div>
        <div class="executive-card"><span>Turmas</span><strong>${formationClassStats.length}</strong></div>
        <div class="executive-card"><span>Formação atenção</span><strong>${formationLowAttendance}</strong></div>
      </div>
      <section class="doc-section">
        <h2>Pendências recomendadas</h2>
        <table class="executive-table">
          <thead><tr><th>Ação</th><th>Qtd.</th><th>Prioridade</th><th>Orientação</th></tr></thead>
          <tbody>${taskRows || `<tr><td colspan="4">Nenhuma pendência principal encontrada.</td></tr>`}</tbody>
        </table>
      </section>
      <section class="doc-section">
        <h2>Leitura inteligente</h2>
        <ul class="executive-list">${insightRows || "<li>Nenhum alerta crítico encontrado.</li>"}</ul>
      </section>
      <section class="doc-section">
        <h2>Perguntas rápidas</h2>
        <ul class="executive-list">${quickAnswerRows || "<li>Nenhuma resposta automática disponível neste escopo.</li>"}</ul>
      </section>
      <section class="doc-section">
        <h2>Sugestões de comunicação</h2>
        <table class="executive-table">
          <thead><tr><th>Sugestão</th><th>Público</th><th>Texto pronto</th></tr></thead>
          <tbody>${communicationRows || `<tr><td colspan="3">Nenhuma sugestão de comunicação necessária agora.</td></tr>`}</tbody>
        </table>
      </section>
      <section class="doc-section">
        <h2>Formação cristã</h2>
        <table class="executive-table">
          <thead><tr><th>Área</th><th>Turma</th><th>Professor</th><th>Alunos</th><th>Chamadas</th><th>Presença</th></tr></thead>
          <tbody>${formationRows || `<tr><td colspan="6">Nenhuma turma com alunos ou chamadas encontrada neste escopo.</td></tr>`}</tbody>
        </table>
      </section>
      <section class="doc-section">
        <h2>Próximos eventos</h2>
        <table class="executive-table">
          <thead><tr><th>Data</th><th>Horário</th><th>Evento</th><th>Grupo</th></tr></thead>
          <tbody>${eventRows || `<tr><td colspan="4">Nenhum evento próximo encontrado.</td></tr>`}</tbody>
        </table>
      </section>
    `,
  );
}

export function IntelligencePanel({
  absentRows,
  currentAccessRole,
  data,
  monthlyBirthdays,
  onOpenModule,
  pendingRegistrationRequests,
  upcomingPanelEvents,
}: IntelligencePanelProps) {
  const [copiedSuggestion, setCopiedSuggestion] = useState("");
  const [selectedCongregation, setSelectedCongregation] = useState("Todas");
  const congregationOptions = buildCongregationOptions(data);
  const panelData = scopedDataForCongregation(data, selectedCongregation);
  const panelMonthlyBirthdays = monthlyBirthdays.filter((member) => matchesCongregation(member.congregation, selectedCongregation));
  const panelPendingRegistrationRequests = pendingRegistrationRequests.filter((request) => matchesCongregation(request.congregation, selectedCongregation));
  const panelUpcomingPanelEvents = upcomingPanelEvents.filter((event) => matchesCongregation(event.congregation, selectedCongregation));
  const panelMemberNames = new Set(panelData.members.map((member) => member.fullName));
  const panelAbsentRows = selectedCongregation === "Todas" ? absentRows : absentRows.filter((row) => panelMemberNames.has(String(row[0] ?? "")));
  const scopeLabel = selectedCongregation === "Todas" ? "Todas as congregações" : selectedCongregation;
  const monthKey = currentMonthKey();
  const activeMembers = panelData.members.filter((member) => member.status === "Membro ativo");
  const newMembersThisMonth = panelData.members.filter((member) => recordMonth(member.createdAt || member.joinedAt) === monthKey);
  const visitorsInFollowUp = panelData.visitors.filter((visitor) => visitor.integrationStatus !== "Integrado");
  const integratedVisitors = panelData.visitors.filter((visitor) => visitor.integrationStatus === "Integrado");
  const pendingCare = panelData.careRequests.filter((request) => request.status !== "Concluido");
  const unassignedCare = pendingCare.filter((request) => !request.responsible);
  const publishedMural = panelData.mural.filter((item) => item.published);
  const attendance = attendanceCounts(panelData);
  const schoolStudents = panelData.members.filter((member) => member.schoolClassId).length;
  const discipleshipStudents = panelData.members.filter((member) => member.discipleshipClassId).length;
  const schoolFormationStats = formationStats("EBD", panelData.schoolClasses, panelData.members, panelData);
  const discipleshipFormationStats = formationStats("Discipulado", panelData.discipleshipClasses, panelData.members, panelData);
  const formationClassStats = [...schoolFormationStats, ...discipleshipFormationStats];
  const formationLowAttendance = formationClassStats.filter((item) => item.totalRecords > 0 && Number.parseFloat(item.attendanceRate) < 75);
  const incompleteMembers = panelData.members.filter(isMissingMemberData);
  const membersWithClass = panelData.members.filter((member) => member.schoolClassId || member.discipleshipClassId);
  const statusBreakdown = countByLabel(panelData.members, (member) => member.status).slice(0, 4);
  const ageBreakdown = countByLabel(panelData.members, (member) => member.ageGroup).slice(0, 5);
  const visitorFunnel = countByLabel(panelData.visitors, (visitor) => visitor.integrationStatus);
  const pastoralFunnel = countByLabel(panelData.careRequests, (request) => request.status === "Em analise" ? "Em análise" : request.status === "Concluido" ? "Concluído" : request.status);
  const engagementRate = percentage(membersWithClass.length, panelData.members.length);
  const visitorIntegrationRate = percentage(integratedVisitors.length, panelData.visitors.length);
  const confirmedTransactions = panelData.transactions.filter((transaction) => transaction.status === "Confirmado");
  const pendingTransactions = panelData.transactions.filter((transaction) => transaction.status === "Pendente");
  const financialIncome = confirmedTransactions
    .filter((transaction) => transaction.type === "Entrada" || transaction.type === "Dizimo" || transaction.type === "Oferta")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const financialExpense = confirmedTransactions
    .filter((transaction) => transaction.type === "Saida")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const assetsNeedingAttention = panelData.assets.filter((asset) => asset.condition === "Manutencao" || asset.condition === "Baixado");
  const insights = buildInsights({ absentRows: panelAbsentRows, data: panelData, monthlyBirthdays: panelMonthlyBirthdays, pendingRegistrationRequests: panelPendingRegistrationRequests, upcomingPanelEvents: panelUpcomingPanelEvents });
  const actionTasks = buildActionTasks({ absentRows: panelAbsentRows, data: panelData, pendingRegistrationRequests: panelPendingRegistrationRequests, upcomingPanelEvents: panelUpcomingPanelEvents });
  const communicationSuggestions = buildCommunicationSuggestions({ data: panelData, monthlyBirthdays: panelMonthlyBirthdays, pendingRegistrationRequests: panelPendingRegistrationRequests, upcomingPanelEvents: panelUpcomingPanelEvents });
  const congregationSummaries = buildCongregationSummary({ data: panelData, monthlyBirthdays: panelMonthlyBirthdays, upcomingPanelEvents: panelUpcomingPanelEvents });
  const weeklyPlan = buildWeeklyPlan(actionTasks, panelUpcomingPanelEvents);
  const automationSuggestions = buildAutomationSuggestions({ data: panelData, monthlyBirthdays: panelMonthlyBirthdays, pendingRegistrationRequests: panelPendingRegistrationRequests, upcomingPanelEvents: panelUpcomingPanelEvents });
  const governanceItems = buildGovernanceItems({ data: panelData });
  const nextEvents = [...panelUpcomingPanelEvents].sort(sortEventsByDate).slice(0, 5);
  const upcomingPublicEvents = panelUpcomingPanelEvents.filter((event) => event.published);
  const upcomingInternalEvents = panelUpcomingPanelEvents.filter((event) => !event.published);
  const upcomingRegistrationEvents = panelUpcomingPanelEvents.filter((event) => event.registrationUrl);
  const quickAnswers = buildQuickAnswers({
    attendance,
    data: panelData,
    discipleshipStudents,
    formationLowAttendance,
    newMembersThisMonth,
    panelAbsentRows,
    pendingCare: pendingCare.length,
    pendingRegistrationRequests: panelPendingRegistrationRequests.length,
    schoolStudents,
    upcomingPanelEvents: panelUpcomingPanelEvents,
    visitorsInFollowUp: visitorsInFollowUp.length,
  });
  const healthScore = healthScoreForTasks(actionTasks);

  async function copySuggestion(suggestion: CommunicationSuggestion) {
    await navigator.clipboard.writeText(suggestion.text);
    setCopiedSuggestion(suggestion.title);
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyAllCommunicationSuggestions() {
    await navigator.clipboard.writeText(copyCommunicationSuggestionsText(communicationSuggestions, scopeLabel));
    setCopiedSuggestion("communication-suggestions");
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyWeeklyPlan() {
    await navigator.clipboard.writeText(copyWeeklyPlanText(weeklyPlan));
    setCopiedSuggestion("weekly-plan");
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyActionTasks() {
    await navigator.clipboard.writeText(copyActionTasksText(actionTasks, scopeLabel));
    setCopiedSuggestion("action-tasks");
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyQuickAnswer(answer: QuickAnswer) {
    await navigator.clipboard.writeText(answer.answer);
    setCopiedSuggestion(answer.question);
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyAllQuickAnswers() {
    await navigator.clipboard.writeText(copyQuickAnswersText(quickAnswers, scopeLabel));
    setCopiedSuggestion("quick-answers");
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyExecutiveSummary() {
    await navigator.clipboard.writeText(
      copyExecutiveSummaryText({
        actionTasks,
        attendance,
        data: panelData,
        healthScore,
        pendingCare: pendingCare.length,
        pendingRegistrationRequests: panelPendingRegistrationRequests.length,
        quickAnswers,
        scopeLabel,
        upcomingPanelEvents: panelUpcomingPanelEvents,
        visitorsInFollowUp: visitorsInFollowUp.length,
      }),
    );
    setCopiedSuggestion("executive-summary");
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  return (
    <section className="content-grid intelligence-panel">
      <article className="surface wide intelligence-hero">
        <p className="eyebrow">BI e inteligência da igreja</p>
        <h2>Decisões pastorais e administrativas com base nos dados atuais.</h2>
        <p>
          Este painel transforma cadastros, agenda, presença, visitantes e atendimentos em alertas práticos para a liderança agir com mais rapidez.
        </p>
        <div className="intelligence-hero-grid">
          <span><strong>{panelData.members.length}</strong> pessoas cadastradas</span>
          <span><strong>{panelUpcomingPanelEvents.length}</strong> eventos próximos</span>
          <span><strong>{pendingCare.length}</strong> pedidos em acompanhamento</span>
          <span><strong>{currentAccessRole}</strong> visualizando</span>
        </div>
        <div className="intelligence-scope-control">
          <label htmlFor="intelligence-congregation-filter">
            Filtrar congregação
            <select
              id="intelligence-congregation-filter"
              onChange={(event) => setSelectedCongregation(event.target.value)}
              value={selectedCongregation}
            >
              {congregationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span>
            {selectedCongregation === "Todas"
              ? "Mostrando a visão geral de todas as congregações."
              : `Mostrando apenas dados vinculados a ${selectedCongregation}.`}
          </span>
        </div>
        <div className="intelligence-hero-actions">
          <button
            onClick={() =>
              printExecutiveSummary({
                actionTasks,
                attendance,
                communicationSuggestions,
                data: panelData,
                formationClassStats,
                formationLowAttendance: formationLowAttendance.length,
                healthScore,
                insights,
                monthlyBirthdays: panelMonthlyBirthdays,
                pendingCare: pendingCare.length,
                pendingRegistrationRequests: panelPendingRegistrationRequests.length,
                quickAnswers,
                scopeLabel,
                schoolStudents,
                discipleshipStudents,
                upcomingPanelEvents: nextEvents,
                visitorsInFollowUp: visitorsInFollowUp.length,
              })
            }
            type="button"
          >
            Imprimir resumo executivo
          </button>
          <button onClick={copyExecutiveSummary} type="button">
            {copiedSuggestion === "executive-summary" ? "Resumo copiado" : "Copiar resumo"}
          </button>
        </div>
      </article>

      <article className="surface wide intelligence-score-panel">
        <div>
          <p className="eyebrow">Saúde operacional</p>
          <h2>{healthLabel(healthScore)}</h2>
          <p>Uma leitura rápida do volume de pendências abertas e pontos que precisam de atenção da liderança.</p>
        </div>
        <div className="intelligence-score-ring" aria-label={`Saúde operacional ${healthScore} de 100`}>
          <strong>{healthScore}</strong>
          <span>de 100</span>
        </div>
      </article>

      <article className="surface wide intelligence-actions-panel">
        <div className="panel-heading">
          <h2>Central de pendências</h2>
          <button className="secondary" onClick={copyActionTasks} type="button">
            {copiedSuggestion === "action-tasks" ? "Pendências copiadas" : "Copiar pendências"}
          </button>
        </div>
        <div className="intelligence-actions-grid">
          {actionTasks.length ? (
            actionTasks.map((task) => (
              <button className={`intelligence-action-card insight-${task.priority}`} key={task.title} onClick={() => onOpenModule(task.module)} type="button">
                <span>{task.count}</span>
                <strong>{task.title}</strong>
                <small>{task.description}</small>
                <em>Abrir</em>
              </button>
            ))
          ) : (
            <p className="empty-state">Tudo certo por enquanto. Nenhuma pendência administrativa principal encontrada.</p>
          )}
        </div>
      </article>

      <article className="surface wide quick-answers-panel">
        <div className="panel-heading">
          <h2>Perguntas rápidas</h2>
          <button className="secondary" onClick={copyAllQuickAnswers} type="button">
            {copiedSuggestion === "quick-answers" ? "Respostas copiadas" : "Copiar tudo"}
          </button>
        </div>
        <div className="quick-answer-grid">
          {quickAnswers.map((answer) => (
            <div className="quick-answer-card" key={answer.question}>
              <strong>{answer.question}</strong>
              <p>{answer.answer}</p>
              <div className="row-actions">
                <button className="secondary" onClick={() => copyQuickAnswer(answer)} type="button">
                  {copiedSuggestion === answer.question ? "Resposta copiada" : "Copiar resposta"}
                </button>
                <button onClick={() => onOpenModule(answer.module)} type="button">
                  Abrir área
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="surface wide weekly-plan-panel">
        <div className="panel-heading">
          <h2>Plano dos próximos 7 dias</h2>
          <button className="secondary" disabled={!weeklyPlan.length} onClick={copyWeeklyPlan} type="button">
            {copiedSuggestion === "weekly-plan" ? "Plano copiado" : "Copiar plano"}
          </button>
        </div>
        <div className="weekly-plan-list">
          {weeklyPlan.length ? (
            weeklyPlan.map((item, index) => (
              <button className={`weekly-plan-item insight-${item.priority}`} key={`${item.title}-${index}`} onClick={() => onOpenModule(item.module)} type="button">
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.owner} • {item.due}</small>
                  <p>{item.action}</p>
                </div>
              </button>
            ))
          ) : (
            <p className="empty-state">Nenhuma ação recomendada para os próximos dias.</p>
          )}
        </div>
      </article>

      <article className="surface wide automation-readiness-panel">
        <div className="panel-heading">
          <h2>Mapa de automações</h2>
          <span>{automationSuggestions.filter((item) => item.readiness === "Pronta").length} prontas</span>
        </div>
        <div className="automation-readiness-grid">
          {automationSuggestions.map((item) => (
            <button className={`automation-readiness-card automation-${item.readiness.toLowerCase().replaceAll(" ", "-")}`} key={item.title} onClick={() => onOpenModule(item.module)} type="button">
              <span>{item.readiness}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </article>

      <article className="surface wide governance-panel">
        <div className="panel-heading">
          <h2>Governança e LGPD</h2>
          <span>{governanceItems.filter((item) => item.status !== "Em dia").length} ponto{governanceItems.filter((item) => item.status !== "Em dia").length === 1 ? "" : "s"} para revisar</span>
        </div>
        <div className="governance-grid">
          {governanceItems.map((item) => (
            <button className={`governance-card governance-${item.status.toLowerCase().replaceAll(" ", "-")}`} key={item.title} onClick={() => onOpenModule(item.module)} type="button">
              <span>{item.status}</span>
              <strong>{item.title}</strong>
              <small>{item.count} ocorrência{item.count === 1 ? "" : "s"}</small>
              <p>{item.description}</p>
            </button>
          ))}
        </div>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Indicadores principais</h2>
          <span>Atualizados pela base carregada</span>
        </div>
        <div className="report-grid intelligence-metrics">
          <div className="report-card">
            <strong>{panelData.members.length}</strong>
            <span>Membros e congregados</span>
            <small>{activeMembers.length} membros ativos • {newMembersThisMonth.length} novo(s) no mês</small>
          </div>
          <div className="report-card">
            <strong>{panelPendingRegistrationRequests.length}</strong>
            <span>Pré-cadastros pendentes</span>
            <small>{panelData.registrationRequests.length} solicitações no histórico</small>
          </div>
          <div className="report-card">
            <strong>{visitorsInFollowUp.length}</strong>
            <span>Visitantes em acompanhamento</span>
            <small>{panelData.visitors.filter((visitor) => !visitor.contactMade).length} sem contato registrado</small>
          </div>
          <div className="report-card">
            <strong>{pendingCare.length}</strong>
            <span>Atendimentos pastorais</span>
            <small>{unassignedCare.length} sem responsável definido</small>
          </div>
          <div className="report-card">
            <strong>{panelData.schoolClasses.length + panelData.discipleshipClasses.length}</strong>
            <span>Classes formativas</span>
            <small>{schoolStudents} EBD • {discipleshipStudents} discipulado</small>
          </div>
          <div className="report-card">
            <strong>{publishedMural.length}</strong>
            <span>Murais publicados</span>
            <small>{panelData.notices.filter((notice) => notice.status === "Publicado").length} comunicados ativos</small>
          </div>
          <div className="report-card">
            <strong>{panelUpcomingPanelEvents.length}</strong>
            <span>Próximos eventos</span>
            <small>{upcomingPublicEvents.length} públicos • {upcomingInternalEvents.length} internos</small>
          </div>
          <div className="report-card">
            <strong>{upcomingRegistrationEvents.length}</strong>
            <span>Eventos com inscrição</span>
            <small>{upcomingRegistrationEvents.length ? "Revisar links antes de compartilhar" : "Sem inscrições abertas na agenda"}</small>
          </div>
        </div>
      </article>

      <article className="surface wide growth-engagement-panel">
        <div className="panel-heading">
          <h2>Crescimento e engajamento</h2>
          <span>Perfil, integração e formação</span>
        </div>
        <div className="growth-engagement-grid">
          <div className="growth-card">
            <strong>{engagementRate}</strong>
            <span>membros vinculados a EBD ou Discipulado</span>
            <i><b style={{ width: engagementRate }} /></i>
            <small>{membersWithClass.length} de {panelData.members.length} cadastros</small>
          </div>
          <div className="growth-card">
            <strong>{visitorIntegrationRate}</strong>
            <span>visitantes integrados</span>
            <i><b style={{ width: visitorIntegrationRate }} /></i>
            <small>{integratedVisitors.length} de {panelData.visitors.length} visitantes</small>
          </div>
          <div className="growth-card">
            <strong>{newMembersThisMonth.length}</strong>
            <span>novos cadastros no mês</span>
            <small>{activeMembers.length} membros ativos na base</small>
          </div>
        </div>
        <div className="growth-breakdown-grid">
          <div>
            <h3>Situação dos membros</h3>
            {statusBreakdown.map((item) => (
              <span key={item.label}><b>{item.count}</b>{item.label}</span>
            ))}
          </div>
          <div>
            <h3>Faixa etária</h3>
            {ageBreakdown.map((item) => (
              <span key={item.label}><b>{item.count}</b>{item.label}</span>
            ))}
          </div>
        </div>
      </article>

      <article className="surface wide formation-intelligence-panel">
        <div className="panel-heading">
          <h2>Formação cristã</h2>
          <span>{formationClassStats.length} turma{formationClassStats.length === 1 ? "" : "s"} acompanhada{formationClassStats.length === 1 ? "" : "s"}</span>
        </div>
        <div className="formation-intelligence-summary">
          <button onClick={() => onOpenModule("school")} type="button">
            <strong>{schoolStudents}</strong>
            <span>alunos EBD</span>
            <small>{schoolFormationStats.length} turma{schoolFormationStats.length === 1 ? "" : "s"} com vínculo</small>
          </button>
          <button onClick={() => onOpenModule("discipleship")} type="button">
            <strong>{discipleshipStudents}</strong>
            <span>alunos Discipulado</span>
            <small>{discipleshipFormationStats.length} turma{discipleshipFormationStats.length === 1 ? "" : "s"} com vínculo</small>
          </button>
          <button onClick={() => onOpenModule("school")} type="button">
            <strong>{percentage(attendance.present, attendance.total)}</strong>
            <span>frequência média</span>
            <small>{attendance.total} marcações de chamada</small>
          </button>
          <button onClick={() => onOpenModule("school")} type="button">
            <strong>{formationLowAttendance.length}</strong>
            <span>turmas para atenção</span>
            <small>frequência abaixo de 75%</small>
          </button>
        </div>
        <div className="formation-class-grid">
          {formationClassStats.length ? (
            formationClassStats.slice(0, 6).map((item) => (
              <button className="formation-class-card" key={`${item.area}-${item.classId}`} onClick={() => onOpenModule(item.area === "EBD" ? "school" : "discipleship")} type="button">
                <span>{item.area}</span>
                <strong>{item.className}</strong>
                <small>{item.teacher}</small>
                <div>
                  <em>{item.students} aluno{item.students === 1 ? "" : "s"}</em>
                  <em>{item.sessions} chamada{item.sessions === 1 ? "" : "s"}</em>
                  <em>{item.attendanceRate} presença</em>
                </div>
              </button>
            ))
          ) : (
            <p className="empty-state">Nenhuma turma com alunos ou chamadas nesta visão.</p>
          )}
        </div>
      </article>

      <article className="surface wide follow-up-funnel-panel">
        <div className="panel-heading">
          <h2>Funil de acompanhamento</h2>
          <span>Visitantes e cuidado pastoral</span>
        </div>
        <div className="follow-up-funnel-grid">
          <div className="funnel-card">
            <h3>Visitantes</h3>
            <p>Acompanhe se as visitas estão avançando para retorno, acompanhamento e integração.</p>
            <div className="funnel-steps">
              {visitorFunnel.length ? (
                visitorFunnel.map((item) => (
                  <button key={item.label} onClick={() => onOpenModule("visitors")} type="button">
                    <span>{item.count}</span>
                    <strong>{item.label}</strong>
                    <i><b style={{ width: percentage(item.count, panelData.visitors.length) }} /></i>
                  </button>
                ))
              ) : (
                <p className="empty-state">Nenhum visitante cadastrado ainda.</p>
              )}
            </div>
          </div>
          <div className="funnel-card">
            <h3>Atendimento pastoral</h3>
            <p>Veja em qual etapa estão os pedidos de oração, visita e aconselhamento.</p>
            <div className="funnel-steps">
              {pastoralFunnel.length ? (
                pastoralFunnel.map((item) => (
                  <button key={item.label} onClick={() => onOpenModule("pastoral")} type="button">
                    <span>{item.count}</span>
                    <strong>{item.label}</strong>
                    <i><b style={{ width: percentage(item.count, panelData.careRequests.length) }} /></i>
                  </button>
                ))
              ) : (
                <p className="empty-state">Nenhum atendimento pastoral registrado ainda.</p>
              )}
            </div>
          </div>
        </div>
      </article>

      <article className="surface wide congregation-intelligence-panel">
        <div className="panel-heading">
          <h2>Visão por congregação</h2>
          <span>{congregationSummaries.length} congregação{congregationSummaries.length === 1 ? "" : "ões"}</span>
        </div>
        <div className="congregation-summary-grid">
          {congregationSummaries.length ? (
            congregationSummaries.map((summary) => (
              <div className="congregation-summary-card" key={summary.name}>
                <strong>{summary.name}</strong>
                <div>
                  <span><b>{summary.members}</b> membros</span>
                  <span><b>{summary.visitors}</b> visitantes</span>
                  <span><b>{summary.pastoralPending}</b> pastoral</span>
                  <span><b>{summary.events}</b> eventos</span>
                  <span><b>{summary.birthdays}</b> aniversários</span>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhuma congregação encontrada nos cadastros atuais.</p>
          )}
        </div>
      </article>

      <article className="surface intelligence-card">
        <div className="panel-heading">
          <h2>Leitura inteligente</h2>
          <span>{insights.length} alerta{insights.length === 1 ? "" : "s"}</span>
        </div>
        <div className="row-list">
          {insights.length ? (
            insights.map((insight) => (
              <div className={`data-row insight-row insight-${insight.level}`} key={insight.title}>
                <span className="bullet-mark" />
                <div>
                  <strong>{insight.title}</strong>
                  <small>{insight.text}</small>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhum alerta crítico encontrado nos dados carregados.</p>
          )}
        </div>
      </article>

      <article className="surface intelligence-card intelligence-communication-panel">
        <div className="panel-heading">
          <h2>Sugestões de comunicação</h2>
          <button className="secondary" onClick={copyAllCommunicationSuggestions} type="button">
            {copiedSuggestion === "communication-suggestions" ? "Sugestões copiadas" : "Copiar sugestões"}
          </button>
        </div>
        <div className="row-list">
          {communicationSuggestions.length ? (
            communicationSuggestions.map((suggestion) => (
              <div className="data-row communication-suggestion-row" key={suggestion.title}>
                <span className="bullet-mark" />
                <div>
                  <strong>{suggestion.title}</strong>
                  <small>{suggestion.audience}</small>
                  <p>{suggestion.text}</p>
                  <div className="row-actions">
                    <button className="secondary" onClick={() => copySuggestion(suggestion)} type="button">
                      {copiedSuggestion === suggestion.title ? "Copiado" : "Copiar texto"}
                    </button>
                    <button onClick={() => onOpenModule(suggestion.module)} type="button">
                      Abrir área
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhuma sugestão de comunicação necessária agora.</p>
          )}
        </div>
      </article>

      <article className="surface intelligence-card">
        <div className="panel-heading">
          <h2>Presença e acompanhamento</h2>
          <span>{panelData.attendanceSessions.length} chamada(s)</span>
        </div>
        <div className="intelligence-progress-list">
          <div>
            <span>Frequência registrada</span>
            <strong>{percentage(attendance.present, attendance.total)}</strong>
            <i><b style={{ width: percentage(attendance.present, attendance.total) }} /></i>
          </div>
          <div>
            <span>Faltas</span>
            <strong>{attendance.absent}</strong>
            <i><b style={{ width: percentage(attendance.absent, attendance.total) }} /></i>
          </div>
          <div>
            <span>Precisa de contato</span>
            <strong>{attendance.contact}</strong>
            <i><b style={{ width: percentage(attendance.contact, attendance.total) }} /></i>
          </div>
        </div>
        <div className="row-list">
          {panelAbsentRows.slice(0, 4).map((row) => (
            <div className="data-row" key={`${row[0]}-${row[2]}`}>
              <span className="bullet-mark" />
              <div>
                <strong>{row[0]}</strong>
                <small>{row[2]} • {row[3]} falta(s) recentes • {row[4]} no mês</small>
              </div>
            </div>
          ))}
          {!panelAbsentRows.length && <p className="empty-state">Sem alerta de faltas recorrentes no momento.</p>}
        </div>
      </article>

      <article className="surface intelligence-card">
        <div className="panel-heading">
          <h2>Agenda estratégica</h2>
          <span>{nextEvents.length} próximos</span>
        </div>
        <div className="row-list">
          {nextEvents.length ? (
            nextEvents.map((event) => (
              <div className="data-row" key={event.id}>
                <span className="date-box">{formatDate(event.date)}</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>{event.time || "Sem horário"} • {event.ministry || "Sem grupo"} • {event.location || "Local não informado"}</small>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhum evento próximo encontrado para orientar o painel.</p>
          )}
        </div>
      </article>

      <article className="surface intelligence-card finance-assets-panel">
        <div className="panel-heading">
          <h2>Financeiro e patrimônio</h2>
          <span>{pendingTransactions.length + assetsNeedingAttention.length} ponto{pendingTransactions.length + assetsNeedingAttention.length === 1 ? "" : "s"} para revisar</span>
        </div>
        <div className="finance-assets-grid">
          <button onClick={() => onOpenModule("finance")} type="button">
            <strong>{financialIncome.toLocaleString("pt-BR", { currency: "BRL", style: "currency" })}</strong>
            <span>entradas confirmadas</span>
          </button>
          <button onClick={() => onOpenModule("finance")} type="button">
            <strong>{financialExpense.toLocaleString("pt-BR", { currency: "BRL", style: "currency" })}</strong>
            <span>saídas confirmadas</span>
          </button>
          <button onClick={() => onOpenModule("finance")} type="button">
            <strong>{(financialIncome - financialExpense).toLocaleString("pt-BR", { currency: "BRL", style: "currency" })}</strong>
            <span>saldo confirmado</span>
          </button>
          <button onClick={() => onOpenModule("finance")} type="button">
            <strong>{pendingTransactions.length}</strong>
            <span>lançamentos pendentes</span>
          </button>
          <button onClick={() => onOpenModule("assets")} type="button">
            <strong>{panelData.assets.length}</strong>
            <span>bens cadastrados</span>
          </button>
          <button onClick={() => onOpenModule("assets")} type="button">
            <strong>{assetsNeedingAttention.length}</strong>
            <span>em manutenção/baixados</span>
          </button>
        </div>
      </article>

      <article className="surface intelligence-card">
        <div className="panel-heading">
          <h2>Qualidade dos dados</h2>
          <span>{incompleteMembers.length} ficha(s) para revisar</span>
        </div>
        <div className="report-grid compact-report-grid">
          <div className="report-card">
            <strong>{percentage(panelData.members.length - incompleteMembers.length, panelData.members.length)}</strong>
            <span>cadastros completos</span>
            <small>telefone, e-mail, congregação, aniversário e grupos</small>
          </div>
          <div className="report-card">
            <strong>{panelMonthlyBirthdays.length}</strong>
            <span>aniversários do mês</span>
            <small>base para cuidado e comunicação</small>
          </div>
        </div>
        <div className="row-list">
          {incompleteMembers.slice(0, 5).map((member) => (
            <div className="data-row" key={member.id}>
              <span className="bullet-mark" />
              <div>
                <strong>{member.fullName}</strong>
                <small>Revise telefone, e-mail, congregação, aniversário ou grupos.</small>
              </div>
            </div>
          ))}
          {!incompleteMembers.length && <p className="empty-state">As fichas principais estão bem preenchidas.</p>}
        </div>
      </article>
    </section>
  );
}
