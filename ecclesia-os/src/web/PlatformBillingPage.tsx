import { useEffect, useState } from "react";
import { api, money, shortDate, type RecordData } from "./api";
import { Badge, Empty } from "./ui";
import type { PageProps } from "./pages";

type PlatformData = { accounts: RecordData[]; sales: RecordData[]; revenue: RecordData; invoices: RecordData[]; usage: RecordData[]; alerts: RecordData[]; history: RecordData[] };

export default function PlatformBillingPage(props: PageProps) {
  const [data, setData] = useState<PlatformData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const load = async () => {
    setError("");
    try {
      const [accounts, sales, revenue, invoices, usage, alerts, history] = await Promise.all([
        api<RecordData[]>("/platform/billing/accounts"),
        api<RecordData[]>("/platform/billing/sales"),
        api<RecordData>("/platform/billing/revenue"),
        api<RecordData[]>(`/platform/billing/invoices?status=${invoiceStatus}&from=${dateFrom}&to=${dateTo}`),
        api<RecordData[]>("/platform/usage"),
        api<RecordData[]>("/platform/usage/alerts"),
        api<RecordData[]>("/platform/billing/history"),
      ]);
      setData({ accounts, sales, revenue, invoices, usage, alerts, history });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => { void load(); }, [props.revision, invoiceStatus, dateFrom, dateTo]);
  const updateInvoice = async (id: string, status: string) => {
    setBusy(true);
    try {
      await api(`/platform/billing/invoices/${id}`, "PATCH", { status });
      props.notify("Fatura atualizada.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const networks = Array.from(new Set((data?.accounts ?? []).map((v) => String(v.network_name ?? "")).filter(Boolean)));
  const plans = Array.from(new Set((data?.accounts ?? []).map((v) => String(v.plan ?? "")).filter(Boolean)));
  const visibleAccounts = (data?.accounts ?? []).filter((v) => (networkFilter === "all" || v.network_name === networkFilter) && (planFilter === "all" || v.plan === planFilter) && (!accountQuery.trim() || String(v.name ?? "").toLowerCase().includes(accountQuery.trim().toLowerCase()) || String(v.owner_church ?? "").toLowerCase().includes(accountQuery.trim().toLowerCase())));
  const visibleInvoices = (data?.invoices ?? []).filter((v) => invoiceStatus === "all" || v.status === invoiceStatus);
  if (error && !data) return <section className="panel" style={{padding:24}}><p className="error" role="alert">{error}</p></section>;
  return <section className="stack" aria-label="Operação comercial da plataforma">
    {error && <p className="error" role="alert">{error}</p>}
    <div className="stats-grid">
      <article className="stat-card"><span>Contas comerciais</span><strong>{data?.accounts.length ?? 0}</strong><small>contas ativas ou em implantação</small></article>
      <article className="stat-card"><span>Receita bruta</span><strong>{money(Number(data?.revenue?.gross_cents ?? 0))}</strong><small>contratos e faturas registradas</small></article>
      <article className="stat-card"><span>Receita líquida</span><strong>{money(Number(data?.revenue?.gross_cents ?? 0) - Number(data?.revenue?.fee_cents ?? 0))}</strong><small>após tarifas e descontos</small></article>
      <article className="stat-card"><span>Em atraso</span><strong>{data?.invoices.filter((v) => v.status === "overdue").length ?? 0}</strong><small>faturas para acompanhamento</small></article>
    </div>
    <div className="panel" style={{padding:24}}><div className="toolbar"><div><h2>Contas comerciais e unidades</h2><p className="muted">Visão agregada da operação. Dados de membros, pastoral e contribuições individuais ficam fora deste painel.</p></div><input aria-label="Buscar conta comercial" placeholder="Buscar conta ou sede" value={accountQuery} onChange={(e)=>setAccountQuery(e.target.value)} /><button className="button secondary" type="button" onClick={()=>window.open("/api/platform/billing/accounts.csv", "_blank")}>Exportar contas</button><select aria-label="Filtrar por rede" value={networkFilter} onChange={(e)=>setNetworkFilter(e.target.value)}><option value="all">Todas as redes</option>{networks.map((v)=><option key={v} value={v}>{v}</option>)}</select><select aria-label="Filtrar por plano" value={planFilter} onChange={(e)=>setPlanFilter(e.target.value)}><option value="all">Todos os planos</option>{plans.map((v)=><option key={v} value={v}>{v}</option>)}</select></div>{visibleAccounts.length ? <div className="table-wrap"><table><thead><tr><th>Conta</th><th>Unidades</th><th>Plano</th><th>Status</th><th>Criação</th></tr></thead><tbody>{visibleAccounts.map((v) => <tr key={v.id}><td><strong>{v.name}</strong><small>{v.contact_email || v.contact || ""}</small></td><td>{v.church_count ?? v.units_count ?? (Number(v.children_count ?? 0) + 1)}</td><td>{v.plan || "—"}</td><td><Badge tone={v.status === "active" ? "green" : "amber"}>{v.status || "implantação"}</Badge></td><td>{v.created_at ? shortDate(v.created_at) : "—"}</td></tr>)}</tbody></table></div> : <Empty title="Nenhuma conta comercial" text="As contas aparecerão quando uma sede iniciar a contratação." />}</div>
    <div className="panel" style={{padding:24}}><h2>Histórico comercial</h2>{data?.history?.length ? <div className="stack-list">{data.history.slice(0,10).map((v)=><article className="toolbar" key={v.id}><div><strong>{v.billing_account}</strong><p>{v.previous_plan || "—"} → {v.new_plan || "—"} · {v.previous_status || "—"} → {v.new_status || "—"}</p><p>Responsável: {v.changed_by || "registro do sistema"}</p></div><small>{v.created_at ? shortDate(v.created_at) : ""}</small></article>)}</div> : <Empty title="Sem alterações registradas" text="Mudanças de plano e status aparecerão aqui." />}</div><div className="grid-2">
      <div className="panel" style={{padding:24}}><div className="toolbar"><h2>Faturas recentes</h2><label>De <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} /></label><label>Até <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} /></label><button className="button secondary" type="button" onClick={()=>window.open(`/api/platform/billing/export.csv?status=${invoiceStatus}`, "_blank")}>Exportar CSV</button><select aria-label="Filtrar faturas por situação" value={invoiceStatus} onChange={(e)=>setInvoiceStatus(e.target.value)}><option value="all">Todas</option><option value="issued">Emitidas</option><option value="paid">Pagas</option><option value="overdue">Em atraso</option><option value="void">Canceladas</option></select></div>{visibleInvoices.length ? <div className="stack-list">{visibleInvoices.slice(0,12).map((v)=><article className="toolbar" key={v.id}><div><strong>{v.account_name || v.billing_account_name || "Conta comercial"}</strong><p>{money(Number(v.amount_cents||0))} · vence {v.due_on ? shortDate(v.due_on) : "—"}</p></div><select value={v.status} disabled={busy} onChange={(e)=>void updateInvoice(v.id,e.target.value)} aria-label={`Status da fatura ${v.id}`}><option value="issued">Emitida</option><option value="paid">Paga</option><option value="overdue">Em atraso</option><option value="void">Cancelada</option></select></article>)}</div> : <Empty title="Nenhuma fatura" text="A operação comercial ainda não possui faturas." />}</div>
      <div className="panel" style={{padding:24}}><h2>Uso contratado</h2>{data?.usage.length ? <div className="stack-list">{data.usage.slice(0,12).map((v)=><article className="toolbar" key={v.id}><div><strong>{v.account_name || v.billing_account || "Conta comercial"}</strong><p>{v.plan || "piloto"} · {v.captured_on ? shortDate(v.captured_on) : "sem data"}</p><p>Igrejas: {v.churches_count ?? 0}/{v.max_churches ?? "—"} · usuários: {v.users_count ?? 0}/{v.max_users ?? "—"} · membros: {v.members_count ?? 0}/{v.max_members ?? "—"}</p></div><Badge tone={(Number(v.churches_over ?? 0)>0 || Number(v.users_over ?? 0)>0 || Number(v.members_over ?? 0)>0) ? "amber" : "green"}>{(Number(v.churches_over ?? 0)>0 || Number(v.users_over ?? 0)>0 || Number(v.members_over ?? 0)>0) ? "upgrade" : "dentro do limite"}</Badge></article>)}</div> : <Empty title="Sem snapshots de uso" text="O consumo será consolidado após a ativação dos módulos." />}</div>
    </div>
  </section>;
}
