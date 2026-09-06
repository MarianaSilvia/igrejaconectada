import type { Dispatch, SetStateAction } from "react";
import { dateAfterDays, formatDate } from "../app-helpers";
import type { Notice } from "../types";

type NoticeForm = Omit<Notice, "id">;

type NoticesPanelProps = {
  activeNotices: Notice[];
  canCreateNotice: boolean;
  canManageNotices: boolean;
  createNotice: () => void;
  deleteNotice: (notice: Notice) => void;
  noticeForm: NoticeForm;
  setNoticeForm: Dispatch<SetStateAction<NoticeForm>>;
};

export function NoticesPanel({ activeNotices, canCreateNotice, canManageNotices, createNotice, deleteNotice, noticeForm, setNoticeForm }: NoticesPanelProps) {
  return (
    <section className="content-grid">
      {canManageNotices && (
        <article className="surface">
          <div className="panel-heading">
            <h2>Novo comunicado</h2>
            <span>Avisos</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Titulo
              <input onChange={(event) => setNoticeForm((form) => ({ ...form, title: event.target.value }))} placeholder="Ex.: Reuniao de lideres" value={noticeForm.title} />
            </label>
            <label>
              Publico
              <input onChange={(event) => setNoticeForm((form) => ({ ...form, audience: event.target.value }))} placeholder="Ex.: Toda igreja" value={noticeForm.audience} />
            </label>
            <label>
              Canal
              <select onChange={(event) => setNoticeForm((form) => ({ ...form, channel: event.target.value as Notice["channel"] }))} value={noticeForm.channel}>
                <option>Todos</option>
                <option>App</option>
                <option>WhatsApp</option>
                <option>Mural</option>
              </select>
            </label>
            <label>
              Status
              <select onChange={(event) => setNoticeForm((form) => ({ ...form, status: event.target.value as Notice["status"] }))} value={noticeForm.status}>
                <option>Publicado</option>
                <option>Rascunho</option>
              </select>
            </label>
            <label>
              Tempo no ar
              <select
                onChange={(event) => {
                  const retentionDays = Number(event.target.value);
                  setNoticeForm((form) => ({ ...form, retentionDays, expiresAt: dateAfterDays(retentionDays) }));
                }}
                value={noticeForm.retentionDays}
              >
                <option value={3}>3 dias</option>
                <option value={4}>4 dias</option>
                <option value={7}>7 dias</option>
                <option value={15}>15 dias</option>
              </select>
            </label>
            <label>
              Excluir em
              <input onChange={(event) => setNoticeForm((form) => ({ ...form, expiresAt: event.target.value }))} type="date" value={noticeForm.expiresAt || dateAfterDays(noticeForm.retentionDays)} />
            </label>
            <label className="full">
              Mensagem
              <textarea onChange={(event) => setNoticeForm((form) => ({ ...form, body: event.target.value }))} placeholder="Escreva o comunicado" value={noticeForm.body} />
            </label>
            <button className="primary-action" disabled={!canCreateNotice} onClick={createNotice} type="button">
              Criar comunicado
            </button>
          </div>
        </article>
      )}

      <article className="surface">
        <div className="panel-heading">
          <h2>Comunicados</h2>
          <span>{activeNotices.length} avisos ativos</span>
        </div>
        <div className="row-list">
          {activeNotices.map((notice) => (
            <div className="data-row access-user-row" key={notice.id}>
              <span className="bullet-mark" />
              <div>
                <strong>{notice.title}</strong>
                <small>{notice.status} - {notice.audience} - {notice.channel}</small>
                <small>Expira em {formatDate(notice.expiresAt)} - {notice.retentionDays} dias no ar</small>
                <small>{notice.body}</small>
              </div>
              {canManageNotices && (
                <div className="row-actions">
                  <button className="danger-action" onClick={() => deleteNotice(notice)} type="button">
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
