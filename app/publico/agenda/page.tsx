import Link from "next/link";

import { formatDate } from "../../app-helpers";
import { getPublicAgenda } from "../../public-content";

export const dynamic = "force-dynamic";

export default async function PublicAgendaPage({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const { date, events } = await getPublicAgenda(params.date);

  return (
    <main className="public-share-page">
      <section className="public-share-shell">
        <div className="public-share-brand">
          <span>IC</span>
          <div>
            <strong>Igreja Conectada</strong>
            <small>Agenda pública</small>
          </div>
        </div>

        <article className="public-share-card">
          <p className="eyebrow">Agenda do dia</p>
          <h1>{formatDate(date)}</h1>
          <p className="public-share-muted">Eventos publicados para hoje.</p>

          <div className="public-event-list">
            {events.map((event) => (
              <div className="public-event-card" key={event.id}>
                <span>{event.time || "Sem horário"}</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>{event.ministry || "Igreja"} - {event.status}</small>
                  <small>{event.location || "Local não informado"}</small>
                  {event.responsible && <small>Responsável: {event.responsible}</small>}
                </div>
              </div>
            ))}
            {!events.length && <p className="empty-state">Nenhum evento publicado para hoje.</p>}
          </div>

          <Link className="public-share-button" href="/">
            Acessar o sistema
          </Link>
        </article>
      </section>
    </main>
  );
}
