import { useEffect, useState } from "react";
import { api, type RecordData } from "./api";

export default function EducationInterestQueue() {
  const [items, setItems] = useState<RecordData[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<RecordData>({
    page: 1,
    pages: 1,
    total: 0,
  });
  const load = () =>
    api<RecordData>(
      `/education/interests?page=${page}&pageSize=25&status=${status}`,
    )
      .then((v) => {
        setItems(v.items ?? []);
        setPagination(v);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [status, page]);
  async function update(id: string, nextStatus: string) {
    try {
      await api(`/education/interests/${id}`, "PATCH", { status: nextStatus });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeStatus(value: string) {
    setStatus(value);
    setPage(1);
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <div className="toolbar">
        <div>
          <h3>Interesses em cursos</h3>
          <p className="muted">
            Solicitações recebidas pelo catálogo público para acompanhamento da
            secretaria.
          </p>
        </div>
        <div>
          <label>
            Situação{" "}
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="pending">Pendentes</option>
              <option value="contacted">Contatadas</option>
              <option value="closed">Encerradas</option>
            </select>
          </label>{" "}
          <a
            className="button secondary"
            href={`/api/education/interests/export.csv?status=${status}`}
          >
            Exportar CSV
          </a>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items.length ? (
        items.map((item) => (
          <article className="toolbar" key={item.id}>
            <div>
              <strong>
                {item.name} · {item.class_name}
              </strong>
              <p>
                {item.email}
                {item.phone ? ` · ${item.phone}` : ""}
                {item.message ? ` · ${item.message}` : ""}
              </p>
            </div>
            <div>
              <span className="badge">{item.status}</span>
              {item.status === "pending" && (
                <button
                  className="button secondary"
                  onClick={() => void update(item.id, "contacted")}
                >
                  Marcar contato
                </button>
              )}
              {item.status !== "closed" && (
                <button
                  className="button secondary"
                  onClick={() => void update(item.id, "closed")}
                >
                  Encerrar
                </button>
              )}
            </div>
          </article>
        ))
      ) : (
        <p className="muted">Nenhuma solicitação de interesse em curso.</p>
      )}
      {pagination.pages > 1 && (
        <div className="toolbar" aria-label="Paginação de interesses em cursos">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Anterior
          </button>
          <span className="muted">
            {pagination.total} registro(s) · página {page} de {pagination.pages}
          </span>
          <button
            className="button secondary"
            disabled={page >= pagination.pages}
            onClick={() => setPage((v) => v + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
