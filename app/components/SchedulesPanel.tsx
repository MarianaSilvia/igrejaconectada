import type { Dispatch, SetStateAction } from "react";
import { formatDate, whatsappUrl } from "../app-helpers";
import type { MemberRecord, ReportKind, ScheduleRecord } from "../types";

type ScheduleForm = Omit<ScheduleRecord, "id">;

type SchedulesPanelProps = {
  canCreateSchedule: boolean;
  canManageSchedules: boolean;
  createSchedule: () => void;
  deleteSchedule: (schedule: ScheduleRecord) => void;
  editSchedule: (schedule: ScheduleRecord) => void;
  editingScheduleId: string | null;
  exportReport: (kind: ReportKind, format: "pdf" | "csv") => void;
  filteredSchedules: ScheduleRecord[];
  groupOptions: string[];
  memberRoleOptions: string[];
  members: MemberRecord[];
  scheduleForm: ScheduleForm;
  scheduleFunctionFilter: string;
  scheduleGroupFilter: string;
  scheduleServiceFilter: string;
  scheduleStatusFilter: string;
  selectedScheduleWeekRange: { start: Date; end: Date };
  setEditingScheduleId: Dispatch<SetStateAction<string | null>>;
  setScheduleForm: Dispatch<SetStateAction<ScheduleForm>>;
  setScheduleFunctionFilter: Dispatch<SetStateAction<string>>;
  setScheduleGroupFilter: Dispatch<SetStateAction<string>>;
  setScheduleServiceFilter: Dispatch<SetStateAction<string>>;
  setScheduleStatusFilter: Dispatch<SetStateAction<string>>;
  setScheduleWeekOffset: Dispatch<SetStateAction<number>>;
  schedules: ScheduleRecord[];
};

const blankSchedule: ScheduleForm = {
  date: "",
  serviceType: "",
  group: "",
  functionName: "",
  assignedTo: "",
  phone: "",
  confirmationStatus: "Pendente",
  notes: "",
};

export function SchedulesPanel({
  canCreateSchedule,
  canManageSchedules,
  createSchedule,
  deleteSchedule,
  editSchedule,
  editingScheduleId,
  exportReport,
  filteredSchedules,
  groupOptions,
  memberRoleOptions,
  members,
  scheduleForm,
  scheduleFunctionFilter,
  scheduleGroupFilter,
  scheduleServiceFilter,
  scheduleStatusFilter,
  selectedScheduleWeekRange,
  setEditingScheduleId,
  setScheduleForm,
  setScheduleFunctionFilter,
  setScheduleGroupFilter,
  setScheduleServiceFilter,
  setScheduleStatusFilter,
  setScheduleWeekOffset,
  schedules,
}: SchedulesPanelProps) {
  const serviceOptions = Array.from(new Set(schedules.map((schedule) => schedule.serviceType).filter(Boolean)));
  const functionOptions = Array.from(new Set(schedules.map((schedule) => schedule.functionName).filter(Boolean)));

  return (
    <section className="content-grid">
      {canManageSchedules && (
        <article className={editingScheduleId ? "surface editing-surface" : "surface"}>
          <div className="panel-heading">
            <h2>{editingScheduleId ? "Editar escala" : "Nova escala"}</h2>
            <span>Culto, grupo e funcao</span>
          </div>
          <div className="form-grid">
            <label>
              Data
              <input onChange={(event) => setScheduleForm((form) => ({ ...form, date: event.target.value }))} type="date" value={scheduleForm.date} />
            </label>
            <label>
              Culto ou evento
              <input onChange={(event) => setScheduleForm((form) => ({ ...form, serviceType: event.target.value }))} placeholder="Ex.: Culto da familia" value={scheduleForm.serviceType} />
            </label>
            <label>
              Grupo
              <select onChange={(event) => setScheduleForm((form) => ({ ...form, group: event.target.value }))} value={scheduleForm.group}>
                <option value="">Sem grupo definido</option>
                {groupOptions.map((group) => (
                  <option key={group}>{group}</option>
                ))}
              </select>
            </label>
            <label>
              Funcao
              <select onChange={(event) => setScheduleForm((form) => ({ ...form, functionName: event.target.value }))} value={scheduleForm.functionName}>
                <option value="">Selecione</option>
                {memberRoleOptions.map((role) => (
                  <option key={role}>{role}</option>
                ))}
                <option>Recepcao</option>
                <option>Pregador</option>
                <option>Louvor</option>
                <option>Midia</option>
              </select>
            </label>
            <label>
              Selecionar membro
              <select
                onChange={(event) => {
                  const member = members.find((item) => item.id === event.target.value);
                  if (!member) return;
                  setScheduleForm((form) => ({
                    ...form,
                    assignedTo: member.fullName,
                    phone: member.phone,
                    group: form.group || member.ministry,
                  }));
                }}
                value={members.find((member) => member.fullName === scheduleForm.assignedTo && member.phone === scheduleForm.phone)?.id ?? ""}
              >
                <option value="">Preencher manualmente</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pessoa escalada
              <input onChange={(event) => setScheduleForm((form) => ({ ...form, assignedTo: event.target.value }))} placeholder="Nome do membro ou voluntario" value={scheduleForm.assignedTo} />
            </label>
            <label>
              WhatsApp
              <input onChange={(event) => setScheduleForm((form) => ({ ...form, phone: event.target.value }))} placeholder="(00) 00000-0000" value={scheduleForm.phone} />
            </label>
            <label>
              Status
              <select onChange={(event) => setScheduleForm((form) => ({ ...form, confirmationStatus: event.target.value as ScheduleRecord["confirmationStatus"] }))} value={scheduleForm.confirmationStatus}>
                <option>Pendente</option>
                <option>Confirmado</option>
                <option>Substituir</option>
              </select>
            </label>
            <label className="full">
              Observacoes
              <textarea onChange={(event) => setScheduleForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Horario de chegada, roupa, substituicao ou orientacao" value={scheduleForm.notes} />
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateSchedule} onClick={createSchedule} type="button">
                {editingScheduleId ? "Atualizar escala" : "Salvar escala"}
              </button>
              {editingScheduleId && (
                <button
                  className="secondary"
                  onClick={() => {
                    setScheduleForm(blankSchedule);
                    setEditingScheduleId(null);
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

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Escalas cadastradas</h2>
          <span>{filteredSchedules.length} registros</span>
        </div>
        <div className="filter-bar">
          <div className="week-switcher">
            <button className="secondary" onClick={() => setScheduleWeekOffset((offset) => offset - 1)} type="button">
              Semana anterior
            </button>
            <span>
              {formatDate(selectedScheduleWeekRange.start.toISOString().slice(0, 10))} a {formatDate(selectedScheduleWeekRange.end.toISOString().slice(0, 10))}
            </span>
            <button className="secondary" onClick={() => setScheduleWeekOffset((offset) => offset + 1)} type="button">
              Proxima semana
            </button>
          </div>
          <label>
            Grupo
            <select onChange={(event) => setScheduleGroupFilter(event.target.value)} value={scheduleGroupFilter}>
              <option>Todos</option>
              {groupOptions.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </label>
          <label>
            Culto
            <select onChange={(event) => setScheduleServiceFilter(event.target.value)} value={scheduleServiceFilter}>
              <option>Todos</option>
              {serviceOptions.map((serviceType) => (
                <option key={serviceType}>{serviceType}</option>
              ))}
            </select>
          </label>
          <label>
            Funcao
            <select onChange={(event) => setScheduleFunctionFilter(event.target.value)} value={scheduleFunctionFilter}>
              <option>Todos</option>
              {functionOptions.map((functionName) => (
                <option key={functionName}>{functionName}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select onChange={(event) => setScheduleStatusFilter(event.target.value)} value={scheduleStatusFilter}>
              <option>Todos</option>
              <option>Pendente</option>
              <option>Confirmado</option>
              <option>Substituir</option>
            </select>
          </label>
          <button className="secondary" onClick={() => exportReport("schedules", "pdf")} type="button">
            PDF
          </button>
          <button className="secondary" onClick={() => exportReport("schedules", "csv")} type="button">
            Excel
          </button>
        </div>
        <div className="row-list">
          {filteredSchedules.map((schedule) => (
            <div className="data-row access-user-row" key={schedule.id}>
              <span className="date-box">{formatDate(schedule.date)}</span>
              <div>
                <strong>{schedule.assignedTo}</strong>
                <small>
                  {schedule.serviceType} - {schedule.functionName || "Funcao nao informada"} - {schedule.group || "Sem grupo"}
                </small>
                <small>{schedule.confirmationStatus} - {schedule.phone || "Sem WhatsApp"}</small>
                {schedule.notes && <small>{schedule.notes}</small>}
              </div>
              <div className="row-actions">
                {schedule.phone && (
                  <a className="whatsapp-link" href={whatsappUrl(schedule.phone, "Paz, {nome}! Voce esta escalado(a). Por favor confirme sua disponibilidade. {igreja}.", schedule.assignedTo)} rel="noreferrer" target="_blank">
                    WhatsApp
                  </a>
                )}
                {canManageSchedules && (
                  <button className="secondary" onClick={() => editSchedule(schedule)} type="button">
                    Editar
                  </button>
                )}
                {canManageSchedules && (
                  <button className="danger-action" onClick={() => deleteSchedule(schedule)} type="button">
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
          {!filteredSchedules.length && <p className="empty-state">Nenhuma escala encontrada para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
