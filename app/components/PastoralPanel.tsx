import type { Dispatch, SetStateAction } from "react";
import type { CareRequest, CareStatus, MemberFormTab } from "../types";

type CareForm = Omit<CareRequest, "id" | "createdAt" | "updatedAt">;

type PastoralPanelProps = {
  canManagePastoral: boolean;
  careForm: CareForm;
  careStatusFilter: string;
  createCareRequest: () => void;
  currentMemberName: string;
  currentMemberPhone: string;
  filteredCareRequests: CareRequest[];
  memberFormTab: MemberFormTab;
  pastoralResponsibleOptions: string[];
  selectedRequest?: CareRequest;
  deleteCareRequest: (request: CareRequest) => void;
  setCareForm: Dispatch<SetStateAction<CareForm>>;
  setCareStatusFilter: Dispatch<SetStateAction<string>>;
  setSelectedRequestId: Dispatch<SetStateAction<string>>;
  statusFlow: CareStatus[];
  updateCareRequest: (id: string, patch: Partial<CareRequest>, action: string) => void;
};

function nextStatus(status: CareStatus): CareStatus {
  if (status === "Pendente") return "Em analise";
  if (status === "Em analise") return "Agendado";
  return "Concluido";
}

function suggestedNextStep(request: CareRequest) {
  if (request.status === "Pendente") return "Definir responsavel";
  if (request.status === "Em analise") return "Agendar conversa";
  if (request.status === "Agendado") return request.scheduleDate ? `Atendimento em ${request.scheduleDate}` : "Confirmar data";
  return "Registrar encerramento";
}

export function PastoralPanel({
  canManagePastoral,
  careForm,
  careStatusFilter,
  createCareRequest,
  currentMemberName,
  currentMemberPhone,
  filteredCareRequests,
  memberFormTab,
  pastoralResponsibleOptions,
  selectedRequest,
  deleteCareRequest,
  setCareForm,
  setCareStatusFilter,
  setSelectedRequestId,
  statusFlow,
  updateCareRequest,
}: PastoralPanelProps) {
  function optionsWithCurrent(currentResponsible: string) {
    const trimmed = currentResponsible.trim();
    const options = [...pastoralResponsibleOptions];
    if (trimmed && !options.includes(trimmed)) options.push(trimmed);
    return options.sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }));
  }

  return (
    <section className="pastoral-layout">
      <article className="surface">
        <div className="panel-heading">
          <h2>{canManagePastoral ? "Novo pedido pastoral" : "Solicitar atendimento ou oracao"}</h2>
          <span>{canManagePastoral ? "Fluxo real" : "Pedido pessoal"}</span>
        </div>
        <div className="form-grid" data-current-member-tab={memberFormTab}>
          <label>
            Nome do membro
            <input
              disabled={!canManagePastoral}
              onChange={(event) => setCareForm((form) => ({ ...form, member: event.target.value }))}
              placeholder="Ex.: Maria Oliveira"
              value={canManagePastoral ? careForm.member : currentMemberName}
            />
          </label>
          <label>
            Telefone
            <input
              disabled={!canManagePastoral}
              onChange={(event) => setCareForm((form) => ({ ...form, phone: event.target.value }))}
              placeholder="(00) 00000-0000"
              value={canManagePastoral ? careForm.phone : currentMemberPhone}
            />
          </label>
          <label>
            Categoria
            <select onChange={(event) => setCareForm((form) => ({ ...form, category: event.target.value }))} value={careForm.category}>
              <option>Aconselhamento</option>
              <option>Pedido de visita</option>
              <option>Oracao</option>
              <option>Familia</option>
              <option>Urgente</option>
            </select>
          </label>
          <label>
            Escolher responsavel
            <select onChange={(event) => setCareForm((form) => ({ ...form, responsible: event.target.value }))} value={careForm.responsible}>
              <option value="">Sem preferencia / Secretaria encaminha</option>
              {optionsWithCurrent(careForm.responsible).map((responsible) => (
                <option key={responsible} value={responsible}>
                  {responsible}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Descricao do pedido
            <textarea onChange={(event) => setCareForm((form) => ({ ...form, summary: event.target.value }))} placeholder="Escreva o motivo do atendimento" value={careForm.summary} />
          </label>
          <button className="primary-action" onClick={createCareRequest} type="button">
            {canManagePastoral ? "Criar atendimento" : "Enviar pedido"}
          </button>
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>{canManagePastoral ? "Fila pastoral" : "Meus pedidos"}</h2>
          <span>{filteredCareRequests.length} registros</span>
        </div>
        {canManagePastoral && (
          <div className="filter-bar">
            <label>
              Status
              <select onChange={(event) => setCareStatusFilter(event.target.value)} value={careStatusFilter}>
                <option>Todos</option>
                {statusFlow.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="care-list">
          {filteredCareRequests.map((request) => (
            <article className={request.id === selectedRequest?.id ? "care-list-item selected" : "care-list-item"} key={request.id}>
              <button className="care-list-main" onClick={() => setSelectedRequestId(request.id)} type="button">
                <span className={`status-chip ${request.status.toLowerCase().replaceAll(" ", "-")}`}>{request.status}</span>
                <strong>{request.member}</strong>
                <small>{request.responsible || "Sem responsavel definido"}</small>
                <small>{suggestedNextStep(request)}</small>
              </button>
              {canManagePastoral && (
                <div className="care-list-actions">
                  <button onClick={() => setSelectedRequestId(request.id)} type="button">
                    Editar
                  </button>
                  <button className="danger" onClick={() => deleteCareRequest(request)} type="button">
                    Excluir
                  </button>
                </div>
              )}
            </article>
          ))}
          {!filteredCareRequests.length && <p className="empty-state">Nenhum pedido registrado para este filtro.</p>}
        </div>
      </article>

      {canManagePastoral && selectedRequest && (
        <article className="surface care-detail">
          <div className="panel-heading">
            <h2>{selectedRequest.member}</h2>
            <span>{selectedRequest.category}</span>
          </div>
          <p>{selectedRequest.summary}</p>
          <div className="flow-line" aria-label="Etapas do atendimento">
            {statusFlow.map((status) => (
              <span className={statusFlow.indexOf(status) <= statusFlow.indexOf(selectedRequest.status) ? "flow-step done" : "flow-step"} key={status}>
                {status}
              </span>
            ))}
          </div>
          <div className="detail-grid">
            <label>
              Responsavel
              <select onChange={(event) => updateCareRequest(selectedRequest.id, { responsible: event.target.value }, "Responsavel pastoral atualizado")} value={selectedRequest.responsible}>
                <option value="">Sem preferencia / Secretaria encaminha</option>
                {optionsWithCurrent(selectedRequest.responsible).map((responsible) => (
                  <option key={responsible} value={responsible}>
                    {responsible}
                  </option>
                ))}
              </select>
              <input onChange={(event) => updateCareRequest(selectedRequest.id, { responsible: event.target.value }, "Responsavel pastoral atualizado")} placeholder="Ou digite outro responsavel" value={selectedRequest.responsible} />
            </label>
            <label>
              Data
              <input onChange={(event) => updateCareRequest(selectedRequest.id, { scheduleDate: event.target.value }, "Data do atendimento atualizada")} type="date" value={selectedRequest.scheduleDate} />
            </label>
            <label>
              Horario
              <input onChange={(event) => updateCareRequest(selectedRequest.id, { scheduleTime: event.target.value }, "Horario do atendimento atualizado")} type="time" value={selectedRequest.scheduleTime} />
            </label>
            <label className="full">
              Retorno e encaminhamento
              <textarea onChange={(event) => updateCareRequest(selectedRequest.id, { returnNote: event.target.value }, "Retorno pastoral registrado")} placeholder="Registre conversa, retorno, decisao e proximo passo" value={selectedRequest.returnNote} />
            </label>
          </div>
          <div className="detail-actions">
            <button onClick={() => updateCareRequest(selectedRequest.id, { status: nextStatus(selectedRequest.status) }, `Status alterado para ${nextStatus(selectedRequest.status)}`)} type="button">
              Avancar etapa
            </button>
            <button className="secondary" onClick={() => updateCareRequest(selectedRequest.id, { status: "Concluido" }, "Atendimento pastoral concluido")} type="button">
              Concluir
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
