import { useEffect, useState } from "react";
import { api, money, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";
import type { PageProps } from "./pages";

export default function AssetsPage(props: PageProps) {
  const [data, setData] = useState<RecordData | null>(null);
  const [people, setPeople] = useState<RecordData[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [maintenancePage, setMaintenancePage] = useState(1);
  const [status, setStatus] = useState("all");
  const [maintenanceStatus, setMaintenanceStatus] = useState("all");
  const [q, setQ] = useState("");

  const load = () => Promise.all([
    api<RecordData>(`/assets?assetPage=${page}&assetPageSize=25&maintenancePage=${maintenancePage}&maintenancePageSize=25&status=${status}&maintenanceStatus=${maintenanceStatus}&q=${encodeURIComponent(q)}`),
    api<RecordData[]>("/people"),
  ]).then(([a, p]) => { setData(a); setPeople(p); }).catch(e => setError(e.message));

  useEffect(() => { setData(null); void load(); }, [props.church, props.revision, revision, page, maintenancePage, status, maintenanceStatus, q]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); props.notify("Patrimônio atualizado."); setRevision(v => v + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const assets = data?.assets ?? [];
  const maintenance = data?.maintenance ?? [];
  const assetPagination = data?.assetPagination;
  const maintenancePagination = data?.maintenancePagination;

  return <section className="panel" style={{ padding: 24 }}>
    <h2>Patrimônio e manutenção</h2>
    <p className="muted">Inventário de bens, localização, responsáveis e manutenção por igreja.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="grid-2">
      <form onSubmit={e => { const b = formValues(e); void run(() => api("/assets", "POST", { assetTag: b.assetTag, name: b.name, kind: b.kind, location: b.location || "", status: b.status, responsiblePersonId: b.responsiblePersonId || null, acquiredOn: b.acquiredOn || null, valueCents: b.value ? Math.round(Number(b.value) * 100) : null, notes: b.notes || "" })); }}>
        <h3>Novo item</h3>
        <Field label="Código patrimonial"><input name="assetTag" required /></Field>
        <Field label="Nome"><input name="name" required /></Field>
        <Field label="Tipo"><input name="kind" placeholder="Mobiliário, equipamento…" required /></Field>
        <Field label="Localização"><input name="location" /></Field>
        <Field label="Responsável"><select name="responsiblePersonId"><option value="">Sem responsável</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Valor (R$)"><input name="value" type="number" min={0} step="0.01" /></Field>
        <Submit busy={busy} label="Cadastrar item" />
      </form>
      <div>
        <div className="toolbar"><h3>Fila de manutenção</h3><Field label="Situação"><select value={maintenanceStatus} onChange={e => { setMaintenanceStatus(e.target.value); setMaintenancePage(1); }}><option value="all">Todas</option><option value="open">Abertas</option><option value="in_progress">Em andamento</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></select></Field></div>
        {maintenance.map((m: RecordData) => <article className="toolbar" key={m.id}><div><strong>{m.asset_name}</strong><p>{m.description} · {m.status}{m.scheduled_on ? ` · ${shortDate(m.scheduled_on)}` : ""}</p></div>{["open", "in_progress"].includes(m.status) && <button className="button secondary" disabled={busy} onClick={() => void run(() => api(`/assets/maintenance/${m.id}`, "PATCH", { status: "completed", completedOn: new Date().toISOString().slice(0, 10) }))}>Concluir</button>}</article>)}
        {!maintenance.length && <p>Nenhuma manutenção encontrada.</p>}
        {(maintenancePagination?.pages ?? 1) > 1 && <div className="toolbar"><button className="button secondary" disabled={maintenancePage <= 1 || busy} onClick={() => setMaintenancePage(v => v - 1)}>Anterior</button><span className="muted">Página {maintenancePagination?.page} de {maintenancePagination?.pages}</span><button className="button secondary" disabled={maintenancePage >= (maintenancePagination?.pages ?? 1) || busy} onClick={() => setMaintenancePage(v => v + 1)}>Próxima</button></div>}
      </div>
    </div>
    <div className="toolbar"><h3>Inventário</h3><Field label="Buscar"><input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Nome, código, tipo ou local" /></Field><Field label="Situação"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">Todas</option><option value="available">Disponível</option><option value="in_use">Em uso</option><option value="maintenance">Manutenção</option><option value="disposed">Baixado</option></select></Field></div>
    {assets.map((a: RecordData) => <article className="toolbar" key={a.id}><div><strong>{a.name}</strong><p>{a.asset_tag} · {a.kind} · {a.location || "Local não informado"} · {a.status}{a.value_cents != null ? ` · ${money(a.value_cents)}` : ""}</p><small>{a.responsible_name || "Sem responsável"}</small></div><button className="button secondary" disabled={busy} onClick={() => { const description = window.prompt("Descreva a manutenção"); if (description) void run(() => api(`/assets/${a.id}/maintenance`, "POST", { description, costCents: 0 })); }}>Registrar manutenção</button></article>)}
    {!assets.length && <p>Nenhum item encontrado.</p>}
    {(assetPagination?.pages ?? 1) > 1 && <div className="toolbar"><button className="button secondary" disabled={page <= 1 || busy} onClick={() => setPage(v => v - 1)}>Anterior</button><span className="muted">Página {assetPagination?.page} de {assetPagination?.pages} · {assetPagination?.total} itens</span><button className="button secondary" disabled={page >= (assetPagination?.pages ?? 1) || busy} onClick={() => setPage(v => v + 1)}>Próxima</button></div>}
  </section>;
}
