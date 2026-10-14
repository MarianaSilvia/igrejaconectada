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
  const libraryDevotionals = [...devotionals]
    .filter((devotional) => devotional.status === "Aprovado")
    .sort((first, second) => first.title.localeCompare(second.title, "pt-BR", { sensitivity: "base" }));
  const scheduledDevotionals = [...devotionals]
    .filter((devotional) => devotional.status !== "Aprovado")
    .sort((first, second) => first.publishedAt.localeCompare(second.publishedAt));

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
              Título
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex.: Palavra do dia" value={devotionalForm.title} />
            </label>
            <label>
              Versículo
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, verse: event.target.value }))} placeholder="Ex.: Salmo 23:1" value={devotionalForm.verse} />
            </label>
            <label>
              Tema
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, theme: event.target.value }))} placeholder="Ex.: Fé, família, oração" value={devotionalForm.theme} />
            </label>
            <label>
              Publicação
              <input onChange={(event) => setDevotionalForm((form) => ({ ...form, publishedAt: event.target.value }))} type="date" value={devotionalForm.publishedAt} />
            </label>
            <label>
              Status
              <select onChange={(event) => setDevotionalForm((form) => ({ ...form, status: event.target.value as DevotionalRecord["status"] }))} value={devotionalForm.status}>
                <option>Publicado</option>
                <option>Rascunho</option>
                <option>Aprovado</option>
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
          <h2>Devocionais publicados</h2>
          <span>{scheduledDevotionals.length} registros</span>
        </div>
        <div className="row-list devotional-published-list">
          {scheduledDevotionals.map((devotional) => (
            <div className="data-row access-user-row" key={devotional.id}>
              <span className="date-box">{formatDate(devotional.publishedAt)}</span>
              <div>
                <strong>{devotional.title}</strong>
                <div className="message-card-tags" aria-label="Resumo do devocional">
                  <span>{devotional.status}</span>
                  <span>{devotional.createdByAutomation ? "Automático" : "Manual"}</span>
                  <span>{devotional.theme || "Sem tema"}</span>
                </div>
                <small>{devotional.verse || "Sem versículo"}</small>
                <details className="record-sensitive-details devotional-body-details">
                  <summary>Ver mensagem</summary>
                  <small>{devotional.body || "Sem mensagem cadastrada."}</small>
                </details>
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
          {!scheduledDevotionals.length && <p className="empty-state">Nenhuma palavra publicada ou agendada ainda.</p>}
        </div>
      </article>

      {canManageDevotional && (
        <details className="surface wide module-compact-drawer devotional-library-drawer">
          <summary>
            <span>
              <strong>Banco de devocionais</strong>
              <small>Textos aprovados que entram na seleção automática semanal.</small>
            </span>
            <b>{libraryDevotionals.length} aprovado(s)</b>
          </summary>
          <p className="form-hint">Textos com status Aprovado entram na seleção automática semanal.</p>
          <div className="row-list devotional-library-list">
            {libraryDevotionals.map((devotional) => (
              <div className="data-row access-user-row" key={devotional.id}>
                <span className="date-box">{devotional.usedAt ? "Usado" : "Novo"}</span>
                <div>
                  <strong>{devotional.title}</strong>
                  <div className="message-card-tags" aria-label="Resumo do texto aprovado">
                    <span>{devotional.theme || "Sem tema"}</span>
                    <span>{devotional.usedAt ? `Usado em ${formatDate(devotional.usedAt)}` : "Ainda não usado"}</span>
                  </div>
                  <small>{devotional.verse || "Sem versículo"}</small>
                  <details className="record-sensitive-details devotional-body-details">
                    <summary>Ver texto aprovado</summary>
                    <small>{devotional.body || "Sem mensagem cadastrada."}</small>
                  </details>
                </div>
                <div className="row-actions">
                  <button className="secondary" onClick={() => editDevotional(devotional)} type="button">
                    Editar
                  </button>
                  <button className="danger-action" onClick={() => deleteDevotional(devotional)} type="button">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {!libraryDevotionals.length && <p className="empty-state">Nenhum devocional aprovado no banco ainda.</p>}
          </div>
        </details>
      )}
    </section>
  );
}
