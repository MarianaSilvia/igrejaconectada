import type { Dispatch, SetStateAction } from "react";
import type { MinistryRecord } from "../types";

type MinistryForm = Omit<MinistryRecord, "id">;

type GroupsPanelProps = {
  canCreateMinistry: boolean;
  cancelMinistryEdit: () => void;
  createMinistry: () => void;
  deleteMinistry: (ministry: MinistryRecord) => void;
  editMinistry: (ministry: MinistryRecord) => void;
  editingMinistryId: string | null;
  ministries: MinistryRecord[];
  ministryForm: MinistryForm;
  setMinistryForm: Dispatch<SetStateAction<MinistryForm>>;
};

export function GroupsPanel({
  canCreateMinistry,
  cancelMinistryEdit,
  createMinistry,
  deleteMinistry,
  editMinistry,
  editingMinistryId,
  ministries,
  ministryForm,
  setMinistryForm,
}: GroupsPanelProps) {
  return (
    <section className="content-grid">
      <article className="surface">
        <div className="panel-heading">
          <h2>{editingMinistryId ? "Editar grupo" : "Novo grupo"}</h2>
          <span>{editingMinistryId ? "Atualizando equipe" : "Equipe"}</span>
        </div>
        <div className="form-grid">
          <label className="full">
            Nome do grupo
            <input
              onChange={(event) => setMinistryForm((form) => ({ ...form, name: event.target.value }))}
              placeholder="Ex.: Recepcao"
              value={ministryForm.name}
            />
          </label>
          <label>
            Lider
            <input
              onChange={(event) => setMinistryForm((form) => ({ ...form, leader: event.target.value }))}
              placeholder="Nome do lider"
              value={ministryForm.leader}
            />
          </label>
          <label>
            Auxiliar
            <input
              onChange={(event) => setMinistryForm((form) => ({ ...form, assistant: event.target.value }))}
              placeholder="Opcional"
              value={ministryForm.assistant}
            />
          </label>
          <label>
            Dia de reuniao
            <input
              onChange={(event) => setMinistryForm((form) => ({ ...form, meetingDay: event.target.value }))}
              placeholder="Ex.: Quinta-feira"
              value={ministryForm.meetingDay}
            />
          </label>
          <label>
            Voluntarios
            <input
              min={0}
              onChange={(event) => setMinistryForm((form) => ({ ...form, volunteers: Number(event.target.value) }))}
              type="number"
              value={ministryForm.volunteers}
            />
          </label>
          <label>
            Status
            <select
              onChange={(event) => setMinistryForm((form) => ({ ...form, status: event.target.value as MinistryRecord["status"] }))}
              value={ministryForm.status}
            >
              <option>Ativo</option>
              <option>Em formacao</option>
              <option>Pausado</option>
            </select>
          </label>
          <label className="full">
            Observacoes
            <textarea
              onChange={(event) => setMinistryForm((form) => ({ ...form, notes: event.target.value }))}
              placeholder="Necessidades, atividades ou observacoes"
              value={ministryForm.notes}
            />
          </label>
          <div className="form-actions full">
            <button className="primary-action" disabled={!canCreateMinistry} onClick={createMinistry} type="button">
              {editingMinistryId ? "Atualizar grupo" : "Adicionar grupo"}
            </button>
            {editingMinistryId && (
              <button className="secondary" onClick={cancelMinistryEdit} type="button">
                Cancelar
              </button>
            )}
          </div>
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Grupos</h2>
          <span>{ministries.length} grupo{ministries.length === 1 ? "" : "s"}</span>
        </div>
        <div className="row-list">
          {ministries.map((ministry) => (
            <div className="member-record" key={ministry.id}>
              <div className="data-row">
                <span className="date-box">{ministry.volunteers}</span>
                <div>
                  <strong>{ministry.name}</strong>
                  <small>
                    {ministry.status} - Lider: {ministry.leader}
                    {ministry.assistant ? ` - Auxiliar: ${ministry.assistant}` : ""}
                  </small>
                  <small>{ministry.meetingDay || "Reuniao nao definida"} - {ministry.notes || "Sem observacoes"}</small>
                </div>
              </div>
              <div className="record-actions">
                <button className="secondary" onClick={() => editMinistry(ministry)} type="button">
                  Editar grupo
                </button>
                <button className="danger-action" onClick={() => deleteMinistry(ministry)} type="button">
                  Excluir grupo
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
