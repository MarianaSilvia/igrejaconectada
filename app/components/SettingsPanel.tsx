import { useMemo, useState } from "react";

import { formatDateTime, normalizeSearchText } from "../app-helpers";
import { globalCongregationScope, normalizeCongregationScope } from "../congregation-scope";
import { moduleAccessByRole, modules, type AccessRole } from "../permissions";
import { downloadCsv, downloadExcelWorkbook, printHtmlReport } from "../report-helpers";
import type { AppData, AuditItem, KidRecord, MemberRecord, Notice } from "../types";

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
        <textarea className="backup-json" readOnly value={JSON.stringify(data, null, 2)} />
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
              <strong>{item.role}</strong>
              <small>
                {item.activeUsers.length
                  ? `${item.activeUsers.length} acesso${item.activeUsers.length === 1 ? "" : "s"} ativo${item.activeUsers.length === 1 ? "" : "s"}`
                  : "Nenhum acesso ativo cadastrado"}
              </small>
              <p>{item.allowedModules.join(", ")}</p>
            </div>
          ))}
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
          <h2>Qualidade dos cadastros</h2>
          <span>Antes da normalização</span>
        </div>
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
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Próxima normalização</h2>
          <span>Visitantes, Kids, Agenda e Pastoral</span>
        </div>
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
