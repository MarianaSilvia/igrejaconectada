import { whatsappUrl } from "../app-helpers";
import { canAccessModule, type AccessRole } from "../permissions";
import type { AppData, ChurchEvent, MemberRecord, ReportKind } from "../types";
import type { ReportDefinition } from "../report-builders";

type ReportCardDefinition = [ReportKind, string, string];

type ReportsPanelProps = {
  absentRows: unknown[][];
  currentAccessRole: AccessRole;
  data: AppData;
  exportReport: (kind: ReportKind, format: "pdf" | "csv") => void;
  monthlyBirthdays: MemberRecord[];
  reportPreviewKind: ReportKind;
  selectedReportPreview: ReportDefinition;
  setReportPreviewKind: (kind: ReportKind) => void;
  weekEvents: ChurchEvent[];
};

export function ReportsPanel({
  absentRows,
  currentAccessRole,
  data,
  exportReport,
  monthlyBirthdays,
  reportPreviewKind,
  selectedReportPreview,
  setReportPreviewKind,
  weekEvents,
}: ReportsPanelProps) {
  const reportCards: ReportCardDefinition[] = [
    ["members", "Membros por tipo", `${data.members.length} cadastros`],
    ["visitors", "Visitantes", `${data.visitors.length} acompanhamentos`],
    ["birthdays", "Aniversariantes", `${monthlyBirthdays.length} no mes`],
    ["kids", "Area Kids", `${data.kids.length} criancas`],
    ["agenda", "Agenda semanal", `${weekEvents.length} eventos na semana`],
    ["schedules", "Escalas", `${data.schedules.length} pessoas escaladas`],
    ["attendance", "Presenca EBD/Discipulado", `${data.attendanceSessions.length} chamadas`],
    ["absences", "Faltosos recentes", `${absentRows.length} alertas`],
    ["finance", "Financeiro", `${data.transactions.length} lancamentos`],
    ["assets", "Patrimonio", `${data.assets.length} itens`],
  ];

  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>Relatorios operacionais</h2>
          <span>PDF e Excel/CSV</span>
        </div>
        <div className="report-grid">
          {reportCards
            .filter(([kind]) => {
              if (kind === "finance") return canAccessModule(currentAccessRole, "finance");
              if (kind === "assets") return canAccessModule(currentAccessRole, "assets");
              return true;
            })
            .map(([kind, title, count]) => (
              <div className="report-card" key={kind}>
                <strong>{title}</strong>
                <small>{count}</small>
                <div className="row-actions">
                  <button className="secondary" onClick={() => setReportPreviewKind(kind)} type="button">
                    Previa
                  </button>
                  <button className="secondary" onClick={() => exportReport(kind, "pdf")} type="button">
                    PDF
                  </button>
                  <button className="secondary" onClick={() => exportReport(kind, "csv")} type="button">
                    Excel
                  </button>
                </div>
              </div>
            ))}
        </div>
      </article>

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Previa do relatorio</h2>
          <span>{selectedReportPreview.title}</span>
        </div>
        <div className="preview-table">
          <div className="preview-row preview-head" style={{ gridTemplateColumns: `repeat(${selectedReportPreview.headers.length}, minmax(120px, 1fr))` }}>
            {selectedReportPreview.headers.map((header) => (
              <strong key={header}>{header}</strong>
            ))}
          </div>
          {selectedReportPreview.rows.slice(0, 6).map((row, index) => (
            <div className="preview-row" key={`${reportPreviewKind}-${index}`} style={{ gridTemplateColumns: `repeat(${selectedReportPreview.headers.length}, minmax(120px, 1fr))` }}>
              {row.map((cell, cellIndex) => (
                <span key={`${reportPreviewKind}-${index}-${cellIndex}`}>{String(cell ?? "")}</span>
              ))}
            </div>
          ))}
          {!selectedReportPreview.rows.length && <p className="empty-state">Nenhum dado encontrado para este relatorio.</p>}
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Previa de faltosos</h2>
          <span>{absentRows.length} alertas</span>
        </div>
        <div className="row-list">
          {absentRows.map(([name, phone, status, recent, month]) => (
            <div className="data-row" key={`${String(name)}-${String(phone)}`}>
              <span className="date-box">{String(month)}</span>
              <div>
                <strong>{String(name)}</strong>
                <small>
                  {String(status)} - {String(recent)} faltas recentes - {String(month)} no mes
                </small>
              </div>
              <a className="whatsapp-link" href={whatsappUrl(String(phone), "Ola, {nome}! Sentimos sua falta na aula. Podemos ajudar em algo?", String(name))} rel="noreferrer" target="_blank">
                WhatsApp
              </a>
            </div>
          ))}
          {!absentRows.length && <p className="empty-state">Nenhum aluno em alerta de falta no momento.</p>}
        </div>
      </article>
    </section>
  );
}
