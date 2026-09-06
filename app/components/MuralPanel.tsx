import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { formatDate } from "../app-helpers";
import type { ChurchEvent, MuralItem, Notice } from "../types";

type MuralForm = Omit<MuralItem, "id">;

type MuralPanelProps = {
  activeNotices: Notice[];
  canCreateMuralItem: boolean;
  canManageMural: boolean;
  createMuralItem: () => void;
  deleteMuralItem: (item: MuralItem) => void;
  filteredMuralItems: MuralItem[];
  muralForm: MuralForm;
  muralImageMessage: string;
  readMuralImage: (event: ChangeEvent<HTMLInputElement>) => void;
  setMuralForm: Dispatch<SetStateAction<MuralForm>>;
  toggleMural: (id: string, field: "published" | "featured") => void;
  totalPublishedMuralItems: number;
  weekEvents: ChurchEvent[];
};

export function MuralPanel({
  activeNotices,
  canCreateMuralItem,
  canManageMural,
  createMuralItem,
  deleteMuralItem,
  filteredMuralItems,
  muralForm,
  muralImageMessage,
  readMuralImage,
  setMuralForm,
  toggleMural,
  totalPublishedMuralItems,
  weekEvents,
}: MuralPanelProps) {
  const publishedNotices = activeNotices.filter((notice) => notice.status === "Publicado");
  const memberVisibleTotal = totalPublishedMuralItems + publishedNotices.length + weekEvents.length;

  return (
    <section className="content-grid">
      {canManageMural && (
        <article className="surface">
          <div className="panel-heading">
            <h2>Novo item do mural</h2>
            <span>Publicacao</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Titulo
              <input onChange={(event) => setMuralForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex.: Encontro de jovens" value={muralForm.title} />
            </label>
            <label>
              Categoria
              <input onChange={(event) => setMuralForm((form) => ({ ...form, category: event.target.value }))} placeholder="Ex.: Jovens" value={muralForm.category} />
            </label>
            <div className="photo-uploader full">
              <div className="photo-preview mural-preview">{muralForm.imageDataUrl ? <img alt="" src={muralForm.imageDataUrl} /> : <span>Banner</span>}</div>
              <label>
                Foto, imagem ou banner
                <input accept="image/*" onChange={readMuralImage} type="file" />
              </label>
              {muralImageMessage && <small className="form-hint">{muralImageMessage}</small>}
            </div>
            <label className="full">
              Link da imagem ou banner
              <input onChange={(event) => setMuralForm((form) => ({ ...form, bannerUrl: event.target.value }))} placeholder="https://..." type="url" value={muralForm.bannerUrl} />
            </label>
            <label className="full">
              Link de rede social
              <input onChange={(event) => setMuralForm((form) => ({ ...form, socialUrl: event.target.value }))} placeholder="Instagram, Facebook, YouTube ou outro link" type="url" value={muralForm.socialUrl} />
            </label>
            <label>
              Expira em
              <input onChange={(event) => setMuralForm((form) => ({ ...form, expiresAt: event.target.value }))} type="date" value={muralForm.expiresAt} />
            </label>
            <label className="switch full">
              <input checked={muralForm.published} onChange={(event) => setMuralForm((form) => ({ ...form, published: event.target.checked }))} type="checkbox" />
              Publicar agora
            </label>
            <label className="switch full">
              <input checked={muralForm.featured} onChange={(event) => setMuralForm((form) => ({ ...form, featured: event.target.checked }))} type="checkbox" />
              Marcar como destaque
            </label>
            <button className="primary-action" disabled={!canCreateMuralItem} onClick={createMuralItem} type="button">
              Adicionar ao mural
            </button>
          </div>
        </article>
      )}

      <article className="surface">
        <div className="panel-heading">
          <h2>{canManageMural ? "Administrar mural" : "Mural da igreja"}</h2>
          <span>{canManageMural ? `${totalPublishedMuralItems} publicados` : `${memberVisibleTotal} itens gerais`}</span>
        </div>
        <div className="table-like">
          {filteredMuralItems.map((item) => (
            <div className="table-row" key={item.id}>
              <div>
                {(item.imageDataUrl || item.bannerUrl) && (
                  <div className="mural-media">
                    <img alt="" src={item.imageDataUrl || item.bannerUrl} />
                  </div>
                )}
                <strong>{item.title}</strong>
                <small>{item.category} - expira em {formatDate(item.expiresAt)}</small>
                {item.socialUrl && (
                  <a className="inline-link" href={item.socialUrl} rel="noreferrer" target="_blank">
                    Abrir rede social
                  </a>
                )}
              </div>
              {canManageMural && (
                <label className="switch">
                  Publicado
                  <input checked={item.published} onChange={() => toggleMural(item.id, "published")} type="checkbox" />
                </label>
              )}
              {canManageMural && (
                <label className="switch">
                  Destaque
                  <input checked={item.featured} onChange={() => toggleMural(item.id, "featured")} type="checkbox" />
                </label>
              )}
              {canManageMural && (
                <button className="danger-action" onClick={() => deleteMuralItem(item)} type="button">
                  Excluir
                </button>
              )}
            </div>
          ))}
          {!canManageMural && !filteredMuralItems.length && (
            <div className="data-row">
              <span className="bullet-mark" />
              <div>
                <strong>Nenhum banner publicado</strong>
                <small>Quando a administracao publicar fotos, imagens ou banners, eles aparecem aqui.</small>
              </div>
            </div>
          )}
          {!canManageMural &&
            publishedNotices.map((notice) => (
              <div className="table-row" key={`notice-${notice.id}`}>
                <div>
                  <strong>{notice.title}</strong>
                  <small>Aviso - {notice.audience} - {notice.channel}</small>
                  <small>{notice.body}</small>
                </div>
              </div>
            ))}
          {!canManageMural &&
            weekEvents.map((event) => (
              <div className="table-row" key={`event-${event.id}`}>
                <span className="date-box">{formatDate(event.date)}</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    Evento - {event.time || "Sem horario"} - {event.ministry} - {event.status}
                  </small>
                  <small>{event.location || "Local nao informado"} - {event.responsible || "Sem responsavel"}</small>
                </div>
              </div>
            ))}
          {!canManageMural && !totalPublishedMuralItems && !publishedNotices.length && !weekEvents.length && <p className="empty-state">Nenhum aviso, banner ou evento publicado no momento.</p>}
        </div>
      </article>
    </section>
  );
}
