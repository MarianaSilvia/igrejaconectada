import { useEffect, useState } from "react";
import { api, money, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";
import type { PageProps } from "./pages";
import { todayInChurch } from "../shared/dates";
async function filePayload(file: File) {
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
  return { name: file.name, mediaType: file.type || "application/octet-stream", content };
}
export default function TreasuryPage(props: PageProps) {
  const [data, setData] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState("bills"),
    [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID()),
    [history, setHistory] = useState<Record<string, { items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>>({}),
    [historyPage, setHistoryPage] = useState<Record<string, number>>({}),
    [matchSelection, setMatchSelection] = useState<Record<string, string>>({}),
    [statementPage, setStatementPage] = useState(1),
    [importPage, setImportPage] = useState(1),
    [statementStatus, setStatementStatus] = useState("unmatched"),
    [integrationPage, setIntegrationPage] = useState(1),
    [report, setReport] = useState<RecordData | null>(null),
    [reportFrom, setReportFrom] = useState(`${todayInChurch().slice(0, 4)}-01-01`),
    [reportTo, setReportTo] = useState(todayInChurch());
  useEffect(() => {
    let active = true;
    setError("");
    const statementQuery = new URLSearchParams({ statementPage: String(statementPage), statementPageSize: "50", statementStatus, importPage: String(importPage), importPageSize: "25", integrationPage: String(integrationPage), integrationPageSize: "25" });
    api(`/finance/treasury?${statementQuery}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.church, props.revision, revision, statementPage, statementStatus, importPage, integrationPage]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setRevision((v) => v + 1);
      props.refresh();
      props.notify("Tesouraria atualizada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const select = (
    name: string,
    label: string,
    rows: RecordData[],
    optional = true,
  ) => (
    <Field label={label}>
      <select name={name} required={!optional}>
        {optional && <option value="">Sem vínculo</option>}
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  );
  async function showHistory(type: "bill" | "payment", id: string, requestedPage?: number) {
    try {
      const key = `${type}:${id}`;
      const page = requestedPage ?? historyPage[key] ?? 1;
      const rows = await api<{ items: RecordData[]; total: number; page: number; pageSize: number; pages: number }>(`/finance/history/${type}/${id}?page=${page}&pageSize=25`);
      setHistory((current) => ({ ...current, [key]: rows }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadReport() {
    try {
      setError("");
      setReport(await api<RecordData>(`/finance/reports?from=${reportFrom}&to=${reportTo}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Contas, aprovações e orçamento</h2>
      <p>
        As baixas registram movimentações já realizadas; não executam
        transferências bancárias.
      </p>
      <div className="tabs" role="group" aria-label="Tesouraria operacional">
        {[
          { id: "bills", label: "Contas e baixas" },
          { id: "request", label: "Nova solicitação" },
          { id: "records", label: "Cadastros e orçamento" },
          { id: "integrations", label: "Integrações" },
          { id: "reports", label: "Relatórios" },
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
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
      {data && tab === "bills" && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th>Aprovação</th>
                  <th>Histórico</th>
                </tr>
              </thead>
              <tbody>
                {data.bills.map((b: RecordData) => (
                  <tr key={b.id}>
                    <td>
                      {b.description}
                      <small className="block">{b.party_name}</small>
                    </td>
                    <td>{b.kind === "payable" ? "A pagar" : "A receber"}</td>
                    <td>{shortDate(b.due_on)}</td>
                    <td>{money(b.amount_cents)}</td>
                    <td>
                      {money(Number(b.amount_cents) - Number(b.paid_cents))}
                    </td>
                    <td>
                      {Number(b.paid_cents) === Number(b.amount_cents)
                        ? "Quitada"
                        : b.status === "approved"
                          ? Number(b.paid_cents) > 0
                            ? "Parcial"
                            : "Aprovada"
                          : b.status === "draft"
                            ? "Aguardando aprovação"
                            : "Rejeitada"}
                    </td>
                    <td>
                      {b.status === "draft" &&
                        data.canApprove &&
                        ["approved", "rejected"].map((status) => (
                          <button
                            key={status}
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              const reason = window.prompt(
                                "Registre a justificativa. O solicitante não pode aprovar a própria solicitação.",
                              );
                              if (reason)
                                void run(() =>
                                  api(
                                    `/finance/bills/${b.id}/decision`,
                                    "POST",
                                    { status, reason },
                                  ),
                                );
                            }}
                          >
                            {status === "approved" ? "Aprovar" : "Rejeitar"}
                          </button>
                        ))}
                    </td>
                    <td>
                      <button className="text-button" disabled={busy} onClick={() => void showHistory("bill", b.id)}>Ver</button>
                      {history[`bill:${b.id}`]?.items.map((entry) => (
                        <small className="block" key={entry.id}>{entry.actor_name} · {entry.action} · {entry.reason}</small>
                      ))}
                      {history[`bill:${b.id}`]?.pages > 1 && <div className="toolbar"><button className="button secondary" onClick={() => { const key = `bill:${b.id}`; const next = (history[key]?.page ?? 1) - 1; setHistoryPage((current) => ({ ...current, [key]: next })); void showHistory("bill", b.id, next); }} disabled={history[`bill:${b.id}`].page <= 1}>Anterior</button><span className="muted">Página {history[`bill:${b.id}`].page} de {history[`bill:${b.id}`].pages}</span><button className="button secondary" onClick={() => { const key = `bill:${b.id}`; const next = (history[key]?.page ?? 1) + 1; setHistoryPage((current) => ({ ...current, [key]: next })); void showHistory("bill", b.id, next); }} disabled={history[`bill:${b.id}`].page >= history[`bill:${b.id}`].pages}>Próxima</button></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Registrar baixa parcial ou total</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(async () => {
                await api(`/finance/bills/${b.bill}/payments`, "POST", {
                  amount: b.amount,
                  accountId: b.accountId,
                  date: b.date,
                  requestKey: paymentKey,
                });
                setPaymentKey(crypto.randomUUID());
              });
            }}
          >
            <Field label="Conta aprovada">
              <select
                name="bill"
                required
                onChange={() => setPaymentKey(crypto.randomUUID())}
              >
                {data.bills
                  .filter(
                    (b: RecordData) =>
                      b.status === "approved" &&
                      Number(b.paid_cents) < Number(b.amount_cents),
                  )
                  .map((b: RecordData) => (
                    <option key={b.id} value={b.id}>
                      {b.description} · saldo{" "}
                      {money(Number(b.amount_cents) - Number(b.paid_cents))}
                    </option>
                  ))}
              </select>
            </Field>
            {select("accountId", "Conta bancária", data.accounts, false)}
            <Field label="Valor em reais">
              <input
                name="amount"
                type="number"
                min="0.01"
                max="999999999.99"
                step="0.01"
                required
                onChange={() => setPaymentKey(crypto.randomUUID())}
              />
            </Field>
            <Field label="Data da movimentação">
              <input
                name="date"
                type="date"
                defaultValue={todayInChurch()}
                required
              />
            </Field>
            <Submit busy={busy} label="Registrar baixa" />
          </form>
          <h3>Baixas registradas</h3>
          {data.payments.map((p: RecordData) => (
            <div className="toolbar" key={p.id}>
              <span>
                {
                  data.bills.find((b: RecordData) => b.id === p.bill_id)
                    ?.description
                }{" "}
                · {money(p.amount_cents)} · {shortDate(p.occurred_on)}{" "}
                {p.reversal_entry_id && "· Estornada"}
              </span>
              <button className="text-button" disabled={busy} onClick={() => void showHistory("payment", p.id)}>Histórico</button>
              {history[`payment:${p.id}`]?.items.map((entry) => (
                <small key={entry.id}>{entry.actor_name} · {entry.action} · {entry.reason}</small>
              ))}
              {history[`payment:${p.id}`]?.pages > 1 && <div className="toolbar"><button className="button secondary" onClick={() => { const key = `payment:${p.id}`; const next = (history[key]?.page ?? 1) - 1; setHistoryPage((current) => ({ ...current, [key]: next })); void showHistory("payment", p.id, next); }} disabled={history[`payment:${p.id}`].page <= 1}>Anterior</button><span className="muted">Página {history[`payment:${p.id}`].page} de {history[`payment:${p.id}`].pages}</span><button className="button secondary" onClick={() => { const key = `payment:${p.id}`; const next = (history[key]?.page ?? 1) + 1; setHistoryPage((current) => ({ ...current, [key]: next })); void showHistory("payment", p.id, next); }} disabled={history[`payment:${p.id}`].page >= history[`payment:${p.id}`].pages}>Próxima</button></div>}
              {!p.reversal_entry_id && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Estornar esta baixa no período aberto e devolver o valor ao saldo da conta?",
                      )
                    )
                      void run(() =>
                        api(`/finance/payments/${p.id}/reverse`, "POST"),
                      );
                  }}
                >
                  Estornar baixa
                </button>
              )}
            </div>
          ))}
          <h3>Anexos financeiros</h3>
          <p className="muted">Guarde notas, recibos e comprovantes junto da conta ou da baixa. Arquivos PDF, PNG, JPEG ou texto podem ter até 250 KB.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const values = formValues(e);
              const selected = String(values.resource ?? "");
              const [kind, id] = selected.split(":", 2);
              const file = (form.elements.namedItem("attachment") as HTMLInputElement).files?.[0];
              if (!kind || !id || !file) {
                setError("Escolha uma conta ou baixa e um arquivo.");
                return;
              }
              void run(async () => {
                const payload = await filePayload(file);
                await api(`/finance/${kind === "bill" ? "bills" : "payments"}/${id}/attachments`, "POST", payload);
                form.reset();
              });
            }}
          >
            <Field label="Vínculo">
              <select name="resource" required>
                <option value="">Selecione a conta ou baixa</option>
                {data.bills.map((b: RecordData) => <option key={`bill:${b.id}`} value={`bill:${b.id}`}>Conta · {b.description}</option>)}
                {data.payments.map((p: RecordData) => <option key={`payment:${p.id}`} value={`payment:${p.id}`}>Baixa · {data.bills.find((b: RecordData) => b.id === p.bill_id)?.description ?? p.id}</option>)}
              </select>
            </Field>
            <Field label="Arquivo">
              <input name="attachment" type="file" accept="application/pdf,text/plain,image/png,image/jpeg" required />
            </Field>
            <Submit busy={busy} label="Adicionar anexo" />
          </form>
          {data.attachments?.map((a: RecordData) => (
            <div className="toolbar" key={a.id}>
              <span>{a.name} · {a.media_type} · {Math.ceil(Number(a.bytes) / 1024)} KB</span>
              <button className="text-button" disabled={busy} onClick={() => void run(async () => {
                const res = await fetch(`/api/finance/attachments/${a.id}`, { headers: { "x-church-id": props.church } });
                if (!res.ok) throw new Error("Anexo indisponível.");
                const url = URL.createObjectURL(await res.blob());
                const link = document.createElement("a");
                link.href = url;
                link.download = a.name;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })}>Baixar</button>
            </div>
          ))}
          <h3>Conciliação de extrato</h3>
          <p className="muted">Linhas importadas ficam pendentes até a tesouraria confirmar a baixa correspondente.</p>
          <div className="toolbar">
            <Field label="Situação do extrato">
              <select value={statementStatus} onChange={(e) => { setStatementStatus(e.target.value); setStatementPage(1); }}>
                <option value="unmatched">Pendentes</option>
                <option value="matched">Conciliadas</option>
                <option value="ignored">Ignoradas</option>
                <option value="all">Todas</option>
              </select>
            </Field>
            <span className="muted">{data.statementPagination?.total ?? 0} linha(s)</span>
          </div>
          {(data.statementLines ?? []).filter((line: RecordData) => statementStatus !== "all" || line.status === "unmatched").map((line: RecordData) => (
            <div className="toolbar" key={line.id}>
              <span>{shortDate(line.occurred_on)} · {line.description} · {money(Math.abs(Number(line.amount_cents)))}</span>
              {line.status === "unmatched" ? <>
                <select
                  value={matchSelection[line.id] ?? ""}
                  onChange={(e) => setMatchSelection((current) => ({ ...current, [line.id]: e.target.value }))}
                  aria-label={`Baixa para ${line.description}`}
                >
                  <option value="">Escolha uma baixa</option>
                  {data.payments.filter((p: RecordData) => p.account_id === line.account_id && !p.reversal_entry_id).map((p: RecordData) => (
                    <option key={p.id} value={p.id}>{shortDate(p.occurred_on)} · {money(p.amount_cents)} · {data.bills.find((b: RecordData) => b.id === p.bill_id)?.description ?? p.id}</option>
                  ))}
                </select>
                <button className="text-button" disabled={busy || !matchSelection[line.id]} onClick={() => void run(() => api(`/finance/statement-lines/${line.id}/match`, "POST", { paymentId: matchSelection[line.id] }))}>Conciliar</button>
                <button className="text-button" disabled={busy} onClick={() => {
                  const reason = window.prompt("Informe por que esta linha não será conciliada.");
                  if (reason) void run(() => api(`/finance/statement-lines/${line.id}/ignore`, "POST", { reason }));
                }}>Ignorar</button>
              </> : <span className="muted">{line.status === "matched" ? "Conciliada" : "Ignorada"}</span>}
            </div>
          ))}
          {(data.statementPagination?.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação do extrato">
              <button className="button secondary" disabled={statementPage <= 1 || busy} onClick={() => setStatementPage((v) => v - 1)}>Anterior</button>
              <span className="muted">Página {data.statementPagination.page} de {data.statementPagination.pages}</span>
              <button className="button secondary" disabled={statementPage >= data.statementPagination.pages || busy} onClick={() => setStatementPage((v) => v + 1)}>Próxima</button>
            </div>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await fetch("/api/finance/accountant-export", {
                  headers: { "x-church-id": props.church },
                });
                if (!r.ok) throw new Error("Exportação indisponível.");
                const url = URL.createObjectURL(await r.blob()),
                  a = document.createElement("a");
                a.href = url;
                a.download = "lancamentos-contador.csv";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            Exportar lançamentos para o contador
          </button>
        </>
      )}
      {data && tab === "request" && (
        <form
          onSubmit={(e) => {
            const b = formValues(e);
            void run(async () => {
              await api("/finance/bills", "POST", {
                ...b,
                partyId: b.partyId || undefined,
                fundId: b.fundId || undefined,
                costCenterId: b.costCenterId || undefined,
              });
              setTab("bills");
            });
          }}
        >
          <Field label="Tipo">
            <select name="kind">
              <option value="payable">Conta a pagar</option>
              <option value="receivable">Conta a receber</option>
            </select>
          </Field>
          <Field label="Descrição">
            <input name="description" minLength={3} maxLength={200} required />
          </Field>
          <Field label="Valor em reais">
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </Field>
          <Field label="Vencimento">
            <input name="dueOn" type="date" required />
          </Field>
          {select("partyId", "Fornecedor / contraparte", data.parties)}
          {select("fundId", "Fundo", data.funds)}
          {select("costCenterId", "Centro de custo", data.costCenters)}
          <Submit busy={busy} label="Enviar para aprovação" />
        </form>
      )}
      {data && tab === "records" && (
        <>
          <h3>Importar extrato bancário</h3>
          <p className="muted">CSV obrigatório: <code>external_id,date,description,amount</code>. Use data YYYY-MM-DD e valores em reais, com sinal.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const file = (form.elements.namedItem("statement") as HTMLInputElement).files?.[0];
              const accountId = (form.elements.namedItem("accountId") as HTMLSelectElement).value;
              if (!file || !accountId) {
                setError("Escolha a conta e o arquivo CSV.");
                return;
              }
              void run(async () => {
                const result = await api<RecordData>(`/finance/bank-accounts/${accountId}/statements/import`, "POST", { fileName: file.name, csv: await file.text() });
                props.notify(result.duplicate ? "Este extrato já foi importado." : `${result.inserted} linha(s) importada(s).`);
                form.reset();
              });
            }}
          >
            {select("accountId", "Conta bancária", data.accounts, false)}
            <Field label="Arquivo CSV">
              <input name="statement" type="file" accept=".csv,text/csv" required />
            </Field>
            <Submit busy={busy} label="Importar extrato" />
          </form>
          {!!data.statementImports?.length && <><h3>Arquivos importados</h3><div className="attendance-list">{data.statementImports.map((item: RecordData) => <div className="toolbar" key={item.id}><span>{item.file_name} · hash {String(item.source_hash).slice(0, 16)}… · {shortDate(item.created_at)}</span></div>)}</div>{(data.importPagination?.pages ?? 1) > 1 && <div className="toolbar" aria-label="Paginação das importações de extrato"><button className="button secondary" disabled={importPage <= 1 || busy} onClick={() => setImportPage((v) => v - 1)}>Anterior</button><span className="muted">Importações · página {data.importPagination.page} de {data.importPagination.pages} · {data.importPagination.total} arquivos</span><button className="button secondary" disabled={importPage >= data.importPagination.pages || busy} onClick={() => setImportPage((v) => v + 1)}>Próxima</button></div>}</>}
          <h3>Fornecedores e contrapartes</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() => api("/finance/parties", "POST", b));
            }}
          >
            <Field label="Nome">
              <input name="name" minLength={2} required />
            </Field>
            <Field label="Tipo">
              <select name="kind">
                <option value="supplier">Fornecedor</option>
                <option value="customer">Cliente</option>
                <option value="other">Outro</option>
              </select>
            </Field>
            <Submit busy={busy} label="Cadastrar contraparte" />
          </form>
          <h3>Contas bancárias</h3>
          <form
            onSubmit={(e) => {
              const b = formValues(e);
              void run(() => api("/finance/bank-accounts", "POST", b));
            }}
          >
            <Field label="Nome da conta">
              <input name="name" minLength={2} required />
            </Field>
            <Field label="Código interno · letras minúsculas, números, hífen">
              <input name="code" pattern="[a-z0-9_-]{2,40}" required />
            </Field>
            <Submit busy={busy} label="Cadastrar conta" />
          </form>
          {data.canApprove && (
            <>
              <h3>Orçamento mensal</h3>
              <form
                onSubmit={(e) => {
                  const b = formValues(e);
                  void run(() =>
                    api("/finance/budgets", "POST", {
                      ...b,
                      month: b.month + "-01",
                    }),
                  );
                }}
              >
                {select(
                  "costCenterId",
                  "Centro de custo",
                  data.costCenters,
                  false,
                )}
                <Field label="Mês">
                  <input name="month" type="month" required />
                </Field>
                <Field label="Valor em reais">
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </Field>
                <Submit busy={busy} label="Definir orçamento" />
              </form>
            </>
          )}
          {data.budgets.map((b: RecordData) => (
            <p key={b.id}>
              {b.name} · {shortDate(b.month)} · Previsto {money(b.amount_cents)}{" "}
              · Realizado {money(b.spent_cents)}
            </p>
          ))}
        </>
      )}
      {data && tab === "integrations" && (
        <>
          <h3>Fila de integração Pix</h3>
          <p>
            Falhas são recuperadas pelo mesmo identificador da cobrança. Confira
            a situação antes de repetir.
          </p>
          {data.jobs.map((j: RecordData) => (
            <div className="toolbar" key={j.id}>
              <div>
                <strong>{j.kind}</strong>
                <p>
                  {j.status} · {j.attempts} tentativas
                </p>
                {j.last_error && <p>{j.last_error}</p>}
              </div>
              {["pending", "failed"].includes(j.status) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api(`/finance/integrations/${j.id}/retry`, "POST"),
                    )
                  }
                >
                  Solicitar nova consulta
                </button>
              )}
            </div>
          ))}
          {(data.integrationPagination?.pages ?? 1) > 1 && <div className="toolbar" aria-label="Paginação da fila de integrações"><button className="button secondary" disabled={integrationPage <= 1 || busy} onClick={() => setIntegrationPage((v) => v - 1)}>Anterior</button><span className="muted">Integrações · página {data.integrationPagination.page} de {data.integrationPagination.pages} · {data.integrationPagination.total} trabalhos</span><button className="button secondary" disabled={integrationPage >= data.integrationPagination.pages || busy} onClick={() => setIntegrationPage((v) => v + 1)}>Próxima</button></div>}
        </>
      )}
      {data && tab === "reports" && (
        <>
          <h3>Relatório gerencial financeiro</h3>
          <p className="muted">Valores derivados dos lançamentos de caixa, sem nomes de contribuintes. O filtro respeita a igreja selecionada e a permissão da tesouraria.</p>
          <button className="button secondary" type="button" onClick={async () => { try { const response = await fetch(`/api/finance/reports.csv?from=${reportFrom}&to=${reportTo}`, { headers: { "x-church-id": props.church } }); if (!response.ok) throw new Error("Exportação indisponível."); const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "relatorio-centros-custo.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError((e as Error).message); } }}>Exportar centros de custo</button>
          <form onSubmit={(e) => { e.preventDefault(); void loadReport(); }}>
            <Field label="De"><input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} required /></Field>
            <Field label="Até"><input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} required /></Field>
            <Submit busy={busy} label="Gerar relatório" />
          </form>
          {report && (
            <>
              <div className="stats-grid finance-stats">
                <div className="stat-card"><span>Entradas</span><strong>{money(report.summary.income_cents)}</strong></div>
                <div className="stat-card"><span>Saídas</span><strong>{money(report.summary.expense_cents)}</strong></div>
                <div className="stat-card"><span>Saldo no período</span><strong>{money(report.summary.net_cents)}</strong></div>
                <div className="stat-card"><span>Extrato pendente</span><strong>{report.pendingStatement.count}</strong><small>{money(report.pendingStatement.amount_cents)}</small></div>
              </div>
              <h4>Por mês</h4>
              <div className="table-scroll"><table><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>{report.monthly.map((row: RecordData) => <tr key={row.month}><td>{row.month}</td><td>{money(row.income_cents)}</td><td>{money(row.expense_cents)}</td><td>{money(row.net_cents)}</td></tr>)}</tbody></table></div>
              <h4>Por fundo</h4>
              <div className="table-scroll"><table><thead><tr><th>Fundo</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>{report.byFund.map((row: RecordData) => <tr key={row.name}><td>{row.name}</td><td>{money(row.income_cents)}</td><td>{money(row.expense_cents)}</td><td>{money(row.net_cents)}</td></tr>)}</tbody></table></div>
              <h4>Por centro de custo</h4>
              <div className="table-scroll"><table><thead><tr><th>Centro</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>{report.byCostCenter.map((row: RecordData) => <tr key={row.name}><td>{row.name}</td><td>{money(row.income_cents)}</td><td>{money(row.expense_cents)}</td><td>{money(row.net_cents)}</td></tr>)}</tbody></table></div>
              <h4>Contas em aberto</h4>
              <p>{report.openBills.count} conta(s) · saldo {money(report.openBills.amount_cents)} · vencido {money(report.openBills.overdue_cents)}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
