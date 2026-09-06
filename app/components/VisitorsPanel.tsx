import type { Dispatch, SetStateAction } from "react";
import { formatDate, whatsappUrl } from "../app-helpers";
import type { VisitorRecord } from "../types";

type VisitorForm = Omit<VisitorRecord, "id">;

type VisitorsPanelProps = {
  canCreateVisitor: boolean;
  canManageMembers: boolean;
  canManageVisitors: boolean;
  convertVisitorToMember: (visitor: VisitorRecord) => void;
  createVisitor: () => void;
  deleteVisitor: (visitor: VisitorRecord) => void;
  editVisitor: (visitor: VisitorRecord) => void;
  editingVisitorId: string | null;
  exportReport: (kind: "visitors", format: "pdf" | "csv") => void;
  filteredVisitors: VisitorRecord[];
  setEditingVisitorId: Dispatch<SetStateAction<string | null>>;
  setVisitorContactFilter: Dispatch<SetStateAction<string>>;
  setVisitorForm: Dispatch<SetStateAction<VisitorForm>>;
  setVisitorStatusFilter: Dispatch<SetStateAction<string>>;
  visitorContactFilter: string;
  visitorForm: VisitorForm;
  visitorStatusFilter: string;
};

const blankVisitor: VisitorForm = {
  fullName: "",
  phone: "",
  firstVisitDate: "",
  returnDate: "",
  invitedBy: "",
  contactMade: false,
  integrationStatus: "Primeira visita",
  notes: "",
};

export function VisitorsPanel({
  canCreateVisitor,
  canManageMembers,
  canManageVisitors,
  convertVisitorToMember,
  createVisitor,
  deleteVisitor,
  editVisitor,
  editingVisitorId,
  exportReport,
  filteredVisitors,
  setEditingVisitorId,
  setVisitorContactFilter,
  setVisitorForm,
  setVisitorStatusFilter,
  visitorContactFilter,
  visitorForm,
  visitorStatusFilter,
}: VisitorsPanelProps) {
  return (
    <section className="content-grid">
      {canManageVisitors && (
        <article className={editingVisitorId ? "surface editing-surface" : "surface"}>
          <div className="panel-heading">
            <h2>{editingVisitorId ? "Editar visitante" : "Novo visitante"}</h2>
            <span>Acompanhamento</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Nome completo
              <input onChange={(event) => setVisitorForm((form) => ({ ...form, fullName: event.target.value }))} placeholder="Ex.: Joao Pereira" value={visitorForm.fullName} />
            </label>
            <label>
              WhatsApp
              <input onChange={(event) => setVisitorForm((form) => ({ ...form, phone: event.target.value }))} placeholder="(00) 00000-0000" value={visitorForm.phone} />
            </label>
            <label>
              Primeira visita
              <input onChange={(event) => setVisitorForm((form) => ({ ...form, firstVisitDate: event.target.value }))} type="date" value={visitorForm.firstVisitDate} />
            </label>
            <label>
              Retorno
              <input onChange={(event) => setVisitorForm((form) => ({ ...form, returnDate: event.target.value }))} type="date" value={visitorForm.returnDate} />
            </label>
            <label>
              Convidado por
              <input onChange={(event) => setVisitorForm((form) => ({ ...form, invitedBy: event.target.value }))} placeholder="Nome, grupo ou evento" value={visitorForm.invitedBy} />
            </label>
            <label>
              Integracao
              <select onChange={(event) => setVisitorForm((form) => ({ ...form, integrationStatus: event.target.value as VisitorRecord["integrationStatus"] }))} value={visitorForm.integrationStatus}>
                <option>Primeira visita</option>
                <option>Retornou</option>
                <option>Em acompanhamento</option>
                <option>Integrado</option>
              </select>
            </label>
            <label className="check-card">
              <input checked={visitorForm.contactMade} onChange={(event) => setVisitorForm((form) => ({ ...form, contactMade: event.target.checked }))} type="checkbox" />
              Contato feito
            </label>
            <label className="full">
              Observacoes
              <textarea onChange={(event) => setVisitorForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Primeira impressao, necessidade pastoral, retorno ou decisao" value={visitorForm.notes} />
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateVisitor} onClick={createVisitor} type="button">
                {editingVisitorId ? "Atualizar visitante" : "Salvar visitante"}
              </button>
              {editingVisitorId && (
                <button
                  className="secondary"
                  onClick={() => {
                    setVisitorForm(blankVisitor);
                    setEditingVisitorId(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="surface">
        <div className="panel-heading">
          <h2>Visitantes em acompanhamento</h2>
          <span>{filteredVisitors.length} registros</span>
        </div>
        <div className="filter-bar">
          <label>
            Status
            <select onChange={(event) => setVisitorStatusFilter(event.target.value)} value={visitorStatusFilter}>
              <option>Todos</option>
              <option>Primeira visita</option>
              <option>Retornou</option>
              <option>Em acompanhamento</option>
              <option>Integrado</option>
            </select>
          </label>
          <label>
            Contato
            <select onChange={(event) => setVisitorContactFilter(event.target.value)} value={visitorContactFilter}>
              <option>Todos</option>
              <option>Contato pendente</option>
              <option>Contato feito</option>
            </select>
          </label>
          <button className="secondary" onClick={() => exportReport("visitors", "pdf")} type="button">
            PDF
          </button>
          <button className="secondary" onClick={() => exportReport("visitors", "csv")} type="button">
            Excel
          </button>
        </div>
        <div className="row-list">
          {filteredVisitors.map((visitor) => (
            <div className="data-row access-user-row" key={visitor.id}>
              <span className="date-box">{formatDate(visitor.firstVisitDate)}</span>
              <div>
                <strong>{visitor.fullName}</strong>
                <div className="notice-stack">
                  {!visitor.contactMade && <span className="notice-pill">Sem contato feito</span>}
                  {visitor.contactMade && visitor.integrationStatus === "Em acompanhamento" && <span className="notice-pill">Pronto para integrar</span>}
                </div>
                <small>
                  {visitor.integrationStatus} - {visitor.contactMade ? "contato feito" : "contato pendente"} - {visitor.phone}
                </small>
                <small>Convidado por: {visitor.invitedBy || "Nao informado"}</small>
                {visitor.notes && <small>{visitor.notes}</small>}
              </div>
              <div className="row-actions">
                <a className="whatsapp-link" href={whatsappUrl(visitor.phone, "Paz, {nome}! Ficamos felizes com sua visita. Podemos ajudar em algo?", visitor.fullName)} rel="noreferrer" target="_blank">
                  WhatsApp
                </a>
                {canManageVisitors && (
                  <button className="secondary" onClick={() => editVisitor(visitor)} type="button">
                    Editar
                  </button>
                )}
                {canManageMembers && visitor.integrationStatus !== "Integrado" && (
                  <button className="secondary" onClick={() => convertVisitorToMember(visitor)} type="button">
                    Integrar
                  </button>
                )}
                {canManageVisitors && (
                  <button className="danger-action" onClick={() => deleteVisitor(visitor)} type="button">
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
          {!filteredVisitors.length && <p className="empty-state">Nenhum visitante encontrado para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
