import { useEffect, useState, type FormEvent } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";

type Props = { church: string; revision: number; notify: (s: string) => void };
export default function CommunicationPage(props: Props) {
  const [data, setData] = useState<RecordData | null>(null),
    [campuses, setCampuses] = useState<RecordData[]>([]),
    [cells, setCells] = useState<RecordData[]>([]),
    [templates, setTemplates] = useState<RecordData[]>([]),
    [selectedTemplateId, setSelectedTemplateId] = useState(""),
    [savedViews, setSavedViews] = useState<RecordData[]>([]),
    [selectedViewId, setSelectedViewId] = useState(""),
    [preview, setPreview] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [failedPage, setFailedPage] = useState(1),
    [preferencePage, setPreferencePage] = useState(1);
  const load = () =>
    api(
      `/communication?page=${page}&pageSize=25&failedPage=${failedPage}&failedPageSize=25&preferencePage=${preferencePage}&preferencePageSize=25`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    setData(null);
    void Promise.all([
      load(),
      api("/campuses")
        .then(setCampuses)
        .catch(() => setCampuses([])),
      api("/cells")
        .then(setCells)
        .catch(() => setCells([])),
      api("/communication/templates")
        .then(setTemplates)
        .catch(() => setTemplates([])),
      api<RecordData[]>("/saved-views?kind=communication")
        .then(setSavedViews)
        .catch(() => setSavedViews([])),
    ]);
  }, [props.church, props.revision, page, failedPage, preferencePage]);
  async function send(e: FormEvent<HTMLFormElement>) {
    const b = formValues(e);
    setBusy(true);
    setError("");
    try {
      const r = await api("/communication/messages", "POST", {
        channel: b.channel,
        subject: b.subject,
        body: b.body,
        sendAt: b.sendAt ? new Date(b.sendAt).toISOString() : null,
        filter: {
          status: b.status,
          campusId: b.campusId || null,
          cellId: b.cellId || null,
          teamId: b.teamId || null,
        },
      });
      props.notify(`Mensagem criada para ${r.recipientCount} destinatários.`);
      setPage(1);
      await load();
      e.currentTarget.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function previewRecipients(form: HTMLFormElement) {
    const b = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      const result = await api<RecordData>("/communication/preview", "POST", {
        channel: b.channel,
        filter: {
          status: b.status,
          campusId: b.campusId || null,
          cellId: b.cellId || null,
          teamId: b.teamId || null,
        },
      });
      setPreview(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updatePreference(
    preference: RecordData,
    channel: "portal" | "email" | "sms",
  ) {
    setBusy(true);
    setError("");
    try {
      await api(`/communication/preferences/${preference.person_id}`, "PUT", {
        portalOptIn:
          channel === "portal"
            ? !preference.portal_opt_in
            : Boolean(preference.portal_opt_in),
        emailOptIn:
          channel === "email"
            ? !preference.email_opt_in
            : Boolean(preference.email_opt_in),
        smsOptIn:
          channel === "sms"
            ? !preference.sms_opt_in
            : Boolean(preference.sms_opt_in),
      });
      props.notify("Preferência atualizada.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Comunicação e preferências</h2>
      <p className="muted">
        Registre consentimento e mantenha o histórico de avisos da igreja.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h3>Novo aviso</h3>
      <form onSubmit={send}>
        <Field label="Modelo salvo">
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              const template = templates.find((v) => v.id === e.target.value);
              const form = e.currentTarget.form;
              if (!template || !form) return;
              (form.elements.namedItem("channel") as HTMLSelectElement).value =
                template.channel;
              (form.elements.namedItem("subject") as HTMLInputElement).value =
                template.subject;
              (form.elements.namedItem("body") as HTMLTextAreaElement).value =
                template.body;
              const filter = template.audience_filter ?? {};
              (form.elements.namedItem("status") as HTMLSelectElement).value =
                filter.status ?? "all";
              (form.elements.namedItem("campusId") as HTMLSelectElement).value =
                filter.campusId ?? "";
              (form.elements.namedItem("cellId") as HTMLSelectElement).value =
                filter.cellId ?? "";
              (form.elements.namedItem("teamId") as HTMLSelectElement).value =
                filter.teamId ?? "";
            }}
          >
            <option value="">Escolher modelo…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · {template.channel}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Audiência salva">
          <select
            value={selectedViewId}
            onChange={(e) => {
              setSelectedViewId(e.target.value);
              const view = savedViews.find((v) => v.id === e.target.value);
              const form = e.currentTarget.form;
              if (!view || !form) return;
              const filter = view.filters ?? {};
              for (const [name, value] of Object.entries({
                channel: filter.channel ?? "all",
                status: filter.status ?? "all",
                campusId: filter.campusId ?? "",
                cellId: filter.cellId ?? "",
                teamId: filter.teamId ?? "",
              })) {
                const field = form.elements.namedItem(name) as
                  HTMLInputElement | HTMLSelectElement | null;
                if (field) field.value = String(value ?? "");
              }
            }}
          >
            <option value="">Escolher audiência…</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Canal">
          <select name="channel">
            <option value="portal">Portal do membro</option>
            <option value="email">E-mail (fila)</option>
            <option value="sms">SMS (fila)</option>
          </select>
        </Field>
        <Field label="Agendar envio (opcional)">
          <input name="sendAt" type="datetime-local" />
          <small className="muted">
            Disponível para e-mail e SMS; avisos do portal são imediatos.
          </small>
        </Field>
        <Field label="Público">
          <select name="status">
            <option value="all">Toda a igreja autorizada</option>
            <option value="visitor">Visitantes</option>
            <option value="member">Membros</option>
            <option value="worker">Obreiros</option>
          </select>
        </Field>
        <Field label="Campus">
          <select name="campusId" defaultValue="">
            <option value="">Todos os campi autorizados</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grupo ou grupo">
          <select name="cellId" defaultValue="">
            <option value="">Todos os grupos</option>
            {cells.map((cell) => (
              <option key={cell.id} value={cell.id}>
                {cell.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ministério ou equipe">
          <select name="teamId" defaultValue="">
            <option value="">Todas as equipes</option>
            {(data?.teams ?? []).map((team: RecordData) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assunto">
          <input name="subject" minLength={2} maxLength={180} required />
        </Field>
        <Field label="Mensagem">
          <textarea
            name="body"
            rows={5}
            minLength={2}
            maxLength={10000}
            required
          />
        </Field>
        <div className="row-actions">
          <Submit busy={busy} label="Registrar aviso" />
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={(e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (form) void previewRecipients(form);
            }}
          >
            Pré-visualizar destinatários
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async (e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (!form) return;
              const b = Object.fromEntries(new FormData(form)) as Record<
                string,
                string
              >;
              const name = window.prompt("Nome do modelo:");
              if (!name?.trim()) return;
              setBusy(true);
              try {
                await api("/communication/templates", "POST", {
                  name: name.trim(),
                  channel: b.channel,
                  subject: b.subject,
                  body: b.body,
                  audienceFilter: {
                    status: b.status,
                    campusId: b.campusId || null,
                    cellId: b.cellId || null,
                    teamId: b.teamId || null,
                  },
                });
                props.notify("Modelo salvo.");
                setTemplates(await api("/communication/templates"));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar modelo
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async (e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (!form) return;
              const b = Object.fromEntries(new FormData(form)) as Record<
                string,
                string
              >;
              const name = window.prompt("Nome da audiência:");
              if (!name?.trim()) return;
              setBusy(true);
              try {
                const view = await api<RecordData>("/saved-views", "POST", {
                  name: name.trim(),
                  kind: "communication",
                  shared: true,
                  filters: {
                    channel: b.channel,
                    status: b.status,
                    campusId: b.campusId || null,
                    cellId: b.cellId || null,
                    teamId: b.teamId || null,
                  },
                });
                setSavedViews(
                  await api<RecordData[]>("/saved-views?kind=communication"),
                );
                setSelectedViewId(view.id);
                props.notify("Audiência salva para a equipe.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar audiência
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !selectedViewId}
            onClick={async (e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (!form || !selectedViewId) return;
              const current = savedViews.find((v) => v.id === selectedViewId);
              if (!current) return;
              const b = Object.fromEntries(new FormData(form)) as Record<
                string,
                string
              >;
              setBusy(true);
              try {
                await api(`/saved-views/${selectedViewId}`, "PATCH", {
                  name: current.name,
                  shared: Boolean(current.shared),
                  filters: {
                    channel: b.channel,
                    status: b.status,
                    campusId: b.campusId || null,
                    cellId: b.cellId || null,
                    teamId: b.teamId || null,
                  },
                });
                setSavedViews(
                  await api<RecordData[]>("/saved-views?kind=communication"),
                );
                props.notify("Audiência atualizada.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Atualizar audiência
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !selectedViewId}
            onClick={async () => {
              const current = savedViews.find((v) => v.id === selectedViewId);
              if (
                !current ||
                !window.confirm(`Excluir a audiência “${current.name}”?`)
              )
                return;
              setBusy(true);
              try {
                await api(`/saved-views/${selectedViewId}`, "DELETE");
                setSelectedViewId("");
                setSavedViews(
                  await api<RecordData[]>("/saved-views?kind=communication"),
                );
                props.notify("Audiência excluída.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Excluir audiência
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !selectedTemplateId}
            onClick={async (e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (!form || !selectedTemplateId) return;
              const b = Object.fromEntries(new FormData(form)) as Record<
                string,
                string
              >;
              const template = templates.find(
                (v) => v.id === selectedTemplateId,
              );
              if (!template) return;
              setBusy(true);
              try {
                await api(
                  `/communication/templates/${selectedTemplateId}`,
                  "PATCH",
                  {
                    name: template.name,
                    channel: b.channel,
                    subject: b.subject,
                    body: b.body,
                    audienceFilter: {
                      status: b.status,
                      campusId: b.campusId || null,
                      cellId: b.cellId || null,
                      teamId: b.teamId || null,
                    },
                  },
                );
                props.notify("Modelo atualizado.");
                setTemplates(await api("/communication/templates"));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Atualizar modelo
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !selectedTemplateId}
            onClick={async () => {
              const template = templates.find(
                (v) => v.id === selectedTemplateId,
              );
              if (
                !template ||
                !window.confirm(`Excluir o modelo “${template.name}”?`)
              )
                return;
              setBusy(true);
              try {
                await api(
                  `/communication/templates/${selectedTemplateId}`,
                  "DELETE",
                );
                setSelectedTemplateId("");
                props.notify("Modelo excluído.");
                setTemplates(await api("/communication/templates"));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Excluir modelo
          </button>
        </div>
      </form>
      {preview && (
        <p className="panel-footnote" role="status">
          Prévia: <strong>{preview.recipientCount}</strong> destinatário(s) com
          consentimento.{" "}
          {preview.sample?.length
            ? `Exemplos: ${preview.sample.map((v: RecordData) => v.name).join(", ")}${preview.truncated ? "…" : ""}.`
            : "Nenhum destinatário atende aos filtros."}
        </p>
      )}
      {!!templates.length && (
        <p className="panel-footnote">
          Modelos são exclusivos desta igreja e podem ser removidos pela equipe
          autorizada.
        </p>
      )}
      <h3>Preferências de recebimento</h3>
      {data?.preferences?.map((preference: RecordData) => (
        <article className="toolbar" key={preference.person_id}>
          <div>
            <strong>{preference.name}</strong>
            <p>
              {preference.email || preference.phone || "Sem contato cadastrado"}
            </p>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void updatePreference(preference, "portal")}
            >
              Portal: {preference.portal_opt_in ? "sim" : "não"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void updatePreference(preference, "email")}
            >
              E-mail: {preference.email_opt_in ? "sim" : "não"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void updatePreference(preference, "sms")}
            >
              SMS: {preference.sms_opt_in ? "sim" : "não"}
            </button>
          </div>
        </article>
      ))}
      {(data?.preferencePagination?.pages ?? 1) > 1 && (
        <div className="toolbar" aria-label="Paginação de preferências">
          <button
            className="button secondary"
            disabled={preferencePage <= 1 || busy}
            onClick={() => setPreferencePage((v) => v - 1)}
          >
            Anterior
          </button>
          <span className="muted">
            Preferências · página {data?.preferencePagination?.page} de{" "}
            {data?.preferencePagination?.pages} ·{" "}
            {data?.preferencePagination?.total} pessoas
          </span>
          <button
            className="button secondary"
            disabled={
              preferencePage >= data!.preferencePagination.pages || busy
            }
            onClick={() => setPreferencePage((v) => v + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      <div className="toolbar">
        <h3>Histórico</h3>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              const response = await fetch("/api/communication/export.csv", {
                headers: { "x-church-id": props.church },
              });
              if (!response.ok) throw new Error("Exportação indisponível.");
              const url = URL.createObjectURL(await response.blob());
              const link = document.createElement("a");
              link.href = url;
              link.download = "comunicacao.csv";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Exportar CSV
        </button>
      </div>
      {data?.messages?.map((m: RecordData) => (
        <article className="toolbar" key={m.id}>
          <div>
            <strong>{m.subject}</strong>
            <p>
              {m.channel} · {m.status} · {m.sent_count}/{m.deliveries} entregas
              {m.send_at
                ? ` · agendado para ${shortDate(m.send_at)}`
                : ""}· {shortDate(m.created_at)}
            </p>
          </div>
          {m.status === "queued" && m.send_at && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("Cancelar este aviso agendado?")) return;
                setBusy(true);
                try {
                  await api(
                    `/communication/messages/${m.id}/cancel`,
                    "POST",
                    {},
                  );
                  props.notify("Aviso agendado cancelado.");
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancelar envio
            </button>
          )}
        </article>
      ))}
      {!data?.messages?.length && <p>Nenhuma mensagem registrada.</p>}
      {(data?.messagePagination?.pages ?? 1) > 1 && (
        <div className="toolbar">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Anterior
          </button>
          <span className="muted">
            Página {data?.messagePagination?.page ?? page} de{" "}
            {data?.messagePagination?.pages}
          </span>
          <button
            className="button secondary"
            disabled={page >= (data?.messagePagination?.pages ?? 1)}
            onClick={() => setPage((v) => v + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      {!!data?.failedDeliveries?.length && (
        <>
          <h3>Entregas com falha</h3>
          {data.failedDeliveries.map((delivery: RecordData) => (
            <article className="toolbar" key={delivery.id}>
              <div>
                <strong>{delivery.subject}</strong>
                <p>
                  {delivery.name} · {delivery.channel} · tentativa{" "}
                  {delivery.attempts}
                </p>
                {delivery.last_error && <small>{delivery.last_error}</small>}
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(
                      `/communication/deliveries/${delivery.id}/retry`,
                      "POST",
                      {},
                    );
                    props.notify("Entrega recolocada na fila.");
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Repetir
              </button>
            </article>
          ))}
          {(data.failedDeliveriesPagination?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={failedPage <= 1 || busy}
                onClick={() => setFailedPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {data.failedDeliveriesPagination.page} de{" "}
                {data.failedDeliveriesPagination.pages}
              </span>
              <button
                className="button secondary"
                disabled={
                  failedPage >= data.failedDeliveriesPagination.pages || busy
                }
                onClick={() => setFailedPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      <p className="panel-footnote">
        E-mail e SMS permanecem em fila até um provedor ser configurado e
        confirmar a entrega. Avisos do portal são disponibilizados internamente.
      </p>
    </section>
  );
}
