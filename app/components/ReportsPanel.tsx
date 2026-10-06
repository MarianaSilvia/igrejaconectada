import { useMemo, useState } from "react";

import { birthdayDateThisYear, normalizeSearchText, whatsappUrl } from "../app-helpers";
import { printableDocumentDefinitions, type PrintableDocumentKind } from "../document-templates";
import { canAccessModule, type AccessRole } from "../permissions";
import type { AppData, ChurchEvent, MemberRecord, ReportKind } from "../types";
import type { ReportDefinition } from "../report-builders";

type ReportCardDefinition = [ReportKind, string, string];

type ReportsPanelProps = {
  absentRows: unknown[][];
  currentAccessRole: AccessRole;
  data: AppData;
  exportReport: (kind: ReportKind, format: "pdf" | "excel", congregationScope?: string) => void;
  generatePrintableDocument: (kind: PrintableDocumentKind, targetId: string) => void;
  monthlyBirthdays: MemberRecord[];
  reportCongregationFilter: string;
  reportEndDate: string;
  reportPreviewKind: ReportKind;
  reportStartDate: string;
  selectedReportPreview: ReportDefinition;
  setReportCongregationFilter: (congregation: string) => void;
  setReportEndDate: (date: string) => void;
  setReportPreviewKind: (kind: ReportKind) => void;
  setReportStartDate: (date: string) => void;
  weekEvents: ChurchEvent[];
};

export function ReportsPanel({
  absentRows,
  currentAccessRole,
  data,
  exportReport,
  generatePrintableDocument,
  monthlyBirthdays,
  reportCongregationFilter,
  reportEndDate,
  reportPreviewKind,
  reportStartDate,
  selectedReportPreview,
  setReportCongregationFilter,
  setReportEndDate,
  setReportPreviewKind,
  setReportStartDate,
  weekEvents,
}: ReportsPanelProps) {
  const [documentKind, setDocumentKind] = useState<PrintableDocumentKind>("member-file");
  const [documentSearch, setDocumentSearch] = useState("");
  const selectedDocument = printableDocumentDefinitions.find((document) => document.kind === documentKind) ?? printableDocumentDefinitions[0];
  const documentTargets = useMemo(() => {
    const matchesDocumentScope = (congregation?: string) => reportCongregationFilter === "Todas" || congregation === reportCongregationFilter;

    if (selectedDocument.target === "kid") {
      return data.kids.filter((kid) => matchesDocumentScope(kid.congregation)).map((kid) => ({ id: kid.id, label: kid.childName }));
    }

    const scopedDocumentMembers = data.members.filter((member) => matchesDocumentScope(member.congregation));

    if (documentKind === "school-certificate") {
      return scopedDocumentMembers
        .filter((member) => member.schoolClassId)
        .map((member) => ({ id: member.id, label: member.fullName }));
    }

    if (documentKind === "discipleship-certificate") {
      return scopedDocumentMembers
        .filter((member) => member.discipleshipClassId)
        .map((member) => ({ id: member.id, label: member.fullName }));
    }

    return scopedDocumentMembers.map((member) => ({ id: member.id, label: member.fullName }));
  }, [data.kids, data.members, documentKind, reportCongregationFilter, selectedDocument.target]);
  const visibleDocumentTargets = useMemo(() => {
    const search = normalizeSearchText(documentSearch);
    if (!search) return documentTargets;
    return documentTargets.filter((target) => normalizeSearchText(target.label).includes(search));
  }, [documentSearch, documentTargets]);
  const [documentTargetId, setDocumentTargetId] = useState("");
  const selectedTargetId = visibleDocumentTargets.some((target) => target.id === documentTargetId) ? documentTargetId : (visibleDocumentTargets[0]?.id ?? "");
  const canGenerateDocuments = currentAccessRole === "Administrador" || currentAccessRole === "Secretario";
  const congregationOptions = useMemo(() => {
    const congregations = new Set<string>();
    [
      ...data.members.map((member) => member.congregation),
      ...data.visitors.map((visitor) => visitor.congregation),
      ...data.kids.map((kid) => kid.congregation),
      ...data.events.map((event) => event.congregation),
      ...data.registrationRequests.map((request) => request.congregation),
      ...data.careRequests.map((request) => request.congregation),
      ...data.messageCampaigns.map((campaign) => campaign.congregation),
    ].forEach((congregation) => {
      const normalized = congregation?.trim();
      if (normalized) congregations.add(normalized);
    });

    return ["Todas", ...Array.from(congregations).sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }))];
  }, [data.careRequests, data.events, data.kids, data.members, data.messageCampaigns, data.registrationRequests, data.visitors]);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const dateKey = (date: Date) => date.toLocaleDateString("en-CA");
  const applyCurrentWeek = () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    setReportStartDate(dateKey(start));
    setReportEndDate(dateKey(end));
  };
  const applyCurrentMonth = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    setReportStartDate(dateKey(start));
    setReportEndDate(dateKey(end));
  };
  const reportIsScoped = reportCongregationFilter !== "Todas";
  const reportHasPeriod = Boolean(reportStartDate || reportEndDate);
  const dateFromKey = (value: string) => {
    if (!value) return null;
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const isDateInReportPeriod = (value: string) => {
    if (!reportHasPeriod) return true;
    const date = dateFromKey(value);
    if (!date) return false;
    const start = reportStartDate ? dateFromKey(reportStartDate) : null;
    const end = reportEndDate ? dateFromKey(reportEndDate) : null;

    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  };
  const isBirthdayInReportPeriod = (value: string) => {
    if (!reportHasPeriod) return true;
    const date = birthdayDateThisYear(value);
    if (!date) return false;
    const start = reportStartDate ? dateFromKey(reportStartDate) : null;
    const end = reportEndDate ? dateFromKey(reportEndDate) : null;

    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  };
  const belongsToReportScope = (congregation?: string) => !reportIsScoped || congregation === reportCongregationFilter;
  const scopedMembers = data.members.filter((member) => belongsToReportScope(member.congregation));
  const reportMembers = reportHasPeriod ? scopedMembers.filter((member) => isDateInReportPeriod(member.createdAt || member.joinedAt)) : scopedMembers;
  const scopedVisitors = data.visitors.filter((visitor) => belongsToReportScope(visitor.congregation) && isDateInReportPeriod(visitor.firstVisitDate || visitor.returnDate));
  const scopedKids = data.kids.filter((kid) => belongsToReportScope(kid.congregation));
  const eventSource = reportHasPeriod ? data.events : weekEvents;
  const scopedWeekEvents = eventSource.filter((event) => belongsToReportScope(event.congregation) && isDateInReportPeriod(event.date));
  const scopedRegistrationRequests = data.registrationRequests.filter((request) => belongsToReportScope(request.congregation) && isDateInReportPeriod(request.createdAt));
  const scopedCareRequests = data.careRequests.filter(
    (request) => belongsToReportScope(request.congregation) && (!reportHasPeriod || isDateInReportPeriod(request.createdAt) || isDateInReportPeriod(request.scheduleDate)),
  );
  const scopedMessageCampaigns = data.messageCampaigns.filter((campaign) => belongsToReportScope(campaign.congregation) && isDateInReportPeriod(campaign.createdAt));
  const birthdaySource = reportHasPeriod ? scopedMembers : monthlyBirthdays;
  const scopedMonthlyBirthdays = birthdaySource.filter((member) => belongsToReportScope(member.congregation) && isBirthdayInReportPeriod(member.birthDate));
  const scopedAbsentRows = reportIsScoped
    ? absentRows.filter(([name]) => scopedMembers.some((member) => member.fullName === String(name)))
    : absentRows;
  const scopedMemberIds = new Set(scopedMembers.map((member) => member.id));
  const scopedSchoolStudents = scopedMembers.filter((member) => member.schoolClassId);
  const scopedDiscipleshipStudents = scopedMembers.filter((member) => member.discipleshipClassId);
  const scopedAttendanceCount = data.attendanceSessions.filter(
    (session) => isDateInReportPeriod(session.date) && (!reportIsScoped || session.records.some((record) => scopedMemberIds.has(record.memberId))),
  ).length;
  const scopedFormationClassCount =
    data.schoolClasses.filter((classRecord) => scopedSchoolStudents.some((member) => member.schoolClassId === classRecord.id)).length +
    data.discipleshipClasses.filter((classRecord) => scopedDiscipleshipStudents.some((member) => member.discipleshipClassId === classRecord.id)).length;
  const newMembersThisMonth = reportHasPeriod
    ? scopedMembers.filter((member) => isDateInReportPeriod(member.createdAt || member.joinedAt)).length
    : scopedMembers.filter((member) => (member.createdAt || member.joinedAt).slice(0, 7) === currentMonthKey).length;
  const scopedFinanceCount = reportHasPeriod ? data.transactions.filter((transaction) => isDateInReportPeriod(transaction.date)).length : data.transactions.length;
  const reportCards: ReportCardDefinition[] = [
    ["members", "Membros por tipo", `${reportMembers.length} cadastros`],
    ["visitors", "Visitantes", `${scopedVisitors.length} acompanhamentos`],
    ["birthdays", "Aniversariantes", `${scopedMonthlyBirthdays.length} no mês`],
    ["kids", "Área Kids", `${scopedKids.length} crianças`],
    ["agenda", "Agenda semanal", `${scopedWeekEvents.length} eventos na semana`],
    ["registrationRequests", "Pré-cadastros", `${scopedRegistrationRequests.length} solicitações`],
    ["careRequests", "Atendimento pastoral", `${scopedCareRequests.length} pedidos`],
    ["messageCampaigns", "Campanhas WhatsApp", `${scopedMessageCampaigns.length} envios`],
    ["attendance", "Presença EBD/Discipulado", `${scopedAttendanceCount} chamadas`],
    ["schoolRoster", "Turmas EBD", `${scopedSchoolStudents.length} alunos`],
    ["discipleshipRoster", "Turmas Discipulado", `${scopedDiscipleshipStudents.length} alunos`],
    ["classAttendanceSummary", "Frequência por turma", `${scopedFormationClassCount} turmas`],
    ["absences", "Faltosos recentes", `${scopedAbsentRows.length} alertas`],
    ["newMembers", "Novos membros do mês", `${newMembersThisMonth} cadastros`],
    ["followUpStudents", "Alunos em acompanhamento", `${scopedAbsentRows.length} alertas`],
    ["indicators", "Indicadores gerais", "Visão executiva"],
    ["finance", "Financeiro", `${scopedFinanceCount} lançamentos`],
    ["assets", "Patrimônio", `${data.assets.length} itens`],
  ];

  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <div>
            <h2>Relatórios operacionais</h2>
            <span>PDF e Excel</span>
          </div>
          <label className="report-scope-filter">
            Congregação
            <select onChange={(event) => setReportCongregationFilter(event.target.value)} value={reportCongregationFilter}>
              {congregationOptions.map((congregation) => (
                <option key={congregation} value={congregation}>
                  {congregation}
                </option>
              ))}
            </select>
          </label>
          <div className="report-period-filter">
            <button className="secondary" onClick={applyCurrentWeek} type="button">
              Semana atual
            </button>
            <button className="secondary" onClick={applyCurrentMonth} type="button">
              Mês atual
            </button>
            <label>
              De
              <input onChange={(event) => setReportStartDate(event.target.value)} type="date" value={reportStartDate} />
            </label>
            <label>
              Até
              <input onChange={(event) => setReportEndDate(event.target.value)} type="date" value={reportEndDate} />
            </label>
            {(reportStartDate || reportEndDate) && (
              <button className="secondary" onClick={() => {
                setReportStartDate("");
                setReportEndDate("");
              }} type="button">
                Limpar
              </button>
            )}
          </div>
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
                  <button className="secondary" onClick={() => exportReport(kind, "pdf", reportCongregationFilter)} type="button">
                    PDF
                  </button>
                  <button className="secondary" onClick={() => exportReport(kind, "excel", reportCongregationFilter)} type="button">
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
                  setDocumentSearch("");
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
              Buscar
              <input onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Digite o nome" value={documentSearch} />
            </label>
            <label>
              {selectedDocument.target === "kid" ? "Criança" : "Membro"}
              <select onChange={(event) => setDocumentTargetId(event.target.value)} value={selectedTargetId}>
                {visibleDocumentTargets.map((target) => (
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
          {!documentTargets.length && (
            <p className="empty-state">
              Nenhum cadastro disponível para este modelo{reportCongregationFilter !== "Todas" ? ` em ${reportCongregationFilter}` : ""}.
            </p>
          )}
          {documentTargets.length > 0 && !visibleDocumentTargets.length && <p className="empty-state">Nenhum cadastro encontrado com esse nome.</p>}
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
          <span>{scopedAbsentRows.length} alertas</span>
        </div>
        <div className="row-list">
          {scopedAbsentRows.map(([name, phone, status, recent, month]) => (
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
          {!scopedAbsentRows.length && <p className="empty-state">Nenhum aluno em alerta de falta no momento.</p>}
        </div>
      </article>
    </section>
  );
}
