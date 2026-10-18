import { useEffect, useState, type FormEvent } from "react";
import { api, type RecordData, shortDate } from "./api";
import { Field, Submit, formValues, Empty } from "./ui";
import type { PageProps } from "./pages";

const actions = [
  "people.read",
  "people.write",
  "cells.read",
  "cells.write",
  "finance.read",
  "finance.write",
  "pastoral.read",
  "pastoral.write",
];
const actionNames: Record<string, string> = {
  "people.read": "Consultar pessoas",
  "people.write": "Editar pessoas",
  "cells.read": "Consultar grupos",
  "cells.write": "Operar grupos",
  "finance.read": "Consultar tesouraria",
  "finance.write": "Operar tesouraria",
  "pastoral.read": "Consultar pedidos pastorais",
  "pastoral.write": "Registrar notas pastorais",
};
export default function OperationsPage(
  props: PageProps & { current: RecordData },
) {
  const admin = props.current.role === "admin",
    secretary = admin || props.current.permissions?.peopleWrite;
  const [tab, setTab] = useState("account"),
    [data, setData] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [privateLink, setPrivateLink] = useState(""),
    [setup, setSetup] = useState<RecordData | null>(null),
    [backup, setBackup] = useState<string[]>([]),
    [transferHistory, setTransferHistory] = useState<Record<string, { items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>>({}),
    [privacyPage, setPrivacyPage] = useState(1),
    [privacyStatus, setPrivacyStatus] = useState("all"),
    [groupInterestStatus, setGroupInterestStatus] = useState("all"),
    [accessHistoryPage, setAccessHistoryPage] = useState(1);
  const refresh = () => {
    setRevision((v) => v + 1);
    props.refresh();
  };
  const tabs = [
    { id: "account", label: "Minha conta" },
    ...(admin
      ? [
          { id: "access", label: "Acessos e convites" },
          { id: "privacy", label: "Privacidade" },
          { id: "transfers", label: "Transferências" },
        ]
      : []),
    ...(secretary ? [{ id: "documents", label: "Documentos" }, { id: "groups", label: "Interesses em grupos" }] : []),
    ...(props.current.permissions?.pastoralRead
      ? [{ id: "care", label: "Pedidos pastorais" }]
      : []),
  ];
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const paths: Record<string, string[]> = {
      access: [`/access?page=${accessHistoryPage}&pageSize=25`, "/cells"],
      privacy: ["/privacy/admin", "/memberships", "/privacy/retention"],
      documents: ["/documents?page=1&pageSize=25", "/people"],
      groups: ["/group-interests?page=1&pageSize=25"],
      transfers: ["/transfers", "/people", "/transfer-destinations"],
      care: ["/prayers"],
    };
    const urls = paths[tab];
    if (tab === "privacy" && urls) urls[0] = `/privacy/admin?page=${privacyPage}&pageSize=25&status=${privacyStatus}`;
    if (tab === "groups" && urls) urls[0] = `/group-interests?page=1&pageSize=25&status=${groupInterestStatus}`;
    if (urls)
      Promise.all(urls.map((url) => api(url)))
        .then((rows) => {
          if (active)
            setData({ rows: rows[0], extra: rows[1], destinations: rows[2], people: rows[1], retention: rows[2] });
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [props.church, props.revision, revision, tab, privacyPage, privacyStatus, groupInterestStatus, accessHistoryPage]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh();
      props.notify("Operação concluída.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string, name: string) {
    const r = await fetch(`/api/documents/${id}`, {
      headers: { "x-church-id": props.church },
    });
    if (!r.ok) throw new Error("Documento indisponível.");
    const url = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Secretaria, acesso e operação</h2>
      <div className="tabs" role="group" aria-label="Operações administrativas">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => {
              setTab(t.id);
              setPrivateLink("");
            }}
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
      {privateLink && (
        <Field label="Endereço privado · entregue somente à pessoa identificada">
          <input readOnly value={privateLink} />
        </Field>
      )}
      {tab === "account" && (
        <>
          <h3>Trocar senha</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(async () => {
                await api("/account/password", "POST", b);
                window.location.assign("/");
              });
            }}
          >
            <Field label="Senha atual">
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nova senha · mínimo de 14 caracteres">
              <input
                name="password"
                type="password"
                minLength={14}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </Field>
            <Submit busy={busy} label="Trocar senha e sair" />
          </form>
          <h3>Autenticador e recuperação</h3>
          {!setup ? (
            <form
              onSubmit={(e) => {
                const b = formValues(e);
                void run(async () =>
                  setSetup(await api("/account/mfa/setup", "POST", b)),
                );
              }}
            >
              <Field label="Confirme sua senha para configurar o autenticador">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Submit busy={busy} label="Preparar novo autenticador" />
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                const b = formValues(e);
                void run(async () => {
                  const v = await api("/auth/mfa-confirm", "POST", {
                    challenge: setup.challenge,
                    code: b.code,
                  });
                  setBackup(v.backupCodes);
                  setSetup(null);
                });
              }}
            >
              <p>
                Cadastre esta chave no autenticador e confirme o código. A
                confirmação encerrará suas sessões.
              </p>
              <code style={{ overflowWrap: "anywhere" }}>{setup.secret}</code>
              <Field label="Código do novo autenticador">
                <input
                  name="code"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                />
              </Field>
              <Submit busy={busy} label="Confirmar autenticador" />
            </form>
          )}
          {backup.length > 0 && (
            <>
              <p>
                Guarde os códigos abaixo em local seguro. Cada um só pode ser
                usado uma vez. Depois entre novamente.
              </p>
              <pre style={{ whiteSpace: "pre-wrap" }}>{backup.join("\n")}</pre>
              <a href="/">Entrar novamente</a>
            </>
          )}
          <p>
            <a href="/recuperar-autenticador">
              Recuperar com senha e código de segurança
            </a>
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/account/revoke-sessions", "POST");
                window.location.assign("/");
              })
            }
          >
            Encerrar todas as minhas sessões
          </button>
        </>
      )}
      {tab !== "account" && !data && !error && <p role="status">Carregando…</p>}
      {tab === "access" && data && (
        <>
          <h3>Convidar pessoa</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(async () => {
                const v = await api("/access/invites", "POST", b);
                setPrivateLink(v.url);
              });
            }}
          >
            <Field label="Nome">
              <input name="name" minLength={2} maxLength={120} required />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" required />
            </Field>
            <Field label="Função">
              <select name="role">
                <option value="member">Membro</option>
                <option value="secretary">Secretaria</option>
                <option value="treasurer">Tesouraria</option>
                <option value="leader">Liderança</option>
                <option value="admin">Administração</option>
              </select>
            </Field>
            <Submit busy={busy} label="Gerar convite privado" />
          </form>
          <p>
            O convite vale por 48 horas. O titular confirma senha e autenticador
            antes de receber acesso.
          </p>
          {data.rows.invites.map((i: RecordData) => (
            <div className="toolbar" key={i.id}>
              <span>
                {i.name} · {i.email} ·{" "}
                {i.accepted_at
                  ? "Aceito"
                  : i.revoked_at
                    ? "Revogado"
                    : `Até ${shortDate(i.expires_at)}`}
              </span>
              {!i.accepted_at && !i.revoked_at && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(`/access/invites/${i.id}`, "DELETE"))
                  }
                >
                  Revogar convite
                </button>
              )}
            </div>
          ))}
          <h3>Permissões por ação</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() =>
                api(`/access/permissions/${b.user}`, "PUT", {
                  action: b.action,
                  allowed: b.allowed === "default" ? null : b.allowed === "yes",
                }),
              );
            }}
          >
            <Field label="Pessoa">
              <select name="user" required>
                {data.rows.users.map((u: RecordData) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ação">
              <select name="action">
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {actionNames[a]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decisão">
              <select name="allowed">
                <option value="default">Usar padrão da função</option>
                <option value="yes">Permitir</option>
                <option value="no">Negar</option>
              </select>
            </Field>
            <Submit busy={busy} label="Aplicar permissão" />
          </form>
          {data.rows.permissions.map((p: RecordData) => (
            <p key={p.user_id + p.action}>
              {
                data.rows.users.find((u: RecordData) => u.id === p.user_id)
                  ?.name
              }{" "}
              · {actionNames[p.action]}: {p.allowed ? "Permitido" : "Negado"}
            </p>
          ))}
          <h3>Atribuição de grupos</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() =>
                api(`/access/cells/${b.cell}/${b.user}`, "PUT", {
                  responsibility: b.responsibility || null,
                }),
              );
            }}
          >
            <Field label="Líder">
              <select name="user" required>
                {data.rows.users
                  .filter((u: RecordData) => u.role === "leader")
                  .map((u: RecordData) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Grupo">
              <select name="cell" required>
                {data.extra.map((c: RecordData) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsabilidade">
              <select name="responsibility">
                <option value="leader">Líder</option>
                <option value="supervisor">Supervisor</option>
                <option value="">Remover atribuição</option>
              </select>
            </Field>
            <Submit busy={busy} label="Atualizar atribuição" />
          </form>
          {data.rows.assignments.map((a: RecordData) => (
            <p key={a.cell_id + a.user_id}>
              {
                data.rows.users.find((u: RecordData) => u.id === a.user_id)
                  ?.name
              }{" "}
              · {data.extra.find((c: RecordData) => c.id === a.cell_id)?.name} ·{" "}
              {a.responsibility}
            </p>
          ))}
          <h3>Histórico de segurança</h3>
          {!data.rows.history?.length && <p className="muted">Nenhuma alteração registrada.</p>}
          {data.rows.history?.map((entry: RecordData) => (
            <p key={entry.id}>
              <strong>{entry.actor_name}</strong> · {new Date(entry.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              <br />
              <small>{entry.action} · {entry.scope} · {entry.reason}</small>
            </p>
          ))}
          {(data.rows.historyPagination?.pages ?? 1) > 1 && <div className="toolbar" aria-label="Paginação do histórico de segurança"><button className="button secondary" disabled={accessHistoryPage <= 1 || busy} onClick={() => setAccessHistoryPage((v) => v - 1)}>Anterior</button><span className="muted">Histórico · página {data.rows.historyPagination.page} de {data.rows.historyPagination.pages} · {data.rows.historyPagination.total} registros</span><button className="button secondary" disabled={accessHistoryPage >= data.rows.historyPagination.pages || busy} onClick={() => setAccessHistoryPage((v) => v + 1)}>Próxima</button></div>}
          <h3>Desligamento e recuperação</h3>
          {data.rows.users.map((u: RecordData) => (
            <div className="toolbar" key={u.id}>
              <span>
                {u.name} · {u.email}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remover o vínculo de ${u.name} com esta igreja?`,
                    )
                  )
                    void run(() => api(`/access/users/${u.id}`, "DELETE"));
                }}
              >
                Remover vínculo
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt(
                    "Confirme a identidade do titular por canal privado e registre o motivo da recuperação:",
                  );
                  if (reason)
                    void run(async () => {
                      const v = await api("/access/recovery", "POST", {
                        userId: u.id,
                        reason,
                      });
                      setPrivateLink(v.url);
                    });
                }}
              >
                Preparar recuperação
              </button>
            </div>
          ))}
        </>
      )}
      {tab === "documents" && data && (
        <>
          <h3>Documentos privados da secretaria</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                file = (form.elements.namedItem("file") as HTMLInputElement)
                  .files?.[0];
              if (!file) return;
              void run(async () => {
                if (file.size > 250000)
                  throw new Error("O documento deve ter até 250 KB.");
                const content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.onerror = () =>
                    reject(new Error("Não foi possível ler o arquivo."));
                  reader.readAsDataURL(file);
                });
                await api("/documents", "POST", {
                  name: file.name,
                  mediaType: file.type,
                  content,
                });
                form.reset();
              });
            }}
          >
            <Field label="PDF, texto, PNG ou JPG · até 250 KB">
              <input
                name="file"
                type="file"
                accept="application/pdf,text/plain,image/png,image/jpeg"
                required
              />
            </Field>
            <Submit busy={busy} label="Guardar documento" />
          </form>
          {data.rows.items?.map((d: RecordData) => (
            <div className="toolbar" key={d.id}>
              <span>
                {d.name} · {shortDate(d.created_at)}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void run(() => download(d.id, d.name))}
              >
                Baixar documento
              </button>
              <form onSubmit={(e) => { const b = formValues(e); void run(() => api(`/documents/${d.id}/share`, "POST", { personId: b.personId })); }}>
                <select name="personId" aria-label={`Compartilhar ${d.name}`} required>
                  <option value="">Compartilhar com…</option>
                  {data.people?.map((p: RecordData) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="text-button" disabled={busy}>Enviar ao portal</button>
              </form>
              {d.shares?.map((share: RecordData) => <button key={share.person_id} className="text-button" disabled={busy} onClick={() => void run(() => api(`/documents/${d.id}/share/${share.person_id}`, "DELETE"))}>Revogar {share.person_name}</button>)}
            </div>
          ))}
          {(data.rows.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação de documentos">
              <button className="button secondary" disabled={data.rows.page <= 1 || busy} onClick={() => {
                api(`/documents?page=${data.rows.page - 1}&pageSize=${data.rows.pageSize}`).then((rows) => setData((current) => current ? { ...current, rows } : current)).catch((e) => setError(e.message));
              }}>Anterior</button>
              <span className="muted">{data.rows.total} documento(s) · página {data.rows.page} de {data.rows.pages}</span>
              <button className="button secondary" disabled={data.rows.page >= data.rows.pages || busy} onClick={() => {
                api(`/documents?page=${data.rows.page + 1}&pageSize=${data.rows.pageSize}`).then((rows) => setData((current) => current ? { ...current, rows } : current)).catch((e) => setError(e.message));
              }}>Próxima</button>
            </div>
          )}
        </>
      )}
      {tab === "privacy" && data && (
        <>
          <div className="toolbar">
            <Field label="Situação">
              <select value={privacyStatus} onChange={(e) => { setPrivacyStatus(e.target.value); setPrivacyPage(1); }}>
                <option value="all">Todas</option>
                <option value="received">Recebidas</option>
                <option value="reviewing">Em análise</option>
                <option value="fulfilled">Atendidas</option>
                <option value="retained">Retidas</option>
              </select>
            </Field>
            <span className="muted">{data.rows.total ?? 0} solicitação(ões)</span>
            <button className="button secondary" onClick={async () => { try { const response = await fetch("/api/privacy/admin/export.csv", { headers: { "x-church-id": props.church } }); if (!response.ok) throw new Error("Exportação indisponível."); const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "solicitacoes-privacidade.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { setError((error as Error).message); } }}>Exportar CSV</button>
          </div>
          <h3>Política de retenção por categoria</h3>
          <p className="muted">Documente finalidade, base legal e prazo. A configuração não elimina dados automaticamente.</p>
          {(data.retention?.items ?? []).map((policy: RecordData) => (
            <form key={policy.category} className="toolbar" onSubmit={(e) => {
              const b = formValues(e);
              void run(() => api(`/privacy/retention/${policy.category}`, "PATCH", {
                retentionDays: b.retentionDays === "" ? null : Number(b.retentionDays),
                legalBasis: b.legalBasis, purpose: b.purpose, responsible: b.responsible, notes: b.notes,
              }));
            }}>
              <strong>{String(policy.category).replaceAll("_", " ")}</strong>
              <input name="retentionDays" type="number" min="0" placeholder="dias" defaultValue={policy.retention_days ?? ""} aria-label={`Prazo de ${policy.category}`} />
              <input name="legalBasis" placeholder="Base legal" defaultValue={policy.legal_basis ?? ""} aria-label={`Base legal de ${policy.category}`} />
              <input name="purpose" placeholder="Finalidade" defaultValue={policy.purpose ?? ""} aria-label={`Finalidade de ${policy.category}`} />
              <input name="responsible" placeholder="Responsável" defaultValue={policy.responsible ?? ""} aria-label={`Responsável por ${policy.category}`} />
              <input name="notes" placeholder="Observações" defaultValue={policy.notes ?? ""} aria-label={`Observações de ${policy.category}`} />
              <button className="button secondary" disabled={busy}>Salvar</button>
            </form>
          ))}
          {!data.rows.items?.length && <Empty>Sem solicitações de privacidade.</Empty>}
          {data.rows.items?.map((p: RecordData) => (
            <article key={p.id}>
              <h3>
                {{
                  access: "Acesso aos dados",
                  correction: "Correção",
                  deletion: "Exclusão",
                }[p.kind as string] ?? p.kind}{" "}
                · {p.status}
              </h3>
              <p>{p.detail}</p>
              <p>{p.resolution_reason}</p>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() => api(`/privacy/admin/${p.id}`, "PATCH", b));
                }}
              >
                <Field label="Situação">
                  <select name="status">
                    <option value="reviewing">Em análise</option>
                    <option value="fulfilled">Atendida</option>
                    <option value="retained">Retenção justificada</option>
                  </select>
                </Field>
                <Field label="Providências realizadas ou fundamento da retenção">
                  <textarea
                    name="reason"
                    minLength={5}
                    maxLength={500}
                    required
                  />
                </Field>
                {p.kind === "deletion" && <label className="member-checkbox"><input type="checkbox" name="confirmDeletion" /> Confirmo a anonimização do titular e a preservação das retenções legais.</label>}
                <Submit busy={busy} label="Registrar atendimento" />
              </form>
            </article>
          ))}
          {(data.rows.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação de privacidade">
              <button className="button secondary" disabled={privacyPage <= 1 || busy} onClick={() => setPrivacyPage((v) => v - 1)}>Anterior</button>
              <span className="muted">Página {data.rows.page} de {data.rows.pages}</span>
              <button className="button secondary" disabled={privacyPage >= data.rows.pages || busy} onClick={() => setPrivacyPage((v) => v + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}
      {tab === "transfers" && data && (
        <>
          <h3>Transferência autorizada</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() => api("/transfers", "POST", b));
            }}
          >
            <Field label="Pessoa">
              <select name="personId" required>
                {data.extra.map((p: RecordData) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Igreja de destino">
              <select name="targetChurchId" required>
                {data.destinations.map((c: RecordData) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <p>
              A igreja de destino precisa aceitar. Notas pastorais e
              contribuições permanecem na origem.
            </p>
            <Submit busy={busy} label="Solicitar transferência" />
          </form>
          {data.rows.map((t: RecordData) => (
            <div className="toolbar" key={t.id}>
              <span>
                {t.person_name ?? "Transferência recebida"} · {t.status}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  try {
                    const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>(`/transfers/${t.id}/history?page=1&pageSize=25`);
                    setTransferHistory((current) => ({ ...current, [t.id]: rows }));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Histórico
              </button>
              {t.target_church_id === props.church &&
                t.status === "pending" && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api(`/transfers/${t.id}/accept`, "POST"))
                    }
                  >
                    Aceitar transferência
                  </button>
                )}
              {transferHistory[t.id]?.items.map((entry) => (
                <small key={entry.id}>
                  {entry.actor_name} · {new Date(entry.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {entry.note}
                </small>
              ))}
              {transferHistory[t.id]?.pages > 1 && <div className="toolbar"><button className="button secondary" disabled={transferHistory[t.id].page <= 1} onClick={async () => { const next = transferHistory[t.id].page - 1; const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>(`/transfers/${t.id}/history?page=${next}&pageSize=25`); setTransferHistory((current) => ({ ...current, [t.id]: rows })); }}>Anterior</button><span className="muted">Página {transferHistory[t.id].page} de {transferHistory[t.id].pages}</span><button className="button secondary" disabled={transferHistory[t.id].page >= transferHistory[t.id].pages} onClick={async () => { const next = transferHistory[t.id].page + 1; const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>(`/transfers/${t.id}/history?page=${next}&pageSize=25`); setTransferHistory((current) => ({ ...current, [t.id]: rows })); }}>Próxima</button></div>}
            </div>
          ))}
        </>
      )}
      {tab === "care" && data && (
        <>
          {!data.rows.items?.length && <Empty>Sem pedidos pastorais.</Empty>}
          {data.rows.items?.map((p: RecordData) => (
            <article key={p.id}>
              <p>{p.text}</p>
              <small>{shortDate(p.createdAt)} · {p.status === "open" ? "Aberto" : p.status === "in_progress" ? "Em acompanhamento" : p.status === "resolved" ? "Resolvido" : "Encerrado"}</small>
              {p.resolution && <p className="muted">Retorno: {p.resolution}</p>}
              <div className="row-actions">
                <select aria-label="Responsável pelo pedido de oração" value={p.assignedTo ?? ""} disabled={busy || ["resolved", "closed"].includes(String(p.status))} onChange={(e) => void run(() => api(`/prayers/${p.id}`, "PATCH", { assignedTo: e.target.value || null, status: e.target.value ? "in_progress" : p.status }))}>
                  <option value="">Sem responsável</option>
                  {(data.assignees ?? []).map((u: RecordData) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                {p.status !== "resolved" && p.status !== "closed" && <button className="button secondary" disabled={busy} onClick={() => { const resolution = window.prompt("Retorno ou providência pastoral"); if (resolution) void run(() => api(`/prayers/${p.id}`, "PATCH", { status: "resolved", resolution })); }}>Resolver</button>}
              </div>
            </article>
          ))}
          {(data.rows.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação de pedidos pastorais">
              <button className="button secondary" disabled={data.rows.page <= 1 || busy} onClick={() => {
                api(`/prayers?page=${data.rows.page - 1}&pageSize=${data.rows.pageSize}`).then((rows) => setData((current) => current ? { ...current, rows } : current)).catch((e) => setError(e.message));
              }}>Anterior</button>
              <span className="muted">{data.rows.total} pedido(s) · página {data.rows.page} de {data.rows.pages}</span>
              <button className="button secondary" disabled={data.rows.page >= data.rows.pages || busy} onClick={() => {
                api(`/prayers?page=${data.rows.page + 1}&pageSize=${data.rows.pageSize}`).then((rows) => setData((current) => current ? { ...current, rows } : current)).catch((e) => setError(e.message));
              }}>Próxima</button>
            </div>
          )}
        </>
      )}
      {tab === "groups" && data && (
        <>
          <h3>Solicitações de participação em grupos</h3>
          <button className="button secondary" onClick={async () => { try { const response = await fetch(`/api/group-interests/export.csv?status=${groupInterestStatus}`, { headers: { "x-church-id": props.church } }); if (!response.ok) throw new Error("Exportação indisponível."); const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "interesses-grupos.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError((e as Error).message); } }}>Exportar CSV</button>
          <Field label="Situação"><select value={groupInterestStatus} onChange={(e) => setGroupInterestStatus(e.target.value)}><option value="all">Todas</option><option value="pending">Pendentes</option><option value="contacted">Contatadas</option><option value="closed">Encerradas</option></select></Field>
          {!data.rows?.items?.length && <Empty>Nenhuma solicitação de grupo.</Empty>}
          {data.rows?.items?.map((interest: RecordData) => (
            <article className="toolbar" key={interest.id}>
              <div>
                <strong>{interest.name} · {interest.cell_name}</strong>
                <p>{interest.email}{interest.phone ? ` · ${interest.phone}` : ""} · {shortDate(interest.created_at)}</p>
                {interest.message && <small>{interest.message}</small>}
              </div>
              <select value={interest.status} disabled={busy} onChange={(e) => void run(() => api(`/group-interests/${interest.id}`, "PATCH", { status: e.target.value }))}>
                <option value="pending">Pendente</option>
                <option value="contacted">Contatado</option>
                <option value="closed">Encerrado</option>
              </select>
            </article>
          ))}
          {(data.rows?.pages ?? 1) > 1 && <div className="toolbar" aria-label="Paginação de interesses em grupos"><button className="button secondary" disabled={data.rows.page <= 1 || busy} onClick={() => { api(`/group-interests?page=${data.rows.page - 1}&pageSize=${data.rows.pageSize}`).then((rows) => setData((current) => current ? { ...current, rows } : current)).catch((e) => setError(e.message)); }}>Anterior</button><span className="muted">{data.rows.total} solicitação(ões) · página {data.rows.page} de {data.rows.pages}</span><button className="button secondary" disabled={data.rows.page >= data.rows.pages || busy} onClick={() => { api(`/group-interests?page=${data.rows.page + 1}&pageSize=${data.rows.pageSize}`).then((rows) => setData((current) => current ? { ...current, rows } : current)).catch((e) => setError(e.message)); }}>Próxima</button></div>}
        </>
      )}
    </section>
  );
}
