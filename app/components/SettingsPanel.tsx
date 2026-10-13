import { useMemo, useState } from "react";

import { formatDateTime, normalizeSearchText } from "../app-helpers";
import { globalCongregationScope, normalizeCongregationScope } from "../congregation-scope";
import { accessRoleLabel, moduleAccessByRole, modules, type AccessRole } from "../permissions";
import { downloadCsv, downloadExcelWorkbook, printHtmlReport } from "../report-helpers";
import { getSupabaseClient } from "../supabase-client";
import type { AppData, AuditItem, KidRecord, MemberRecord, MemberSyncStatus, Notice } from "../types";

type AuditModuleFilter = "Todos" | "Membros" | "Acessos" | "Agenda" | "Visitantes" | "Pastoral" | "Sistema";
type AuditPeriodFilter = "Todos" | "Hoje" | "7 dias" | "30 dias";

type SettingsPanelProps = {
  activeNotices: Notice[];
  data: AppData;
  log: (action: string) => void;
  monthlyBirthdays: MemberRecord[];
  monthlyKidsBirthdays: KidRecord[];
  resetLocalData: () => void;
};

const auditModuleOptions: AuditModuleFilter[] = ["Todos", "Membros", "Acessos", "Agenda", "Visitantes", "Pastoral", "Sistema"];
const auditPeriodOptions: AuditPeriodFilter[] = ["Todos", "Hoje", "7 dias", "30 dias"];
const profileTestRoles: AccessRole[] = ["Administrador", "Secretario", "Lider", "Professor", "Tesoureiro", "Membro"];

function auditModuleFor(action: string): AuditModuleFilter {
  const normalized = normalizeSearchText(action);

  if (normalized.includes("membro") || normalized.includes("ficha") || normalized.includes("pre-cadastro")) return "Membros";
  if (normalized.includes("acesso") || normalized.includes("usuario") || normalized.includes("login")) return "Acessos";
  if (normalized.includes("evento") || normalized.includes("agenda")) return "Agenda";
  if (normalized.includes("visitante")) return "Visitantes";
  if (normalized.includes("pastoral") || normalized.includes("atendimento") || normalized.includes("pedido")) return "Pastoral";

  return "Sistema";
}

function isInAuditPeriod(value: string, period: AuditPeriodFilter) {
  if (period === "Todos") return true;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  if (period === "Hoje") return date.toDateString() === now.toDateString();

  const days = period === "7 dias" ? 7 : 30;
  const limit = new Date(now);
  limit.setDate(now.getDate() - days);

  return date >= limit;
}

function auditRows(items: AuditItem[]) {
  return items.map((item) => [formatDateTime(item.when), auditModuleFor(item.action), item.action]);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function memberGroups(member: MemberRecord) {
  const groups = member.ministries?.length ? member.ministries : member.ministry ? [member.ministry] : [];
  return groups.join(", ");
}

export function SettingsPanel({ activeNotices, data, log, monthlyBirthdays, monthlyKidsBirthdays, resetLocalData }: SettingsPanelProps) {
  const [auditSearch, setAuditSearch] = useState("");
  const [auditModule, setAuditModule] = useState<AuditModuleFilter>("Todos");
  const [auditPeriod, setAuditPeriod] = useState<AuditPeriodFilter>("Todos");
  const [memberSyncStatus, setMemberSyncStatus] = useState<MemberSyncStatus | null>(null);
  const [memberSyncLoading, setMemberSyncLoading] = useState(false);
  const [memberSyncMessage, setMemberSyncMessage] = useState("");

  const filteredAudit = useMemo(() => {
    const search = normalizeSearchText(auditSearch);

    return data.audit.filter((item) => {
      const auditArea = auditModuleFor(item.action);
      const matchesModule = auditModule === "Todos" || auditArea === auditModule;
      const matchesPeriod = isInAuditPeriod(item.when, auditPeriod);
      const matchesSearch = !search || normalizeSearchText(`${item.action} ${formatDateTime(item.when)} ${auditArea}`).includes(search);

      return matchesModule && matchesPeriod && matchesSearch;
    });
  }, [auditModule, auditPeriod, auditSearch, data.audit]);

  const auditSummary = useMemo(
    () =>
      auditModuleOptions
        .filter((option) => option !== "Todos")
        .map((module) => ({
          module,
          total: data.audit.filter((item) => auditModuleFor(item.action) === module).length,
        }))
        .filter((item) => item.total > 0),
    [data.audit],
  );
  const profileChecklist = useMemo(
    () =>
      profileTestRoles.map((role) => {
        const activeUsers = data.users.filter((user) => user.role === role && user.status === "Ativo");
        const allowedModules = moduleAccessByRole[role]
          .map((moduleKey) => modules.find((module) => module.key === moduleKey)?.short ?? moduleKey)
          .slice(0, 8);

        return {
          role,
          activeUsers,
          allowedModules,
          ready: activeUsers.length > 0,
        };
      }),
    [data.users],
  );
  const profileTestRows = useMemo(
    () =>
      profileChecklist.map((item) => [
        accessRoleLabel(item.role),
        item.activeUsers.length,
        item.ready ? "Pronto para testar" : "Criar ou reativar acesso antes",
        item.allowedModules.join(", "),
        "Entrar, confirmar painel, abrir módulos permitidos e pressionar F5 para validar sessão.",
      ]),
    [profileChecklist],
  );
  const operationalTestRows = useMemo(() => {
    const activeUsers = data.users.filter((user) => user.status === "Ativo");
    const nonAdminUsers = data.users.filter((user) => user.role !== "Administrador");
    const openCareRequests = data.careRequests.filter((request) => request.status !== "Concluido");
    const publishedMural = data.mural.filter((item) => item.published);
    const todaysEvents = data.events.filter((event) => event.date === new Date().toISOString().slice(0, 10));

    return [
      [
        "Login",
        "Sessão por perfil",
        profileChecklist.every((item) => item.ready) ? "Pronto" : "Pendente",
        `${activeUsers.length} acesso(s) ativo(s).`,
        "Testar administrador, secretário, líder, professor, tesoureiro e membro com F5 após login.",
      ],
      [
        "Usuários e acessos",
        "Cancelar, reativar e excluir acesso",
        nonAdminUsers.length ? "Pronto" : "Criar acesso de teste",
        `${nonAdminUsers.length} acesso(s) não administrador disponíveis para teste.`,
        "Nunca excluir o administrador logado; usar um acesso de teste ou antigo.",
      ],
      [
        "Atendimento pastoral",
        "Avançar etapa e Concluir",
        openCareRequests.length ? "Pronto" : "Criar pedido de teste",
        `${openCareRequests.length} atendimento(s) aberto(s).`,
        "Confirmar que Pendente vira Em análise, depois Agendado e Concluído.",
      ],
      [
        "Membros",
        "Editar ficha, foto e grupos",
        data.members.length ? "Pronto" : "Criar membro de teste",
        `${data.members.length} membro(s) cadastrado(s).`,
        "Alterar uma ficha teste, conferir grupo múltiplo e confirmar persistência após F5.",
      ],
      [
        "Mural",
        "Compartilhar aviso publicado",
        publishedMural.length ? "Pronto" : "Publicar aviso de teste",
        `${publishedMural.length} mural(is) publicado(s).`,
        "Abrir link público sem login e confirmar que não expõe dados administrativos.",
      ],
      [
        "Agenda",
        "Compartilhar agenda do dia",
        todaysEvents.length ? "Pronto" : "Criar evento de hoje para teste",
        `${todaysEvents.length} evento(s) de hoje.`,
        "Abrir link público da agenda e confirmar que mostra apenas eventos do dia.",
      ],
      [
        "Relatórios",
        "Gerar PDF/Excel e documentos prontos",
        data.members.length ? "Pronto" : "Cadastrar membro antes",
        "Usa dados administrativos do painel.",
        "Gerar ficha cadastral, carta e relatório simples sem salvar PDF no banco.",
      ],
      [
        "Notificações",
        "Enviar teste push",
        "Revisar",
        "Depende de permissão no aparelho e VAPID em produção.",
        "Ativar notificações, enviar teste e tocar no aviso para abrir o sistema.",
      ],
    ];
  }, [data.careRequests, data.events, data.members.length, data.mural, data.users, profileChecklist]);
  const securityChecklist = useMemo(() => {
    const activeAdmins = data.users.filter((user) => user.role === "Administrador" && user.status === "Ativo");
    const activeLocalStaffWithoutScope = data.users.filter((user) => {
      if (user.status !== "Ativo") return false;
      if (user.role === "Administrador" || user.role === "Membro") return false;
      return normalizeCongregationScope(user.congregationScope) === globalCongregationScope;
    });
    const membersWithoutCongregation = data.members.filter((member) => normalizeCongregationScope(member.congregation) === globalCongregationScope);
    const legacyMemberPhotos = data.members.filter((member) => Boolean(member.photoDataUrl));
    const legacyKidsPhotos = data.kids.filter((kid) => Boolean(kid.photoDataUrl));
    const photosWithoutConsent = data.members.filter((member) => Boolean(member.photoUrl) && !member.photoConsent);

    return [
      {
        detail: activeAdmins.length ? `${activeAdmins.length} administrador(es) ativo(s).` : "Crie ou reative um administrador antes de mudanças grandes.",
        ok: activeAdmins.length > 0,
        title: "Administrador ativo",
      },
      {
        detail: activeLocalStaffWithoutScope.length
          ? `${activeLocalStaffWithoutScope.length} acesso(s) local(is) ainda estão em “Todas”.`
          : "Liderança local está vinculada a uma congregação.",
        ok: activeLocalStaffWithoutScope.length === 0,
        title: "Escopo por congregação",
      },
      {
        detail: membersWithoutCongregation.length
          ? `${membersWithoutCongregation.length} membro(s) sem congregação específica.`
          : "Membros possuem congregação definida.",
        ok: membersWithoutCongregation.length === 0,
        title: "Membros com congregação",
      },
      {
        detail: legacyMemberPhotos.length || legacyKidsPhotos.length
          ? `${legacyMemberPhotos.length} foto(s) de membro e ${legacyKidsPhotos.length} foto(s) Kids ainda em base64.`
          : "Fotos de membros não estão pesando o JSON principal.",
        ok: legacyMemberPhotos.length === 0 && legacyKidsPhotos.length === 0,
        title: "Fotos fora do JSON",
      },
      {
        detail: photosWithoutConsent.length
          ? `${photosWithoutConsent.length} foto(s) salvas sem autorização de exibição.`
          : "Fotos salvas respeitam autorização de exibição.",
        ok: photosWithoutConsent.length === 0,
        title: "Consentimento de fotos",
      },
    ];
  }, [data.kids, data.members, data.users]);
  const memberQualityChecklist = useMemo(() => {
    const phoneCounts = new Map<string, number>();
    const cpfCounts = new Map<string, number>();

    data.members.forEach((member) => {
      const phone = onlyDigits(member.phone);
      const cpf = onlyDigits(member.cpf);
      if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
      if (cpf) cpfCounts.set(cpf, (cpfCounts.get(cpf) ?? 0) + 1);
    });

    const missingPhone = data.members.filter((member) => onlyDigits(member.phone).length < 8);
    const missingEmail = data.members.filter((member) => !member.email.trim());
    const missingBirthDate = data.members.filter((member) => !member.birthDate);
    const withoutGroup = data.members.filter((member) => !member.ministry && (!member.ministries || member.ministries.length === 0));
    const duplicatePhones = Array.from(phoneCounts.values()).filter((count) => count > 1).length;
    const duplicateCpfs = Array.from(cpfCounts.values()).filter((count) => count > 1).length;

    return [
      {
        count: missingPhone.length,
        detail: missingPhone.length ? "Sem telefone válido para WhatsApp, contato e recuperação." : "Telefones principais preenchidos.",
        ok: missingPhone.length === 0,
        title: "Telefone",
      },
      {
        count: missingEmail.length,
        detail: missingEmail.length ? "Sem e-mail, o login do membro pode depender de ajuste manual." : "E-mails principais preenchidos.",
        ok: missingEmail.length === 0,
        title: "E-mail de acesso",
      },
      {
        count: missingBirthDate.length,
        detail: missingBirthDate.length ? "Aniversariantes, idade e relatórios ficam incompletos." : "Datas de nascimento preenchidas.",
        ok: missingBirthDate.length === 0,
        title: "Nascimento",
      },
      {
        count: withoutGroup.length,
        detail: withoutGroup.length ? "Fichas sem grupo dificultam filtros, liderança e comunicação." : "Grupos vinculados nas fichas.",
        ok: withoutGroup.length === 0,
        title: "Grupos",
      },
      {
        count: duplicatePhones + duplicateCpfs,
        detail:
          duplicatePhones || duplicateCpfs
            ? `${duplicatePhones} telefone(s) e ${duplicateCpfs} CPF(s) aparecem repetidos.`
            : "Não há duplicidades óbvias por telefone ou CPF.",
        ok: duplicatePhones === 0 && duplicateCpfs === 0,
        title: "Duplicidades",
      },
    ];
  }, [data.members]);
  const memberQualityRows = useMemo(() => {
    const phoneCounts = new Map<string, number>();
    const cpfCounts = new Map<string, number>();

    data.members.forEach((member) => {
      const phone = onlyDigits(member.phone);
      const cpf = onlyDigits(member.cpf);
      if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
      if (cpf) cpfCounts.set(cpf, (cpfCounts.get(cpf) ?? 0) + 1);
    });

    return data.members
      .flatMap((member) => {
        const issues: string[] = [];
        const phone = onlyDigits(member.phone);
        const cpf = onlyDigits(member.cpf);

        if (phone.length < 8) issues.push("Telefone ausente ou inválido");
        if (!member.email.trim()) issues.push("E-mail de acesso ausente");
        if (!member.birthDate) issues.push("Data de nascimento ausente");
        if (!memberGroups(member)) issues.push("Sem grupo vinculado");
        if (phone && (phoneCounts.get(phone) ?? 0) > 1) issues.push("Telefone duplicado");
        if (cpf && (cpfCounts.get(cpf) ?? 0) > 1) issues.push("CPF duplicado");

        return issues.map((issue) => [
          member.memberCode,
          member.fullName,
          member.congregation || "Não informado",
          member.phone || "Não informado",
          member.email || "Não informado",
          member.cpf || "Não informado",
          memberGroups(member) || "Sem grupo",
          issue,
        ]);
      })
      .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pt-BR"));
  }, [data.members]);
  const normalizationChecklist = useMemo(() => {
    const visitorsWithoutCongregation = data.visitors.filter((visitor) => normalizeCongregationScope(visitor.congregation) === globalCongregationScope);
    const visitorsWithoutPhone = data.visitors.filter((visitor) => onlyDigits(visitor.phone).length < 8);
    const kidsWithoutCongregation = data.kids.filter((kid) => normalizeCongregationScope(kid.congregation) === globalCongregationScope);
    const kidsWithoutGuardianPhone = data.kids.filter((kid) => onlyDigits(kid.guardianPhone).length < 8);
    const eventsWithoutCongregation = data.events.filter((event) => normalizeCongregationScope(event.congregation) === globalCongregationScope);
    const eventsWithoutDate = data.events.filter((event) => !event.date || !event.time);
    const careWithoutCongregation = data.careRequests.filter((request) => normalizeCongregationScope(request.congregation) === globalCongregationScope);
    const careWithoutResponsible = data.careRequests.filter((request) => !request.responsible.trim() && request.status !== "Concluido");

    return [
      {
        detail: visitorsWithoutCongregation.length || visitorsWithoutPhone.length
          ? `${visitorsWithoutCongregation.length} sem congregação e ${visitorsWithoutPhone.length} sem telefone válido.`
          : "Visitantes já têm base mínima para filtros e contato.",
        ok: visitorsWithoutCongregation.length === 0 && visitorsWithoutPhone.length === 0,
        title: "Visitantes",
      },
      {
        detail: kidsWithoutCongregation.length || kidsWithoutGuardianPhone.length
          ? `${kidsWithoutCongregation.length} sem congregação e ${kidsWithoutGuardianPhone.length} sem telefone do responsável.`
          : "Kids está pronto para conferência por congregação e responsável.",
        ok: kidsWithoutCongregation.length === 0 && kidsWithoutGuardianPhone.length === 0,
        title: "Kids",
      },
      {
        detail: eventsWithoutCongregation.length || eventsWithoutDate.length
          ? `${eventsWithoutCongregation.length} sem congregação e ${eventsWithoutDate.length} sem data/horário.`
          : "Agenda está consistente para publicação e filtros.",
        ok: eventsWithoutCongregation.length === 0 && eventsWithoutDate.length === 0,
        title: "Agenda",
      },
      {
        detail: careWithoutCongregation.length || careWithoutResponsible.length
          ? `${careWithoutCongregation.length} sem congregação e ${careWithoutResponsible.length} sem responsável em aberto.`
          : "Pastoral está consistente para fila por congregação e responsável.",
        ok: careWithoutCongregation.length === 0 && careWithoutResponsible.length === 0,
        title: "Pastoral",
      },
    ];
  }, [data.careRequests, data.events, data.kids, data.visitors]);
  const normalizationRows = useMemo(() => {
    const rows: unknown[][] = [];

    data.visitors.forEach((visitor) => {
      const base = ["Visitantes", visitor.id, visitor.fullName || "Sem nome", visitor.congregation || "Não informado", visitor.phone || "Não informado", visitor.firstVisitDate || "Não informado"];

      if (normalizeCongregationScope(visitor.congregation) === globalCongregationScope) rows.push([...base, "Congregação ausente"]);
      if (onlyDigits(visitor.phone).length < 8) rows.push([...base, "Telefone ausente ou inválido"]);
    });

    data.kids.forEach((kid) => {
      const base = ["Kids", kid.id, kid.childName || "Sem nome", kid.congregation || "Não informado", kid.guardianPhone || "Não informado", kid.joinedAt || "Não informado"];

      if (normalizeCongregationScope(kid.congregation) === globalCongregationScope) rows.push([...base, "Congregação ausente"]);
      if (onlyDigits(kid.guardianPhone).length < 8) rows.push([...base, "Telefone do responsável ausente ou inválido"]);
    });

    data.events.forEach((event) => {
      const base = ["Agenda", event.id, event.title || "Sem título", event.congregation || "Não informado", event.responsible || "Não informado", `${event.date || "Sem data"} ${event.time || "Sem horário"}`.trim()];

      if (normalizeCongregationScope(event.congregation) === globalCongregationScope) rows.push([...base, "Congregação ausente"]);
      if (!event.date || !event.time) rows.push([...base, "Data ou horário ausente"]);
    });

    data.careRequests.forEach((request) => {
      const base = ["Pastoral", request.id, request.member || "Sem membro", request.congregation || "Não informado", request.responsible || "Não informado", request.createdAt || "Não informado"];

      if (normalizeCongregationScope(request.congregation) === globalCongregationScope) rows.push([...base, "Congregação ausente"]);
      if (!request.responsible.trim() && request.status !== "Concluido") rows.push([...base, "Responsável ausente em atendimento aberto"]);
    });

    return rows.sort((a, b) => `${String(a[0])}-${String(a[2])}`.localeCompare(`${String(b[0])}-${String(b[2])}`, "pt-BR"));
  }, [data.careRequests, data.events, data.kids, data.visitors]);

  function exportAudit(format: "pdf" | "csv") {
    const headers = ["Data e hora", "Módulo", "Ação"];
    const rows = auditRows(filteredAudit);
    const subtitle = `Auditoria filtrada em ${new Date().toLocaleString("pt-BR")} - ${filteredAudit.length} evento(s).`;

    if (format === "csv") {
      downloadCsv("auditoria-igreja-conectada.csv", headers, rows);
      log("Auditoria exportada em CSV");
      return;
    }

    const opened = printHtmlReport("Auditoria - Igreja Conectada", subtitle, headers, rows);
    log(opened ? "Auditoria preparada em PDF" : "Falha ao abrir relatório de auditoria");
  }

  function downloadFullBackup() {
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup-igreja-conectada-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    log("Backup completo baixado em JSON");
  }

  function exportMemberQuality(format: "csv" | "excel") {
    const headers = ["Código", "Nome", "Congregação", "Telefone", "E-mail", "CPF", "Grupos", "Pendência"];

    if (format === "csv") {
      downloadCsv("pendencias-cadastros-membros.csv", headers, memberQualityRows);
      log("Pendências dos cadastros exportadas em CSV");
      return;
    }

    downloadExcelWorkbook(
      "pendencias-cadastros-membros.xls",
      "Pendências dos cadastros de membros",
      `Lista gerada em ${new Date().toLocaleString("pt-BR")} com ${memberQualityRows.length} pendência(s).`,
      headers,
      memberQualityRows,
    );
    log("Pendências dos cadastros exportadas para Excel");
  }

  function exportProfileTests(format: "csv" | "excel") {
    const headers = ["Perfil", "Acessos ativos", "Status", "Módulos esperados", "Teste obrigatório"];

    if (format === "csv") {
      downloadCsv("roteiro-testes-por-perfil.csv", headers, profileTestRows);
      log("Roteiro de testes por perfil exportado em CSV");
      return;
    }

    downloadExcelWorkbook(
      "roteiro-testes-por-perfil.xls",
      "Roteiro de testes por perfil",
      `Lista gerada em ${new Date().toLocaleString("pt-BR")}.`,
      headers,
      profileTestRows,
    );
    log("Roteiro de testes por perfil exportado para Excel");
  }

  function exportOperationalTests(format: "csv" | "excel") {
    const headers = ["Área", "Fluxo", "Status", "Evidência atual", "Como testar"];

    if (format === "csv") {
      downloadCsv("roteiro-testes-operacionais.csv", headers, operationalTestRows);
      log("Roteiro de testes operacionais exportado em CSV");
      return;
    }

    downloadExcelWorkbook(
      "roteiro-testes-operacionais.xls",
      "Roteiro de testes operacionais",
      `Lista gerada em ${new Date().toLocaleString("pt-BR")} com ${operationalTestRows.length} fluxo(s).`,
      headers,
      operationalTestRows,
    );
    log("Roteiro de testes operacionais exportado para Excel");
  }

  function exportNormalizationReadiness(format: "csv" | "excel") {
    const headers = ["Módulo", "ID", "Registro", "Congregação", "Contato ou responsável", "Data", "Pendência"];

    if (format === "csv") {
      downloadCsv("pendencias-normalizacao-modulos.csv", headers, normalizationRows);
      log("Pendências de normalização exportadas em CSV");
      return;
    }

    downloadExcelWorkbook(
      "pendencias-normalizacao-modulos.xls",
      "Pendências para normalização dos módulos",
      `Lista gerada em ${new Date().toLocaleString("pt-BR")} com ${normalizationRows.length} pendência(s).`,
      headers,
      normalizationRows,
    );
    log("Pendências de normalização exportadas para Excel");
  }

  async function memberSyncRequest(method: "GET" | "POST", path = "/api/admin/member-sync-status") {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const token = sessionData.session?.access_token;

    if (!token) {
      setMemberSyncMessage("Sessão administrativa não encontrada. Entre novamente e tente conferir.");
      return null;
    }

    const response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<MemberSyncStatus> & {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      setMemberSyncMessage(result.error ?? "Não foi possível concluir a conferência de membros.");
      return null;
    }

    return result;
  }

  async function refreshMemberSyncStatus() {
    setMemberSyncLoading(true);
    setMemberSyncMessage("");

    try {
      const result = await memberSyncRequest("GET");
      if (result?.status) {
        setMemberSyncStatus(result as MemberSyncStatus);
        setMemberSyncMessage(result.message ?? "");
      }
    } finally {
      setMemberSyncLoading(false);
    }
  }

  async function syncMembersMirror() {
    setMemberSyncLoading(true);
    setMemberSyncMessage("");

    try {
      const result = await memberSyncRequest("POST");
      if (result?.status) {
        setMemberSyncStatus(result as MemberSyncStatus);
        setMemberSyncMessage(result.message ?? "");
        log("Espelho da tabela members sincronizado pelo painel de configurações");
      }
    } finally {
      setMemberSyncLoading(false);
    }
  }

  async function restoreMembersJson() {
    setMemberSyncLoading(true);
    setMemberSyncMessage("");

    try {
      const result = await memberSyncRequest("POST", "/api/admin/member-sync-status/restore-json");
      if (result) {
        setMemberSyncMessage(result.message ?? "JSON principal conferido a partir da tabela members.");
        log("JSON principal de membros conferido a partir da tabela members");
      }
    } finally {
      setMemberSyncLoading(false);
    }

    await refreshMemberSyncStatus();
  }

  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>Backup e recuperação local</h2>
          <span>JSON validado</span>
        </div>
        <p className="body-copy">
          Antes de importações, migrações ou mudanças grandes, baixe um backup completo. Ele representa a cópia atual carregada neste painel e serve como ponto de segurança para conferência.
        </p>
        <div className="backup-box">
          <strong>Cobertura do backup</strong>
          <span>100%</span>
          <small>
            {data.members.length} membros, {monthlyBirthdays.length} aniversariantes no mês, {data.kids.length} crianças no Kids,{" "}
            {data.visitors.length} visitantes, {monthlyKidsBirthdays.length} aniversariantes Kids no mês,{" "}
            {data.users.length} usuários, {data.careRequests.length} atendimentos, {data.events.length} eventos, {data.schoolClasses.length} classes EBD,{" "}
            {data.discipleshipClasses.length} classes Discipulado, {activeNotices.length} comunicados ativos, {data.mural.length} itens de mural,{" "}
            {data.transactions.length} lançamentos financeiros, {data.assets.length} itens de patrimônio, {data.devotionals.length} devocionais e{" "}
            {data.audit.length} auditorias.
          </small>
        </div>
        <details className="backup-json-details">
          <summary>Visualizar JSON técnico do backup</summary>
          <p>Use esta prévia apenas para conferência administrativa. O arquivo contém dados pessoais e deve ser tratado com cuidado.</p>
          <textarea className="backup-json" readOnly value={JSON.stringify(data, null, 2)} />
        </details>
        <div className="detail-actions">
          <button onClick={downloadFullBackup} type="button">
            Baixar backup completo
          </button>
          <button className="secondary" onClick={() => log("Backup conferido antes de alteração grande")} type="button">
            Registrar conferência
          </button>
          <button className="secondary" onClick={resetLocalData} type="button">
            Restaurar dados exemplo
          </button>
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Teste por perfil</h2>
          <span>Login e permissões</span>
        </div>
        <p className="body-copy">
          Use esta lista como roteiro antes de mudanças grandes: entre com uma conta ativa de cada perfil, confira os módulos esperados e pressione F5 para confirmar que a sessão continua aberta.
        </p>
        <div className="profile-check-grid">
          {profileChecklist.map((item) => (
            <div className={item.ready ? "profile-check-card ready" : "profile-check-card warning"} key={item.role}>
              <span>{item.ready ? "Pronto para teste" : "Precisa criar acesso"}</span>
              <strong>{accessRoleLabel(item.role)}</strong>
              <small>
                {item.activeUsers.length
                  ? `${item.activeUsers.length} acesso${item.activeUsers.length === 1 ? "" : "s"} ativo${item.activeUsers.length === 1 ? "" : "s"}`
                  : "Nenhum acesso ativo cadastrado"}
              </small>
              <p>{item.allowedModules.join(", ")}</p>
            </div>
          ))}
        </div>
        <div className="detail-actions">
          <button className="secondary" onClick={() => exportProfileTests("csv")} type="button">
            Exportar perfis CSV
          </button>
          <button className="secondary" onClick={() => exportProfileTests("excel")} type="button">
            Exportar para Excel
          </button>
        </div>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Checklist operacional</h2>
          <span>Botões e fluxos críticos</span>
        </div>
        <p className="body-copy">
          Use este roteiro antes de uma publicação importante ou depois de mudanças grandes. Ele mostra o que já tem dados para teste e o que precisa de um registro de teste antes da conferência manual.
        </p>
        <div className="security-check-grid">
          {operationalTestRows.map((row) => (
            <div className={row[2] === "Pronto" ? "security-check-card ok" : "security-check-card warning"} key={`${row[0]}-${row[1]}`}>
              <span>{String(row[2])}</span>
              <strong>{String(row[1])}</strong>
              <small>{String(row[0])} - {String(row[3])}</small>
            </div>
          ))}
        </div>
        <div className="detail-actions">
          <button className="secondary" onClick={() => exportOperationalTests("csv")} type="button">
            Exportar testes CSV
          </button>
          <button className="secondary" onClick={() => exportOperationalTests("excel")} type="button">
            Exportar para Excel
          </button>
        </div>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Prontidão de segurança e Supabase</h2>
          <span>Antes de crescer</span>
        </div>
        <p className="body-copy">
          Estes pontos ajudam a preparar o sistema para normalização gradual, isolamento por congregação e revisão de permissões. Eles não substituem teste de RLS no Supabase, mas mostram o que já dá para conferir pelos dados atuais.
        </p>
        <div className="security-check-grid">
          {securityChecklist.map((item) => (
            <div className={item.ok ? "security-check-card ok" : "security-check-card warning"} key={item.title}>
              <span>{item.ok ? "OK" : "Revisar"}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Sincronização dos membros</h2>
          <span>JSON principal e tabela members</span>
        </div>
        <details className="settings-maintenance-drawer" open={memberSyncStatus?.status === "Atencao" || undefined}>
          <summary>
            <span>
              <strong>Conferência técnica dos membros</strong>
              <small>Use quando algum cadastro não aparecer ou quando houver diferença no espelho.</small>
            </span>
            <b>{memberSyncStatus?.status === "Atencao" ? "Atenção" : "Abrir manutenção"}</b>
          </summary>
          <p className="body-copy">
            Use esta conferência quando os membros sumirem da tela ou quando houver diferença entre a base principal e a tabela espelho. A restauração pelo espelho só fica disponível quando a tabela members tiver mais cadastros que o JSON principal.
          </p>
          {memberSyncStatus ? (
            <div className={`member-sync-card member-sync-${memberSyncStatus.status.toLowerCase()}`}>
              <div>
                <strong>{memberSyncStatus.status === "Atencao" ? "Atenção na sincronização" : memberSyncStatus.status}</strong>
                <small>{memberSyncMessage || memberSyncStatus.message}</small>
              </div>
              <div className="member-sync-grid">
                <span>JSON: {memberSyncStatus.jsonTotal}</span>
                <span>Tabela: {memberSyncStatus.tableTotal}</span>
                <span>Sem código: {memberSyncStatus.missingCodeCount}</span>
                <span>CPF duplicado: {memberSyncStatus.duplicateCpfCount}</span>
                <span>Telefone duplicado: {memberSyncStatus.duplicatePhoneCount}</span>
                <span>Faltando na tabela: {memberSyncStatus.missingInTableCount}</span>
                <span>Sobra na tabela: {memberSyncStatus.extraInTableCount}</span>
              </div>
            </div>
          ) : (
            <p className="empty-state">Clique em conferir para comparar a base principal com a tabela members.</p>
          )}
          <div className="detail-actions">
            <button className="secondary" disabled={memberSyncLoading} onClick={refreshMemberSyncStatus} type="button">
              {memberSyncLoading ? "Conferindo..." : "Conferir membros"}
            </button>
            <button className="secondary" disabled={memberSyncLoading} onClick={syncMembersMirror} type="button">
              Sincronizar espelho
            </button>
            <button
              className="secondary"
              disabled={memberSyncLoading || !memberSyncStatus || memberSyncStatus.tableTotal <= memberSyncStatus.jsonTotal}
              onClick={restoreMembersJson}
              type="button"
            >
              Restaurar JSON pela tabela
            </button>
          </div>
        </details>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Qualidade dos cadastros</h2>
          <span>Antes da normalização</span>
        </div>
        <details className="settings-maintenance-drawer" open={memberQualityRows.length > 0 || undefined}>
          <summary>
            <span>
              <strong>Conferir pendências de cadastro</strong>
              <small>{memberQualityRows.length ? `${memberQualityRows.length} ponto(s) para revisar` : "Nenhuma pendência encontrada agora"}</small>
            </span>
            <b>{memberQualityRows.length ? "Revisar" : "Tudo certo"}</b>
          </summary>
          <p className="body-copy">
            Esta conferência mostra pontos que podem dificultar login, relatórios, comunicação por WhatsApp e filtros por grupo quando os dados forem migrados para tabelas próprias.
          </p>
          <div className="data-quality-grid">
            {memberQualityChecklist.map((item) => (
              <div className={item.ok ? "data-quality-card ok" : "data-quality-card warning"} key={item.title}>
                <span>{item.ok ? "OK" : `${item.count} revisar`}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
          <div className="detail-actions">
            <button className="secondary" disabled={!memberQualityRows.length} onClick={() => exportMemberQuality("csv")} type="button">
              Exportar pendências CSV
            </button>
            <button className="secondary" disabled={!memberQualityRows.length} onClick={() => exportMemberQuality("excel")} type="button">
              Exportar para Excel
            </button>
          </div>
          {!memberQualityRows.length && <p className="empty-state">Nenhuma pendência de cadastro encontrada nesta conferência.</p>}
        </details>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Próxima normalização</h2>
          <span>Visitantes, Kids, Agenda e Pastoral</span>
        </div>
        <details className="settings-maintenance-drawer" open={normalizationRows.length > 0 || undefined}>
          <summary>
            <span>
              <strong>Preparação para futuras tabelas</strong>
              <small>{normalizationRows.length ? `${normalizationRows.length} pendência(s) antes da normalização` : "Módulos prontos nesta conferência"}</small>
            </span>
            <b>{normalizationRows.length ? "Revisar" : "Pronto"}</b>
          </summary>
          <p className="body-copy">
            Esta etapa ajuda a decidir quais módulos já estão prontos para sair do JSON principal no futuro. O ideal é corrigir congregação, contato e responsáveis antes de criar tabelas definitivas.
          </p>
          <div className="security-check-grid">
            {normalizationChecklist.map((item) => (
              <div className={item.ok ? "security-check-card ok" : "security-check-card warning"} key={item.title}>
                <span>{item.ok ? "Pronto" : "Revisar"}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
          <div className="detail-actions">
            <button className="secondary" disabled={!normalizationRows.length} onClick={() => exportNormalizationReadiness("csv")} type="button">
              Exportar normalização CSV
            </button>
            <button className="secondary" disabled={!normalizationRows.length} onClick={() => exportNormalizationReadiness("excel")} type="button">
              Exportar para Excel
            </button>
          </div>
          {!normalizationRows.length && <p className="empty-state">Nenhuma pendência encontrada nos próximos módulos para normalização.</p>}
        </details>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Auditoria</h2>
          <span>
            {filteredAudit.length} de {data.audit.length} eventos
          </span>
        </div>
        <div className="audit-summary">
          {auditSummary.map((item) => (
            <div className="audit-summary-card" key={item.module}>
              <strong>{item.total}</strong>
              <small>{item.module}</small>
            </div>
          ))}
        </div>
        <div className="filter-bar">
          <label>
            Buscar
            <input placeholder="Ação, módulo ou data" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} />
          </label>
          <label>
            Módulo
            <select value={auditModule} onChange={(event) => setAuditModule(event.target.value as AuditModuleFilter)}>
              {auditModuleOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Período
            <select value={auditPeriod} onChange={(event) => setAuditPeriod(event.target.value as AuditPeriodFilter)}>
              {auditPeriodOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => exportAudit("pdf")} type="button">
            PDF
          </button>
          <button className="secondary" onClick={() => exportAudit("csv")} type="button">
            CSV
          </button>
        </div>
        <div className="audit-list">
          {filteredAudit.map((item) => (
            <div className="audit-item" key={item.id}>
              <span className="status-chip">{auditModuleFor(item.action)}</span>
              <strong>{item.action}</strong>
              <small>{formatDateTime(item.when)}</small>
            </div>
          ))}
          {!filteredAudit.length && <p className="empty-state">Nenhum evento de auditoria encontrado para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
