"use client";

import { useState } from "react";
import type { AccessRole, ModuleKey } from "../permissions";
import type { AppData, ChurchEvent, MemberRecord, RegistrationRequest } from "../types";
import { formatDate, sortEventsByDate } from "../app-helpers";
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
  const pendingOrBlockedUsers = data.users.filter((user) => user.status !== "Ativo");
  const publicMuralWithExternalLink = data.mural.filter((item) => item.published && item.socialUrl);
  const membersWithoutCongregation = data.members.filter((member) => !member.congregation);
  const careWithSensitiveNotes = data.careRequests.filter((request) => request.summary.length > 120 || request.returnNote.length > 120);

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
  data,
  healthScore,
  insights,
  monthlyBirthdays,
  pendingCare,
  pendingRegistrationRequests,
  upcomingPanelEvents,
  visitorsInFollowUp,
}: {
  actionTasks: ActionTask[];
  attendance: ReturnType<typeof attendanceCounts>;
  data: AppData;
  healthScore: number;
  insights: { level: string; text: string; title: string }[];
  monthlyBirthdays: MemberRecord[];
  pendingCare: number;
  pendingRegistrationRequests: number;
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
  const monthKey = currentMonthKey();
  const activeMembers = data.members.filter((member) => member.status === "Membro ativo");
  const newMembersThisMonth = data.members.filter((member) => recordMonth(member.createdAt || member.joinedAt) === monthKey);
  const visitorsInFollowUp = data.visitors.filter((visitor) => visitor.integrationStatus !== "Integrado");
  const integratedVisitors = data.visitors.filter((visitor) => visitor.integrationStatus === "Integrado");
  const pendingCare = data.careRequests.filter((request) => request.status !== "Concluido");
  const unassignedCare = pendingCare.filter((request) => !request.responsible);
  const publishedMural = data.mural.filter((item) => item.published);
  const attendance = attendanceCounts(data);
  const schoolStudents = data.members.filter((member) => member.schoolClassId).length;
  const discipleshipStudents = data.members.filter((member) => member.discipleshipClassId).length;
  const incompleteMembers = data.members.filter(isMissingMemberData);
  const membersWithClass = data.members.filter((member) => member.schoolClassId || member.discipleshipClassId);
  const statusBreakdown = countByLabel(data.members, (member) => member.status).slice(0, 4);
  const ageBreakdown = countByLabel(data.members, (member) => member.ageGroup).slice(0, 5);
  const visitorFunnel = countByLabel(data.visitors, (visitor) => visitor.integrationStatus);
  const pastoralFunnel = countByLabel(data.careRequests, (request) => request.status === "Em analise" ? "Em análise" : request.status === "Concluido" ? "Concluído" : request.status);
  const engagementRate = percentage(membersWithClass.length, data.members.length);
  const visitorIntegrationRate = percentage(integratedVisitors.length, data.visitors.length);
  const confirmedTransactions = data.transactions.filter((transaction) => transaction.status === "Confirmado");
  const pendingTransactions = data.transactions.filter((transaction) => transaction.status === "Pendente");
  const financialIncome = confirmedTransactions
    .filter((transaction) => transaction.type === "Entrada" || transaction.type === "Dizimo" || transaction.type === "Oferta")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const financialExpense = confirmedTransactions
    .filter((transaction) => transaction.type === "Saida")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const assetsNeedingAttention = data.assets.filter((asset) => asset.condition === "Manutencao" || asset.condition === "Baixado");
  const insights = buildInsights({ absentRows, data, monthlyBirthdays, pendingRegistrationRequests, upcomingPanelEvents });
  const actionTasks = buildActionTasks({ absentRows, data, pendingRegistrationRequests, upcomingPanelEvents });
  const communicationSuggestions = buildCommunicationSuggestions({ data, monthlyBirthdays, pendingRegistrationRequests, upcomingPanelEvents });
  const congregationSummaries = buildCongregationSummary({ data, monthlyBirthdays, upcomingPanelEvents });
  const weeklyPlan = buildWeeklyPlan(actionTasks, upcomingPanelEvents);
  const automationSuggestions = buildAutomationSuggestions({ data, monthlyBirthdays, pendingRegistrationRequests, upcomingPanelEvents });
  const governanceItems = buildGovernanceItems({ data });
  const nextEvents = [...upcomingPanelEvents].sort(sortEventsByDate).slice(0, 5);
  const healthScore = healthScoreForTasks(actionTasks);

  async function copySuggestion(suggestion: CommunicationSuggestion) {
    await navigator.clipboard.writeText(suggestion.text);
    setCopiedSuggestion(suggestion.title);
    window.setTimeout(() => setCopiedSuggestion(""), 2200);
  }

  async function copyWeeklyPlan() {
    await navigator.clipboard.writeText(copyWeeklyPlanText(weeklyPlan));
    setCopiedSuggestion("weekly-plan");
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
          <span><strong>{data.members.length}</strong> pessoas cadastradas</span>
          <span><strong>{upcomingPanelEvents.length}</strong> eventos próximos</span>
          <span><strong>{pendingCare.length}</strong> pedidos em acompanhamento</span>
          <span><strong>{currentAccessRole}</strong> visualizando</span>
        </div>
        <div className="intelligence-hero-actions">
          <button
            onClick={() =>
              printExecutiveSummary({
                actionTasks,
                attendance,
                data,
                healthScore,
                insights,
                monthlyBirthdays,
                pendingCare: pendingCare.length,
                pendingRegistrationRequests: pendingRegistrationRequests.length,
                upcomingPanelEvents: nextEvents,
                visitorsInFollowUp: visitorsInFollowUp.length,
              })
            }
            type="button"
          >
            Imprimir resumo executivo
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
          <span>{actionTasks.length} ação{actionTasks.length === 1 ? "" : "ões"} recomendada{actionTasks.length === 1 ? "" : "s"}</span>
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
            <strong>{data.members.length}</strong>
            <span>Membros e congregados</span>
            <small>{activeMembers.length} membros ativos • {newMembersThisMonth.length} novo(s) no mês</small>
          </div>
          <div className="report-card">
            <strong>{pendingRegistrationRequests.length}</strong>
            <span>Pré-cadastros pendentes</span>
            <small>{data.registrationRequests.length} solicitações no histórico</small>
          </div>
          <div className="report-card">
            <strong>{visitorsInFollowUp.length}</strong>
            <span>Visitantes em acompanhamento</span>
            <small>{data.visitors.filter((visitor) => !visitor.contactMade).length} sem contato registrado</small>
          </div>
          <div className="report-card">
            <strong>{pendingCare.length}</strong>
            <span>Atendimentos pastorais</span>
            <small>{unassignedCare.length} sem responsável definido</small>
          </div>
          <div className="report-card">
            <strong>{data.schoolClasses.length + data.discipleshipClasses.length}</strong>
            <span>Classes formativas</span>
            <small>{schoolStudents} EBD • {discipleshipStudents} discipulado</small>
          </div>
          <div className="report-card">
            <strong>{publishedMural.length}</strong>
            <span>Murais publicados</span>
            <small>{data.notices.filter((notice) => notice.status === "Publicado").length} comunicados ativos</small>
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
            <small>{membersWithClass.length} de {data.members.length} cadastros</small>
          </div>
          <div className="growth-card">
            <strong>{visitorIntegrationRate}</strong>
            <span>visitantes integrados</span>
            <i><b style={{ width: visitorIntegrationRate }} /></i>
            <small>{integratedVisitors.length} de {data.visitors.length} visitantes</small>
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
                    <i><b style={{ width: percentage(item.count, data.visitors.length) }} /></i>
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
                    <i><b style={{ width: percentage(item.count, data.careRequests.length) }} /></i>
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
          <span>{communicationSuggestions.length} texto{communicationSuggestions.length === 1 ? "" : "s"} pronto{communicationSuggestions.length === 1 ? "" : "s"}</span>
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
          <span>{data.attendanceSessions.length} chamada(s)</span>
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
          {absentRows.slice(0, 4).map((row) => (
            <div className="data-row" key={`${row[0]}-${row[2]}`}>
              <span className="bullet-mark" />
              <div>
                <strong>{row[0]}</strong>
                <small>{row[2]} • {row[3]} falta(s) recentes • {row[4]} no mês</small>
              </div>
            </div>
          ))}
          {!absentRows.length && <p className="empty-state">Sem alerta de faltas recorrentes no momento.</p>}
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
            <strong>{data.assets.length}</strong>
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
            <strong>{percentage(data.members.length - incompleteMembers.length, data.members.length)}</strong>
            <span>cadastros completos</span>
            <small>telefone, e-mail, congregação, aniversário e grupos</small>
          </div>
          <div className="report-card">
            <strong>{monthlyBirthdays.length}</strong>
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
