import type { Dispatch, ReactNode, SetStateAction } from "react";
import { classWhatsappRecipients } from "../communication-helpers";
import type { MemberRecord, SchoolClass } from "../types";

type ClassNoticeForm = {
  classId: string;
  title: string;
  body: string;
};

type ClassModulePanelProps = {
  areaLabel: "EBD" | "Discipulado";
  canCreateNotice: boolean;
  canManage: boolean;
  classes: SchoolClass[];
  createNotice: () => void;
  members: MemberRecord[];
  noticeForm: ClassNoticeForm;
  noticeTitle: string;
  renderAttendancePanel: (classRecord: SchoolClass) => ReactNode;
  setNoticeForm: Dispatch<SetStateAction<ClassNoticeForm>>;
  title: string;
  whatsappPlaceholder: string;
  openClassWhatsapp: (classRecord: SchoolClass, title: string, body: string, area: "EBD" | "Discipulado") => void;
};

export function ClassModulePanel({
  areaLabel,
  canCreateNotice,
  canManage,
  classes,
  createNotice,
  members,
  noticeForm,
  noticeTitle,
  renderAttendancePanel,
  setNoticeForm,
  title,
  whatsappPlaceholder,
  openClassWhatsapp,
}: ClassModulePanelProps) {
  return (
    <section className="content-grid">
      {canManage && (
        <article className="surface">
          <div className="panel-heading">
            <h2>{noticeTitle}</h2>
            <span>Por classe</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Classe
              <select onChange={(event) => setNoticeForm((form) => ({ ...form, classId: event.target.value }))} value={noticeForm.classId}>
                {classes.map((classRecord) => (
                  <option key={classRecord.id} value={classRecord.id}>
                    {classRecord.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Titulo do aviso
              <input onChange={(event) => setNoticeForm((form) => ({ ...form, title: event.target.value }))} placeholder={whatsappPlaceholder} value={noticeForm.title} />
            </label>
            <label className="full">
              Mensagem
              <textarea onChange={(event) => setNoticeForm((form) => ({ ...form, body: event.target.value }))} placeholder="Escreva o aviso para a classe selecionada" value={noticeForm.body} />
            </label>
            <button className="primary-action" disabled={!canCreateNotice} onClick={createNotice} type="button">
              Gerar aviso para classe
            </button>
            <button
              className="secondary"
              disabled={!canCreateNotice}
              onClick={() => {
                const selectedClass = classes.find((classRecord) => classRecord.id === noticeForm.classId);
                if (selectedClass) openClassWhatsapp(selectedClass, noticeForm.title, noticeForm.body, areaLabel);
              }}
              type="button"
            >
              Enviar via WhatsApp
            </button>
          </div>
        </article>
      )}

      <article className="surface">
        <div className="panel-heading">
          <h2>{title}</h2>
          <span>{classes.length} classes</span>
        </div>
        <div className="row-list">
          {classes.map((classRecord) => (
            <div className="data-row class-row" key={classRecord.id}>
              <span className="date-box">{classRecord.students}</span>
              <div>
                <strong>{classRecord.name}</strong>
                <small>
                  Professor: {classRecord.teacher} - Proxima aula: {classRecord.nextLesson}
                </small>
                {canManage && <small>{classWhatsappRecipients(members, classRecord, areaLabel).length} contatos de WhatsApp encontrados</small>}
                <div className="notice-stack">
                  {classRecord.notices.length === 0 ? (
                    <small>Nenhum aviso enviado para esta classe.</small>
                  ) : (
                    classRecord.notices.map((notice) => (
                      <span className="notice-pill" key={notice.id}>
                        {notice.title}
                      </span>
                    ))
                  )}
                </div>
                {renderAttendancePanel(classRecord)}
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
