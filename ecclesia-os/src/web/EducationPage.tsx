import { useEffect, useState, type FormEvent } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";
import EducationInterestQueue from "./EducationInterestQueue";

type Props = { church: string; revision: number; notify: (s: string) => void };
export default function EducationPage({ church, revision, notify }: Props) {
  const [data, setData] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sessionClass, setSessionClass] = useState(""),
    [sessionRoster, setSessionRoster] = useState<RecordData[]>([]),
    [assessmentId, setAssessmentId] = useState(""),
    [assessmentRoster, setAssessmentRoster] = useState<RecordData[]>([]),
    [enrollmentPage, setEnrollmentPage] = useState(1),
    [sessionPage, setSessionPage] = useState(1),
    [resultPage, setResultPage] = useState(1),
    [certificatePage, setCertificatePage] = useState(1),
    [coursePage, setCoursePage] = useState(1),
    [classPage, setClassPage] = useState(1),
    [materialPage, setMaterialPage] = useState(1),
    [assessmentPage, setAssessmentPage] = useState(1);
  const load = () =>
    Promise.all([
      api<RecordData>(
        "/education?coursePage=" +
          coursePage +
          "&coursePageSize=25&classPage=" +
          classPage +
          "&classPageSize=25&materialPage=" +
          materialPage +
          "&materialPageSize=25&assessmentPage=" +
          assessmentPage +
          "&assessmentPageSize=25",
      ),
      api<RecordData>(
        `/education/enrollments?page=${enrollmentPage}&pageSize=25`,
      ),
      api<RecordData>(`/education/sessions?page=${sessionPage}&pageSize=25`),
      api<RecordData>(`/education/results?page=${resultPage}&pageSize=25`),
      api<RecordData>(
        `/education/certificates?page=${certificatePage}&pageSize=25`,
      ),
      api<RecordData[]>("/education/instructors"),
    ])
      .then(
        ([v, enrollments, sessions, results, certificates, instructors]) => {
          setData({
            ...v,
            instructors,
            enrollments: enrollments.items,
            enrollmentPagination: enrollments,
            sessions: sessions.items,
            sessionPagination: sessions,
            results: results.items,
            resultPagination: results,
            certificates: certificates.items,
            certificatePagination: certificates,
          });
          setSessionClass((old) => old || v.classes?.[0]?.id || "");
        },
      )
      .catch((e) => setError(e.message));
  useEffect(() => {
    setData(null);
    setSessionClass("");
    void load();
  }, [
    church,
    revision,
    enrollmentPage,
    sessionPage,
    resultPage,
    certificatePage,
    coursePage,
    classPage,
    materialPage,
    assessmentPage,
  ]);
  useEffect(() => {
    if (!sessionClass) {
      setSessionRoster([]);
      return;
    }
    api<RecordData[]>(`/education/classes/${sessionClass}/enrollments`)
      .then(setSessionRoster)
      .catch((e) => setError(e.message));
  }, [sessionClass, church, revision]);
  useEffect(() => {
    if (!assessmentId) {
      setAssessmentRoster([]);
      return;
    }
    api<RecordData[]>(`/education/assessments/${assessmentId}/enrollments`)
      .then(setAssessmentRoster)
      .catch((e) => setError(e.message));
  }, [assessmentId, church, revision]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      notify("Ensino atualizado.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function course(e: FormEvent<HTMLFormElement>) {
    const b = formValues(e);
    void run(() =>
      api("/education/courses", "POST", {
        name: b.name,
        description: b.description,
        completionPercent: Number(b.completionPercent),
        track: b.track,
        level: b.level || null,
        certificateEnabled: b.certificateEnabled === "on",
        publicCatalog: b.publicCatalog === "on",
      }),
    );
  }
  function clazz(e: FormEvent<HTMLFormElement>) {
    const b = formValues(e);
    void run(() =>
      api("/education/classes", "POST", {
        courseId: b.courseId,
        name: b.name,
        startsOn: b.startsOn,
        endsOn: b.endsOn || null,
        instructorId: b.instructorId || null,
        capacity: b.capacity ? Number(b.capacity) : null,
        publicCatalog: b.publicCatalog === "on",
        disciplerId: b.disciplerId || null,
        assistantId: b.assistantId || null,
        meetingFrequency: b.meetingFrequency || "weekly",
        location: b.location || "",
        deliveryMode: b.deliveryMode || "presencial",
      }),
    );
  }
  function session(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget),
      attendance =
        data?.enrollments
          ?.filter((v: RecordData) => v.class_id === sessionClass)
          .map((v: RecordData) => ({
            enrollmentId: v.id,
            present: f.get(`present-${v.id}`) === "on",
          })) ?? [];
    void run(() =>
      api(`/education/classes/${sessionClass}/sessions`, "POST", {
        heldOn: String(f.get("heldOn") ?? ""),
        topic: String(f.get("topic") ?? ""),
        attendance,
      }),
    );
  }
  function grade(e: FormEvent<HTMLFormElement>) {
    const b = formValues(e);
    void run(() =>
      api(`/education/assessments/${b.assessmentId}/results`, "POST", {
        enrollmentId: b.enrollmentId,
        score: Number(b.score),
        feedback: b.feedback || "",
      }),
    );
  }
  function togglePublicCatalog(item: RecordData) {
    void run(() =>
      api(`/education/classes/${item.id}`, "PATCH", {
        publicCatalog: !item.public_catalog,
      }),
    );
  }
  const selected = sessionRoster;
  return (
    <>
      <EducationInterestQueue />
      <section className="panel" style={{ padding: 24 }}>
        <div className="toolbar">
          <div>
            <h2>Ensino, EBD e discipulado</h2>
            <p className="muted">
              Cursos, turmas, matrículas, frequência, materiais, avaliações e
              certificados ligados às pessoas.
            </p>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              const url = `${window.location.origin}/catalogo/${church}`;
              try {
                await navigator.clipboard.writeText(url);
                notify("Link do catálogo público copiado.");
              } catch {
                setError(
                  "Não foi possível copiar o link; selecione-o manualmente.",
                );
              }
            }}
          >
            Copiar catálogo público
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="grid-2">
          <div>
            <h3>Novo curso</h3>
            <form onSubmit={course}>
              <Field label="Nome">
                <input name="name" required />
              </Field>
              <Field label="Descrição">
                <textarea name="description" rows={3} />
              </Field>
              <Field label="Modalidade">
                <select name="track" defaultValue="curso">
                  <option value="ebd">EBD</option>
                  <option value="discipulado">Discipulado</option>
                  <option value="curso">Curso</option>
                  <option value="formacao">Formação</option>
                  <option value="treinamento">Treinamento</option>
                </select>
              </Field>
              <Field label="Nível">
                <input name="level" placeholder="Ex.: básico, intermediário" />
              </Field>
              <Field label="Frequência mínima (%)">
                <input name="completionPercent" type="number" min={1} max={100} defaultValue={75} required />
              </Field>
              <label className="check-row">
                <input name="certificateEnabled" type="checkbox" defaultChecked /> Emitir certificado
              </label>
              <label className="check-row">
                <input name="publicCatalog" type="checkbox" /> Publicar no catálogo
              </label>
              <Submit busy={busy} label="Criar curso" />
            </form>
          </div>
          <div>
            <h3>Nova turma</h3>
            <form onSubmit={clazz}>
              <Field label="Curso">
                <select name="courseId" required>
                  <option value="">Selecione</option>
                  {data?.courses?.map((v: RecordData) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nome">
                <input name="name" required />
              </Field>
              <Field label="Início">
                <input name="startsOn" type="date" required />
              </Field>
              <Field label="Encerramento">
                <input name="endsOn" type="date" />
              </Field>
              <Field label="Instrutor">
                <select name="instructorId">
                  <option value="">Selecionar depois</option>
                  {data?.instructors?.map((v: RecordData) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Discipulador">
                <select name="disciplerId">
                  <option value="">Selecionar depois</option>
                  {data?.instructors?.map((v: RecordData) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Auxiliar">
                <select name="assistantId">
                  <option value="">Selecionar depois</option>
                  {data?.instructors?.map((v: RecordData) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Frequência">
                <select name="meetingFrequency"><option value="weekly">Semanal</option><option value="fortnightly">Quinzenal</option><option value="monthly">Mensal</option></select>
              </Field>
              <Field label="Formato">
                <select name="deliveryMode"><option value="presencial">Presencial</option><option value="online">Online</option><option value="hibrido">Híbrido</option></select>
              </Field>
              <Field label="Local ou link">
                <input name="location" />
              </Field>
              <Field label="Vagas">
                <input name="capacity" type="number" min={1} />
              </Field>
              <label className="check-row">
                <input name="publicCatalog" type="checkbox" /> Publicar no
                catálogo público
              </label>
              <Submit busy={busy} label="Criar turma" />
            </form>
          </div>
        </div>
        <div className="grid-2">
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() =>
                api(`/education/courses/${b.courseId}/materials`, "POST", {
                  title: b.title,
                  kind: b.kind,
                  location: b.location || "",
                  description: b.description || "",
                  position: 0,
                }),
              );
            }}
          >
            <h3>Novo material</h3>
            <Field label="Curso">
              <select name="courseId" required>
                <option value="">Selecione</option>
                {data?.courses?.map((v: RecordData) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Título">
              <input name="title" required />
            </Field>
            <Field label="Tipo">
              <select name="kind">
                <option value="link">Link</option>
                <option value="file">Arquivo</option>
                <option value="text">Texto</option>
              </select>
            </Field>
            <Field label="Local ou conteúdo">
              <textarea name="location" rows={2} />
            </Field>
            <Submit busy={busy} label="Adicionar material" />
          </form>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() =>
                api(`/education/classes/${b.classId}/assessments`, "POST", {
                  title: b.title,
                  maxScore: Number(b.maxScore),
                  published: b.published === "on",
                }),
              );
            }}
          >
            <h3>Nova avaliação</h3>
            <Field label="Turma">
              <select name="classId" required>
                <option value="">Selecione</option>
                {data?.classes?.map((v: RecordData) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Título">
              <input name="title" required />
            </Field>
            <Field label="Nota máxima">
              <input
                name="maxScore"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={10}
                required
              />
            </Field>
            <label className="check-row">
              <input name="published" type="checkbox" /> Publicar para turma
            </label>
            <Submit busy={busy} label="Criar avaliação" />
          </form>
        </div>
        <h3>Registrar sessão e frequência</h3>
        <form onSubmit={session}>
          <Field label="Turma">
            <select
              value={sessionClass}
              onChange={(e) => setSessionClass(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {data?.classes?.map((v: RecordData) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input name="heldOn" type="date" required />
          </Field>
          <Field label="Tema">
            <input name="topic" />
          </Field>
          {selected.length ? (
            <div className="stack">
              {selected.map((v: RecordData) => (
                <label className="check-row" key={v.id}>
                  <input type="checkbox" name={`present-${v.id}`} />{" "}
                  {v.person_name}
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">A turma ainda não tem matrículas.</p>
          )}
          <Submit busy={busy} label="Salvar frequência" />
        </form>
        {(data?.enrollmentPagination?.pages ?? 1) > 1 && (
          <div className="toolbar" aria-label="Paginação de matrículas">
            <button
              type="button"
              className="button secondary"
              disabled={enrollmentPage <= 1 || busy}
              onClick={() => setEnrollmentPage((v) => v - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              Matrículas · página {data?.enrollmentPagination?.page} de{" "}
              {data?.enrollmentPagination?.pages}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={
                enrollmentPage >= data!.enrollmentPagination.pages || busy
              }
              onClick={() => setEnrollmentPage((v) => v + 1)}
            >
              Próxima
            </button>
          </div>
        )}
        <h3>Histórico de sessões</h3>
        {data?.sessions?.map((v: RecordData) => (
          <article className="toolbar" key={v.id}>
            <div>
              <strong>
                {shortDate(v.held_on)} · {v.class_name}
              </strong>
              <p>
                {v.topic || "Sem tema"} · {v.attendance_present}/
                {v.attendance_total} presenças confirmadas
              </p>
            </div>
          </article>
        ))}
        {(data?.sessionPagination?.pages ?? 1) > 1 && (
          <div className="toolbar" aria-label="Paginação de sessões">
            <button
              type="button"
              className="button secondary"
              disabled={sessionPage <= 1 || busy}
              onClick={() => setSessionPage((v) => v - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              Sessões · página {data?.sessionPagination?.page} de{" "}
              {data?.sessionPagination?.pages}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={sessionPage >= data!.sessionPagination.pages || busy}
              onClick={() => setSessionPage((v) => v + 1)}
            >
              Próxima
            </button>
          </div>
        )}
        <form onSubmit={grade}>
          <h3>Lançar resultado</h3>
          <div className="grid-2">
            <Field label="Avaliação">
              <select
                name="assessmentId"
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {data?.assessments?.map((v: RecordData) => (
                  <option key={v.id} value={v.id}>
                    {v.title} · {v.class_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Aluno">
              <select name="enrollmentId" required>
                <option value="">Selecione</option>
                {assessmentRoster.map((v: RecordData) => (
                  <option key={v.id} value={v.id}>
                    {v.person_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nota">
              <input name="score" type="number" min={0} step="0.01" required />
            </Field>
            <Field label="Feedback">
              <input name="feedback" maxLength={2000} />
            </Field>
          </div>
          <Submit busy={busy} label="Salvar resultado" />
        </form>
        <h3>Resultados de avaliações</h3>
        {data?.results?.length ? (
          data.results.map((v: RecordData) => (
            <article className="toolbar" key={v.id}>
              <div>
                <strong>{v.person_name}</strong>
                <p>
                  {v.assessment_title} · {v.class_name} · nota {v.score} ·{" "}
                  {v.feedback || "Sem feedback"}
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="muted">Nenhum resultado lançado.</p>
        )}
        {(data?.resultPagination?.pages ?? 1) > 1 && (
          <div className="toolbar" aria-label="Paginação de resultados">
            <button
              type="button"
              className="button secondary"
              disabled={resultPage <= 1 || busy}
              onClick={() => setResultPage((v) => v - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              Resultados · página {data?.resultPagination?.page} de{" "}
              {data?.resultPagination?.pages}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={resultPage >= data!.resultPagination.pages || busy}
              onClick={() => setResultPage((v) => v + 1)}
            >
              Próxima
            </button>
          </div>
        )}
        <h3>Materiais e avaliações</h3>
        {data?.materials?.map((v: RecordData) => (
          <article className="toolbar" key={v.id}>
            <div>
              <strong>{v.title}</strong>
              <p>
                {v.course_name || v.class_name} · {v.kind} ·{" "}
                {v.location || "Sem localização"}
              </p>
            </div>
          </article>
        ))}
        {data?.assessments?.map((v: RecordData) => (
          <article className="toolbar" key={v.id}>
            <div>
              <strong>{v.title}</strong>
              <p>
                {v.class_name} · máximo {v.max_score} ·{" "}
                {v.published ? "publicada" : "rascunho"}
              </p>
            </div>
          </article>
        ))}
        <form
          onSubmit={(e) => {
            const b = formValues(e);
            void run(() =>
              api(`/education/assessments/${b.assessmentId}`, "PATCH", {
                published: b.published === "on",
              }),
            );
          }}
        >
          <h4>Publicação de avaliação</h4>
          <div className="grid-2">
            <Field label="Avaliação">
              <select
                name="assessmentId"
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {data?.assessments?.map((v: RecordData) => (
                  <option key={v.id} value={v.id}>
                    {v.title} · {v.class_name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="check-row">
              <input name="published" type="checkbox" /> Disponível no portal
            </label>
          </div>
          <Submit busy={busy} label="Atualizar publicação" />
        </form>
        <h3>Certificados emitidos</h3>
        {data?.certificates?.length ? (
          data.certificates.map((v: RecordData) => (
            <article className="toolbar" key={v.id}>
              <div>
                <strong>{v.person_name}</strong>
                <p>
                  {v.class_name} · código {v.code} · emitido em{" "}
                  {shortDate(v.issued_at)}
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="muted">Nenhum certificado emitido.</p>
        )}
        {(data?.certificatePagination?.pages ?? 1) > 1 && (
          <div className="toolbar" aria-label="Paginação de certificados">
            <button
              type="button"
              className="button secondary"
              disabled={certificatePage <= 1 || busy}
              onClick={() => setCertificatePage((v) => v - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              Certificados · página {data?.certificatePagination?.page} de{" "}
              {data?.certificatePagination?.pages}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={
                certificatePage >= data!.certificatePagination.pages || busy
              }
              onClick={() => setCertificatePage((v) => v + 1)}
            >
              Próxima
            </button>
          </div>
        )}
        <h3>Cursos e turmas</h3>
        {data?.courses?.map((v: RecordData) => (
          <article className="toolbar" key={v.id}>
            <div>
              <strong>{v.name}</strong>
              <p>
                {v.description || "Sem descrição"} · certificado a partir de{" "}
                {v.completion_percent}%
              </p>
            </div>
          </article>
        ))}
        {data?.classes?.map((v: RecordData) => (
          <article className="toolbar" key={v.id}>
            <div>
              <strong>{v.name}</strong>
              <p>
                {v.course_name} · início {shortDate(v.starts_on)} · {v.enrolled}
                {v.capacity ? `/${v.capacity}` : ""} matriculados
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => togglePublicCatalog(v)}
            >
              {v.public_catalog
                ? "Retirar do catálogo"
                : "Publicar no catálogo"}
            </button>
          </article>
        ))}
        <div className="toolbar" aria-label="Paginação do conteúdo de ensino">
          <span className="muted">
            Cursos {data?.coursesPagination?.page} de{" "}
            {data?.coursesPagination?.pages}
          </span>
          <button
            type="button"
            className="button secondary"
            disabled={coursePage <= 1 || busy}
            onClick={() => setCoursePage((v) => v - 1)}
          >
            Cursos anteriores
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              coursePage >= (data?.coursesPagination?.pages ?? 1) || busy
            }
            onClick={() => setCoursePage((v) => v + 1)}
          >
            Próximos cursos
          </button>
          <span className="muted">
            Turmas {data?.classesPagination?.page} de{" "}
            {data?.classesPagination?.pages}
          </span>
          <button
            type="button"
            className="button secondary"
            disabled={classPage <= 1 || busy}
            onClick={() => setClassPage((v) => v - 1)}
          >
            Turmas anteriores
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              classPage >= (data?.classesPagination?.pages ?? 1) || busy
            }
            onClick={() => setClassPage((v) => v + 1)}
          >
            Próximas turmas
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={materialPage <= 1 || busy}
            onClick={() => setMaterialPage((v) => v - 1)}
          >
            Materiais anteriores
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              materialPage >= (data?.materialsPagination?.pages ?? 1) || busy
            }
            onClick={() => setMaterialPage((v) => v + 1)}
          >
            Próximos materiais
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={assessmentPage <= 1 || busy}
            onClick={() => setAssessmentPage((v) => v - 1)}
          >
            Avaliações anteriores
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              assessmentPage >= (data?.assessmentsPagination?.pages ?? 1) ||
              busy
            }
            onClick={() => setAssessmentPage((v) => v + 1)}
          >
            Próximas avaliações
          </button>
        </div>
        <p className="panel-footnote">
          Certificados são emitidos somente quando a frequência confirmada
          atinge o percentual configurado.
        </p>
      </section>
    </>
  );
}
