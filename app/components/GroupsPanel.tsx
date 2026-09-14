import type { Dispatch, SetStateAction } from "react";
import { normalizeSearchText } from "../app-helpers";
import type { MinistryRecord } from "../types";
import { ResponsiveImage } from "./ResponsiveImage";

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

const defaultGroupNames = [
  "Louvor",
  "Jovens",
  "Intercessão",
  "Recepção",
  "Kids",
  "Senhoras",
  "Obreiros",
  "Evangelismo",
  "Ensino/EBD",
  "Discipulado",
  "Mídia",
  "Diaconato",
  "Coral Remidos por Cristo",
  "Coral RENASCER",
];

const groupCoverImages: Record<string, string> = {
  [normalizeSearchText("Coral Remidos por Cristo")]: "/group-covers/remidos_por_cristo_card_320.webp",
  [normalizeSearchText("Coral RENASCER")]: "/group-covers/coral-renascer.png",
};

function groupCoverFor(name: string) {
  return groupCoverImages[normalizeSearchText(name)];
}

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
  const groupNameOptions = Array.from(
    new Set([...defaultGroupNames, ...ministries.map((ministry) => ministry.name).filter(Boolean), ministryForm.name].filter(Boolean)),
  );

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
            <select
              onChange={(event) => setMinistryForm((form) => ({ ...form, name: event.target.value }))}
              value={ministryForm.name}
            >
              <option value="">Selecione o grupo</option>
              {groupNameOptions.map((groupName) => (
                <option key={groupName} value={groupName}>
                  {groupName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Líder
            <input
              onChange={(event) => setMinistryForm((form) => ({ ...form, leader: event.target.value }))}
              placeholder="Nome do líder"
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
            Dia de reunião
            <input
              onChange={(event) => setMinistryForm((form) => ({ ...form, meetingDay: event.target.value }))}
              placeholder="Ex.: Quinta-feira"
              value={ministryForm.meetingDay}
            />
          </label>
          <label>
            Voluntários
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
              <option value="Em formacao">Em formação</option>
              <option>Pausado</option>
            </select>
          </label>
          <label className="full">
            Observações
            <textarea
              onChange={(event) => setMinistryForm((form) => ({ ...form, notes: event.target.value }))}
              placeholder="Necessidades, atividades ou observações"
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
          {ministries.map((ministry) => {
            const groupCover = groupCoverFor(ministry.name);

            return (
              <div className={groupCover ? "member-record group-record with-cover" : "member-record group-record"} key={ministry.id}>
                {groupCover && (
                  <div className="group-cover">
                    <ResponsiveImage alt={`Card do grupo ${ministry.name}`} sizes="96px" src={groupCover} />
                  </div>
                )}
                <div className="data-row">
                  <span className="date-box">{ministry.volunteers}</span>
                  <div>
                    <strong>{ministry.name}</strong>
                    <small>
                      {ministry.status} - Líder: {ministry.leader}
                      {ministry.assistant ? ` - Auxiliar: ${ministry.assistant}` : ""}
                    </small>
                    <small>{ministry.meetingDay || "Reunião não definida"} - {ministry.notes || "Sem observações"}</small>
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
            );
          })}
        </div>
      </article>
    </section>
  );
}
