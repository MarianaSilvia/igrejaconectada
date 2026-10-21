import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Field, Submit } from "./ui";
import type { PageProps } from "./pages";

type TimelineEvent = RecordData & { event_date: string; title: string; description: string; event_type: string };
const types = [
  ["foundation", "Fundação"], ["leadership", "Liderança"], ["membership", "Membresia"],
  ["discipleship", "Discipulado"], ["education", "Ensino"], ["family", "Família"],
  ["ministry", "Ministério"], ["department", "Departamento"], ["campaign", "Campanha"],
  ["festival", "Festividade"], ["visit", "Visita"], ["transfer", "Transferência"], ["other", "Outro"],
];

export default function HistoryPage(props: PageProps) {
  const [subjectType, setSubjectType] = useState<"church" | "person">("church");
  const [personId, setPersonId] = useState("");
  const [people, setPeople] = useState<RecordData[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [metrics, setMetrics] = useState<RecordData>({});
  const [subject, setSubject] = useState<RecordData | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedId = subjectType === "person" ? personId : props.church;
  const load = async () => {
    if (!selectedId) return;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ subjectType, subjectId: selectedId });
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      const report = await api<{ subject: RecordData; events: TimelineEvent[]; metrics: RecordData }>("/history/report?" + query.toString());
      setEvents(report.events ?? []);
      setSubject(report.subject ?? null);
      setMetrics(report.metrics ?? {});
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void api<RecordData[]>("/people").then(setPeople).catch(() => undefined); }, [props.church]);
  useEffect(() => { void load(); }, [props.church, subjectType, personId, from, to]);

  const title = subjectType === "person" ? subject?.name ?? "Histórico do membro" : subject?.name ?? "Histórico da congregação";
  const metricCards = useMemo(() => subjectType === "person"
    ? [["Matrículas", metrics.educationEnrollments ?? 0], ["Concluídos", metrics.educationCompleted ?? 0]]
    : [["Pessoas", metrics.people ?? 0], ["Membros", metrics.members ?? 0], ["Visitantes", metrics.visitors ?? 0], ["Reuniões", metrics.meetings ?? 0], ["Visitantes registrados", metrics.meetingVisitors ?? 0], ["Turmas", metrics.classes ?? 0], ["Atividades da agenda", metrics.agendaActivities ?? 0]], [metrics, subjectType]);

  async function exportCsv() {
    const query = new URLSearchParams({ subjectType, subjectId: selectedId });
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const response = await fetch("/api/history/export.csv?" + query.toString(), {
      credentials: "same-origin",
      headers: { "x-church-id": props.church },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Exportação indisponível.");
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "linha-do-tempo.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function addEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const form = new FormData(e.currentTarget);
    try {
      await api("/history", "POST", {
        subjectType, subjectId: selectedId, eventDate: form.get("eventDate"),
        eventType: form.get("eventType"), title: form.get("title"),
        description: form.get("description") ?? "", visibility: form.get("visibility") ?? "administrative",
      });
      e.currentTarget.reset(); props.notify("Registro histórico adicionado."); await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="panel history-page" style={{ padding: 24 }}>
    <div className="toolbar">
      <div><h2>Histórico e relatórios</h2><p className="muted">Registre e consulte a história da congregação e das pessoas, com indicadores conectados aos módulos existentes.</p></div>
      <div className="toolbar">
        <button className="button secondary" type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button>
        <button className="button secondary" type="button" onClick={() => void exportCsv().catch((error) => setError((error as Error).message))}>Baixar CSV</button>
      </div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="grid-2">
      <Field label="Histórico de">
        <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as "church" | "person")}>
          <option value="church">Congregação atual</option><option value="person">Membro ou visitante</option>
        </select>
      </Field>
      {subjectType === "person" && <Field label="Pessoa">
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} required>
          <option value="">Selecione uma pessoa</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.status}</option>)}
        </select>
      </Field>}
      <Field label="De"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Até"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
    </div>
    <div className="history-report">
      <div className="eyebrow">RELATÓRIO HISTÓRICO</div>
      <h2>{title}</h2>
      <p className="muted">{from || "Início"} até {to || "atualidade"}</p>
      <div className="grid-3">{metricCards.map(([label, value]) => <article className="metric-card" key={String(label)}><strong>{String(value)}</strong><span>{label}</span></article>)}</div>
      <h3>Linha do tempo</h3>
      {!events.length && <p className="muted">Nenhum acontecimento registrado neste período.</p>}
      <div className="timeline" aria-label="Linha do tempo">
        {events.map((event) => <article className="timeline-item" key={event.id}><time>{shortDate(event.event_date)}</time><div><strong>{event.title}</strong><span className="badge">{types.find(([id]) => id === event.event_type)?.[1] ?? event.event_type}</span><p>{event.description}</p></div></article>)}
      </div>
    </div>
    {selectedId && <form onSubmit={addEvent} className="history-form">
      <h3>Adicionar acontecimento</h3>
      <div className="grid-2"><Field label="Data"><input name="eventDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Categoria"><select name="eventType" defaultValue="other">{types.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="Título"><input name="title" required placeholder="Ex.: Fundação da congregação" /></Field><Field label="Visibilidade"><select name="visibility" defaultValue="administrative"><option value="administrative">Administrativa</option><option value="leadership">Liderança</option><option value="private">Privada</option></select></Field></div>
      <Field label="Descrição"><textarea name="description" rows={4} placeholder="Descreva o acontecimento, pessoas relacionadas e documentos disponíveis." /></Field>
      <Submit busy={busy} label="Adicionar ao histórico" />
    </form>}
  </section>;
}