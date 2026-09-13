import { useMemo, useState } from "react";

import { whatsappUrl } from "../app-helpers";
import { printableDocumentDefinitions, type PrintableDocumentKind } from "../document-templates";
import { canAccessModule, type AccessRole } from "../permissions";
import type { AppData, ChurchEvent, MemberRecord, ReportKind } from "../types";
import type { ReportDefinition } from "../report-builders";

type ReportCardDefinition = [ReportKind, string, string];

type ReportsPanelProps = {
  absentRows: unknown[][];
  currentAccessRole: AccessRole;
  data: AppData;
  exportReport: (kind: ReportKind, format: "pdf" | "csv") => void;
  generatePrintableDocument: (kind: PrintableDocumentKind, targetId: string) => void;
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
  generatePrintableDocument,
  monthlyBirthdays,
  reportPreviewKind,
  selectedReportPreview,
  setReportPreviewKind,
  weekEvents,
}: ReportsPanelProps) {
  const [documentKind, setDocumentKind] = useState<PrintableDocumentKind>("member-file");
  const selectedDocument = printableDocumentDefinitions.find((document) => document.kind === documentKind) ?? printableDocumentDefinitions[0];
  const documentTargets = useMemo(() => {
    if (selectedDocument.target === "kid") {
      return data.kids.map((kid) => ({ id: kid.id, label: kid.childName }));
    }

    if (documentKind === "school-certificate") {
      return data.members
        .filter((member) => member.schoolClassId)
        .map((member) => ({ id: member.id, label: member.fullName }));
    }

    if (documentKind === "discipleship-certificate") {
      return data.members
        .filter((member) => member.discipleshipClassId)
        .map((member) => ({ id: member.id, label: member.fullName }));
    }

    return data.members.map((member) => ({ id: member.id, label: member.fullName }));
  }, [data.kids, data.members, documentKind, selectedDocument.target]);
  const [documentTargetId, setDocumentTargetId] = useState("");
  const selectedTargetId = documentTargets.some((target) => target.id === documentTargetId) ? documentTargetId : (documentTargets[0]?.id ?? "");
  const canGenerateDocuments = currentAccessRole === "Administrador" || currentAccessRole === "Secretario";
  const reportCards: ReportCardDefinition[] = [
    ["members", "Membros por tipo", `${data.members.length} cadastros`],
    ["visitors", "Visitantes", `${data.visitors.length} acompanhamentos`],
    ["birthdays", "Aniversariantes", `${monthlyBirthdays.length} no mês`],
    ["kids", "Área Kids", `${data.kids.length} crianças`],
    ["agenda", "Agenda semanal", `${weekEvents.length} eventos na semana`],
    ["attendance", "Presença EBD/Discipulado", `${data.attendanceSessions.length} chamadas`],
    ["absences", "Faltosos recentes", `${absentRows.length} alertas`],
    ["finance", "Financeiro", `${data.transactions.length} lançamentos`],
    ["assets", "Patrimônio", `${data.assets.length} itens`],
  ];

  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>Relatórios operacionais</h2>
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
                    Prévia
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

      {canGenerateDocuments && (
        <article className="surface wide">
          <div className="panel-heading">
            <div>
              <h2>Documentos prontos</h2>
              <span>Cartas, certificados e ficha cadastral em PDF</span>
            </div>
          </div>
          <div className="document-tool-grid">
            <label>
              Modelo
              <select
                onChange={(event) => {
                  setDocumentKind(event.target.value as PrintableDocumentKind);
                  setDocumentTargetId("");
                }}
                value={documentKind}
              >
                {printableDocumentDefinitions.map((document) => (
                  <option key={document.kind} value={document.kind}>
                    {document.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {selectedDocument.target === "kid" ? "Criança" : "Membro"}
              <select onChange={(event) => setDocumentTargetId(event.target.value)} value={selectedTargetId}>
                {documentTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!selectedTargetId} onClick={() => generatePrintableDocument(documentKind, selectedTargetId)} type="button">
              Gerar PDF / Imprimir
            </button>
          </div>
          {!documentTargets.length && <p className="empty-state">Nenhum cadastro disponível para este modelo.</p>}
        </article>
      )}

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Prévia do relatório</h2>
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
          {!selectedReportPreview.rows.length && <p className="empty-state">Nenhum dado encontrado para este relatório.</p>}
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Prévia de faltosos</h2>
          <span>{absentRows.length} alertas</span>
        </div>
        <div className="row-list">
          {absentRows.map(([name, phone, status, recent, month]) => (
            <div className="data-row" key={`${String(name)}-${String(phone)}`}>
              <span className="date-box">{String(month)}</span>
              <div>
                <strong>{String(name)}</strong>
                <small>
                  {String(status)} - {String(recent)} faltas recentes - {String(month)} no mês
                </small>
              </div>
              <a className="whatsapp-link" href={whatsappUrl(String(phone), "Olá, {nome}! Sentimos sua falta na aula. Podemos ajudar em algo?", String(name))} rel="noreferrer" target="_blank">
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
