import { useEffect, useState } from "react";
import { api, money, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";

type Props = { church: string; revision: number; notify: (s: string) => void };
export default function ParticipationPage(props: Props) {
  const [data, setData] = useState<RecordData | null>(null),
    [workflowData, setWorkflowData] = useState<RecordData | null>(null),
    [people, setPeople] = useState<RecordData[]>([]),
    [registrations, setRegistrations] = useState<Record<string, RecordData>>(
      {},
    ),
    [eventCertificates, setEventCertificates] = useState<
      Record<string, RecordData>
    >({}),
    [coupons, setCoupons] = useState<Record<string, RecordData[]>>({}),
    [eventMedia, setEventMedia] = useState<Record<string, RecordData[]>>({}),
    [registrationPages, setRegistrationPages] = useState<
      Record<string, number>
    >({}),
    [registrationStatus, setRegistrationStatus] = useState<
      Record<string, string>
    >({}),
    [eventPage, setEventPage] = useState(1),
    [workflowStatus, setWorkflowStatus] = useState("all"),
    [workflowDue, setWorkflowDue] = useState("all"),
    [workflowPage, setWorkflowPage] = useState(1),
    [tab, setTab] = useState("events"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api(`/participation?page=${eventPage}&pageSize=25`)
      .then(async (value) => {
        setData(value);
        if (value.canManage) {
          try {
            setPeople(await api<RecordData[]>("/people"));
          } catch (e) {
            setError((e as Error).message);
          }
        }
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    setData(null);
    setWorkflowData(null);
    void load();
    if (tab === "workflows")
      Promise.all([
        api(
          `/workflows?status=${workflowStatus}&due=${workflowDue}&page=${workflowPage}&pageSize=25`,
        ),
        api<RecordData[]>("/people"),
      ])
        .then(([workflows, members]) => {
          setWorkflowData(workflows);
          setPeople(members);
        })
        .catch((e) => setError(e.message));
  }, [
    props.church,
    props.revision,
    tab,
    eventPage,
    workflowStatus,
    workflowDue,
    workflowPage,
  ]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      props.notify("Operação registrada.");
      await load();
      if (tab === "workflows") {
        const refreshed = await api(
          `/workflows?status=${workflowStatus}&due=${workflowDue}&page=${workflowPage}&pageSize=25`,
        );
        setWorkflowData(refreshed);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadRegistrations(
    eventId: string,
    page = 1,
    status = registrationStatus[eventId] ?? "all",
  ) {
    const rows = await api(
      `/events/${eventId}/registrations?page=${page}&pageSize=25&status=${status}`,
    );
    setRegistrations((current) => ({ ...current, [eventId]: rows }));
    setRegistrationPages((current) => ({ ...current, [eventId]: page }));
    const certificates = await api(
      `/events/${eventId}/certificates?page=1&pageSize=25`,
    );
    setEventCertificates((current) => ({
      ...current,
      [eventId]: certificates,
    }));
  }
  async function loadCoupons(eventId: string) {
    const rows = await api<RecordData[]>(`/events/${eventId}/coupons`);
    setCoupons((current) => ({ ...current, [eventId]: rows }));
  }
  async function loadEventMedia(eventId: string) {
    const rows = await api<RecordData[]>(`/events/${eventId}/media`);
    setEventMedia((current) => ({ ...current, [eventId]: rows }));
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Participação e processos</h2>
      <p className="muted">
        Eventos, inscrições e acompanhamentos conectados ao cadastro da igreja.
      </p>
      <div className="tabs" role="group" aria-label="Participação">
        <button
          className={tab === "events" ? "active" : ""}
          onClick={() => setTab("events")}
        >
          Inscrições
        </button>
        <button
          className={tab === "workflows" ? "active" : ""}
          onClick={() => setTab("workflows")}
        >
          Workflows
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p>Carregando…</p>}
      {data && tab === "events" && (
        <>
          <h3>Próximos eventos</h3>
          {data.events.items?.map((e: RecordData) => (
            <article className="toolbar" key={e.id}>
              <div>
                <strong>{e.title}</strong>
                <p>
                  {shortDate(e.starts_at)} · {e.registered_count} inscritos
                  {e.capacity ? ` de ${e.capacity}` : ""} · {e.waitlisted_count}{" "}
                  na espera
                </p>
                {e.public_registration && (
                  <div className="row-actions">
                    <small>
                      Link público: {window.location.origin}/evento/{e.id}
                    </small>
                    <button
                      type="button"
                      className="text-button"
                      onClick={async () => {
                        const url = `${window.location.origin}/evento/${e.id}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          props.notify("Link do evento copiado.");
                        } catch {
                          props.notify(
                            "Selecione o endereço exibido para copiar manualmente.",
                          );
                        }
                      }}
                    >
                      Copiar link
                    </button>
                  </div>
                )}
              </div>
              {data.canManage && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await loadRegistrations(e.id);
                    })
                  }
                >
                  Ver inscritos
                </button>
              )}
              {data.canManage && Number(e.price_cents ?? 0) > 0 && (
                <details
                  onToggle={(event) => {
                    if (
                      (event.currentTarget as HTMLDetailsElement).open &&
                      !coupons[e.id]
                    )
                      void loadCoupons(e.id);
                  }}
                >
                  <summary className="button secondary">Cupons</summary>
                  <form
                    className="row-actions"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const b = formValues(event);
                      void run(async () => {
                        await api(`/events/${e.id}/coupons`, "POST", {
                          code: b.code,
                          discountKind: b.discountKind,
                          value:
                            b.discountKind === "percent"
                              ? Number(b.value)
                              : Math.round(Number(b.value) * 100),
                          maxUses: b.maxUses ? Number(b.maxUses) : null,
                          expiresOn: b.expiresOn || undefined,
                        });
                        await loadCoupons(e.id);
                      });
                    }}
                  >
                    <input
                      name="code"
                      placeholder="Código"
                      required
                      maxLength={40}
                    />
                    <select name="discountKind">
                      <option value="percent">Percentual</option>
                      <option value="fixed">Valor fixo (R$)</option>
                    </select>
                    <input
                      name="value"
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="Desconto"
                      required
                    />
                    <input
                      name="maxUses"
                      type="number"
                      min="1"
                      placeholder="Usos máx. (opcional)"
                    />
                    <input name="expiresOn" type="date" aria-label="Validade" />
                    <button className="button secondary" disabled={busy}>
                      Criar cupom
                    </button>
                  </form>
                  {(coupons[e.id] ?? []).map((coupon) => (
                    <div className="toolbar" key={coupon.id}>
                      <span>
                        <strong>{coupon.code}</strong> ·{" "}
                        {coupon.discount_kind === "percent"
                          ? `${coupon.value_cents}%`
                          : money(coupon.value_cents)}{" "}
                        · {coupon.used_count}
                        {coupon.max_uses ? `/${coupon.max_uses}` : ""}
                      </span>
                      {coupon.active && (
                        <button
                          className="text-button"
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/events/${e.id}/coupons/${coupon.id}`,
                                "PATCH",
                                { active: false },
                              );
                              await loadCoupons(e.id);
                            })
                          }
                        >
                          Desativar
                        </button>
                      )}
                    </div>
                  ))}
                </details>
              )}
              <details
                onToggle={(event) => {
                  if ((event.currentTarget as HTMLDetailsElement).open && !eventMedia[e.id])
                    void loadEventMedia(e.id).catch((err) => setError(err.message));
                }}
              >
                <summary className="button secondary">Mídia do evento</summary>
                <div className="media-event-list">
                  {!eventMedia[e.id] ? <p className="muted">Carregando mídia…</p> : null}
                  {eventMedia[e.id]?.map((item) => {
                    const url = String(item.source_url ?? "");
                    const embed = item.kind === "youtube"
                      ? url.replace("watch?v=", "embed/").replace("youtu.be/", "www.youtube.com/embed/")
                      : item.kind === "vimeo" ? url.replace("vimeo.com/", "player.vimeo.com/video/") : "";
                    return <article className="media-event-item" key={item.id}>
                      <strong>{item.title}</strong>
                      {item.description && <p>{item.description}</p>}
                      {embed ? <iframe title={item.title} src={embed} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen /> : item.kind === "photo" && url ? <img src={url} alt={item.alt_text || item.title} loading="lazy" /> : url ? <a href={url} target="_blank" rel="noreferrer">Abrir mídia</a> : null}
                    </article>;
                  })}
                  {eventMedia[e.id]?.length === 0 && <p className="muted">Nenhuma mídia publicada para este evento.</p>}
                </div>
              </details>
              {registrations[e.id]?.items?.map((r: RecordData) => (
                <div className="toolbar" key={r.id}>
                  <span>
                    {r.person_name ?? r.guest_name ?? r.guest_email} ·{" "}
                    {r.status}
                  </span>
                  {!r.person_id && data.canManage && (
                    <form
                      className="row-actions"
                      onSubmit={(event) => {
                        const b = formValues(event);
                        void run(async () => {
                          await api(
                            `/events/${e.id}/registrations/${r.id}/person`,
                            "PATCH",
                            { personId: b.personId },
                          );
                          await loadRegistrations(
                            e.id,
                            registrationPages[e.id] ?? 1,
                          );
                        });
                      }}
                    >
                      <select
                        name="personId"
                        required
                        aria-label={`Vincular ${r.guest_name ?? r.guest_email}`}
                      >
                        <option value="">Vincular ao cadastro…</option>
                        {people
                          .filter((person) => {
                            const query = String(
                              r.guest_email ?? r.guest_name ?? "",
                            ).toLowerCase();
                            return (
                              !query ||
                              `${person.name} ${person.email ?? ""} ${person.phone ?? ""}`
                                .toLowerCase()
                                .includes(query)
                            );
                          })
                          .slice(0, 25)
                          .map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name} · {person.email ?? "sem e-mail"}
                            </option>
                          ))}
                      </select>
                      <button
                        className="button secondary"
                        disabled={busy}
                        type="submit"
                      >
                        Vincular
                      </button>
                    </form>
                  )}
                  {r.person_id && r.status !== "attended" && data.canManage && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api(
                            `/events/${e.id}/registrations/${r.id}/attendance`,
                            "POST",
                            { attended: true },
                          ),
                        )
                      }
                    >
                      Confirmar presença
                    </button>
                  )}
                </div>
              ))}
              {registrations[e.id] && (
                <div className="toolbar">
                  <Field label="Situação dos inscritos">
                    <select
                      value={registrationStatus[e.id] ?? "all"}
                      onChange={(event) => {
                        const status = event.target.value;
                        setRegistrationStatus((current) => ({
                          ...current,
                          [e.id]: status,
                        }));
                        void loadRegistrations(e.id, 1, status);
                      }}
                    >
                      <option value="all">Todas</option>
                      <option value="registered">Confirmadas</option>
                      <option value="waitlisted">Lista de espera</option>
                      <option value="attended">Presentes</option>
                      <option value="cancelled">Canceladas</option>
                    </select>
                  </Field>
                  <span className="muted">
                    {registrations[e.id].total} inscrição(ões)
                  </span>
                  {data.canManage && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => {
                          const status = registrationStatus[e.id] ?? "all";
                          window.open(
                            `/api/events/${e.id}/registrations.csv?status=${status}`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }}
                      >
                        Exportar inscrições
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          window.open(
                            `/api/events/${e.id}/certificates.csv`,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      >
                        Exportar certificados
                      </button>
                    </>
                  )}
                  {(registrations[e.id].pages ?? 1) > 1 && (
                    <>
                      <button
                        className="button secondary"
                        disabled={(registrationPages[e.id] ?? 1) <= 1 || busy}
                        onClick={() =>
                          void loadRegistrations(
                            e.id,
                            (registrationPages[e.id] ?? 1) - 1,
                          )
                        }
                      >
                        Anterior
                      </button>
                      <span className="muted">
                        Página {registrations[e.id].page} de{" "}
                        {registrations[e.id].pages}
                      </span>
                      <button
                        className="button secondary"
                        disabled={
                          (registrationPages[e.id] ?? 1) >=
                            registrations[e.id].pages || busy
                        }
                        onClick={() =>
                          void loadRegistrations(
                            e.id,
                            (registrationPages[e.id] ?? 1) + 1,
                          )
                        }
                      >
                        Próxima
                      </button>
                    </>
                  )}
                </div>
              )}
              {eventCertificates[e.id]?.items?.length > 0 && (
                <details className="toolbar">
                  <summary>
                    Certificados emitidos ({eventCertificates[e.id].total})
                  </summary>
                  {eventCertificates[e.id].items.map(
                    (certificate: RecordData) => (
                      <p key={certificate.id}>
                        <strong>{certificate.recipient_name}</strong> ·{" "}
                        {certificate.code} · {shortDate(certificate.issued_at)}
                      </p>
                    ),
                  )}
                </details>
              )}
            </article>
          ))}
          {!data.events.items?.length && <p>Nenhum evento agendado.</p>}
          {(data.events.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação de eventos">
              <button
                className="button secondary"
                disabled={eventPage <= 1 || busy}
                onClick={() => setEventPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                {data.events.total} evento(s) · página {data.events.page} de{" "}
                {data.events.pages}
              </span>
              <button
                className="button secondary"
                disabled={eventPage >= data.events.pages || busy}
                onClick={() => setEventPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      {data && tab === "workflows" && workflowData && (
        <>
          <WorkflowForm busy={busy} run={run} />
          <WorkflowOperations
            busy={busy}
            run={run}
            data={workflowData}
            people={people}
            workflowStatus={workflowStatus}
            setWorkflowStatus={(value) => {
              setWorkflowStatus(value);
              setWorkflowPage(1);
            }}
            workflowDue={workflowDue}
            setWorkflowDue={(value) => {
              setWorkflowDue(value);
              setWorkflowPage(1);
            }}
            workflowPage={workflowPage}
            setWorkflowPage={setWorkflowPage}
          />
        </>
      )}
    </section>
  );
}

function WorkflowOperations({
  busy,
  run,
  data,
  people,
  workflowStatus,
  setWorkflowStatus,
  workflowDue,
  setWorkflowDue,
  workflowPage,
  setWorkflowPage,
}: {
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  data: RecordData;
  people: RecordData[];
  workflowStatus: string;
  setWorkflowStatus: (value: string) => void;
  workflowDue: string;
  setWorkflowDue: (value: string) => void;
  workflowPage: number;
  setWorkflowPage: (value: number) => void;
}) {
  const definitions = (data.definitions ?? []) as RecordData[];
  const steps = (data.steps ?? []) as RecordData[];
  const instancePage = data.instances ?? {
    items: [],
    total: 0,
    page: 1,
    pages: 1,
  };
  const instances = (instancePage.items ?? []) as RecordData[];
  const [history, setHistory] = useState<
    Record<
      string,
      {
        items: RecordData[];
        total: number;
        page: number;
        pageSize: number;
        pages: number;
      }
    >
  >({});
  const [editingDefinitionId, setEditingDefinitionId] = useState("");
  return (
    <section>
      <h3>Iniciar acompanhamento</h3>
      <form
        onSubmit={(e) => {
          const b = formValues(e);
          void run(() =>
            api(`/workflows/${b.definitionId}/start`, "POST", {
              personId: b.personId,
              ownerId: b.ownerId || undefined,
            }),
          );
        }}
      >
        <div className="grid-2">
          <Field label="Processo">
            <select name="definitionId" required>
              {definitions
                .filter((d) => d.active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Pessoa">
            <select name="personId" required>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select name="ownerId">
              <option value="">Eu mesmo</option>
              {people
                .filter((p) => p.user_id)
                .map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Submit busy={busy} label="Iniciar processo" />
      </form>
      <div className="toolbar" aria-label="Processos configurados">
        <span className="muted">Processos configurados</span>
        {definitions.map((definition) => (
          <span key={definition.id} className="toolbar">
            {editingDefinitionId === definition.id ? (
              <form
                className="row-actions"
                onSubmit={(event) => {
                  const b = formValues(event);
                  const steps = String(b.steps)
                    .split("\n")
                    .map((line) => {
                      const [title, dueDays = "0"] = line.split("|");
                      return {
                        title: title.trim(),
                        dueDays: Number(dueDays.trim()) || 0,
                      };
                    })
                    .filter((step) => step.title);
                  void run(async () => {
                    await api(`/workflows/${definition.id}`, "PUT", {
                      name: b.name,
                      trigger: b.trigger,
                      steps,
                    });
                    setEditingDefinitionId("");
                  });
                }}
              >
                <input
                  name="name"
                  defaultValue={definition.name}
                  aria-label="Nome do workflow"
                  required
                />
                <select
                  name="trigger"
                  defaultValue={definition.trigger}
                  aria-label="Disparo do workflow"
                >
                  <option value="manual">Manual</option>
                  <option value="visitor">Novo visitante</option>
                  <option value="event_registration">
                    Inscrição em evento
                  </option>
                  <option value="volunteer">Voluntariado</option>
                  <option value="baptism">Batismo</option>
                  <option value="transfer">Transferência</option>
                </select>
                <textarea
                  name="steps"
                  rows={3}
                  aria-label="Etapas do workflow"
                  defaultValue={steps
                    .filter((step) => step.definition_id === definition.id)
                    .sort((a, b) => Number(a.position) - Number(b.position))
                    .map((step) => `${step.title}|${step.due_days}`)
                    .join("\n")}
                />
                <button
                  type="submit"
                  className="button secondary"
                  disabled={busy}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditingDefinitionId("")}
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <span>
                  {definition.name} · {definition.active ? "ativo" : "pausado"}
                </span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditingDefinitionId(definition.id)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api(`/workflows/${definition.id}`, "PATCH", {
                        active: !definition.active,
                      }),
                    )
                  }
                >
                  {definition.active ? "Pausar" : "Ativar"}
                </button>
              </>
            )}
          </span>
        ))}
      </div>
      <h3>Processos em acompanhamento</h3>
      <div className="toolbar" aria-label="Filtros de processos">
        <Field label="Situação">
          <select
            value={workflowStatus}
            onChange={(event) => setWorkflowStatus(event.target.value)}
          >
            <option value="all">Todas</option>
            <option value="open">Em andamento</option>
            <option value="completed">Concluídos</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </Field>
        <Field label="Prazo">
          <select
            value={workflowDue}
            onChange={(event) => setWorkflowDue(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="overdue">Atrasados</option>
          </select>
        </Field>
        <span className="muted">{instancePage.total} processo(s)</span>
      </div>
      {!instances.length && <p>Nenhum processo iniciado.</p>}
      {instances.map((instance) => {
        const definitionSteps = steps
          .filter((step) => step.definition_id === instance.definition_id)
          .sort((a, b) => Number(a.position) - Number(b.position));
        const current = Number(instance.current_step ?? 0);
        const completed = instance.status !== "open";
        const isLast = current >= definitionSteps.length - 1;
        return (
          <article className="toolbar" key={instance.id}>
            <div>
              <strong>
                {instance.workflow_name} · {instance.person_name}
              </strong>
              <p>
                {completed
                  ? instance.status
                  : `Etapa ${current + 1} de ${definitionSteps.length}: ${definitionSteps[current]?.title ?? "Acompanhar"}`}
                {instance.owner_name
                  ? ` · responsável: ${instance.owner_name}`
                  : ""}
                {instance.due_on
                  ? ` · prazo ${shortDate(instance.due_on)}`
                  : ""}
              </p>
              {!completed && (
                <label className="field">
                  <span>Responsável</span>
                  <select
                    value={instance.owner_id ?? ""}
                    onChange={(event) =>
                      void run(() =>
                        api(`/workflow-instances/${instance.id}`, "PATCH", {
                          currentStep: current,
                          status: "open",
                          version: instance.version,
                          ownerId: event.target.value || null,
                          note: "Responsável reatribuído pela equipe.",
                        }),
                      )
                    }
                    disabled={busy}
                  >
                    {people
                      .filter((p) => p.user_id)
                      .map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  if (history[instance.id]) {
                    setHistory((current) => {
                      const next = { ...current };
                      delete next[instance.id];
                      return next;
                    });
                    return;
                  }
                  try {
                    const rows = await api<{
                      items: RecordData[];
                      total: number;
                      page: number;
                      pageSize: number;
                      pages: number;
                    }>(
                      `/workflow-instances/${instance.id}/history?page=1&pageSize=25`,
                    );
                    setHistory((current) => ({
                      ...current,
                      [instance.id]: rows,
                    }));
                  } catch (error) {
                    void run(async () => {
                      throw error;
                    });
                  }
                }}
              >
                {history[instance.id] ? "Ocultar histórico" : "Ver histórico"}
              </button>
              {history[instance.id]?.items.map((entry) => (
                <small key={entry.id}>
                  {entry.actor_name ?? "Sistema"} ·{" "}
                  {entry.note ?? "Atualização"} ·{" "}
                  {new Date(entry.created_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </small>
              ))}
              {history[instance.id]?.pages > 1 && (
                <div className="toolbar">
                  <button
                    className="button secondary"
                    disabled={history[instance.id].page <= 1}
                    onClick={async () => {
                      const next = history[instance.id].page - 1;
                      const rows = await api<{
                        items: RecordData[];
                        total: number;
                        page: number;
                        pageSize: number;
                        pages: number;
                      }>(
                        `/workflow-instances/${instance.id}/history?page=${next}&pageSize=25`,
                      );
                      setHistory((current) => ({
                        ...current,
                        [instance.id]: rows,
                      }));
                    }}
                  >
                    Anterior
                  </button>
                  <span className="muted">
                    Página {history[instance.id].page} de{" "}
                    {history[instance.id].pages}
                  </span>
                  <button
                    className="button secondary"
                    disabled={
                      history[instance.id].page >= history[instance.id].pages
                    }
                    onClick={async () => {
                      const next = history[instance.id].page + 1;
                      const rows = await api<{
                        items: RecordData[];
                        total: number;
                        page: number;
                        pageSize: number;
                        pages: number;
                      }>(
                        `/workflow-instances/${instance.id}/history?page=${next}&pageSize=25`,
                      );
                      setHistory((current) => ({
                        ...current,
                        [instance.id]: rows,
                      }));
                    }}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
            {!completed && (
              <>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api(`/workflow-instances/${instance.id}`, "PATCH", {
                        currentStep: isLast ? current : current + 1,
                        status: isLast ? "completed" : "open",
                        version: instance.version,
                        note: isLast
                          ? "Processo concluído pela equipe."
                          : undefined,
                      }),
                    )
                  }
                >
                  {isLast ? "Concluir" : "Avançar etapa"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Cancelar este acompanhamento?"))
                      return;
                    void run(() =>
                      api(`/workflow-instances/${instance.id}`, "PATCH", {
                        currentStep: current,
                        status: "cancelled",
                        version: instance.version,
                        note: "Processo cancelado pela equipe.",
                      }),
                    );
                  }}
                >
                  Cancelar
                </button>
              </>
            )}
          </article>
        );
      })}
      {(instancePage.pages ?? 1) > 1 && (
        <div className="toolbar">
          <button
            className="button secondary"
            disabled={workflowPage <= 1 || busy}
            onClick={() => setWorkflowPage(workflowPage - 1)}
          >
            Anterior
          </button>
          <span className="muted">
            Página {instancePage.page} de {instancePage.pages}
          </span>
          <button
            className="button secondary"
            disabled={workflowPage >= instancePage.pages || busy}
            onClick={() => setWorkflowPage(workflowPage + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
function WorkflowForm({
  busy,
  run,
}: {
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [preset, setPreset] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [stepsText, setStepsText] = useState("");
  const presets: Record<string, { trigger: string; steps: string }> = {
    visitor: {
      trigger: "visitor",
      steps:
        "Fazer primeiro contato|1\nAgendar conversa|7\nRegistrar próximo passo|14",
    },
    baptism: {
      trigger: "baptism",
      steps:
        "Confirmar interesse|1\nConcluir classe de batismo|30\nAgendar entrevista pastoral|45",
    },
    volunteer: {
      trigger: "volunteer",
      steps:
        "Receber pedido de serviço|1\nValidar disponibilidade|3\nConcluir integração|14",
    },
    transfer: {
      trigger: "transfer",
      steps:
        "Conferir solicitação|2\nContatar igreja de origem|7\nRegistrar decisão|14",
    },
  };
  return (
    <>
      <h3>Criar processo acompanhável</h3>
      <p className="muted">
        Use etapas para visitantes, batismo, voluntariado ou transferência. A
        pessoa continua no cadastro único.
      </p>
      <form
        onSubmit={(e) => {
          const b = formValues(e);
          const steps = String(b.steps)
            .split("\n")
            .map((line) => {
              const [title, dueDays = "0"] = line.split("|");
              return {
                title: title.trim(),
                dueDays: Number(dueDays.trim()) || 0,
              };
            })
            .filter((v) => v.title);
          void run(() =>
            api("/workflows", "POST", {
              name: b.name,
              trigger: b.trigger,
              steps,
            }),
          );
        }}
      >
        <Field label="Modelo inicial">
          <select
            value={preset}
            onChange={(event) => {
              const selected = presets[event.target.value];
              setPreset(event.target.value);
              if (selected) {
                setTrigger(selected.trigger);
                setStepsText(selected.steps);
              }
            }}
          >
            <option value="">Começar vazio</option>
            <option value="visitor">Acolhimento de visitante</option>
            <option value="baptism">Preparação para batismo</option>
            <option value="volunteer">Entrada de voluntário</option>
            <option value="transfer">Transferência entre igrejas</option>
          </select>
          <small className="muted">
            Você poderá editar as etapas antes de salvar.
          </small>
        </Field>
        <Field label="Nome do processo">
          <input name="name" minLength={2} required />
        </Field>
        <Field label="Disparo">
          <select
            name="trigger"
            value={trigger}
            onChange={(event) => setTrigger(event.target.value)}
          >
            <option value="manual">Manual</option>
            <option value="visitor">Novo visitante</option>
            <option value="event_registration">Inscrição em evento</option>
            <option value="volunteer">Voluntariado</option>
            <option value="baptism">Batismo</option>
            <option value="transfer">Transferência</option>
          </select>
        </Field>
        <Field label="Etapas, uma por linha">
          <textarea
            name="steps"
            rows={5}
            value={stepsText}
            onChange={(event) => setStepsText(event.target.value)}
            placeholder="Fazer primeiro contato|1\nAgendar conversa|7\nConcluir acompanhamento|14"
            required
          />
          <small className="muted">
            Use o formato <code>etapa|dias até o prazo</code>.
          </small>
        </Field>
        <Submit busy={busy} label="Criar workflow" />
      </form>
    </>
  );
}
