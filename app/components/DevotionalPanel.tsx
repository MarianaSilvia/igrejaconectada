import type { Dispatch, SetStateAction } from "react";
import { formatDate } from "../app-helpers";
import { blankDevotional } from "../data-normalization";
import type { DevotionalRecord } from "../types";

type DevotionalForm = Omit<DevotionalRecord, "id">;

type DevotionalPanelProps = {
  canCreateDevotional: boolean;
  canManageDevotional: boolean;
  createDevotional: () => void;
  deleteDevotional: (devotional: DevotionalRecord) => void;
  devotionalForm: DevotionalForm;
  devotionals: DevotionalRecord[];
  editDevotional: (devotional: DevotionalRecord) => void;
  editingDevotionalId: string | null;
  setDevotionalForm: Dispatch<SetStateAction<DevotionalForm>>;
  setEditingDevotionalId: Dispatch<SetStateAction<string | null>>;
};

export function DevotionalPanel({
  canCreateDevotional,
  canManageDevotional,
  createDevotional,
  deleteDevotional,
  devotionalForm,
  devotionals,
  editDevotional,
  editingDevotionalId,
  setDevotionalForm,
  setEditingDevotionalId,
}: DevotionalPanelProps) {
  return (
    <section className="content-grid">
      {canManageDevotional && (
        <article className={editingDevotionalId ? "surface editing-surface" : "surface"}>
          <div className="panel-heading">
            <h2>{editingDevotionalId ? "Editar devocional" : "Nova palavra"}</h2>
            <span>Painel do membro</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Titulo
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex.: Palavra do dia" value={devotionalForm.title} />
            </label>
            <label>
              Versiculo
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, verse: event.target.value }))} placeholder="Ex.: Salmo 23:1" value={devotionalForm.verse} />
            </label>
            <label>
              Publicacao
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, publishedAt: event.target.value }))} type="date" value={devotionalForm.publishedAt} />
            </label>
            <label>
              Status
              <select onChange={(event) => setDevotionalForm((form) => ({ ...form, status: event.target.value as DevotionalRecord["status"] }))} value={devotionalForm.status}>
                <option>Publicado</option>
                <option>Rascunho</option>
                <option>Arquivado</option>
              </select>
            </label>
            <label className="full">
              Mensagem
              <textarea onChange={(event) => setDevotionalForm((form) => ({ ...form, body: event.target.value }))} placeholder="Texto que aparece no painel do membro" value={devotionalForm.body} />
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateDevotional} onClick={createDevotional} type="button">
                {editingDevotionalId ? "Atualizar palavra" : "Salvar palavra"}
              </button>
              {editingDevotionalId && (
                <button className="secondary" onClick={() => { setDevotionalForm(blankDevotional); setEditingDevotionalId(null); }} type="button">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Devocionais</h2>
          <span>{devotionals.length} registros</span>
        </div>
        <div className="row-list">
          {devotionals.map((devotional) => (
            <div className="data-row access-user-row" key={devotional.id}>
              <span className="date-box">{formatDate(devotional.publishedAt)}</span>
              <div>
                <strong>{devotional.title}</strong>
                <small>{devotional.verse || "Sem versiculo"} - {devotional.status}</small>
                <small>{devotional.body}</small>
              </div>
              {canManageDevotional && (
                <div className="row-actions">
                  <button className="secondary" onClick={() => editDevotional(devotional)} type="button">
                    Editar
                  </button>
                  <button className="danger-action" onClick={() => deleteDevotional(devotional)} type="button">
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
          {!devotionals.length && <p className="empty-state">Nenhuma palavra cadastrada ainda.</p>}
        </div>
      </article>
    </section>
  );
}
