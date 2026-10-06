import type { Dispatch, ReactNode, SetStateAction } from "react";
import { classWhatsappRecipients } from "../communication-helpers";
import type { AttendanceSession, MemberRecord, SchoolClass } from "../types";

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
  attendanceSessions: AttendanceSession[];
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
  attendanceSessions,
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
  const attendanceArea = areaLabel === "EBD" ? "school" : "discipleship";
  const linkedMembersForClass = (classRecord: SchoolClass) =>
    members.filter((member) => (attendanceArea === "school" ? member.schoolClassId === classRecord.id : member.discipleshipClassId === classRecord.id));
  const attendanceSummaryForClass = (classRecord: SchoolClass) => {
    const classMemberIds = new Set(linkedMembersForClass(classRecord).map((member) => member.id));
    const sessions = attendanceSessions.filter((session) => session.area === attendanceArea && session.classId === classRecord.id);
    const records = sessions.flatMap((session) => session.records).filter((record) => classMemberIds.has(record.memberId));
    const present = records.filter((record) => record.status === "Presente").length;
    const rate = records.length ? Math.round((present / records.length) * 100) : 0;

    return { records: records.length, sessions: sessions.length, present, rate };
  };

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
              Título do aviso
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
          {classes.map((classRecord) => {
            const linkedMembers = linkedMembersForClass(classRecord);
            const summary = attendanceSummaryForClass(classRecord);

            return (
            <div className="data-row class-row" key={classRecord.id}>
              <span className="date-box">{linkedMembers.length}</span>
              <div>
                <strong>{classRecord.name}</strong>
                <small>
                  Professor: {classRecord.teacher} - Próxima aula: {classRecord.nextLesson}
                </small>
                <small>
                  {linkedMembers.length} aluno{linkedMembers.length === 1 ? "" : "s"} vinculado{linkedMembers.length === 1 ? "" : "s"} - {summary.sessions} chamada
                  {summary.sessions === 1 ? "" : "s"} registrada{summary.sessions === 1 ? "" : "s"}
                </small>
                <span className="class-attendance-meter">
                  <span>Frequência da turma</span>
                  <strong>{summary.records ? `${summary.rate}%` : "Sem chamada"}</strong>
                  <i aria-hidden="true">
                    <b style={{ width: `${summary.rate}%` }} />
                  </i>
                </span>
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
            );
          })}
        </div>
      </article>
    </section>
  );
}
