import { useEffect, useMemo, useState } from "react";
import { api, shortDate, type RecordData } from "./api";
import { Badge, Empty, Icon } from "./ui";

type Props = {
  church: string;
  revision: number;
  notify: (message: string) => void;
  refresh: () => void;
};

type InsightData = {
  from: string;
  to: string;
  anniversaries: RecordData[];
  duplicates: Array<{ reason: string; people: RecordData[] }>;
};

function monthStart() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function monthEnd() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

export default function PeopleInsightsPage({ church, revision, notify }: Props) {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api(
      `/people/insights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      "GET",
      undefined,
      { "x-church-id": church },
    )
      .then((value) => {
        if (active) setData(value as InsightData);
      })
      .catch((error) => {
        if (active) {
          setData(null);
          notify((error as Error).message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [church, from, to, revision, notify]);

  const sorted = useMemo(
    () => data?.anniversaries ?? [],
    [data],
  );

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">SECRETARIA</span>
            <h2>Comemorações e qualidade cadastral</h2>
            <p>Encontre marcos importantes e revise possíveis duplicidades antes de confirmar alterações.</p>
          </div>
          <Icon name="people" size={28} />
        </div>
        <div className="toolbar">
          <label>
            De
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <span className="muted">Os dados respeitam a igreja selecionada e a permissão de Secretaria.</span>
        </div>
      </section>

      {loading ? (
        <section className="panel"><p role="status">Carregando indicadores cadastrais…</p></section>
      ) : (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Próximos marcos</h2>
                <p>Aniversários e datas de integração no período selecionado.</p>
              </div>
              <Badge tone="purple">{sorted.length} registros</Badge>
            </div>
            {sorted.length ? (
              <div className="simple-list">
                {sorted.map((item) => (
                  <div className="simple-row" key={`${item.personId}-${item.kind}-${item.date}`}>
                    <Icon name="calendar" />
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.label} · {shortDate(item.date)}</small>
                    </div>
                    <Badge tone="green">{item.monthDay}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nenhum marco cadastrado neste período.</Empty>
            )}
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Possíveis duplicidades</h2>
                <p>Use esta lista como revisão. Nenhum cadastro é alterado automaticamente.</p>
              </div>
              <Badge tone={data?.duplicates.length ? "amber" : "green"}>
                {data?.duplicates.length ?? 0} grupos
              </Badge>
            </div>
            {data?.duplicates.length ? (
              <div className="simple-list">
                {data.duplicates.map((group, index) => (
                  <div className="simple-row" key={`${group.reason}-${index}`}>
                    <Icon name="search" />
                    <div>
                      <strong>{group.reason}</strong>
                      <small>{group.people.map((person) => person.name).join(" · ")}</small>
                    </div>
                    <span className="muted">{group.people.length} registros</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nenhuma duplicidade provável encontrada.</Empty>
            )}
          </section>
        </>
      )}
    </div>
  );
}
