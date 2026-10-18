import { useEffect, useState } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";
import type { PageProps } from "./pages";
export default function AgendaPage(props: PageProps & { current: RecordData }) {
  const [data, setData] = useState<RecordData | null>(null),
    [volunteers, setVolunteers] = useState<RecordData[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [history, setHistory] = useState<Record<string, { items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>>({}),
    [savedViews, setSavedViews] = useState<RecordData[]>([]),
    [selectedSavedView, setSelectedSavedView] = useState(""),
    [tab, setTab] = useState("events"),
    [taskPage, setTaskPage] = useState(1),
    [taskStatus, setTaskStatus] = useState("all"),
    [taskScope, setTaskScope] = useState("all"),
    [taskAssignee, setTaskAssignee] = useState("all"),
    [taskDue, setTaskDue] = useState("all"),
    [eventPage, setEventPage] = useState(1);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const taskQuery = new URLSearchParams({ page: String(taskPage), pageSize: "25", eventPage: String(eventPage), eventPageSize: "25", status: taskStatus, scope: taskScope, assignedTo: taskAssignee, due: taskDue });
    api(`/agenda?${taskQuery}`)
      .then(async (v) => {
        if (!active) return;
        setData(v);
        if (v.canManage) {
          const people = await api("/agenda/volunteers");
          if (active) setVolunteers(people);
          try { const views = await api<RecordData[]>("/saved-views?kind=tasks"); if (active) setSavedViews(views); } catch { /* a user may only have read access to the queue */ }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.church, props.revision, revision, taskPage, taskStatus, taskScope, taskAssignee, taskDue, eventPage]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setRevision((v) => v + 1);
      props.notify("Operação registrada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const time = (name: string, label: string) => (
    <Field label={label}>
      <input name={name} type="datetime-local" required />
    </Field>
  );
  const select = (name: string, label: string, rows: RecordData[]) => (
    <Field label={label}>
      <select name={name} required>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name ?? r.title ?? r.ministry ?? r.id}
          </option>
        ))}
      </select>
    </Field>
  );
  const scopeNames: Record<string, string> = {
    people: "Secretaria",
    cells: "Grupos e discipulado",
    pastoral: "Pastoral",
    finance: "Tesouraria",
  };
  const scopes = Object.keys(scopeNames).filter(
    (scope) =>
      props.current.permissions?.[scope + "Write"] &&
      (scope === "pastoral" || props.current.modules.includes(scope)),
  );
  async function saveTaskView() {
    const name = window.prompt("Nome desta fila salva:");
    if (!name?.trim()) return;
    try {
      await api("/saved-views", "POST", { name: name.trim(), kind: "tasks", filters: { status: taskStatus, scope: taskScope, assignedTo: taskAssignee === "all" ? null : taskAssignee, due: taskDue, q: "", campusId: null }, shared: window.confirm("Compartilhar esta fila com a equipe autorizada desta igreja?") });
      props.notify("Fila salva criada.");
      setSavedViews(await api<RecordData[]>("/saved-views?kind=tasks"));
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Agenda, equipes e tarefas</h2>
      <div className="tabs" role="group" aria-label="Agenda e processos">
        {[
          { id: "events", label: "Agenda e reservas" },
          { id: "teams", label: "Equipes e escalas" },
          { id: "tasks", label: "Tarefas e acompanhamento" },
        ].map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p>Carregando…</p>}
      {data && tab === "events" && (
        <>
          {data.canManage && (
            <>
              <h3>Agendar atividade e reservar recursos</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    b = Object.fromEntries(new FormData(form)),
                    resourceIds = new FormData(form).getAll("resource");
                  void run(() =>
                    api("/agenda/events", "POST", {
                      title: b.title,
                      kind: b.kind,
                      startsAt: new Date(String(b.starts)).toISOString(),
                      endsAt: new Date(String(b.ends)).toISOString(),
                      weeklyCount: Number(b.weeks),
                      resourceIds,
                      capacity: b.capacity ? Number(b.capacity) : null,
                      publicRegistration: b.publicRegistration === "on",
                      waitlistEnabled: b.waitlistEnabled === "on",
                      registrationDeadline: b.registrationDeadline
                        ? new Date(String(b.registrationDeadline)).toISOString()
                        : null,
                      certificateEnabled: b.certificateEnabled === "on",
                      priceCents: b.price ? Math.round(Number(b.price) * 100) : 0,
                      registrationFields: String(b.registrationFields ?? "")
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [key, label, type = "text", required = "", options = ""] = line.split("|").map((part) => part.trim());
                          return { key, label, type, required: required.toLowerCase() === "sim", options: options ? options.split(",").map((part) => part.trim()).filter(Boolean) : [] };
                        }),
                    }),
                  );
                }}
              >
                <Field label="Título">
                  <input name="title" minLength={3} maxLength={150} required />
                </Field>
                <Field label="Tipo">
                  <select name="kind">
                    <option value="meeting">Reunião</option>
                    <option value="service">Culto</option>
                    <option value="event">Evento</option>
                    <option value="class">Aula</option>
                  </select>
                </Field>
                {time("starts", "Início · horário local do dispositivo")}
                {time("ends", "Fim · horário local do dispositivo")}
                <Field label="Quantidade de encontros semanais">
                  <input
                    name="weeks"
                    type="number"
                    min={1}
                    max={26}
                    defaultValue={1}
                    required
                  />
                </Field>
                <Field label="Limite de participantes (opcional)">
                  <input name="capacity" type="number" min={1} max={100000} />
                </Field>
                <Field label="Valor da inscrição (R$; opcional)">
                  <input name="price" type="number" min={0} step="0.01" defaultValue={0} />
                </Field>
                <Field label="Encerramento das inscrições (opcional)">
                  <input name="registrationDeadline" type="datetime-local" />
                </Field>
                <Field label="Campos extras do formulário público">
                  <textarea
                    name="registrationFields"
                    rows={4}
                    placeholder="empresa|Empresa|text|não\ncomo_conheceu|Como conheceu?|select|sim|Instagram,Indicação,Outro"
                  />
                  <small className="muted">
                    Uma linha por campo: chave|rótulo|tipo|sim/não|opções. Tipos: text, email, phone, number, textarea ou select.
                  </small>
                </Field>
                <label className="member-checkbox">
                  <input name="publicRegistration" type="checkbox" />
                  Permitir inscrição pública por link
                </label>
                <label className="member-checkbox">
                  <input name="certificateEnabled" type="checkbox" />
                  Emitir certificado ao confirmar presença
                </label>
                <label className="member-checkbox">
                  <input
                    name="waitlistEnabled"
                    type="checkbox"
                    defaultChecked
                  />
                  Aceitar lista de espera quando lotar
                </label>
                <fieldset>
                  <legend>Recursos necessários</legend>
                  {data.resources.map((r: RecordData) => (
                    <label key={r.id} className="member-checkbox">
                      <input type="checkbox" name="resource" value={r.id} />
                      {r.name}
                    </label>
                  ))}
                </fieldset>
                <Submit busy={busy} label="Agendar e reservar" />
              </form>
              <h3>Cadastrar sala, veículo ou equipamento</h3>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() => api("/agenda/resources", "POST", b));
                }}
              >
                <Field label="Nome do recurso">
                  <input name="name" minLength={2} maxLength={120} required />
                </Field>
                <Field label="Tipo do recurso">
                  <select name="kind">
                    <option value="room">Sala</option>
                    <option value="vehicle">Veículo</option>
                    <option value="equipment">Equipamento</option>
                  </select>
                </Field>
                <Submit busy={busy} label="Cadastrar recurso" />
              </form>
            </>
          )}
          {data.events.map((v: RecordData) => (
            <article key={v.id} className="toolbar">
              <div>
                <strong>{v.title}</strong>
                <p>
                  {new Date(v.starts_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}{" "}
                  até{" "}
                  {new Date(v.ends_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}{" "}
                  · {v.status === "cancelled" ? "Cancelado" : "Agendado"}
                </p>
                <small>
                  {data.bookings
                    .filter((b: RecordData) => b.event_id === v.id)
                    .map(
                      (b: RecordData) =>
                        data.resources.find(
                          (r: RecordData) => r.id === b.resource_id,
                        )?.name,
                    )
                    .join(", ")}
                </small>
              </div>
              {data.canManage && v.status !== "cancelled" && (
                <>
                <details>
                  <summary className="text-button">Editar configurações</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const b = Object.fromEntries(new FormData(e.currentTarget));
                      const fields = String(b.registrationFields ?? "")
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [key, label, type = "text", required = "", options = ""] = line.split("|").map((part) => part.trim());
                          return { key, label, type, required: required.toLowerCase() === "sim", options: options ? options.split(",").map((part) => part.trim()).filter(Boolean) : [] };
                        });
                      void run(() => api(`/agenda/events/${v.id}`, "PATCH", {
                        title: b.title,
                        capacity: b.capacity ? Number(b.capacity) : null,
                        publicRegistration: b.publicRegistration === "on",
                        waitlistEnabled: b.waitlistEnabled === "on",
                        registrationDeadline: b.registrationDeadline ? new Date(String(b.registrationDeadline)).toISOString() : null,
                        certificateEnabled: b.certificateEnabled === "on",
                        priceCents: Math.round(Number(b.price) * 100),
                        registrationFields: fields,
                      }));
                    }}
                  >
                    <Field label="Título"><input name="title" defaultValue={v.title} minLength={3} maxLength={150} required /></Field>
                    <div className="grid-2">
                      <Field label="Capacidade"><input name="capacity" type="number" min={1} defaultValue={v.capacity ?? ""} /></Field>
                      <Field label="Valor da inscrição (R$)"><input name="price" type="number" min={0} step="0.01" defaultValue={Number(v.price_cents ?? 0) / 100} /></Field>
                    </div>
                    <Field label="Encerramento das inscrições"><input name="registrationDeadline" type="datetime-local" defaultValue={v.registration_deadline ? new Date(v.registration_deadline).toISOString().slice(0, 16) : ""} /></Field>
                    <Field label="Campos extras"><textarea name="registrationFields" rows={3} defaultValue={(v.registration_fields ?? []).map((field: RecordData) => `${field.key}|${field.label}|${field.type}|${field.required ? "sim" : "não"}|${(field.options ?? []).join(",")}`).join("\n")} /></Field>
                    <label className="member-checkbox"><input name="publicRegistration" type="checkbox" defaultChecked={Boolean(v.public_registration)} /> Inscrição pública</label>
                    <label className="member-checkbox"><input name="waitlistEnabled" type="checkbox" defaultChecked={Boolean(v.waitlist_enabled)} /> Lista de espera</label>
                    <label className="member-checkbox"><input name="certificateEnabled" type="checkbox" defaultChecked={Boolean(v.certificate_enabled)} /> Certificado</label>
                    <Submit busy={busy} label="Salvar alterações" />
                  </form>
                </details>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>(`/agenda/events/${v.id}/history?page=1&pageSize=25`);
                      setHistory((current) => ({ ...current, [v.id]: rows }));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Ver histórico
                </button>
                {history[v.id] && (
                  <div className="panel-footnote">
                    {history[v.id].items.length === 0 ? "Nenhuma alteração registrada." : history[v.id].items.map((entry) => (
                      <p key={entry.id}>
                        <strong>{entry.actor_name}</strong> · {new Date(entry.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br />
                        <small>{Object.entries(entry.changes ?? {}).map(([field, change]) => `${field}: ${JSON.stringify((change as RecordData).from)} → ${JSON.stringify((change as RecordData).to)}`).join(" · ")}</small>
                      </p>
                    ))}
                    {history[v.id].pages > 1 && <div className="toolbar"><button className="button secondary" disabled={history[v.id].page <= 1} onClick={async () => { const next = history[v.id].page - 1; const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>(`/agenda/events/${v.id}/history?page=${next}&pageSize=25`); setHistory((current) => ({ ...current, [v.id]: rows })); }}>Anterior</button><span className="muted">Página {history[v.id].page} de {history[v.id].pages}</span><button className="button secondary" disabled={history[v.id].page >= history[v.id].pages} onClick={async () => { const next = history[v.id].page + 1; const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number } & { pages: number }>(`/agenda/events/${v.id}/history?page=${next}&pageSize=25`); setHistory((current) => ({ ...current, [v.id]: rows })); }}>Próxima</button></div>}
                  </div>
                )}
                </>
              )}
              {data.canManage && v.status !== "cancelled" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancelar esta atividade e liberar seus recursos e escalas?",
                      )
                    )
                      void run(() =>
                        api(`/agenda/events/${v.id}/cancel`, "POST"),
                      );
                  }}
                >
                  Cancelar atividade
                </button>
              )}
            </article>
          ))}
          {(data.eventPagination?.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação de atividades">
              <button type="button" className="button secondary" disabled={eventPage <= 1 || busy} onClick={() => setEventPage((v) => v - 1)}>Anterior</button>
              <span className="muted">Atividades · página {data.eventPagination.page} de {data.eventPagination.pages} · {data.eventPagination.total} no total</span>
              <button type="button" className="button secondary" disabled={eventPage >= data.eventPagination.pages || busy} onClick={() => setEventPage((v) => v + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}
      {data && tab === "teams" && (
        <>
          {data.canManage && (
            <>
              <h3>Ministérios e equipes</h3>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() => api("/agenda/teams", "POST", b));
                }}
              >
                <Field label="Nome da equipe">
                  <input name="name" minLength={2} required />
                </Field>
                <Submit busy={busy} label="Criar equipe" />
              </form>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() =>
                    api(`/agenda/teams/${b.teamId}/members`, "POST", {
                      userId: b.userId,
                      role: b.role,
                    }),
                  );
                }}
              >
                {select("teamId", "Equipe", data.teams)}
                {select("userId", "Pessoa", volunteers)}
                <Field label="Função na equipe">
                  <input name="role" minLength={2} maxLength={80} required />
                </Field>
                <Submit busy={busy} label="Vincular à equipe" />
              </form>
              <h3>Preparar escala</h3>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() => api("/agenda/schedules", "POST", b));
                }}
              >
                {select(
                  "eventId",
                  "Atividade",
                  data.events.filter(
                    (v: RecordData) => v.status === "scheduled",
                  ),
                )}
                {select("teamId", "Equipe da escala", data.teams)}
                {select("userId", "Voluntário", volunteers)}
                <Field label="Justificativa de exceção (somente se faltar treinamento)">
                  <input name="overrideReason" maxLength={500} />
                </Field>
                <Submit busy={busy} label="Escalar voluntário" />
              </form>
              <h3>Exigir treinamento para a equipe</h3>
              <form onSubmit={(e) => { const b = formValues(e); void run(() => api("/agenda/training-requirements", "POST", { teamId: b.teamId, name: b.name })); }}>
                {select("teamId", "Equipe", data.teams)}
                <Field label="Nome do treinamento obrigatório"><input name="name" minLength={2} maxLength={160} required /></Field>
                <Submit busy={busy} label="Salvar requisito" />
              </form>
              <h3>Registrar treinamento</h3>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() =>
                    api("/agenda/training", "POST", {
                      userId: b.userId,
                      teamId: b.teamId,
                      name: b.name,
                      completedAt: b.completedAt,
                      expiresAt: b.expiresAt || null,
                    }),
                  );
                }}
              >
                {select("teamId", "Equipe", data.teams)}
                {select("userId", "Voluntário", volunteers)}
                <Field label="Treinamento concluído">
                  <input name="name" minLength={2} maxLength={160} required />
                </Field>
                <Field label="Concluído em">
                  <input name="completedAt" type="date" required />
                </Field>
                <Field label="Validade (opcional)">
                  <input name="expiresAt" type="date" />
                </Field>
                <Submit busy={busy} label="Registrar treinamento" />
              </form>
              <h3>Solicitar substituição</h3>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() =>
                    api(`/agenda/schedules/${b.scheduleId}/substitutions`, "POST", {
                      substituteUserId: b.substituteUserId,
                      reason: b.reason,
                    }),
                  );
                }}
              >
                {select("scheduleId", "Escala", data.schedules)}
                {select("substituteUserId", "Substituto", volunteers)}
                <Field label="Motivo">
                  <input name="reason" maxLength={500} />
                </Field>
                <Submit busy={busy} label="Solicitar substituição" />
              </form>
            </>
          )}
          <h3>Minha indisponibilidade</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() =>
                api("/agenda/unavailability", "POST", {
                  startsAt: new Date(b.starts).toISOString(),
                  endsAt: new Date(b.ends).toISOString(),
                }),
              );
            }}
          >
            {time("starts", "Indisponível a partir de")}
            {time("ends", "Indisponível até")}
            <Submit busy={busy} label="Registrar indisponibilidade" />
          </form>
          <h3>Escalas visíveis</h3>
          {data.schedules.map((v: RecordData) => (
            <p key={v.id}>
              {v.ministry} · {shortDate(v.starts_at)} ·{" "}
              {volunteers.find((u) => u.id === v.user_id)?.name ??
                "Minha escala"}{" "}
              ·{" "}
              {
                {
                  pending: "Aguardando resposta",
                  accepted: "Confirmada",
                  declined: "Recusada",
                }[String(v.response)]
              }
            </p>
          ))}
          {data.substitutions?.map((v: RecordData) => (
            <article key={v.id} className="toolbar">
              <div>
                <strong>Substituição · {v.original_name} → {v.substitute_name}</strong>
                <p>{v.reason || "Sem motivo informado"} · {v.status === "pending" ? "Aguardando resposta" : v.status}</p>
              </div>
              {v.status === "pending" && data.canManage && (
                <div className="row-actions">
                  <button className="button secondary" disabled={busy} onClick={() => void run(() => api(`/agenda/substitutions/${v.id}`, "PATCH", { status: "accepted" }))}>Aceitar</button>
                  <button className="text-button" disabled={busy} onClick={() => void run(() => api(`/agenda/substitutions/${v.id}`, "PATCH", { status: "declined" }))}>Recusar</button>
                </div>
              )}
            </article>
          ))}
          <p>Confirmações e recusas são feitas no Portal do membro.</p>
        </>
      )}
      {data && tab === "tasks" && (
        <>
          <h3>Fila operacional</h3>
          <p className="muted">Tarefas e processos abertos ordenados pelo próximo prazo.</p>
          <div className="toolbar">
            <Field label="Situação">
              <select value={taskStatus} onChange={(e) => { setTaskStatus(e.target.value); setTaskPage(1); }}>
                <option value="all">Todas</option>
                <option value="open">Abertas</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluídas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </Field>
            <Field label="Área">
              <select value={taskScope} onChange={(e) => { setTaskScope(e.target.value); setTaskPage(1); }}>
                <option value="all">Todas</option>
                {Object.entries(scopeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Responsável">
              <select value={taskAssignee} onChange={(e) => { setTaskAssignee(e.target.value); setTaskPage(1); }}>
                <option value="all">Todos</option>
                {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Prazo">
              <select value={taskDue} onChange={(e) => { setTaskDue(e.target.value); setTaskPage(1); }}><option value="all">Todos</option><option value="overdue">Somente vencidas</option></select>
            </Field>
            <span className="muted">{data.taskPagination?.total ?? 0} tarefa(s)</span>
            <select aria-label="Filas salvas" value={selectedSavedView} onChange={(e) => {
              const view = savedViews.find((v) => v.id === e.target.value); setSelectedSavedView(e.target.value);
              if (!view) return;
              setTaskStatus(view.filters?.status ?? "all"); setTaskScope(view.filters?.scope ?? "all"); setTaskAssignee(view.filters?.assignedTo ?? "all"); setTaskDue(view.filters?.due ?? "all"); setTaskPage(1);
            }}>
              <option value="">Filas salvas</option>
              {savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
            </select>
            <button type="button" className="button secondary" onClick={() => void saveTaskView()}>Salvar fila</button>
          </div>
          {data.queue?.length ? data.queue.map((item: RecordData) => (
            <article key={`${item.kind}-${item.id}`} className="toolbar">
              <div>
                <strong>{item.title}</strong>
                <p>{item.kind === "workflow" ? "Processo" : scopeNames[item.scope] ?? item.scope} · {item.due_on ? shortDate(item.due_on) : "Sem prazo"} · {item.status === "in_progress" ? "Em andamento" : "Aberta"}</p>
              </div>
            </article>
          )) : <p className="muted">Nenhuma pendência aberta.</p>}
          {scopes.length > 0 && (
            <form
              onSubmit={(e) => {
                const b = formValues(e);
                void run(() =>
                  api("/tasks", "POST", {
                    ...b,
                    assignedTo: b.assignedTo || undefined,
                  }),
                );
              }}
            >
              <Field label="Próxima ação">
                <input name="title" minLength={3} maxLength={300} required />
              </Field>
              <Field label="Área responsável">
                <select name="scope">
                  {scopes.map((s) => (
                    <option key={s} value={s}>
                      {scopeNames[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prazo">
                <input name="dueOn" type="date" required />
              </Field>
              <Field label="Responsável">
                <select name="assignedTo">
                  <option value="">Eu mesmo</option>
                  {volunteers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Submit busy={busy} label="Criar tarefa" />
            </form>
          )}
          {data.tasks.map((t: RecordData) => (
            <article key={t.id} className="toolbar">
              <div>
                <strong>{t.title}</strong>
                <p>
                  {scopeNames[t.scope]} · {shortDate(t.due_on)} ·{" "}
                  {
                    {
                      open: "Aberta",
                      in_progress: "Em andamento",
                      done: "Concluída",
                      cancelled: "Cancelada",
                    }[String(t.status)]
                  }
                </p>
              </div>
              {scopes.includes(t.scope) && (
                <>
                  {!t.assigned_to &&
                    ["open", "in_progress"].includes(t.status) && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            api(`/tasks/${t.id}/claim`, "POST", {
                              version: t.version,
                            }),
                          )
                        }
                      >
                        Assumir acompanhamento
                      </button>
                    )}
                  <Field label={`Situação de ${t.title}`}>
                    <select
                      value={t.status}
                      disabled={busy}
                      onChange={(e) =>
                        void run(() =>
                          api(`/tasks/${t.id}`, "PATCH", {
                            status: e.target.value,
                            version: t.version,
                          }),
                        )
                      }
                    >
                      <option value="open">Aberta</option>
                      <option value="in_progress">Em andamento</option>
                      <option value="done">Concluída</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </Field>
                  <Field label={`Responsável por ${t.title}`}>
                    <select
                      value={t.assigned_to ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        void run(() =>
                          api(`/tasks/${t.id}`, "PATCH", {
                            status: t.status,
                            assignedTo: e.target.value || null,
                            version: t.version,
                          }),
                        )
                      }
                    >
                      <option value="">Sem responsável</option>
                      {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </Field>
                </>
              )}
            </article>
          ))}
          {(data.taskPagination?.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação de tarefas">
              <button className="button secondary" disabled={taskPage <= 1 || busy} onClick={() => setTaskPage((v) => v - 1)}>Anterior</button>
              <span className="muted">Página {data.taskPagination.page} de {data.taskPagination.pages}</span>
              <button className="button secondary" disabled={taskPage >= data.taskPagination.pages || busy} onClick={() => setTaskPage((v) => v + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
