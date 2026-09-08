import type { Dispatch, SetStateAction } from "react";
import { formatDate } from "../app-helpers";
import type { ChurchEvent, ReportKind } from "../types";
import { agendaThemeClass } from "../visual-covers";

type EventForm = Omit<ChurchEvent, "id">;

type AgendaPanelProps = {
  canCreateEvent: boolean;
  canManageEvents: boolean;
  createEvent: () => void;
  cancelEventEdit: () => void;
  deleteEvent: (event: ChurchEvent) => void;
  duplicateEvent: (event: ChurchEvent) => void;
  editEvent: (event: ChurchEvent) => void;
  editingEventId: string | null;
  eventForm: EventForm;
  eventGroupFilter: string;
  eventStatusFilter: string;
  exportReport: (kind: ReportKind, format: "pdf" | "csv") => void;
  groupOptions: string[];
  totalEvents: number;
  updateEventStatus: (event: ChurchEvent, status: ChurchEvent["status"]) => void;
  setEventForm: Dispatch<SetStateAction<EventForm>>;
  setEventGroupFilter: Dispatch<SetStateAction<string>>;
  setEventStatusFilter: Dispatch<SetStateAction<string>>;
  setEventWeekOffset: Dispatch<SetStateAction<number>>;
  weekEvents: ChurchEvent[];
};

export function AgendaPanel({
  canCreateEvent,
  canManageEvents,
  createEvent,
  cancelEventEdit,
  deleteEvent,
  duplicateEvent,
  editEvent,
  editingEventId,
  eventForm,
  eventGroupFilter,
  eventStatusFilter,
  exportReport,
  groupOptions,
  totalEvents,
  updateEventStatus,
  setEventForm,
  setEventGroupFilter,
  setEventStatusFilter,
  setEventWeekOffset,
  weekEvents,
}: AgendaPanelProps) {
  return (
    <section className="content-grid">
      {canManageEvents && (
        <article className="surface">
          <div className="panel-heading">
            <h2>{editingEventId ? "Editar evento" : "Novo evento"}</h2>
            <span>{editingEventId ? "Atualizando agenda" : "Agenda"}</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Titulo
              <input onChange={(event) => setEventForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex.: Culto de ensino" value={eventForm.title} />
            </label>
            <label>
              Data
              <input onChange={(event) => setEventForm((form) => ({ ...form, date: event.target.value }))} type="date" value={eventForm.date} />
            </label>
            <label>
              Horario
              <input onChange={(event) => setEventForm((form) => ({ ...form, time: event.target.value }))} type="time" value={eventForm.time} />
            </label>
            <label>
              Grupo
              <input onChange={(event) => setEventForm((form) => ({ ...form, ministry: event.target.value }))} placeholder="Ex.: Jovens" value={eventForm.ministry} />
            </label>
            <label>
              Status
              <select onChange={(event) => setEventForm((form) => ({ ...form, status: event.target.value as ChurchEvent["status"] }))} value={eventForm.status}>
                <option>Programado</option>
                <option>Confirmado</option>
                <option>Concluido</option>
              </select>
            </label>
            <label>
              Local
              <input onChange={(event) => setEventForm((form) => ({ ...form, location: event.target.value }))} placeholder="Ex.: Templo principal" value={eventForm.location} />
            </label>
            <label>
              Responsavel
              <input onChange={(event) => setEventForm((form) => ({ ...form, responsible: event.target.value }))} placeholder="Ex.: Pr. Marcos" value={eventForm.responsible} />
            </label>
            <label>
              Repeticao
              <select onChange={(event) => setEventForm((form) => ({ ...form, recurrence: event.target.value as ChurchEvent["recurrence"] }))} value={eventForm.recurrence}>
                <option>Unico</option>
                <option>Semanal</option>
                <option>Mensal</option>
              </select>
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateEvent} onClick={createEvent} type="button">
                {editingEventId ? "Atualizar evento" : "Adicionar evento"}
              </button>
              {editingEventId && (
                <button className="secondary" onClick={cancelEventEdit} type="button">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="surface">
        <div className="panel-heading">
          <h2>Agenda da semana</h2>
          <span>
            {weekEvents.length} de {totalEvents} eventos
          </span>
        </div>
        <div className="filter-bar">
          <button className="secondary" onClick={() => setEventWeekOffset((offset) => offset - 1)} type="button">
            Semana anterior
          </button>
          <button className="secondary" onClick={() => setEventWeekOffset(0)} type="button">
            Semana atual
          </button>
          <button className="secondary" onClick={() => setEventWeekOffset((offset) => offset + 1)} type="button">
            Proxima semana
          </button>
          <label>
            Grupo
            <select onChange={(event) => setEventGroupFilter(event.target.value)} value={eventGroupFilter}>
              <option>Todos</option>
              {groupOptions.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select onChange={(event) => setEventStatusFilter(event.target.value)} value={eventStatusFilter}>
              <option>Todos</option>
              <option>Programado</option>
              <option>Confirmado</option>
              <option>Concluido</option>
            </select>
          </label>
          <button className="secondary" onClick={() => exportReport("agenda", "pdf")} type="button">
            Imprimir semana
          </button>
        </div>
        <div className="row-list">
          {weekEvents.map((event) => (
            <div className={`data-row access-user-row ${agendaThemeClass(event)}`} key={event.id}>
              <span className="date-box">{formatDate(event.date)}</span>
              <div>
                <strong>{event.title}</strong>
                <small>
                  {event.time || "Sem horario"} - {event.ministry} - {event.status}
                </small>
                <small>{event.location || "Local nao informado"} - {event.responsible || "Sem responsavel"}</small>
              </div>
              {canManageEvents && (
                <div className="row-actions">
                  <button className="secondary" onClick={() => editEvent(event)} type="button">
                    Editar
                  </button>
                  <button className="secondary" onClick={() => duplicateEvent(event)} type="button">
                    Duplicar
                  </button>
                  <button
                    className={event.status === "Concluido" ? "secondary" : "danger-action"}
                    onClick={() => updateEventStatus(event, event.status === "Concluido" ? "Programado" : "Concluido")}
                    type="button"
                  >
                    {event.status === "Concluido" ? "Reativar" : "Cancelar"}
                  </button>
                  <button className="danger-action" onClick={() => deleteEvent(event)} type="button">
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
          {!weekEvents.length && <p className="empty-state">Nenhum evento cadastrado para esta semana.</p>}
        </div>
      </article>
    </section>
  );
}
