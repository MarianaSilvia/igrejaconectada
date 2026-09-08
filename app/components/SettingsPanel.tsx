import { useMemo, useState } from "react";

import { formatDateTime, normalizeSearchText } from "../app-helpers";
import { downloadCsv, printHtmlReport } from "../report-helpers";
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

function auditModuleFor(action: string): AuditModuleFilter {
  const normalized = normalizeSearchText(action);

  if (normalized.includes("membro") || normalized.includes("ficha") || normalized.includes("pre-cadastro")) return "Membros";
  if (normalized.includes("acesso") || normalized.includes("usuario") || normalized.includes("login")) return "Acessos";
  if (normalized.includes("evento") || normalized.includes("agenda") || normalized.includes("escala")) return "Agenda";
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

  function exportAudit(format: "pdf" | "csv") {
    const headers = ["Data e hora", "Modulo", "Acao"];
    const rows = auditRows(filteredAudit);
    const subtitle = `Auditoria filtrada em ${new Date().toLocaleString("pt-BR")} - ${filteredAudit.length} evento(s).`;

    if (format === "csv") {
      downloadCsv("auditoria-igreja-conectada.csv", headers, rows);
      log("Auditoria exportada em CSV");
      return;
    }

    const opened = printHtmlReport("Auditoria - Igreja Conectada", subtitle, headers, rows);
    log(opened ? "Auditoria preparada em PDF" : "Falha ao abrir relatorio de auditoria");
  }

  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>Backup e recuperacao local</h2>
          <span>JSON validado</span>
        </div>
        <p className="body-copy">
          Esta copia roda neste computador. O backup abaixo representa os dados locais do navegador e ajuda a validar a estrutura antes de conectar novamente ao Supabase.
        </p>
        <div className="backup-box">
          <strong>Cobertura do backup</strong>
          <span>100%</span>
          <small>
            {data.members.length} membros, {monthlyBirthdays.length} aniversariantes no mes, {data.kids.length} criancas no Kids,{" "}
            {data.visitors.length} visitantes, {monthlyKidsBirthdays.length} aniversariantes Kids no mes,{" "}
            {data.users.length} usuarios, {data.careRequests.length} atendimentos, {data.events.length} eventos, {data.schoolClasses.length} classes EBD,{" "}
            {data.discipleshipClasses.length} classes Discipulado, {activeNotices.length} comunicados ativos, {data.mural.length} itens de mural,{" "}
            {data.transactions.length} lancamentos financeiros, {data.assets.length} itens de patrimonio, {data.devotionals.length} devocionais e{" "}
            {data.audit.length} auditorias.
          </small>
        </div>
        <textarea className="backup-json" readOnly value={JSON.stringify(data, null, 2)} />
        <div className="detail-actions">
          <button onClick={() => log("Backup local gerado")} type="button">
            Registrar backup
          </button>
          <button className="secondary" onClick={resetLocalData} type="button">
            Restaurar dados exemplo
          </button>
        </div>
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
            <input placeholder="Acao, modulo ou data" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} />
          </label>
          <label>
            Modulo
            <select value={auditModule} onChange={(event) => setAuditModule(event.target.value as AuditModuleFilter)}>
              {auditModuleOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Periodo
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
