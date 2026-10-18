import { useEffect, useState, useRef } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Badge, Empty, Field, Icon, Modal, Submit, formValues } from "./ui";
import MemberForm from "./MemberForm";
import type { PageProps } from "./pages";
import "./registration.css";
import { defaultAdministration } from "../shared/registration";
export default function RegistrationManager(
  props: PageProps & { directory: RecordData | null; onChange: () => void },
) {
  const [config, setConfig] = useState<RecordData | null>(null),
    [links, setLinks] = useState<RecordData[]>([]),
    [submissions, setSubmissions] = useState<RecordData[]>([]),
    [view, setView] = useState<"pending" | "links">("pending"),
    [expanded, setExpanded] = useState(false),
    [linkModal, setLinkModal] = useState(false),
    [review, setReview] = useState<RecordData | null>(null),
    [target, setTarget] = useState("new"),
    [targetVersion, setTargetVersion] = useState<number | undefined>(),
    [busy, setBusy] = useState(false),
    [localRevision, setLocalRevision] = useState(0),
    [error, setError] = useState("");
  const reviewRequest = useRef(0);
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("all"),
    [pagination, setPagination] = useState({
      total: 0,
      pending: 0,
      filtered: 0,
      page: 1,
      pages: 1,
    }),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    setReview(null);
    setPage(1);
    return () => {
      reviewRequest.current++;
    };
  }, [props.church]);
  const closeReview = () => {
    reviewRequest.current++;
    setReview(null);
  };
  const reload = () => {
    setLocalRevision((n) => n + 1);
    props.onChange();
  };
  useEffect(() => {
    let active = true;
    setConfig(null);
    setError("");
    setLoading(true);
    setSubmissions([]);
    api("/registration/config")
      .then(async (c) => {
        if (!active) return;
        setConfig(c);
        if (c.canManage) {
          const [l, s] = await Promise.all([
            api("/registration/links"),
            api(`/registration/submissions?page=${page}&status=${status}`),
          ]);
          if (active) {
            setLinks(l);
            setSubmissions(s.items);
            setPagination(s);
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.church, props.revision, localRevision, page, status]);
  async function openReview(id: string) {
    const request = ++reviewRequest.current;
    try {
      const r = await api("/registration/submissions/" + id);
      if (request !== reviewRequest.current) return;
      setTarget(r.candidates.length ? "" : "new");
      setTargetVersion(undefined);
      setReview({ ...r, submittedPhotoDataUrl: r.photoDataUrl });
    } catch (e) {
      if (request !== reviewRequest.current) return;
      props.notify((e as Error).message);
    }
  }
  if (!config?.canManage) return null;
  const pending = pagination.pending;
  return (
    <section className="panel registration-manager">
      <div className="registration-manager-heading">
        <span className="stat-icon purple">
          <Icon name="people" size={22} />
        </span>
        <div>
          <h2>Ficha de cadastro de membros</h2>
          <p>
            Modelo baseado no PDF · com foto e congregação preenchida
            manualmente.
          </p>
        </div>
        <Badge tone={pending ? "amber" : "muted"}>
          {pending} para conferir
        </Badge>
        <button
          className="button secondary"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Recolher" : "Fichas e link"}
          <Icon name="arrow" size={16} />
        </button>
      </div>
      {expanded && (
        <>
          <div className="tabs" role="group" aria-label="Cadastros online">
            <button
              className={view === "pending" ? "active" : ""}
              onClick={() => setView("pending")}
            >
              Fichas recebidas ({pending})
            </button>
            <button
              className={view === "links" ? "active" : ""}
              onClick={() => setView("links")}
            >
              Link da ficha
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {view === "links" ? (
            <>
              <div className="registration-local-note">
                <Icon name="globe" size={19} />
                <p>
                  A publicação foi deixada para depois. O link gerado agora abre
                  a ficha neste computador; ele ainda não é um endereço público
                  para redes sociais.
                </p>
              </div>
              <div className="toolbar">
                <span className="muted">
                  A mesma ficha pode ser preenchida online ou pela secretaria.
                </span>
                <button
                  className="button primary"
                  onClick={() => setLinkModal(true)}
                >
                  <Icon name="plus" size={16} />
                  Gerar link de prévia
                </button>
              </div>
              {links.map((l) => (
                <article className="registration-link-row" key={l.id}>
                  <div>
                    <strong>{l.title}</strong>
                    <span>
                      <Badge
                        tone={
                          l.active && new Date(l.expiresAt) > new Date()
                            ? "green"
                            : "muted"
                        }
                      >
                        {!l.active
                          ? "Desativado"
                          : new Date(l.expiresAt) < new Date()
                            ? "Expirado"
                            : "Ativo"}
                      </Badge>{" "}
                      Até {shortDate(l.expiresAt)} · Foto{" "}
                      {l.photoRequired ? "obrigatória" : "opcional"}
                    </span>
                    <input
                      readOnly
                      aria-label={`Endereço da ficha ${l.title}`}
                      value={l.url}
                    />
                  </div>
                  <div className="row-actions">
                    <a
                      className="button secondary"
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir ficha
                    </a>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(l.url);
                          props.notify("Link local de prévia copiado.");
                        } catch {
                          props.notify(
                            "Selecione o endereço para copiar manualmente.",
                          );
                        }
                      }}
                    >
                      Copiar
                    </button>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          if (navigator.share) {
                            await navigator.share({
                              title: l.title,
                              text: "Preencha sua ficha de cadastro da igreja.",
                              url: l.url,
                            });
                            props.notify("Menu de compartilhamento aberto.");
                          } else {
                            await navigator.clipboard.writeText(l.url);
                            props.notify("Link copiado para compartilhar.");
                          }
                        } catch (e) {
                          if ((e as DOMException).name !== "AbortError")
                            props.notify(
                              "Não foi possível compartilhar o link.",
                            );
                        }
                      }}
                    >
                      Compartilhar
                    </button>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await api("/registration/links/" + l.id, "PATCH", {
                            active: !l.active,
                          });
                          reload();
                          props.notify(
                            l.active ? "Link desativado." : "Link reativado.",
                          );
                        } catch (e) {
                          props.notify((e as Error).message);
                        }
                      }}
                    >
                      {l.active ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                </article>
              ))}
              {!links.length && (
                <Empty>
                  Gere uma prévia para conferir o formulário. A publicação
                  pública será feita depois.
                </Empty>
              )}
            </>
          ) : (
            <>
              <div className="toolbar">
                <Field label="Situação da ficha">
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">Todas</option>
                    <option value="pending">A conferir</option>
                    <option value="approved">Aprovadas</option>
                    <option value="rejected">Não aprovadas</option>
                  </select>
                </Field>
                <span aria-live="polite">
                  {loading
                    ? "Carregando fichas…"
                    : `${pagination.filtered} fichas · ${pending} pendentes no total`}
                </span>
              </div>
              {!submissions.length && !loading ? (
                <Empty>
                  As fichas enviadas pelo formulário aparecerão aqui para
                  conferência.
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Igreja / congregação informada</th>
                        <th>Recebida em</th>
                        <th>Situação</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <strong>{v.name}</strong>
                            {v.hasPhoto && (
                              <small className="block">Com foto</small>
                            )}
                          </td>
                          <td>{v.congregation || "Não informada"}</td>
                          <td>{shortDate(v.createdAt)}</td>
                          <td>
                            <Badge
                              tone={
                                v.status === "pending"
                                  ? "amber"
                                  : v.status === "approved"
                                    ? "green"
                                    : "muted"
                              }
                            >
                              {
                                (
                                  {
                                    pending: "A conferir",
                                    approved: "Aprovada",
                                    rejected: "Não aprovada",
                                  } as RecordData
                                )[v.status]
                              }
                            </Badge>
                          </td>
                          <td>
                            {v.status === "pending" && (
                              <button
                                className="text-button"
                                onClick={() => void openReview(v.id)}
                              >
                                Conferir ficha <Icon name="arrow" size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <nav className="toolbar" aria-label="Páginas de fichas recebidas">
                <button
                  className="button secondary"
                  disabled={loading || pagination.page <= 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  Anterior
                </button>
                <span aria-live="polite">
                  Página {pagination.page} de {pagination.pages}
                </span>
                <button
                  className="button secondary"
                  disabled={loading || pagination.page >= pagination.pages}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  Próxima
                </button>
              </nav>
            </>
          )}
        </>
      )}
      {linkModal && (
        <Modal
          title="Preparar link da ficha"
          onClose={() => setLinkModal(false)}
        >
          <form
            onSubmit={async (event) => {
              const values = formValues(event);
              setBusy(true);
              try {
                await api("/registration/links", "POST", {
                  title: values.title,
                  days: Number(values.days),
                  photoRequired: values.photoRequired === "on",
                  campusId: values.campusId || null,
                });
                setLinkModal(false);
                setView("links");
                reload();
                props.notify(
                  "Prévia da ficha criada. A publicação será configurada depois.",
                );
              } catch (e) {
                props.notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Título da ficha">
              <input
                name="title"
                defaultValue="Ficha de cadastro de membros"
                minLength={3}
                maxLength={150}
                required
              />
            </Field>
            <Field label="Validade do link em dias">
              <input
                name="days"
                type="number"
                min={1}
                max={365}
                defaultValue={90}
                required
              />
            </Field>
            <Field label="Campus administrativo">
              <select
                name="campusId"
                defaultValue={config.defaultCampusId ?? ""}
              >
                <option value="">Igreja / sem campus específico</option>
                {props.directory?.campuses?.map((c: RecordData) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="member-checkbox">
              <input name="photoRequired" type="checkbox" />
              <span>Exigir foto no cadastro online</span>
            </label>
            <p className="panel-footnote">
              A pessoa informará sua congregação em um campo de texto. Esse
              texto não altera a igreja responsável por receber a ficha.
            </p>
            <Submit busy={busy} label="Gerar prévia da ficha" />
          </form>
        </Modal>
      )}
      {review && (
        <Modal title="Conferir cadastro recebido" onClose={closeReview}>
          <MemberForm
            key={`${review.id}:${target}:${targetVersion ?? "new"}`}
            initial={review}
            directory={props.directory}
            disabled={
              !target || (target !== "new" && targetVersion === undefined)
            }
            submitLabel={
              target === "new"
                ? "Aprovar e cadastrar membro"
                : "Aprovar e atualizar perfil"
            }
            extra={
              <div className="registration-review-tools">
                <Badge tone="amber">AGUARDANDO CONFERÊNCIA</Badge>
                <p>
                  Confira os dados antes de aprovar. A foto e as informações não
                  foram publicadas.
                </p>
                <Field label="Destino desta ficha">
                  <select
                    required
                    value={target}
                    onChange={async (e) => {
                      const id = e.target.value;
                      const request = ++reviewRequest.current;
                      setTarget(id);
                      setTargetVersion(undefined);
                      if (id && id !== "new")
                        try {
                          const p = await api("/people/" + id + "/profile");
                          if (request !== reviewRequest.current) return;
                          setReview((old: RecordData | null) =>
                            old
                              ? {
                                  ...old,
                                  administration: p.administration,
                                  householdId: p.householdId,
                                  campusId: p.campusId,
                                  photoDataUrl:
                                    old.submittedPhotoDataUrl ?? p.photoDataUrl,
                                }
                              : null,
                          );
                          setTargetVersion(p.version);
                        } catch (e) {
                          if (request !== reviewRequest.current) return;
                          props.notify((e as Error).message);
                          setTarget("");
                        }
                      else if (id === "new")
                        setReview((old: RecordData | null) =>
                          old
                            ? {
                                ...old,
                                administration: defaultAdministration(),
                                householdId: null,
                                campusId: old.submissionCampusId,
                                photoDataUrl: old.submittedPhotoDataUrl,
                              }
                            : null,
                        );
                    }}
                  >
                    <option value="">Escolha como registrar</option>
                    <option value="new">Criar um novo membro</option>
                    {review.candidates.map((p: RecordData) => (
                      <option key={p.id} value={p.id}>
                        Atualizar cadastro existente: {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {review.candidates.length > 0 && (
                  <p className="registration-duplicate-note">
                    Encontramos possível cadastro anterior pelo nome ou contato.
                    Escolha conscientemente entre criar um novo registro e
                    atualizar o existente.
                  </p>
                )}
                {target !== "new" && target && (
                  <p className="registration-duplicate-note">
                    A aprovação substituirá os dados gerais do perfil escolhido
                    pelas informações desta ficha. Confira todos os campos.
                  </p>
                )}
                <button
                  className="text-button"
                  type="button"
                  onClick={async () => {
                    const reason = window.prompt(
                      "Motivo para não aprovar esta ficha:",
                    );
                    if (!reason) return;
                    try {
                      await api(
                        "/registration/submissions/" + review.id + "/reject",
                        "POST",
                        { reason },
                      );
                      setReview(null);
                      reload();
                      props.notify("Ficha analisada e não aprovada.");
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Não aprovar esta ficha
                </button>
              </div>
            }
            onSave={async (body) => {
              await api(
                "/registration/submissions/" + review.id + "/approve",
                "POST",
                {
                  ...body,
                  ...(target !== "new"
                    ? { targetPersonId: target, version: targetVersion }
                    : { version: 0 }),
                },
              );
              setReview(null);
              reload();
              props.notify(
                "Ficha aprovada. O perfil está disponível para edição na secretaria.",
              );
            }}
          />
        </Modal>
      )}
    </section>
  );
}
