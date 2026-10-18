import { useEffect, useState } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";
import type { PageProps } from "./pages";

export default function LibraryPage(props: PageProps) {
  const [data, setData] = useState<RecordData | null>(null);
  const [people, setPeople] = useState<RecordData[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [itemPage, setItemPage] = useState(1);
  const [loanPage, setLoanPage] = useState(1);
  const [q, setQ] = useState("");
  const [loanStatus, setLoanStatus] = useState("all");

  const load = () => Promise.all([
    api<RecordData>("/library?itemPage=" + itemPage + "&itemPageSize=25&loanPage=" + loanPage + "&loanPageSize=25&loanStatus=" + loanStatus + "&q=" + encodeURIComponent(q)),
    api<RecordData[]>("/people"),
  ]).then(([l, p]) => { setData(l); setPeople(p); }).catch(e => setError(e.message));

  useEffect(() => { setData(null); void load(); }, [props.church, props.revision, revision, itemPage, loanPage, loanStatus, q]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); props.notify("Biblioteca atualizada."); setRevision(v => v + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const items = data?.items ?? [];
  const loanableItems = data?.loanableItems ?? items;
  const loans = data?.loans ?? [];

  return <section className="panel" style={{ padding: 24 }}>
    <h2>Biblioteca e empréstimos</h2>
    <p className="muted">Catálogo, exemplares e devoluções ligados ao cadastro de pessoas.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="grid-2">
      <form onSubmit={e => { const b = formValues(e); void run(() => api("/library/items", "POST", { itemCode: b.itemCode, title: b.title, author: b.author || "", category: b.category || "", totalCopies: Number(b.totalCopies), location: b.location || "", notes: b.notes || "" })); }}>
        <h3>Novo item</h3>
        <Field label="Código"><input name="itemCode" required /></Field>
        <Field label="Título"><input name="title" required /></Field>
        <Field label="Autor"><input name="author" /></Field>
        <Field label="Categoria"><input name="category" placeholder="Livro, revista, material…" /></Field>
        <Field label="Exemplares"><input name="totalCopies" type="number" min={1} defaultValue={1} /></Field>
        <Field label="Localização"><input name="location" /></Field>
        <Submit busy={busy} label="Cadastrar item" />
      </form>
      <form onSubmit={e => { const b = formValues(e); void run(() => api("/library/loans", "POST", { itemId: b.itemId, personId: b.personId, dueOn: b.dueOn, notes: b.notes || "" })); }}>
        <h3>Novo empréstimo</h3>
        <Field label="Item"><select name="itemId" required><option value="">Selecione</option>{loanableItems.map((i: RecordData) => <option key={i.id} value={i.id}>{i.title} · {i.available_copies} disponíveis</option>)}</select></Field>
        <Field label="Pessoa"><select name="personId" required><option value="">Selecione</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Devolver até"><input name="dueOn" type="date" required /></Field>
        <Submit busy={busy} label="Registrar empréstimo" />
      </form>
    </div>
    <div className="toolbar"><h3>Empréstimos</h3><Field label="Situação"><select value={loanStatus} onChange={e => { setLoanStatus(e.target.value); setLoanPage(1); }}><option value="all">Todos</option><option value="open">Abertos</option><option value="overdue">Em atraso</option><option value="returned">Devolvidos</option><option value="cancelled">Cancelados</option></select></Field></div>
    {loans.map((l: RecordData) => <article className="toolbar" key={l.id}><div><strong>{l.title}</strong><p>{l.person_name} · vence {shortDate(l.due_on)} · {l.status}</p></div>{["open", "overdue"].includes(l.status) && <button className="button secondary" disabled={busy} onClick={() => void run(() => api("/library/loans/" + l.id, "PATCH", { status: "returned", returnedOn: new Date().toISOString().slice(0, 10) }))}>Registrar devolução</button>}</article>)}
    {!loans.length && <p>Nenhum empréstimo encontrado.</p>}
    {(data?.loanPagination?.pages ?? 1) > 1 && <div className="toolbar"><button className="button secondary" disabled={loanPage <= 1 || busy} onClick={() => setLoanPage(v => v - 1)}>Anterior</button><span className="muted">Página {data?.loanPagination?.page} de {data?.loanPagination?.pages}</span><button className="button secondary" disabled={loanPage >= (data?.loanPagination?.pages ?? 1) || busy} onClick={() => setLoanPage(v => v + 1)}>Próxima</button></div>}
    <div className="toolbar"><h3>Catálogo</h3><Field label="Buscar"><input value={q} onChange={e => { setQ(e.target.value); setItemPage(1); }} placeholder="Título, código, autor ou categoria" /></Field></div>
    {items.map((i: RecordData) => <article className="toolbar" key={i.id}><div><strong>{i.title}</strong><p>{i.item_code} · {i.author || "Autor não informado"} · {i.available_copies}/{i.total_copies} disponíveis</p></div></article>)}
    {!items.length && <p>Nenhum item encontrado.</p>}
    {(data?.itemPagination?.pages ?? 1) > 1 && <div className="toolbar"><button className="button secondary" disabled={itemPage <= 1 || busy} onClick={() => setItemPage(v => v - 1)}>Anterior</button><span className="muted">Página {data?.itemPagination?.page} de {data?.itemPagination?.pages} · {data?.itemPagination?.total} itens</span><button className="button secondary" disabled={itemPage >= (data?.itemPagination?.pages ?? 1) || busy} onClick={() => setItemPage(v => v + 1)}>Próxima</button></div>}
  </section>;
}

