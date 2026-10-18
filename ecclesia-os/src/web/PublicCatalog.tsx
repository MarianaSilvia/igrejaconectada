import { useEffect, useState, type FormEvent } from "react";
import { api, type RecordData } from "./api";
import { Field, Icon, Submit } from "./ui";

export default function PublicCatalog({ churchId }: { churchId: string }) {
  const [data, setData] = useState<RecordData | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<RecordData | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setData(null);
    api("/public/catalog/" + churchId + "?page=" + page + "&pageSize=12")
      .then(setData)
      .catch(e => setError(e.message));
  }, [churchId, page]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected && !selectedCourse) return;
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(selected ? "/public/groups/" + selected.id + "/interest" : "/public/education/classes/" + selectedCourse!.id + "/interest", "POST", {
        name: values.name,
        email: values.email,
        phone: values.phone || "",
        message: values.message || "",
        consent: true,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="registration-page"><section className="registration-card"><Icon name="shield" size={32} /><h1>Catálogo indisponível</h1><p>{error}</p></section></main>;
  if (!data) return <main className="registration-page"><section className="registration-card"><p>Carregando opções da comunidade…</p></section></main>;

  return <main className="registration-page"><section className="registration-card">
    <div className="registration-title"><span className="badge green">CATÁLOGO DA COMUNIDADE</span><h1>{data.church.name}</h1><p>Encontre eventos, grupos e cursos abertos para participar.</p></div>
    {done ? <div className="registration-success"><Icon name="check" size={32} /><h2>Solicitação enviada</h2><p>A equipe da igreja entrará em contato.</p><button className="button secondary" onClick={() => { setDone(false); setSelected(null); setSelectedCourse(null); }}>Voltar ao catálogo</button></div> : selected || selectedCourse ? <form onSubmit={submit}><h2>{selected?.name ?? selectedCourse?.name}</h2><p>{selected?.public_description || selectedCourse?.description || "Envie seus dados para receber informações."}</p><Field label="Nome completo"><input name="name" required /></Field><Field label="E-mail"><input name="email" type="email" required /></Field><Field label="Telefone"><input name="phone" /></Field><Field label="Mensagem (opcional)"><textarea name="message" rows={3} /></Field><label className="member-checkbox"><input type="checkbox" required /> Concordo com o contato para esta solicitação.</label>{error && <p className="error">{error}</p>}<Submit busy={busy} label="Enviar solicitação" /><button type="button" className="button secondary" onClick={() => { setSelected(null); setSelectedCourse(null); }}>Voltar</button></form> : <div>
      <h2>Eventos</h2>{data.events?.map((event: RecordData) => <article className="toolbar" key={event.id}><div><strong>{event.title}</strong><p>{new Date(event.starts_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{event.price_cents ? " · R$ " + (Number(event.price_cents) / 100).toFixed(2).replace(".", ",") : " · Gratuito"}</p></div><a className="button secondary" href={"/evento/" + event.id}>Ver evento</a></article>)}{!data.events?.length && <p className="muted">Nenhum evento aberto neste momento.</p>}
      <h2>Grupos</h2>{data.groups?.map((group: RecordData) => <article className="toolbar" key={group.id}><div><strong>{group.name}</strong><p>{group.public_description || "Grupo disponível para novos participantes."}</p>{group.public_contact && <small>{group.public_contact}</small>}</div><button className="button secondary" onClick={() => setSelected(group)}>Tenho interesse</button></article>)}{!data.groups?.length && <p className="muted">Nenhum grupo publicado neste momento.</p>}
      <h2>Cursos abertos</h2>{data.courses?.map((course: RecordData) => <article className="toolbar" key={course.id}><div><strong>{course.name}</strong><p>{course.course_name} · início {course.starts_on}{course.description ? " · " + course.description : ""}</p></div><button className="button secondary" onClick={() => setSelectedCourse(course)}>Tenho interesse</button></article>)}{!data.courses?.length && <p className="muted">Nenhum curso aberto neste momento.</p>}
      {(data.eventPagination?.pages > 1 || data.groupPagination?.pages > 1 || data.coursePagination?.pages > 1) && <div className="toolbar"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span className="muted">Página {page}</span><button className="button secondary" disabled={page >= Math.max(data.eventPagination?.pages ?? 1, data.groupPagination?.pages ?? 1, data.coursePagination?.pages ?? 1)} onClick={() => setPage(v => v + 1)}>Próxima</button></div>}
    </div>}
  </section></main>;
}

