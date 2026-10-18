import { useEffect, useState, useRef, type FormEvent } from "react";
import { todayInChurch } from "../shared/dates";
import { api, money, shortDate, downloadReceipt, type RecordData } from "./api";
import { Icon, Badge, Empty, Field, Modal, Submit, formValues } from "./ui";
import MemberForm from "./MemberForm";
import RegistrationManager from "./RegistrationManager";
import "./registration.css";
export interface PageProps {
  church: string;
  revision: number;
  notify: (s: string) => void;
  refresh: () => void;
  pastoralRead?: boolean;
}
function useData<T = any>(path: string, { church, revision }: PageProps) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api<T>(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, church, revision]);
  return { data, error };
}
function Status({ error, data }: { error: string; data: unknown }) {
  return error ? (
    <Empty>{error}</Empty>
  ) : !data ? (
    <div role="status" className="loading">
      Carregando informações…
    </div>
  ) : null;
}
function Stat({
  label,
  value,
  sub,
  icon,
  tone = "purple",
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
  tone?: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon name={icon} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}
function SectionHead({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
const stages = [
  "Primeiro contato",
  "Café pastoral",
  "Integração em grupo",
  "Classe de batismo",
];
function PastoralQueue(props: PageProps) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [props.church]);
  if (!props.pastoralRead) return null;
  const { data } = useData<RecordData>(
    `/prayers?page=${page}&pageSize=5`,
    props,
  );
  if (!data) return null;
  return (
    <section
      className="panel"
      style={{ marginTop: 18 }}
      aria-labelledby="pastoral-queue-title"
    >
      <SectionHead
        title="Pedidos de oração"
        subtitle="Acompanhamento restrito à equipe pastoral autorizada."
      >
        <Badge tone="muted">{data.total ?? 0} no total</Badge>
      </SectionHead>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Pedido</th>
              <th>Situação</th>
              <th>Responsável</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {(data.items ?? []).map((item: RecordData) => (
              <tr key={item.id}>
                <td>{item.requesterName ?? "Pessoa não identificada"}</td>
                <td>
                  <span className="prayer-preview">{item.text}</span>
                  {item.resolution && (
                    <small className="block muted">
                      Resolução: {item.resolution}
                    </small>
                  )}
                </td>
                <td>
                  <select
                    aria-label={`Situação do pedido ${item.id}`}
                    value={item.status}
                    onChange={async (e) => {
                      try {
                        await api(`/prayers/${item.id}`, "PATCH", {
                          status: e.target.value,
                        });
                        props.refresh();
                        props.notify("Pedido atualizado.");
                      } catch (error) {
                        props.notify((error as Error).message);
                      }
                    }}
                  >
                    <option value="open">Aberto</option>
                    <option value="in_progress">Em acompanhamento</option>
                    <option value="resolved">Resolvido</option>
                    <option value="closed">Encerrado</option>
                  </select>
                </td>
                <td>
                  {data.assignees?.find(
                    (person: RecordData) => person.id === item.assignedTo,
                  )?.name ?? "Sem responsável"}
                </td>
                <td>
                  {item.status !== "resolved" &&
                  item.status !== "closed" &&
                  data.assignees?.length ? (
                    <select
                      aria-label={`Responsável do pedido ${item.id}`}
                      value={item.assignedTo ?? ""}
                      onChange={async (e) => {
                        try {
                          await api(`/prayers/${item.id}`, "PATCH", {
                            assignedTo: e.target.value || null,
                            status: item.status,
                          });
                          props.refresh();
                          props.notify("Responsável atualizado.");
                        } catch (error) {
                          props.notify((error as Error).message);
                        }
                      }}
                    >
                      <option value="">Sem responsável</option>
                      {data.assignees.map((person: RecordData) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items?.length && <Empty>Nenhum pedido de oração na fila.</Empty>}
      {(data.pages ?? 1) > 1 && (
        <div className="toolbar" aria-label="Paginação de pedidos de oração">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </button>
          <span className="muted">
            Página {data.page} de {data.pages}
          </span>
          <button
            className="button secondary"
            disabled={page >= data.pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
export function Dashboard(props: PageProps & { onNavigate: (p: any) => void }) {
  const { data: d, error } = useData("/dashboard", props);
  const readiness = useReadiness(props);
  const operational = useData(
    `/participation/reports?from=${todayInChurch().slice(0, 4)}-01-01&to=${todayInChurch()}`,
    props,
  );
  if (!d) return <Status data={d} error={error} />;
  const last = d.monthly.at(-1);
  const max = Math.max(1, ...d.monthly.map((m: RecordData) => Number(m.cents)));
  const points = d.monthly
    .map(
      (m: RecordData, i: number) =>
        `${50 + i * 95},${210 - (Number(m.cents) / max) * 155}`,
    )
    .join(" ");
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="Pessoas na comunidade"
          value={d.people}
          sub="Membros e visitantes ativos"
          icon="people"
        />
        <Stat
          label="Contribuições no período"
          value={money(last?.cents)}
          sub={
            last
              ? `Último mês registrado · ${last.month}`
              : "Sem lançamentos acessíveis"
          }
          icon="wallet"
          tone="green"
        />
        <Stat
          label="Grupos em movimento"
          value={d.cells}
          sub="Grupos cadastrados na igreja"
          icon="cells"
          tone="blue"
        />
        <Stat
          label="Cuidado em atenção"
          value={d.alerts.length}
          sub="3 ou mais ausências em 30 dias"
          icon="heart"
          tone="amber"
        />
      </div>
      <section
        className="panel"
        aria-labelledby="operational-health-title"
        style={{ marginTop: 18 }}
      >
        <SectionHead
          title="Saúde operacional"
          subtitle="Pendências que precisam de uma próxima ação"
        >
          <Badge tone="muted">ATUALIZADO AGORA</Badge>
        </SectionHead>
        <div className="stats-grid" style={{ marginTop: 0 }}>
          {[
            [
              "Fichas aguardando revisão",
              d.health?.pending_registrations ?? 0,
              "people",
              "people",
            ],
            [
              "Tarefas vencidas",
              d.health?.overdue_tasks ?? 0,
              "tasks",
              "operations",
            ],
            [
              "Eventos em 14 dias",
              d.health?.upcoming_events ?? 0,
              "calendar",
              "participation",
            ],
            [
              "Solicitações de privacidade",
              d.health?.open_privacy ?? 0,
              "shield",
              "operations",
            ],
            [
              "Escalas sem confirmação",
              d.health?.pending_scales ?? 0,
              "cells",
              "agenda",
            ],
            [
              "Integrações em falha",
              d.health?.failed_integrations ?? 0,
              "wallet",
              "treasury",
            ],
            [
              "Entregas de comunicação em falha",
              d.health?.failed_communications ?? 0,
              "bell",
              "communication",
            ],
            [
              "Impressões Kids em falha",
              d.health?.failed_kids_prints ?? 0,
              "bell",
              "kids",
            ],
            [
              "Interesses em cursos",
              d.health?.open_education_interests ?? 0,
              "book",
              "education",
            ],
          ].map(([label, value, icon, page]) => (
            <button
              className="stat-card"
              key={label}
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => props.onNavigate(page)}
              aria-label={`${label}: ${value}`}
            >
              <div className="stat-top">
                <span>{label}</span>
                <span className="stat-icon purple">
                  <Icon name={icon} />
                </span>
              </div>
              <strong>{value}</strong>
              <small>Ver pendências</small>
            </button>
          ))}
          {props.pastoralRead && (
            <button
              className="stat-card"
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() =>
                window.scrollTo({
                  top: document.body.scrollHeight,
                  behavior: "smooth",
                })
              }
              aria-label={`Pedidos de oração: ${d.health?.open_prayers ?? 0}`}
            >
              <div className="stat-top">
                <span>Pedidos de oração</span>
                <span className="stat-icon purple">
                  <Icon name="heart" />
                </span>
              </div>
              <strong>{d.health?.open_prayers ?? 0}</strong>
              <small>Ver fila pastoral</small>
            </button>
          )}
        </div>
      </section>
      {readiness && (
        <section
          className="panel"
          style={{ marginTop: 18 }}
          aria-labelledby="readiness-title"
        >
          <SectionHead
            title="Preparação técnica"
            subtitle="Indicadores de configuração para a homologação"
          >
            <Badge tone={readiness.ok ? "green" : "amber"}>
              {readiness.ok ? "PRONTO" : "AÇÃO NECESSÁRIA"}
            </Badge>
          </SectionHead>
          <div className="toolbar" id="readiness-title">
            {[
              ["Banco principal", readiness.checks?.database],
              ["Banco de serviço", readiness.checks?.serviceDatabase],
              ["Banco de migração", readiness.checks?.migrationDatabase],
              [
                "Chaves de dados e MFA",
                readiness.checks?.dataKey && readiness.checks?.mfaKey,
              ],
              [
                "Efí e certificados TLS",
                readiness.checks?.efi && readiness.checks?.efiTls,
              ],
              ["Comunicação externa", readiness.checks?.communication],
            ].map(([label, ok]) => (
              <span className="badge" key={String(label)}>
                <Icon name={ok ? "check" : "alert"} size={14} /> {label}:{" "}
                {ok ? "ok" : "pendente"}
              </span>
            ))}
          </div>
        </section>
      )}
      <OperationalSearch
        church={props.church}
        notify={props.notify}
        onNavigate={props.onNavigate}
      />
      <PastoralQueue {...props} />
      {operational.data && (
        <section
          className="panel"
          style={{ marginTop: 18 }}
          aria-labelledby="participation-report-title"
        >
          <SectionHead
            title="Participação e operação"
            subtitle={`Indicadores descritivos de ${shortDate(operational.data.from)} a ${shortDate(operational.data.to)}`}
          >
            <Badge tone="muted">SEM PONTUAÇÃO ESPIRITUAL</Badge>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  const response = await fetch(
                    `/api/participation/reports.csv?from=${operational.data.from}&to=${operational.data.to}`,
                    { headers: { "x-church-id": props.church } },
                  );
                  if (!response.ok) throw new Error("Exportação indisponível.");
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `participacao-${operational.data.from}-${operational.data.to}.csv`;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (e) {
                  props.notify((e as Error).message);
                }
              }}
            >
              Exportar CSV
            </button>
          </SectionHead>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            <Stat
              label="Reuniões de grupos"
              value={operational.data.cells.meetings}
              sub={`${operational.data.cells.attendance_rate ?? 0}% de presenças registradas`}
              icon="cells"
              tone="blue"
            />
            <Stat
              label="Visitantes em grupos"
              value={operational.data.cells.visitors}
              sub="Registrados nas reuniões"
              icon="people"
            />
            <Stat
              label="Inscrições em eventos"
              value={operational.data.events.registrations}
              sub={`${operational.data.events.attended} presenças confirmadas`}
              icon="calendar"
              tone="green"
            />
            <Stat
              label="Escalas ministeriais"
              value={operational.data.ministry.schedules}
              sub={`${operational.data.ministry.pending} aguardando resposta`}
              icon="heart"
              tone="amber"
            />
          </div>
          <p className="panel-footnote">
            Os indicadores mostram registros de operação e participação. A
            liderança avalia o contexto de cada pessoa.
          </p>
        </section>
      )}
      <div className="dashboard-middle">
        <section className="panel chart-panel">
          <SectionHead
            title="Generosidade que transforma"
            subtitle="Contribuições registradas · últimos períodos"
          >
            <Badge tone="muted">POR MÊS</Badge>
          </SectionHead>
          <div className="chart-legend">
            <span className="legend-dot" />
            Contribuições{" "}
            <span className="chart-total">
              {money(
                d.monthly.reduce(
                  (s: number, m: RecordData) => s + Number(m.cents),
                  0,
                ),
              )}
            </span>
          </div>
          {d.monthly.length ? (
            <svg
              className="revenue-chart"
              viewBox="0 0 600 270"
              role="img"
              aria-label={`Contribuições por mês: ${d.monthly.map((m: RecordData) => m.month + " " + money(m.cents)).join(", ")}`}
            >
              <defs>
                <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#9c8cf7" stopOpacity=".32" />
                  <stop offset="100%" stopColor="#9c8cf7" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[55, 105, 155, 210].map((y) => (
                <line
                  key={y}
                  x1="35"
                  x2="570"
                  y1={y}
                  y2={y}
                  className="chart-grid"
                />
              ))}
              <polygon
                points={`50,215 ${points} ${50 + (d.monthly.length - 1) * 95},215`}
                fill="url(#area)"
              />
              <polyline
                points={points}
                fill="none"
                stroke="#a998fa"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {d.monthly.map((m: RecordData, i: number) => (
                <g key={m.month}>
                  <circle
                    cx={50 + i * 95}
                    cy={210 - (Number(m.cents) / max) * 155}
                    r="4"
                    fill="#c2b6ff"
                  />
                  <text
                    x={50 + i * 95}
                    y="250"
                    textAnchor="middle"
                    className="chart-label"
                  >
                    {new Date(m.month + "-15").toLocaleDateString("pt-BR", {
                      month: "short",
                    })}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <Empty>Sem lançamentos disponíveis para seu perfil.</Empty>
          )}
        </section>
        <section className="panel care-panel">
          <SectionHead
            title="Um olhar de cuidado"
            subtitle="Presença percebida. Ausência acolhida."
          />
          <div className="care-banner">
            <Icon name="heart" />
            <span>
              Um contato faz a diferença.
              <small>Alertas explicáveis, sem pontuação pessoal.</small>
            </span>
          </div>
          {d.alerts.slice(0, 3).map((a: RecordData, i: number) => (
            <div className="care-person" key={a.id}>
              <span className={`avatar color-${i}`}>
                {a.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{a.name}</strong>
                <small>{a.absences} ausências registradas em 30 dias</small>
              </div>
              <button
                className="icon-button"
                aria-label={`Ver cadastro de ${a.name}`}
                onClick={() => props.onNavigate("people")}
              >
                <Icon name="arrow" size={17} />
              </button>
            </div>
          ))}
          {!d.alerts.length && (
            <p className="muted">Nenhum alerta acessível neste período.</p>
          )}
          <p className="panel-footnote">
            A liderança avalia o contexto antes de qualquer contato.
          </p>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <SectionHead
            title="Próximos passos, vínculos mais fortes"
            subtitle="Acompanhamento de integração"
          >
            <button
              className="text-button"
              onClick={() => props.onNavigate("cells")}
            >
              Ver jornada <Icon name="arrow" size={15} />
            </button>
          </SectionHead>
          <div className="journey-strip">
            {stages.map((s, i) => (
              <div key={s}>
                <span className={`journey-number step-${i}`}>
                  {d.cards.filter((c: RecordData) => c.stage === i).length}
                </span>
                <strong>{s}</strong>
                <small>Etapa {i + 1} de 4</small>
              </div>
            ))}
          </div>
        </section>
        <section className="quick-card">
          <span className="quick-icon">
            <Icon name="globe" size={28} />
          </span>
          <h2>Uma rede de confiança.</h2>
          <p>
            Acompanhe o que importa, preservando a autonomia de cada comunidade.
          </p>
          <button
            className="text-button"
            onClick={() => props.onNavigate("governance")}
          >
            Conhecer os acessos <Icon name="arrow" size={16} />
          </button>
        </section>
      </div>
    </>
  );
}

function useReadiness({ church, revision }: PageProps) {
  const [data, setData] = useState<RecordData | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    fetch("/api/health/ready", {
      credentials: "same-origin",
      headers: church ? { "x-church-id": church } : undefined,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const value = await response.json();
        if (active && value.mode === "homologation") setData(value);
      })
      .catch(() => {
        if (active) setData(null);
      });
    return () => {
      active = false;
    };
  }, [church, revision]);
  return data;
}
function OperationalSearch(props: {
  church: string;
  notify: (s: string) => void;
  onNavigate: (page: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}`,
        { headers: { "x-church-id": props.church } },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Busca indisponível.");
      setResult(body);
    } catch (error) {
      props.notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const destination =
    result?.type === "visitors_without_contact" || result?.type === "people"
      ? "people"
      : result?.type === "overdue_tasks"
        ? "operations"
        : result?.type === "education_interests"
          ? "education"
          : "agenda";
  return (
    <section
      className="panel"
      style={{ marginTop: 18 }}
      aria-labelledby="operational-search-title"
    >
      <SectionHead
        title="Assistente operacional"
        subtitle="Pergunte em linguagem natural. A resposta respeita suas permissões e não altera dados automaticamente."
      />
      <form className="toolbar" onSubmit={submit}>
        <input
          aria-label="Busca operacional"
          placeholder="Ex.: visitantes sem contato ou Ana…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="button secondary"
          disabled={busy || query.trim().length < 2}
        >
          {busy ? "Consultando…" : "Consultar"}
        </button>
      </form>
      {result && (
        <>
          <div className="toolbar">
            <p>
              <strong>{result.interpretation}</strong> ·{" "}
              {result.items?.length ?? 0} resultado(s)
            </p>
            <button
              className="button secondary"
              onClick={() => props.onNavigate(destination)}
            >
              Abrir módulo
            </button>
          </div>
          {result.suggestions?.length ? <div className="muted" style={{marginBottom:12}}>Próximas ações sugeridas: {result.suggestions.join(" · ")}</div> : null}
          {result.items?.slice(0, 10).map((item: RecordData) => (
            <div className="toolbar" key={item.id}>
              <span>{item.name ?? item.scope ?? item.id}</span>
              <small>{item.email ?? item.status ?? item.due_on ?? ""}</small>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function Network(props: PageProps & { onNavigate: (p: any) => void }) {
  const { data, error } = useData<RecordData[]>("/network", props);
  const subscriptions = useData<RecordData[]>("/network/subscriptions", props);
  if (!data) return <Status data={data} error={error} />;
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="Igrejas vinculadas"
          value={data.length}
          sub="Na sua área de supervisão"
          icon="home"
        />
        <Stat
          label="Pessoas na rede"
          value={data.reduce((n, c) => n + c.people, 0)}
          sub="Indicador agregado, sem identificação"
          icon="people"
        />
        <Stat
          label="Grupos cadastradas"
          value={data.reduce((n, c) => n + c.cells, 0)}
          sub="Comunidades que se encontram"
          icon="cells"
          tone="blue"
        />
        <Stat
          label="Entradas neste mês"
          value={money(data.reduce((n, c) => n + Number(c.income_cents), 0))}
          sub="Contribuições consolidadas"
          icon="wallet"
          tone="green"
        />
      </div>
      <section className="panel">
        <SectionHead
          title="Comunidades da sua rede"
          subtitle="A central consulta indicadores. Acesso detalhado depende de autorização local."
        >
          <Badge>SUPERVISÃO RESPONSÁVEL</Badge>
        </SectionHead>
        <div className="church-grid">
          {data.map((c) => (
            <article className="church-card" key={c.id}>
              <span className="church-emblem">
                <Icon name="home" size={30} />
              </span>
              <Badge tone="purple">VINCULADA</Badge>
              <h3>{c.name}</h3>
              <p>{c.region}</p>
              <div className="church-metrics">
                <span>
                  <strong>{c.people}</strong>pessoas
                </span>
                <span>
                  <strong>{c.cells}</strong>grupos
                </span>
                <span>
                  <strong>{money(c.income_cents)}</strong>no mês
                </span>
              </div>
            </article>
          ))}
        </div>
        {!data.length && (
          <Empty>Seu perfil não possui supervisão central.</Empty>
        )}
        <p className="panel-footnote">
          Notas pastorais, pedidos sigilosos e nomes de contribuintes não
          compõem este relatório.
        </p>
      </section>
      {subscriptions.data && (
        <section className="panel" style={{ marginTop: 18 }}>
          <SectionHead
            title="Operação comercial da rede"
            subtitle="Planos e faturas agregados, sem dados de pessoas ou doações identificáveis."
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Igreja</th>
                  <th>Plano</th>
                  <th>Situação</th>
                  <th>Mensalidade</th>
                  <th>Faturas vencidas</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.data.map((c: RecordData) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.plan ?? "Sem contrato"}</td>
                    <td>{c.status ?? "—"}</td>
                    <td>
                      {c.monthly_cents == null ? "—" : money(c.monthly_cents)}
                    </td>
                    <td>{c.overdue_invoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
export function People(
  props: PageProps & { search: string; setSearch: (s: string) => void },
) {
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"import" | "household" | "term" | null>(
      null,
    ),
    [preview, setPreview] = useState<RecordData | null>(null),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState<RecordData | null>(null),
    [filter, setFilter] = useState("all"),
    [campusId, setCampusId] = useState(""),
    [selectedSavedView, setSelectedSavedView] = useState(""),
    [contactAssignee, setContactAssignee] = useState(""),
    [historyPage, setHistoryPage] = useState(1),
    [visitorPage, setVisitorPage] = useState(1),
    [profileOverview, setProfileOverview] = useState<RecordData | null>(null);
  const pageSize = 50;
  const peoplePath = `/people/paged?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(props.search)}&status=${encodeURIComponent(filter)}${campusId ? `&campusId=${encodeURIComponent(campusId)}` : ""}`;
  const { data, error } = useData<RecordData>(peoplePath, props);
  const directory = useData("/directory", props);
  const savedViews = useData<RecordData[]>("/saved-views?kind=people", props);
  const smartLists = useData<RecordData>(
    `/smart-lists?visitorPage=${visitorPage}&visitorPageSize=25`,
    props,
  );
  const [memberEditor, setMemberEditor] = useState<{
    initial: RecordData | null;
    history?: {
      items: RecordData[];
      total: number;
      page: number;
      pageSize: number;
      pages: number;
    };
  } | null>(null);
  const registrationConfig = useData("/registration/config", props);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    const b = formValues(e);
    setBusy(true);
    try {
      if (modal === "household") await api("/households", "POST", b);
      else if (modal === "term") await api("/terms", "POST", b);
      setModal(null);
      props.refresh();
      props.notify("Cadastro salvo com sucesso.");
    } catch (e) {
      props.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rows: RecordData[] = (data?.items as RecordData[] | undefined) ?? [];
  async function saveView() {
    const name = window.prompt("Nome desta lista salva:");
    if (!name?.trim()) return;
    const shared = window.confirm(
      "Compartilhar esta lista com a equipe autorizada desta igreja?",
    );
    try {
      await api("/saved-views", "POST", {
        name: name.trim(),
        kind: "people",
        filters: {
          q: props.search,
          status: filter,
          campusId: campusId || null,
        },
        shared,
      });
      props.notify("Lista salva criada.");
      props.refresh();
    } catch (e) {
      props.notify((e as Error).message);
    }
  }
  async function deleteSavedView() {
    if (!selectedSavedView) return;
    const view = savedViews.data?.find(
      (v: RecordData) => v.id === selectedSavedView,
    );
    if (!view || !window.confirm(`Excluir a lista “${view.name}”?`)) return;
    try {
      await api(`/saved-views/${selectedSavedView}`, "DELETE");
      setSelectedSavedView("");
      props.notify("Lista salva excluída.");
      props.refresh();
    } catch (e) {
      props.notify((e as Error).message);
    }
  }
  async function updateSavedView() {
    if (!selectedSavedView) return;
    const view = savedViews.data?.find(
      (v: RecordData) => v.id === selectedSavedView,
    );
    if (!view) return;
    const name = window.prompt("Nome desta lista salva:", view.name);
    if (!name?.trim()) return;
    const shared = window.confirm(
      "Compartilhar esta lista com a equipe autorizada desta igreja?",
    );
    try {
      await api(`/saved-views/${selectedSavedView}`, "PATCH", {
        name: name.trim(),
        filters: {
          q: props.search,
          status: filter,
          campusId: campusId || null,
        },
        shared,
      });
      props.notify("Lista salva atualizada.");
      props.refresh();
    } catch (e) {
      props.notify((e as Error).message);
    }
  }
  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={18} />
          <input
            aria-label="Buscar pessoas"
            placeholder="Buscar por nome ou e-mail…"
            value={props.search}
            onChange={(e) => {
              props.setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Filtrar vínculo"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todos os vínculos</option>
          <option value="member">Membros</option>
          <option value="visitor">Visitantes</option>
          <option value="worker">Obreiros</option>
          <option value="inactive">Inativos</option>
        </select>
        <select
          aria-label="Filtrar campus"
          value={campusId}
          onChange={(e) => {
            setCampusId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os campi</option>
          {(directory.data?.campuses ?? []).map((campus: RecordData) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Listas salvas"
          value={selectedSavedView}
          onChange={(e) => {
            setSelectedSavedView(e.target.value);
            const view = savedViews.data?.find(
              (v: RecordData) => v.id === e.target.value,
            );
            if (!view) return;
            props.setSearch(view.filters?.q ?? "");
            setFilter(view.filters?.status ?? "all");
            setCampusId(view.filters?.campusId ?? "");
            setPage(1);
          }}
        >
          <option value="">Listas salvas</option>
          {savedViews.data?.map((v: RecordData) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button className="button secondary" onClick={() => void saveView()}>
          Salvar lista
        </button>
        <button
          className="button secondary"
          disabled={!selectedSavedView}
          onClick={() => void updateSavedView()}
        >
          Atualizar lista
        </button>
        <button
          className="button secondary"
          disabled={!selectedSavedView}
          onClick={() => void deleteSavedView()}
        >
          Excluir lista
        </button>
        <button
          className="button secondary"
          onClick={() => {
            setPreview(null);
            setModal("import");
          }}
        >
          <Icon name="download" size={16} />
          Importar CSV
        </button>
        <button
          className="button primary"
          disabled={!registrationConfig.data?.canManage}
          onClick={() => {
            setMemberEditor({ initial: null });
          }}
        >
          <Icon name="plus" size={17} />
          Cadastrar membro
        </button>
      </div>
      <RegistrationManager
        {...props}
        directory={directory.data}
        onChange={props.refresh}
      />
      <section className="panel">
        <SectionHead
          title="Listas inteligentes"
          subtitle="Indicadores calculados para orientar o próximo contato."
        />
        <div className="toolbar">
          <Badge tone="amber">
            {smartLists.data?.visitorsWithoutContactPagination?.total ??
              smartLists.data?.visitorsWithoutContact?.length ??
              0}{" "}
            visitantes sem contato
          </Badge>
          <Badge tone="red">
            {smartLists.data?.overdueTasks?.[0]?.count ?? 0} tarefas vencidas
          </Badge>
          <Badge tone="green">
            {smartLists.data?.availableVolunteers?.length ?? 0} voluntários
            disponíveis
          </Badge>
          <Badge tone="blue">
            {smartLists.data?.visitorContactTasks?.[0]?.open ?? 0} contatos
            abertos
          </Badge>
        </div>
        {!!smartLists.data?.visitorsWithoutContact?.length && (
          <>
            <p className="panel-footnote">
              Visitantes sem telefone ou e-mail:{" "}
              {smartLists.data.visitorsWithoutContact
                .slice(0, 5)
                .map((v: RecordData) => v.name)
                .join(", ")}
              {smartLists.data.visitorsWithoutContact.length > 5 ? "…" : ""}
            </p>
            <button
              className="button secondary"
              onClick={async () => {
                const dueOn = window.prompt(
                  "Prazo para o contato (AAAA-MM-DD):",
                );
                if (!dueOn) return;
                try {
                  const result = await api(
                    "/smart-lists/visitors-without-contact/tasks",
                    "POST",
                    {
                      personIds:
                        smartLists.data?.visitorsWithoutContact?.map(
                          (v: RecordData) => v.id,
                        ) ?? [],
                      dueOn,
                      assignedTo: contactAssignee || null,
                    },
                  );
                  props.notify(
                    `${result.created.length} tarefa(s) criada(s); ${result.skipped} já existiam.`,
                  );
                  props.refresh();
                } catch (e) {
                  props.notify((e as Error).message);
                }
              }}
            >
              Criar tarefas de contato
            </button>
            <select
              aria-label="Responsável pelos contatos"
              value={contactAssignee}
              onChange={(e) => setContactAssignee(e.target.value)}
            >
              <option value="">Atribuir a mim</option>
              {(smartLists.data?.availableVolunteers ?? []).map(
                (person: RecordData) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ),
              )}
            </select>
            {(smartLists.data?.visitorsWithoutContactPagination?.pages ?? 1) >
              1 && (
              <div
                className="toolbar"
                aria-label="Paginação de visitantes sem contato"
              >
                <button
                  className="button secondary"
                  disabled={visitorPage <= 1}
                  onClick={() => setVisitorPage((v) => v - 1)}
                >
                  Anterior
                </button>
                <span className="muted">
                  Página {smartLists.data.visitorsWithoutContactPagination.page}{" "}
                  de {smartLists.data.visitorsWithoutContactPagination.pages}
                </span>
                <button
                  className="button secondary"
                  disabled={
                    visitorPage >=
                    smartLists.data.visitorsWithoutContactPagination.pages
                  }
                  onClick={() => setVisitorPage((v) => v + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
            <small className="muted">
              Criadas: {smartLists.data?.visitorContactTasks?.[0]?.total ?? 0} ·
              concluídas: {smartLists.data?.visitorContactTasks?.[0]?.done ?? 0}{" "}
              · sem responsável:{" "}
              {smartLists.data?.visitorContactTasks?.[0]?.unassigned ?? 0}
            </small>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  const response = await fetch(
                    "/api/smart-lists/visitor-contact-performance.csv",
                    { headers: { "x-church-id": props.church } },
                  );
                  if (!response.ok) throw new Error("Exportação indisponível.");
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "desempenho-contatos.csv";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (e) {
                  props.notify((e as Error).message);
                }
              }}
            >
              Exportar desempenho CSV
            </button>
            {!!smartLists.data?.visitorContactPerformance?.length && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th>Total</th>
                      <th>Abertas</th>
                      <th>Vencidas</th>
                      <th>Concluídas</th>
                      <th>Média até concluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smartLists.data.visitorContactPerformance.map(
                      (row: RecordData) => (
                        <tr key={row.assigned_to ?? "unassigned"}>
                          <td>{row.responsible}</td>
                          <td>{row.total}</td>
                          <td>{row.open}</td>
                          <td>{row.overdue}</td>
                          <td>{row.done}</td>
                          <td>
                            {row.average_days == null
                              ? "—"
                              : `${row.average_days} dia(s)`}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <SectionHead
          title="Pessoas e suas histórias"
          subtitle={`${data?.total ?? 0} registros visíveis · página ${data?.page ?? page} de ${data?.pages ?? 1}`}
        >
          <button
            className="text-button"
            onClick={async () => {
              try {
                const res = await fetch("/api/people/export", {
                  headers: { "x-church-id": props.church },
                });
                if (!res.ok) throw new Error("Exportação não autorizada.");
                const url = URL.createObjectURL(await res.blob());
                const a = document.createElement("a");
                a.href = url;
                a.download = "membros.csv";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (e) {
                props.notify((e as Error).message);
              }
            }}
          >
            Exportar <Icon name="download" size={15} />
          </button>
        </SectionHead>
        <Status data={data} error={error} />
        {data && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Família</th>
                  <th>Vínculo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="person-name">
                        {p.has_photo ? (
                          <img
                            className="avatar mini"
                            src={`/api/people/${p.id}/photo?church=${props.church}&v=${props.revision}`}
                            alt={`Foto de ${p.name}`}
                          />
                        ) : (
                          <span className="avatar mini">{p.name[0]}</span>
                        )}
                        <strong>{p.name}</strong>
                      </span>
                    </td>
                    <td>{p.email ?? "Não informado"}</td>
                    <td>{p.household ?? "Sem vínculo familiar"}</td>
                    <td>
                      <Badge
                        tone={
                          p.status === "visitor"
                            ? "amber"
                            : p.status === "inactive"
                              ? "muted"
                              : "green"
                        }
                      >
                        {
                          (
                            {
                              member: "Membro",
                              visitor: "Visitante",
                              worker: "Obreiro",
                              inactive: "Inativo",
                            } as RecordData
                          )[p.status]
                        }
                      </Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              setProfileOverview(
                                await api(`/people/${p.id}/overview`),
                              );
                            } catch (e) {
                              props.notify((e as Error).message);
                            }
                          }}
                          disabled={!registrationConfig.data?.canManage}
                        >
                          Visão integrada
                        </button>
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              const [initial, history] = await Promise.all([
                                api(`/people/${p.id}/profile`),
                                api<{
                                  items: RecordData[];
                                  total: number;
                                  page: number;
                                  pageSize: number;
                                  pages: number;
                                }>(
                                  `/people/${p.id}/history?page=1&pageSize=25`,
                                ),
                              ]);
                              setHistoryPage(1);
                              setMemberEditor({ initial, history });
                            } catch (e) {
                              props.notify((e as Error).message);
                            }
                          }}
                          disabled={!registrationConfig.data?.canManage}
                        >
                          Editar
                        </button>
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              setCredential(
                                await api("/credentials", "POST", {
                                  personId: p.id,
                                }),
                              );
                            } catch (e) {
                              props.notify((e as Error).message);
                            }
                          }}
                        >
                          Credencial
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty>Nenhuma pessoa encontrada.</Empty>}
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="toolbar" aria-label="Paginação de pessoas">
            <button
              className="button secondary"
              disabled={page <= 1}
              onClick={() => setPage((v) => Math.max(1, v - 1))}
            >
              Anterior
            </button>
            <span className="muted">
              Página {data.page} de {data.pages}
            </span>
            <button
              className="button secondary"
              disabled={page >= data.pages}
              onClick={() => setPage((v) => Math.min(data.pages, v + 1))}
            >
              Próxima
            </button>
          </div>
        )}
      </section>
      <div className="two-columns">
        <section className="panel">
          <SectionHead
            title="Famílias"
            subtitle="Vínculos que conectam gerações"
          >
            <button
              className="text-button"
              onClick={() => setModal("household")}
            >
              Adicionar <Icon name="plus" size={16} />
            </button>
          </SectionHead>
          {directory.data?.households.map((h: RecordData) => (
            <div className="simple-row" key={h.id}>
              <Icon name="home" />
              <strong>{h.name}</strong>
              <Badge tone="muted">
                {data?.items?.filter((p: RecordData) => p.household_id === h.id)
                  .length ?? 0}{" "}
                pessoas
              </Badge>
            </div>
          ))}
        </section>
        <section className="panel">
          <SectionHead
            title="Dirigentes e mandatos"
            subtitle="Responsabilidades com vigência definida"
          >
            <button className="text-button" onClick={() => setModal("term")}>
              Adicionar <Icon name="plus" size={16} />
            </button>
          </SectionHead>
          {directory.data?.terms.length ? (
            directory.data.terms.map((t: RecordData) => (
              <div className="simple-row" key={t.id}>
                <strong>{t.name}</strong>
                <span>{t.title}</span>
                <small>Até {shortDate(t.ends_on)}</small>
              </div>
            ))
          ) : (
            <p className="muted">Nenhum mandato cadastrado.</p>
          )}
        </section>
      </div>
      {memberEditor && (
        <Modal
          title={
            memberEditor.initial
              ? "Editar perfil do membro"
              : "Cadastro manual pela secretaria"
          }
          onClose={() => setMemberEditor(null)}
        >
          <MemberForm
            initial={memberEditor.initial}
            directory={directory.data}
            defaultCampusId={registrationConfig.data?.defaultCampusId}
            onSave={async (body) => {
              await api(
                memberEditor.initial
                  ? `/people/${memberEditor.initial.id}/profile`
                  : "/people/profiles",
                memberEditor.initial ? "PATCH" : "POST",
                body,
              );
              setMemberEditor(null);
              props.refresh();
              props.notify("Ficha do membro salva com sucesso.");
            }}
          />
          {memberEditor.initial && (
            <section className="panel-footnote">
              <h3>Histórico de alterações</h3>
              {!memberEditor.history?.items?.length && (
                <p>Nenhuma alteração de perfil registrada.</p>
              )}
              {memberEditor.history?.items?.map((entry: RecordData) => (
                <p key={entry.id}>
                  <strong>{entry.actor_name}</strong> ·{" "}
                  {new Date(entry.changed_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                  <br />
                  <small>
                    Campos alterados: {(entry.changed_fields ?? []).join(", ")}
                  </small>
                </p>
              ))}
              {(memberEditor.history?.pages ?? 1) > 1 && (
                <div
                  className="toolbar"
                  aria-label="Paginação do histórico do membro"
                >
                  <button
                    className="button secondary"
                    disabled={historyPage <= 1}
                    onClick={async () => {
                      const next = historyPage - 1;
                      const history = await api<{
                        items: RecordData[];
                        total: number;
                        page: number;
                        pageSize: number;
                        pages: number;
                      }>(
                        `/people/${memberEditor.initial!.id}/history?page=${next}&pageSize=25`,
                      );
                      setHistoryPage(next);
                      setMemberEditor((current) =>
                        current ? { ...current, history } : current,
                      );
                    }}
                  >
                    Anterior
                  </button>
                  <span className="muted">
                    Página {memberEditor.history!.page} de{" "}
                    {memberEditor.history!.pages}
                  </span>
                  <button
                    className="button secondary"
                    disabled={historyPage >= memberEditor.history!.pages}
                    onClick={async () => {
                      const next = historyPage + 1;
                      const history = await api<{
                        items: RecordData[];
                        total: number;
                        page: number;
                        pageSize: number;
                        pages: number;
                      }>(
                        `/people/${memberEditor.initial!.id}/history?page=${next}&pageSize=25`,
                      );
                      setHistoryPage(next);
                      setMemberEditor((current) =>
                        current ? { ...current, history } : current,
                      );
                    }}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </section>
          )}
        </Modal>
      )}
      {profileOverview && (
        <Modal
          title={`Visão integrada · ${profileOverview.person?.name ?? "Membro"}`}
          onClose={() => setProfileOverview(null)}
        >
          <p className="muted">
            Resumo operacional da mesma ficha, dentro da igreja autorizada.
            Notas pastorais e dados financeiros ficam fora desta visão.
          </p>
          <div className="two-columns">
            <section className="panel">
              <h3>Família e grupos</h3>
              <p>
                {profileOverview.household?.length ?? 0} familiar(es) ·{" "}
                {profileOverview.cells?.length ?? 0} grupo(s)
              </p>
              {profileOverview.cells?.map((item: RecordData) => (
                <div className="simple-row" key={item.id}>
                  <strong>{item.name}</strong>
                  <small>{item.leader_name ?? ""}</small>
                </div>
              ))}
            </section>
            <section className="panel">
              <h3>Participação</h3>
              <p>
                {profileOverview.events?.length ?? 0} evento(s) ·{" "}
                {profileOverview.education?.length ?? 0} matrícula(s)
              </p>
              {profileOverview.education
                ?.slice(0, 4)
                .map((item: RecordData) => (
                  <div className="simple-row" key={item.class_id}>
                    <strong>{item.course_name}</strong>
                    <small>
                      {item.class_name} · {item.status}
                    </small>
                  </div>
                ))}
            </section>
            <section className="panel">
              <h3>Ministérios e escalas</h3>
              <p>
                {profileOverview.teams?.length ?? 0} equipe(s) ·{" "}
                {profileOverview.schedules?.length ?? 0} escala(s)
              </p>
              {profileOverview.teams?.map((item: RecordData) => (
                <div className="simple-row" key={item.id}>
                  <strong>{item.name}</strong>
                  <small>{item.role}</small>
                </div>
              ))}
            </section>
            <section className="panel">
              <h3>Acompanhamentos</h3>
              <p>
                {profileOverview.workflows?.length ?? 0} workflow(s) ·{" "}
                {profileOverview.tasks?.length ?? 0} tarefa(s)
              </p>
              {profileOverview.workflows
                ?.slice(0, 4)
                .map((item: RecordData) => (
                  <div className="simple-row" key={item.id}>
                    <strong>{item.workflow_name}</strong>
                    <small>
                      {item.step_title ?? ""} · {item.status}
                    </small>
                  </div>
                ))}
            </section>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal === "household"
              ? "Nova família"
              : modal === "term"
                ? "Novo mandato"
                : "Importar pessoas"
          }
          onClose={() => setModal(null)}
        >
          {modal === "import" ? (
            <>
              <p>
                Use as colunas <code>name,email,phone,status</code>. Vínculos:
                member, visitor, worker ou inactive. Até 1.000 linhas.
              </p>
              <Field label="Arquivo CSV">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setPreview(
                        await api("/import/preview", "POST", {
                          csv: await file.text(),
                        }),
                      );
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                />
              </Field>
              {preview && (
                <>
                  <p>
                    <Badge>{preview.valid.length} linhas válidas</Badge>{" "}
                    <Badge tone="amber">
                      {preview.issues.length} linhas para revisão
                    </Badge>
                  </p>
                  <div className="preview-list">
                    {preview.issues.map((i: RecordData) => (
                      <p key={i.line}>
                        Linha {i.line}: {i.error}
                      </p>
                    ))}
                    {preview.valid.map((v: RecordData, i: number) => (
                      <p key={i}>
                        <Icon name="check" size={15} /> {v.name} · {v.email}
                      </p>
                    ))}
                  </div>
                  <button
                    className="button primary"
                    disabled={busy || !preview.valid.length}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const done = await api("/import/confirm", "POST", {
                          previewId: preview.previewId,
                        });
                        props.notify(`${done.imported} pessoas importadas.`);
                        setModal(null);
                        props.refresh();
                      } catch (e) {
                        props.notify((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Confirmar linhas válidas
                  </button>
                </>
              )}
            </>
          ) : (
            <form onSubmit={save}>
              {modal === "term" ? (
                <>
                  <Field label="Pessoa">
                    <select name="personId" required>
                      {data?.items?.map((p: RecordData) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cargo">
                    <input name="title" required />
                  </Field>
                  <Field label="Início">
                    <input name="startsOn" type="date" required />
                  </Field>
                  <Field label="Fim">
                    <input name="endsOn" type="date" required />
                  </Field>
                </>
              ) : (
                <Field label="Nome da família">
                  <input name="name" required />
                </Field>
              )}
              <Submit busy={busy} />
            </form>
          )}
        </Modal>
      )}
      {credential && (
        <Modal title="Credencial digital" onClose={() => setCredential(null)}>
          <div className="credential">
            <Icon name="home" size={32} />
            <h2>{credential.name}</h2>
            <img
              src={credential.qrDataUrl}
              width="220"
              height="220"
              alt="QR de validação da credencial"
            />
            <Badge>Válida por {credential.expiresIn}</Badge>
            <p>A validação exige acesso autorizado à igreja.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Cells(props: PageProps) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const { data, error } = useData<RecordData>(
      `/cells?page=${page}&pageSize=25&q=${encodeURIComponent(search)}`,
      props,
    ),
    dashboard = useData("/dashboard", props);
  const [modal, setModal] = useState<RecordData | null>(null),
    [members, setMembers] = useState<RecordData[]>([]),
    [busy, setBusy] = useState(false);
  const openMeeting = async (c: RecordData) => {
    try {
      setMembers(
        (await api(`/cells/${c.id}/members`)).map((m: RecordData) => ({
          ...m,
          present: true,
        })),
      );
      setModal(c);
    } catch (e) {
      props.notify((e as Error).message);
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    const b = formValues(e);
    setBusy(true);
    try {
      if (modal?.id)
        await api(`/cells/${modal.id}/meetings`, "POST", {
          heldOn: b.heldOn,
          visitors: Number(b.visitors),
          attendance: members.map((m) => ({
            personId: m.id,
            present: m.present,
          })),
        });
      else
        await api("/cells", "POST", {
          name: b.name,
          leaderName: b.leaderName,
          parentId: b.parentId || undefined,
          publicDirectory: b.publicDirectory === "on",
          publicDescription: b.publicDescription || "",
          publicContact: b.publicContact || "",
        });
      setModal(null);
      props.refresh();
      props.notify("Informações salvas.");
    } catch (e) {
      props.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="toolbar">
        <Badge tone="purple">ENCONTROS QUE CONECTAM</Badge>
        <input
          aria-label="Buscar grupos"
          placeholder="Buscar grupo ou líder…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <button className="button primary" onClick={() => setModal({})}>
          <Icon name="plus" size={17} />
          Nova grupo
        </button>
      </div>
      <Status data={data} error={error} />
      <div className="cell-grid">
        {data?.items?.map((c: RecordData, i: number) => (
          <article className="panel cell-card" key={c.id}>
            <div className="cell-card-top">
              <span className={`stat-icon ${i % 2 ? "green" : "purple"}`}>
                <Icon name="cells" size={25} />
              </span>
              <Badge tone="muted">{c.members} pessoas</Badge>
            </div>
            <h2>{c.name}</h2>
            <p>Liderança de {c.leader_name}</p>
            <div className="cell-meta">
              <Icon name="people" size={15} />
              Relatórios e presença por encontro
            </div>
            {c.public_directory && (
              <div className="row-actions">
                <small className="muted">
                  Catálogo público: {window.location.origin}/catalogo/
                  {props.church} · diretório direto: {window.location.origin}
                  /grupos/{props.church}
                </small>
                <button
                  type="button"
                  className="button secondary"
                  onClick={async () => {
                    const url = `${window.location.origin}/catalogo/${props.church}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      props.notify("Link do catálogo copiado.");
                    } catch {
                      props.notify(
                        "Não foi possível copiar automaticamente; selecione o link exibido.",
                      );
                    }
                  }}
                >
                  Copiar link
                </button>
              </div>
            )}
            <button className="button secondary" onClick={() => openMeeting(c)}>
              Registrar encontro <Icon name="arrow" size={16} />
            </button>
          </article>
        ))}
      </div>
      {data && data.pages > 1 && (
        <div className="toolbar" aria-label="Paginação de grupos">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Anterior
          </button>
          <span className="muted">
            Página {data.page} de {data.pages} · {data.total} grupos
          </span>
          <button
            className="button secondary"
            disabled={page >= data.pages}
            onClick={() => setPage((v) => v + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      <section className="panel">
        <SectionHead
          title="Jornada de integração"
          subtitle="Um passo de cada vez. Um acompanhamento próximo."
        />
        <div className="kanban">
          {stages.map((stage, i) => (
            <div className="kanban-column" key={stage}>
              <div className="kanban-title">
                <span className={`stage-dot step-${i}`} />
                <strong>{stage}</strong>
                <small>
                  {dashboard.data?.cards.filter(
                    (c: RecordData) => c.stage === i,
                  ).length ?? 0}
                </small>
              </div>
              {dashboard.data?.cards
                .filter((c: RecordData) => c.stage === i)
                .map((c: RecordData) => (
                  <article key={c.id} className="kanban-card">
                    <span className="avatar mini">{c.name[0]}</span>
                    <strong>{c.name}</strong>
                    {i < 3 ? (
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api(`/workflows/${c.id}`, "PATCH", {
                              stage: i + 1,
                            });
                            props.refresh();
                          } catch (e) {
                            props.notify((e as Error).message);
                          }
                        }}
                      >
                        Avançar <Icon name="arrow" size={14} />
                      </button>
                    ) : (
                      <Badge>Jornada concluída</Badge>
                    )}
                  </article>
                ))}
            </div>
          ))}
        </div>
      </section>
      {modal && (
        <Modal
          title={modal.id ? `Encontro · ${modal.name}` : "Nova grupo"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={submit}>
            {modal.id ? (
              <>
                <Field label="Data do encontro">
                  <input
                    name="heldOn"
                    type="date"
                    required
                    defaultValue={todayInChurch()}
                  />
                </Field>
                <Field label="Visitantes">
                  <input
                    name="visitors"
                    type="number"
                    min="0"
                    defaultValue="0"
                    required
                  />
                </Field>
                <div className="attendance-list">
                  {members.map((m, i) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={m.present}
                        onChange={(e) =>
                          setMembers((old) =>
                            old.map((p, j) =>
                              j === i ? { ...p, present: e.target.checked } : p,
                            ),
                          )
                        }
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
                {!members.length && (
                  <p className="muted">
                    Ainda não há pessoas vinculadas a esta grupo.
                  </p>
                )}
              </>
            ) : (
              <>
                <Field label="Nome da grupo">
                  <input name="name" required />
                </Field>
                <Field label="Nome da liderança">
                  <input name="leaderName" required />
                </Field>
                <label className="member-checkbox">
                  <input name="publicDirectory" type="checkbox" />
                  Publicar no diretório de grupos
                </label>
                <Field label="Descrição pública (opcional)">
                  <textarea name="publicDescription" rows={3} maxLength={500} />
                </Field>
                <Field label="Contato público (opcional)">
                  <input
                    name="publicContact"
                    maxLength={300}
                    placeholder="E-mail ou instrução de contato"
                  />
                </Field>
              </>
            )}
            <Submit
              busy={busy}
              label={modal.id ? "Enviar relatório" : "Criar grupo"}
            />
          </form>
        </Modal>
      )}
    </>
  );
}
export function Finance(props: PageProps & { mode: string }) {
  const pixAttempt = useRef<{ key: string; fingerprint: string } | null>(null);
  const { data: d, error } = useData("/finance", props);
  const [modal, setModal] = useState<"entry" | "pix" | "close" | null>(null),
    [busy, setBusy] = useState(false),
    [charge, setCharge] = useState<RecordData | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    const b = formValues(e);
    setBusy(true);
    try {
      if (modal === "entry")
        await api("/finance/entries", "POST", {
          ...b,
          fundId: b.fundId || undefined,
          costCenterId: b.costCenterId || undefined,
        });
      if (modal === "pix") {
        const fingerprint = JSON.stringify([b.amount, b.fundId]);
        if (pixAttempt.current?.fingerprint !== fingerprint)
          pixAttempt.current = { key: crypto.randomUUID(), fingerprint };
        setCharge(
          await api("/pix/charges", "POST", {
            ...b,
            requestKey: pixAttempt.current!.key,
          }),
        );
        pixAttempt.current = null;
      }
      if (modal === "close") await api("/finance/close", "POST", b);
      setModal(null);
      props.refresh();
      props.notify("Operação registrada.");
    } catch (e) {
      props.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!d) return <Status data={d} error={error} />;
  const balance = d.entries.reduce(
      (s: number, e: RecordData) => s + Number(e.cash_cents),
      0,
    ),
    settled = d.charges.filter((c: RecordData) => c.status === "settled");
  return (
    <>
      <div className="stats-grid finance-stats">
        <Stat
          label="Saldo dos lançamentos"
          value={money(balance)}
          sub="Entradas e saídas registradas"
          icon="wallet"
          tone="green"
        />
        <Stat
          label="Pix conciliado"
          value={money(
            settled.reduce(
              (s: number, c: RecordData) => s + Number(c.amount_cents),
              0,
            ),
          )}
          sub={`${settled.length} recebimentos confirmados`}
          icon="check"
        />
        <Stat
          label="Tarifas registradas"
          value={money(
            settled.reduce(
              (s: number, c: RecordData) => s + Number(c.fee_cents),
              0,
            ),
          )}
          sub="Separadas do valor bruto"
          icon="shield"
          tone="blue"
        />
      </div>
      <div className="toolbar">
        <div className="security-inline">
          <Icon name="shield" size={17} />
          {props.mode === "demo"
            ? "Cobranças fictícias, sem movimentação financeira."
            : "Efí em homologação. Confirmação exclusiva pelo provedor."}
        </div>
        <button className="button secondary" onClick={() => setModal("close")}>
          Fechar período
        </button>
        <button className="button secondary" onClick={() => setModal("entry")}>
          <Icon name="plus" size={16} />
          Lançamento
        </button>
        <button className="button primary" onClick={() => setModal("pix")}>
          <Icon name="plus" size={16} />
          Cobrança Pix
        </button>
      </div>
      <section className="panel">
        <SectionHead
          title="Livro financeiro"
          subtitle="Lançamentos balanceados. Histórico preservado."
        >
          <Badge tone="muted">BRL · REGIME DE CAIXA</Badge>
        </SectionHead>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Movimento em caixa</th>
                <th>Registro</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e: RecordData) => (
                <tr key={e.id}>
                  <td>{shortDate(e.occurred_on)}</td>
                  <td>
                    <strong>{e.description}</strong>
                  </td>
                  <td
                    className={
                      Number(e.cash_cents) >= 0 ? "positive" : "negative"
                    }
                  >
                    {Number(e.cash_cents) >= 0 ? "+" : ""}
                    {money(e.cash_cents)}
                  </td>
                  <td>
                    <Badge tone={e.reversal_of ? "amber" : "green"}>
                      {e.reversal_of ? "Reversão" : "Registrado"}
                    </Badge>
                  </td>
                  <td>
                    {!e.reversal_of &&
                      !d.entries.some(
                        (v: RecordData) => v.reversal_of === e.id,
                      ) &&
                      !d.charges.some(
                        (c: RecordData) => c.entry_id === e.id,
                      ) && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api(
                                `/finance/entries/${e.id}/reverse`,
                                "POST",
                              );
                              props.refresh();
                              props.notify(
                                "Reversão registrada, original preservado.",
                              );
                            } catch (e) {
                              props.notify((e as Error).message);
                            }
                          }}
                        >
                          Reverter
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <SectionHead
          title="Cobranças e conciliação Pix"
          subtitle="Criar uma cobrança não confirma o recebimento."
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Identificação</th>
                <th>Valor bruto</th>
                <th>Tarifa</th>
                <th>Líquido</th>
                <th>Estado</th>
                <th>Conciliação</th>
              </tr>
            </thead>
            <tbody>
              {d.charges.map((c: RecordData) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.txid.slice(0, 12)}…</code>
                  </td>
                  <td>{money(c.amount_cents)}</td>
                  <td>{money(c.fee_cents)}</td>
                  <td>{money(Number(c.amount_cents) - Number(c.fee_cents))}</td>
                  <td>
                    <Badge tone={c.status === "settled" ? "green" : "amber"}>
                      {
                        (
                          {
                            active: "Aguardando",
                            settled: "Conciliado",
                            expired: "Expirado",
                            refunded: "Devolvido",
                          } as RecordData
                        )[c.status]
                      }
                    </Badge>
                  </td>
                  <td>
                    {(c.status === "active" || c.status === "expired") && (
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api(
                              props.mode === "demo"
                                ? `/demo/settle/${c.id}`
                                : `/pix/reconcile/${c.id}`,
                              "POST",
                            );
                            props.refresh();
                            props.notify(
                              props.mode === "demo"
                                ? "Evento fictício conciliado."
                                : "Consulta ao provedor concluída.",
                            );
                          } catch (e) {
                            props.notify((e as Error).message);
                          }
                        }}
                      >
                        {props.mode === "demo"
                          ? "Simular evento"
                          : "Consultar provedor"}
                      </button>
                    )}
                    {["settled", "refunded"].includes(c.status) && (
                      <button
                        className="text-button"
                        onClick={() =>
                          downloadReceipt(c.id).catch((e) =>
                            props.notify(e.message),
                          )
                        }
                      >
                        Comprovante
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.charges.length && (
            <Empty>
              Nenhuma cobrança criada. Comece escolhendo um fundo e um valor.
            </Empty>
          )}
        </div>
      </section>
      {d.closings.length > 0 && (
        <p className="muted">
          Último fechamento: {shortDate(d.closings[0].through_date)}. Períodos
          fechados não aceitam novos lançamentos.
        </p>
      )}
      {modal && (
        <Modal
          title={
            modal === "entry"
              ? "Novo lançamento"
              : modal === "pix"
                ? "Nova contribuição Pix"
                : "Fechar período financeiro"
          }
          onClose={() => setModal(null)}
        >
          <form onSubmit={submit}>
            {modal === "close" ? (
              <>
                <p>
                  Após o fechamento, correções devem ser registradas como
                  reversões em período aberto.
                </p>
                <Field label="Fechar até">
                  <input
                    name="throughDate"
                    type="date"
                    required
                    max={todayInChurch()}
                  />
                </Field>
              </>
            ) : (
              <>
                {modal === "entry" && (
                  <>
                    <Field label="Descrição">
                      <input name="description" required />
                    </Field>
                    <Field label="Tipo">
                      <select name="kind">
                        <option value="income">Entrada</option>
                        {props.mode === "demo" && (
                          <option value="expense">Saída demonstrativa</option>
                        )}
                      </select>
                    </Field>
                    <Field label="Data">
                      <input
                        name="date"
                        type="date"
                        defaultValue={todayInChurch()}
                        required
                      />
                    </Field>
                  </>
                )}
                <Field label="Valor (R$)">
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="150,00"
                    required
                  />
                </Field>
                <Field label="Fundo">
                  <select name="fundId" required={modal === "pix"}>
                    {modal === "entry" && <option value="">Sem fundo</option>}
                    {d.funds.map((f: RecordData) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {modal === "entry" && (
                  <Field label="Centro de custo">
                    <select name="costCenterId">
                      <option value="">Sem centro de custo</option>
                      {d.costCenters.map((c: RecordData) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
            <Submit
              busy={busy}
              label={modal === "pix" ? "Gerar cobrança" : "Registrar"}
            />
          </form>
        </Modal>
      )}
      {charge && (
        <ChargeModal
          charge={charge}
          mode={props.mode}
          onClose={() => setCharge(null)}
          notify={props.notify}
        />
      )}
    </>
  );
}
function ChargeModal({
  charge,
  mode,
  onClose,
  notify,
}: {
  charge: RecordData;
  mode: string;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [current, setCurrent] = useState(charge);
  const status = current.status;
  useEffect(() => {
    const t = setInterval(
      () =>
        api("/pix/charges/" + charge.id)
          .then((c) => setCurrent(c))
          .catch(() => {}),
      5000,
    );
    return () => clearInterval(t);
  }, [charge.id]);
  return (
    <Modal
      title={
        mode === "demo"
          ? "Cobrança demonstrativa"
          : "Contribuição Pix · homologação"
      }
      onClose={onClose}
    >
      <div className="credential">
        <h2>{money(charge.amount_cents)}</h2>
        {current.qrDataUrl && (
          <img
            src={current.qrDataUrl}
            width="240"
            height="240"
            alt={
              mode === "demo"
                ? "QR demonstrativo sem valor financeiro"
                : "QR de cobrança Pix em homologação"
            }
          />
        )}
        <Badge tone={status === "settled" ? "green" : "amber"}>
          {status === "settled"
            ? "Recebimento conciliado"
            : status === "creating"
              ? "Preparando cobrança · recuperação automática ativa"
              : status === "expired"
                ? "Cobrança expirada"
                : "Aguardando confirmação"}
        </Badge>
        <p>
          {mode === "demo"
            ? "Este QR é fictício e não pode ser pago. Use “Simular evento” na tesouraria."
            : "Use somente o ambiente de homologação do provedor."}
        </p>
        <textarea
          readOnly
          aria-label="Conteúdo da cobrança"
          value={current.copy_paste}
        />
        <button
          className="button secondary"
          disabled={!current.copy_paste}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(current.copy_paste);
              notify("Conteúdo copiado.");
            } catch {
              notify("Selecione o conteúdo e copie manualmente.");
            }
          }}
        >
          Copiar conteúdo
        </button>
      </div>
    </Modal>
  );
}
export function Governance(
  props: PageProps & {
    current: RecordData;
    reloadContext: () => Promise<void>;
  },
) {
  const grants = useData<RecordData[]>("/grants", props),
    candidates = useData<RecordData[]>("/grant-candidates", props),
    regional = useData<RecordData>("/regional-grants", props),
    [auditPage, setAuditPage] = useState(1),
    [auditAction, setAuditAction] = useState(""),
    events = useData<RecordData>(
      `/audit?page=${auditPage}&pageSize=50&action=${encodeURIComponent(auditAction)}`,
      props,
    );
  const [modal, setModal] = useState<"church" | "regional" | null>(null),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"permissions" | "brand" | "audit">("permissions");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    const b = formValues(e);
    setBusy(true);
    try {
      await api(modal === "regional" ? "/regional-grants" : "/grants", "POST", {
        ...b,
        days: Number(b.days),
        regionId: b.regionId,
        userId: b.userId,
      });
      setModal(null);
      props.refresh();
      props.notify("Acesso concedido com prazo e auditoria.");
    } catch (e) {
      props.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="privacy-banner">
        <Icon name="shield" size={30} />
        <div>
          <h2>A igreja escolhe o que compartilhar.</h2>
          <p>
            A rede recebe indicadores. Consultas detalhadas exigem autorização
            local, têm prazo e podem ser revogadas.
          </p>
        </div>
        <Badge tone="purple">PRIVACIDADE POR PADRÃO</Badge>
      </div>
      <div className="tabs" role="group" aria-label="Seções de governança">
        {[
          ["permissions", "Concessões de acesso"],
          ["brand", "Identidade e plano"],
          ["audit", "Trilha de auditoria"],
        ].map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => setTab(key as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "permissions" && (
        <section className="panel">
          <SectionHead
            title="Acessos detalhados da central"
            subtitle="Somente leitura. Sem acesso a notas pastorais ou pedidos sigilosos."
          >
            <button
              className="button primary"
              onClick={() => setModal("church")}
            >
              <Icon name="plus" size={16} />
              Conceder acesso
            </button>
            {regional.data && (
              <button
                className="button secondary"
                onClick={() => setModal("regional")}
              >
                Conceder acesso regional
              </button>
            )}
          </SectionHead>
          <Status data={grants.data} error={grants.error} />
          {grants.data && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Responsável</th>
                    <th>Área</th>
                    <th>Vigência</th>
                    <th>Estado</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.data.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <strong>{g.name}</strong>
                        <small className="block">{g.email}</small>
                      </td>
                      <td>
                        {
                          (
                            {
                              people: "Pessoas",
                              finance: "Financeiro",
                              cells: "Grupos",
                            } as RecordData
                          )[g.scope]
                        }
                      </td>
                      <td>{shortDate(g.expires_at)}</td>
                      <td>
                        <Badge tone={g.revoked_at ? "muted" : "green"}>
                          {g.revoked_at
                            ? "Revogado"
                            : new Date(g.expires_at) < new Date()
                              ? "Expirado"
                              : "Autorizado"}
                        </Badge>
                      </td>
                      <td>
                        {!g.revoked_at && (
                          <button
                            className="text-button"
                            onClick={async () => {
                              try {
                                await api("/grants/" + g.id, "DELETE");
                                props.refresh();
                                props.notify("Acesso revogado imediatamente.");
                              } catch (e) {
                                props.notify((e as Error).message);
                              }
                            }}
                          >
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!grants.data.length && (
                <Empty>
                  Nenhum acesso detalhado concedido. Os dados permanecem na
                  igreja.
                </Empty>
              )}
            </div>
          )}
          {regional.data && (
            <>
              <h3>Acessos regionais</h3>
              <p className="muted">
                Acesso somente leitura às igrejas da regional. A concessão não
                permite escrita nem conteúdo pastoral.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th>Regional</th>
                      <th>Área</th>
                      <th>Vigência</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regional.data.grants.map((g: RecordData) => (
                      <tr key={g.id}>
                        <td>
                          <strong>{g.name}</strong>
                          <small className="block">{g.email}</small>
                        </td>
                        <td>{g.region_name}</td>
                        <td>
                          {
                            (
                              {
                                people: "Pessoas",
                                cells: "Grupos",
                                finance: "Financeiro",
                              } as RecordData
                            )[g.scope]
                          }
                        </td>
                        <td>{shortDate(g.expires_at)}</td>
                        <td>
                          {!g.revoked_at && (
                            <button
                              className="text-button"
                              onClick={async () => {
                                try {
                                  await api(
                                    `/regional-grants/${g.id}`,
                                    "DELETE",
                                  );
                                  props.refresh();
                                  props.notify("Acesso regional revogado.");
                                } catch (e) {
                                  props.notify((e as Error).message);
                                }
                              }}
                            >
                              Revogar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!regional.data.grants.length && (
                <Empty>Nenhum acesso regional concedido.</Empty>
              )}
            </>
          )}
        </section>
      )}
      {tab === "brand" && (
        <div className="two-columns">
          <section className="panel">
            <SectionHead
              title="Identidade da comunidade"
              subtitle="Uma identidade reconhecível em toda a experiência."
            />
            <form
              onSubmit={async (e) => {
                const b = formValues(e);
                try {
                  await api("/branding", "PATCH", b);
                  await props.reloadContext();
                  props.notify("Identidade atualizada.");
                } catch (e) {
                  props.notify((e as Error).message);
                }
              }}
            >
              <Field label="Nome da igreja">
                <input
                  name="name"
                  defaultValue={props.current?.name}
                  required
                />
              </Field>
              <Field label="Cor de destaque">
                <select
                  name="primaryColor"
                  defaultValue={props.current?.primary_color}
                >
                  <option value="#7062db">Íris</option>
                  <option value="#317b68">Esperança</option>
                  <option value="#386fa4">Horizonte</option>
                </select>
              </Field>
              <Submit label="Salvar identidade" />
            </form>
          </section>
          <section className="panel">
            <Badge tone="purple">PLANO REDE · PILOTO</Badge>
            <h2>Uma base para crescer juntos.</h2>
            <p className="muted">
              Gestão de pessoas, grupos, financeiro e supervisão responsável.
            </p>
            <ul className="check-list">
              <li>Gestão por igreja vinculada</li>
              <li>Painel agregado para a rede</li>
              <li>Importação assistida e treinamento</li>
              <li>Kids e eventos na próxima fase</li>
            </ul>
            <p className="panel-footnote">
              Preço comercial será definido após validação do piloto. Não há
              cobrança automática nesta versão.
            </p>
            <ModuleSettings {...props} />
          </section>
        </div>
      )}
      {tab === "audit" && (
        <section className="panel">
          <SectionHead
            title="Trilha de responsabilidade"
            subtitle="Eventos de acesso e operação, sem conteúdo pastoral."
          />
          <Status data={events.data} error={events.error} />
          <div className="toolbar">
            <Field label="Ação exata">
              <input
                value={auditAction}
                placeholder="Ex.: person.updated"
                onChange={(e) => {
                  setAuditAction(e.target.value);
                  setAuditPage(1);
                }}
              />
            </Field>
            <span className="muted">{events.data?.total ?? 0} evento(s)</span>
          </div>
          <div className="audit-list">
            {events.data?.items?.map((e: RecordData) => (
              <div key={e.id}>
                <span className="audit-dot" />
                <div>
                  <strong>{e.action}</strong>
                  <small>
                    {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
                    {e.resource_id?.slice(0, 36) ?? "Configuração"}
                  </small>
                </div>
              </div>
            ))}
          </div>
          {(events.data?.pages ?? 1) > 1 && (
            <div className="toolbar" aria-label="Paginação da auditoria">
              <button
                className="button secondary"
                disabled={auditPage <= 1}
                onClick={() => setAuditPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {events.data?.page ?? auditPage} de{" "}
                {events.data?.pages ?? 1}
              </span>
              <button
                className="button secondary"
                disabled={auditPage >= (events.data?.pages ?? 1)}
                onClick={() => setAuditPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {modal && (
        <Modal
          title={
            modal === "regional"
              ? "Autorizar consulta regional"
              : "Autorizar consulta da central"
          }
          onClose={() => setModal(null)}
        >
          <form onSubmit={submit}>
            <Field label="Responsável na rede">
              <select name="userId" required>
                {(modal === "regional"
                  ? regional.data?.candidates
                  : candidates.data
                )?.map((u: RecordData) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.email}
                  </option>
                ))}
              </select>
            </Field>
            {modal === "regional" && (
              <Field label="Regional">
                <select name="regionId" required>
                  {regional.data?.regions.map((region: RecordData) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Área autorizada">
              <select name="scope">
                <option value="people">Pessoas e famílias</option>
                <option value="cells">Grupos e presença</option>
                <option value="finance">Financeiro</option>
              </select>
            </Field>
            <Field label="Prazo em dias (máximo 90)">
              <input
                type="number"
                name="days"
                min="1"
                max="90"
                defaultValue="7"
                required
              />
            </Field>
            <p className="muted">
              A autorização permite leitura da área selecionada. Informações
              pastorais sigilosas permanecem excluídas.
            </p>
            <Submit busy={busy} label="Conceder acesso" />
          </form>
        </Modal>
      )}
    </>
  );
}
function ModuleSettings(props: PageProps) {
  const [invoicePage, setInvoicePage] = useState(1);
  const { data, error } = useData(
    `/subscription?invoicePage=${invoicePage}&invoicePageSize=25`,
    props,
  );
  const [busy, setBusy] = useState(false);
  if (!data) return <Status data={data} error={error} />;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const modules = new FormData(event.currentTarget).getAll("modules");
    setBusy(true);
    try {
      await api("/subscription", "PATCH", { modules });
      props.refresh();
      props.notify("Módulos do piloto atualizados.");
    } catch (error) {
      props.notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const b = formValues(event);
    setBusy(true);
    try {
      const payload = {
        plan: b.plan,
        status: b.contractStatus,
        monthlyCents: Number(b.monthlyCents || 0),
        startsOn: b.startsOn,
        renewsOn: b.renewsOn || null,
        modules: data.modules,
        notes: b.notes || "",
      };
      if (data.contract?.id)
        await api(
          `/subscription/contracts/${data.contract.id}`,
          "PATCH",
          payload,
        );
      else await api("/subscription/contracts", "POST", payload);
      props.refresh();
      props.notify("Contrato SaaS salvo.");
    } catch (error) {
      props.notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const b = formValues(event);
    if (!data.contract?.id) {
      props.notify("Registre o contrato antes da fatura.");
      return;
    }
    setBusy(true);
    try {
      await api("/subscription/invoices", "POST", {
        contractId: data.contract.id,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
        dueOn: b.dueOn,
        amountCents: Number(b.invoiceAmountCents || 0),
        notes: b.invoiceNotes || "",
      });
      props.refresh();
      props.notify("Fatura registrada.");
    } catch (error) {
      props.notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form key={data.modules.join(",")} onSubmit={save}>
        <h3>Módulos habilitados no piloto</h3>
        <div className="attendance-list">
          {[
            ["people", "Pessoas e secretaria"],
            ["cells", "Grupos e cuidado"],
            ["finance", "Financeiro e Pix"],
            ["assets", "Patrimônio e manutenção"],
            ["library", "Biblioteca e empréstimos"],
            ["assistance", "Assistência social"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                name="modules"
                type="checkbox"
                value={key}
                defaultChecked={data.modules.includes(key)}
              />
              {label}
            </label>
          ))}
        </div>
        <Submit busy={busy} label="Atualizar módulos" />
      </form>
      <form className="panel" style={{ marginTop: 18 }} onSubmit={saveContract}>
        <h3>Contrato e implantação</h3>
        <div className="grid-2">
          <Field label="Plano">
            <select
              name="plan"
              defaultValue={data.contract?.plan ?? data.plan ?? "piloto"}
            >
              <option value="piloto">Piloto</option>
              <option value="essencial">Essencial</option>
              <option value="rede">Rede</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </Field>
          <Field label="Situação">
            <select
              name="contractStatus"
              defaultValue={data.contract?.status ?? "draft"}
            >
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="suspended">Suspenso</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </Field>
          <Field label="Mensalidade (centavos)">
            <input
              name="monthlyCents"
              type="number"
              min="0"
              defaultValue={data.contract?.monthly_cents ?? 0}
            />
          </Field>
          <Field label="Início">
            <input
              name="startsOn"
              type="date"
              required
              defaultValue={
                data.contract?.starts_on ??
                new Date().toISOString().slice(0, 10)
              }
            />
          </Field>
          <Field label="Próxima renovação">
            <input
              name="renewsOn"
              type="date"
              defaultValue={data.contract?.renews_on ?? ""}
            />
          </Field>
        </div>
        <Field label="Observações de implantação">
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={data.contract?.notes ?? ""}
          />
        </Field>
        <p className="muted">
          A cobrança permanece manual no piloto; este registro organiza
          contrato, módulos e datas.
        </p>
        <Submit
          busy={busy}
          label={
            data.contract?.id ? "Atualizar contrato" : "Registrar contrato"
          }
        />
      </form>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="toolbar">
          <h3>Faturas SaaS</h3>
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              try {
                const response = await fetch("/api/subscription/invoices.csv", {
                  headers: { "x-church-id": props.church },
                });
                if (!response.ok) throw new Error("Exportação indisponível.");
                const url = URL.createObjectURL(await response.blob());
                const link = document.createElement("a");
                link.href = url;
                link.download = "faturas-saas.csv";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (error) {
                props.notify((error as Error).message);
              }
            }}
          >
            Exportar CSV
          </button>
        </div>
        <form onSubmit={saveInvoice}>
          <div className="grid-2">
            <Field label="Início do período">
              <input name="periodStart" type="date" required />
            </Field>
            <Field label="Fim do período">
              <input name="periodEnd" type="date" required />
            </Field>
            <Field label="Vencimento">
              <input name="dueOn" type="date" required />
            </Field>
            <Field label="Valor (centavos)">
              <input
                name="invoiceAmountCents"
                type="number"
                min="0"
                defaultValue={data.contract?.monthly_cents ?? 0}
                required
              />
            </Field>
          </div>
          <Field label="Observação">
            <input name="invoiceNotes" maxLength={2000} />
          </Field>
          <Submit busy={busy} label="Registrar fatura" />
        </form>
        {!!data.invoices?.length && (
          <div className="attendance-list" style={{ marginTop: 16 }}>
            {data.invoices.map((invoice: RecordData) => (
              <div className="toolbar" key={invoice.id}>
                <span>
                  {shortDate(invoice.period_start)}–
                  {shortDate(invoice.period_end)} · {invoice.amount_cents}{" "}
                  centavos
                </span>
                <select
                  value={invoice.status}
                  disabled={busy}
                  onChange={async (e) => {
                    setBusy(true);
                    try {
                      await api(
                        `/subscription/invoices/${invoice.id}`,
                        "PATCH",
                        { status: e.target.value, notes: invoice.notes ?? "" },
                      );
                      props.refresh();
                    } catch (error) {
                      props.notify((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <option value="issued">Emitida</option>
                  <option value="paid">Paga</option>
                  <option value="overdue">Vencida</option>
                  <option value="void">Cancelada</option>
                </select>
              </div>
            ))}
          </div>
        )}
        {(data.invoicePagination?.pages ?? 1) > 1 && (
          <div className="toolbar" aria-label="Paginação de faturas SaaS">
            <button
              className="button secondary"
              disabled={invoicePage <= 1 || busy}
              onClick={() => setInvoicePage((v) => v - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              Faturas · página {data.invoicePagination.page} de{" "}
              {data.invoicePagination.pages} · {data.invoicePagination.total}{" "}
              registros
            </span>
            <button
              className="button secondary"
              disabled={invoicePage >= data.invoicePagination.pages || busy}
              onClick={() => setInvoicePage((v) => v + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </section>
    </>
  );
}
function PortalMediaCard({ item, church, notify }: { item: RecordData; church: string; notify: (message: string) => void }) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    Promise.all((item.files ?? []).filter((file: RecordData) => file.has_thumbnail).map(async (file: RecordData) => {
      const response = await fetch(`/api/media/files/${file.id}/thumbnail`, { headers: { "x-church-id": church } });
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      urls.push(url);
      return url;
    })).then((values) => { if (active) setThumbs(values.filter(Boolean) as string[]); else urls.forEach((url) => URL.revokeObjectURL(url)); }).catch(() => {});
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [item.files, church]);
  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowRight") setSelected((value) => value === null ? 0 : (value + 1) % thumbs.length);
      if (event.key === "ArrowLeft") setSelected((value) => value === null ? 0 : (value - 1 + thumbs.length) % thumbs.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, thumbs.length]);
  const share = async () => {
    const url = item.source_url ?? window.location.href;
    try { if (navigator.share) await navigator.share({ title: item.title, text: item.description ?? "", url }); else { await navigator.clipboard.writeText(url); notify("Link copiado."); } } catch { notify("Compartilhamento cancelado."); }
  };
  return <article className="portal-media-card">
    <div><Badge tone="muted">{item.kind}</Badge><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div>
    {!!thumbs.length && <div className="portal-media-gallery" aria-label={`Galeria de ${item.title}`}>{thumbs.map((url, index) => <button type="button" key={url} onClick={() => setSelected(index)} aria-label={`Abrir imagem ${index + 1}`}><img src={url} alt={item.alt_text || `${item.title}, imagem ${index + 1}`} /></button>)}</div>}
    {item.source_url && <a className="button secondary" href={item.source_url} target="_blank" rel="noreferrer">Abrir mídia</a>}
    <button className="text-button" type="button" onClick={() => void share()}>Compartilhar</button>
    {selected !== null && thumbs[selected] && <div className="media-lightbox" role="dialog" aria-modal="true" aria-label={`Visualização de ${item.title}`} onClick={() => setSelected(null)}><button type="button" className="media-lightbox-close" onClick={() => setSelected(null)} aria-label="Fechar">×</button><button type="button" className="media-lightbox-nav prev" onClick={(event) => { event.stopPropagation(); setSelected((selected - 1 + thumbs.length) % thumbs.length); }} aria-label="Imagem anterior">‹</button><img src={thumbs[selected]} alt={item.alt_text || item.title} onClick={(event) => event.stopPropagation()} /><button type="button" className="media-lightbox-nav next" onClick={(event) => { event.stopPropagation(); setSelected((selected + 1) % thumbs.length); }} aria-label="Próxima imagem">›</button></div>}
  </article>;
}
export function Portal(props: PageProps & { mode: string }) {
  const pixAttempt = useRef<{ key: string; fingerprint: string } | null>(null);
  const [taskPage, setTaskPage] = useState(1);
  const { data: d, error } = useData(
    `/portal?taskPage=${taskPage}&taskPageSize=25`,
    props,
  );
  const [inboxPage, setInboxPage] = useState(1);
  const inbox = useData<RecordData>(
    `/communication/inbox?page=${inboxPage}&pageSize=25`,
    props,
  );
  const preferences = useData<RecordData>(
    "/communication/preferences/me",
    props,
  );
  const [eventPage, setEventPage] = useState(1);
  const portalEvents = useData<RecordData>(
    `/portal/events?page=${eventPage}&pageSize=25`,
    props,
  );
  const [eventHistoryPage, setEventHistoryPage] = useState(1);
  const portalEventHistory = useData<RecordData>(
    `/portal/events/history?page=${eventHistoryPage}&pageSize=25`,
    props,
  );
  const [educationPage, setEducationPage] = useState(1);
  const portalEducation = useData<RecordData>(
    `/portal/education?page=${educationPage}&pageSize=25`,
    props,
  );
  const portalMedia = useData<RecordData[]>("/portal/media", props);
  const [portalCertificatePage, setPortalCertificatePage] = useState(1);
  const portalCertificates = useData<RecordData>(
    `/portal/education/certificates?page=${portalCertificatePage}&pageSize=25`,
    props,
  );
  const [portalEventCertificatePage, setPortalEventCertificatePage] =
    useState(1);
  const portalEventCertificates = useData<RecordData>(
    `/portal/events/certificates?page=${portalEventCertificatePage}&pageSize=25`,
    props,
  );
  const [portalResultPage, setPortalResultPage] = useState(1);
  const portalResults = useData<RecordData>(
    `/portal/education/results?page=${portalResultPage}&pageSize=25`,
    props,
  );
  const portalDocuments = useData<RecordData[]>("/portal/documents", props);
  const [modal, setModal] = useState<"pix" | "prayer" | "privacy" | null>(null),
    [charge, setCharge] = useState<RecordData | null>(null),
    [credential, setCredential] = useState<RecordData | null>(null),
    [busy, setBusy] = useState(false),
    [eventForm, setEventForm] = useState<RecordData | null>(null);
  const downloadPortalDocument = async (document: RecordData) => {
    const response = await fetch(`/api/documents/${document.id}`, {
      headers: { "x-church-id": props.church },
    });
    if (!response.ok) throw new Error("Documento indisponível.");
    const url = URL.createObjectURL(await response.blob()),
      link = window.document.createElement("a");
    link.href = url;
    link.download = document.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!d) return <Status data={d} error={error} />;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    const b = formValues(e);
    setBusy(true);
    try {
      if (modal === "pix") {
        const fingerprint = JSON.stringify([b.amount, b.fundId]);
        if (pixAttempt.current?.fingerprint !== fingerprint)
          pixAttempt.current = { key: crypto.randomUUID(), fingerprint };
        setCharge(
          await api("/pix/charges", "POST", {
            ...b,
            requestKey: pixAttempt.current!.key,
          }),
        );
        pixAttempt.current = null;
      }
      if (modal === "prayer")
        await api("/prayers", "POST", { text: b.text, confidential: true });
      if (modal === "privacy") await api("/privacy", "POST", b);
      setModal(null);
      props.refresh();
      props.notify("Solicitação registrada.");
    } catch (e) {
      props.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="portal-welcome">
        <div>
          <Badge tone="purple">VOCÊ FAZ PARTE</Badge>
          <h2>
            {d.person
              ? `Que bom ter você aqui, ${d.person.name.split(" ")[0]}.`
              : "Seu lugar na comunidade."}
          </h2>
          <p>
            Encontre suas escalas, contribua e mantenha seus vínculos por perto.
          </p>
        </div>
        <Icon name="heart" size={100} />
      </section>
      {!!portalMedia.data?.length && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Mídia da igreja"
            subtitle="Vídeos, áudios e galerias publicados pela sua igreja."
          />
          <div className="portal-media-grid">
            {portalMedia.data.map((item: RecordData) => <PortalMediaCard key={item.id} item={item} church={props.church} notify={props.notify} />)}
          </div>
        </section>
      )}
      {!!inbox.data?.items?.length && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Avisos da igreja"
            subtitle={`${inbox.data.items.filter((message: RecordData) => !message.read_at).length} aviso(s) não lido(s).`}
          />
          {inbox.data.items.map((message: RecordData) => (
            <article
              className="toolbar"
              key={message.id}
              style={{ opacity: message.read_at ? 0.72 : 1 }}
            >
              <div>
                <strong>{message.subject}</strong>
                <p>{message.body}</p>
                <small>
                  {shortDate(message.sent_at ?? message.created_at)}
                </small>
              </div>
              {!message.read_at && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await api(
                        `/communication/inbox/${message.delivery_id}/read`,
                        "PATCH",
                        {},
                      );
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Marcar como lido
                </button>
              )}
            </article>
          ))}
          {(inbox.data.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={inboxPage <= 1}
                onClick={() => setInboxPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {inbox.data.page} de {inbox.data.pages}
              </span>
              <button
                className="button secondary"
                disabled={inboxPage >= inbox.data.pages}
                onClick={() => setInboxPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {!!d.workflows?.length && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Meus acompanhamentos"
            subtitle="Veja somente o andamento dos seus processos na igreja."
          />
          {d.workflows.map((workflow: RecordData) => (
            <article className="toolbar" key={workflow.id}>
              <div>
                <strong>{workflow.workflow_name}</strong>
                <p>
                  {workflow.status === "open"
                    ? `Etapa ${Number(workflow.current_step) + 1} de ${workflow.step_total}: ${workflow.step_title || "Em acompanhamento"}`
                    : workflow.status === "completed"
                      ? "Concluído"
                      : "Cancelado"}
                  {workflow.due_on
                    ? ` · prazo ${shortDate(workflow.due_on)}`
                    : ""}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
      {!!d.tasks?.length && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Minhas tarefas"
            subtitle="Pendências atribuídas a você, dentro das permissões da igreja."
          />
          {d.tasks.map((task: RecordData) => (
            <article className="toolbar" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <p>
                  {task.scope} ·{" "}
                  {task.status === "in_progress" ? "Em andamento" : "Aberta"}
                  {task.due_on ? ` · prazo ${shortDate(task.due_on)}` : ""}
                </p>
              </div>
              <div className="row-actions">
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await api(`/portal/tasks/${task.id}`, "PATCH", {
                        status: "in_progress",
                        version: task.version,
                      });
                      props.notify("Tarefa marcada como em andamento.");
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Iniciar
                </button>
                <button
                  className="button primary"
                  onClick={async () => {
                    try {
                      await api(`/portal/tasks/${task.id}`, "PATCH", {
                        status: "done",
                        version: task.version,
                      });
                      props.notify("Tarefa concluída.");
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Concluir
                </button>
              </div>
            </article>
          ))}
          {(d.taskPagination?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={taskPage <= 1}
                onClick={() => setTaskPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {d.taskPagination.page} de {d.taskPagination.pages}
              </span>
              <button
                className="button secondary"
                disabled={taskPage >= d.taskPagination.pages}
                onClick={() => setTaskPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {preferences.data && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Preferências de comunicação"
            subtitle="Escolha como deseja receber avisos da igreja."
          />
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const b = formValues(event),
                emailOptIn = b.email === "on",
                smsOptIn = b.sms === "on",
                confirmReOptIn =
                  (emailOptIn && !preferences.data?.email_opt_in) ||
                  (smsOptIn && !preferences.data?.sms_opt_in);
              if (
                confirmReOptIn &&
                !window.confirm(
                  "Você confirma novamente o recebimento de e-mail ou SMS da igreja?",
                )
              )
                return;
              try {
                await api("/communication/preferences/me", "PUT", {
                  emailOptIn,
                  portalOptIn: b.portal === "on",
                  smsOptIn,
                  confirmReOptIn,
                });
                props.notify("Preferências atualizadas.");
                props.refresh();
              } catch (e) {
                props.notify((e as Error).message);
              }
            }}
          >
            <label className="member-checkbox">
              <input
                name="portal"
                type="checkbox"
                defaultChecked={preferences.data.portal_opt_in}
              />{" "}
              Avisos no portal
            </label>
            <label className="member-checkbox">
              <input
                name="email"
                type="checkbox"
                defaultChecked={preferences.data.email_opt_in}
              />{" "}
              E-mail
            </label>
            <label className="member-checkbox">
              <input
                name="sms"
                type="checkbox"
                defaultChecked={preferences.data.sms_opt_in}
              />{" "}
              SMS
            </label>
            <Submit label="Salvar preferências" />
          </form>
        </section>
      )}
      {d.person && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Atualizar meu cadastro"
            subtitle="As alterações ficam pendentes até a conferência da secretaria."
          />
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const b = formValues(event);
              try {
                await api("/portal/profile-change", "POST", b);
                props.notify("Solicitação enviada para a secretaria.");
                props.refresh();
              } catch (e) {
                props.notify((e as Error).message);
              }
            }}
          >
            <div className="grid-2">
              <Field label="Nome">
                <input name="name" defaultValue={d.person.name} required />
              </Field>
              <Field label="E-mail">
                <input
                  name="email"
                  type="email"
                  defaultValue={d.person.email || ""}
                />
              </Field>
              <Field label="Telefone">
                <input name="phone" defaultValue={d.person.phone || ""} />
              </Field>
            </div>
            <Submit label="Enviar para revisão" />
          </form>
        </section>
      )}
      {portalDocuments.data && portalDocuments.data.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Meus documentos"
            subtitle="Arquivos compartilhados pela secretaria."
          />
          {portalDocuments.data.map((document: RecordData) => (
            <div className="toolbar" key={document.id}>
              <span>
                {document.name} · {shortDate(document.created_at)}
              </span>
              <button
                className="button secondary"
                onClick={() =>
                  void downloadPortalDocument(document).catch((e) =>
                    props.notify((e as Error).message),
                  )
                }
              >
                Baixar
              </button>
            </div>
          ))}
        </section>
      )}
      {portalResults.data?.items?.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Minhas avaliações"
            subtitle="Notas e feedbacks das suas formações."
          />
          {portalResults.data?.items?.map((result: RecordData) => (
            <article className="toolbar" key={result.id}>
              <div>
                <strong>
                  {result.assessment_title} · {result.class_name}
                </strong>
                <p>
                  Nota {result.score} · {result.feedback || "Sem feedback"}
                </p>
              </div>
            </article>
          ))}
          {(portalResults.data?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={portalResultPage <= 1}
                onClick={() => setPortalResultPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {portalResults.data?.page} de {portalResults.data?.pages}
              </span>
              <button
                className="button secondary"
                disabled={portalResultPage >= portalResults.data?.pages}
                onClick={() => setPortalResultPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {portalEventCertificates.data?.items?.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Certificados de eventos"
            subtitle="Comprovantes de participação em eventos da igreja."
          />
          {portalEventCertificates.data?.items?.map(
            (certificate: RecordData) => (
              <article className="toolbar" key={certificate.id}>
                <div>
                  <strong>{certificate.event_title}</strong>
                  <p>
                    Código {certificate.code} · emitido em{" "}
                    {shortDate(certificate.issued_at)}
                  </p>
                </div>
              </article>
            ),
          )}
          {(portalEventCertificates.data?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={portalEventCertificatePage <= 1}
                onClick={() => setPortalEventCertificatePage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {portalEventCertificates.data?.page} de{" "}
                {portalEventCertificates.data?.pages}
              </span>
              <button
                className="button secondary"
                disabled={
                  portalEventCertificatePage >=
                  portalEventCertificates.data?.pages
                }
                onClick={() => setPortalEventCertificatePage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {portalCertificates.data?.items?.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Meus certificados"
            subtitle="Certificados emitidos pela formação da igreja."
          />
          {portalCertificates.data?.items?.map((certificate: RecordData) => (
            <article className="toolbar" key={certificate.id}>
              <div>
                <strong>
                  {certificate.course_name} · {certificate.class_name}
                </strong>
                <p>
                  Código {certificate.code} · emitido em{" "}
                  {shortDate(certificate.issued_at)}
                </p>
              </div>
            </article>
          ))}
          {(portalCertificates.data?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={portalCertificatePage <= 1}
                onClick={() => setPortalCertificatePage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {portalCertificates.data?.page} de{" "}
                {portalCertificates.data?.pages}
              </span>
              <button
                className="button secondary"
                disabled={
                  portalCertificatePage >= portalCertificates.data?.pages
                }
                onClick={() => setPortalCertificatePage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {portalEventHistory.data?.items?.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Meu histórico de eventos"
            subtitle="Inscrições anteriores, pagamentos e certificados."
          />
          {portalEventHistory.data?.items?.map((entry: RecordData) => (
            <article className="toolbar" key={entry.registration_id}>
              <div>
                <strong>{entry.title}</strong>
                <p>
                  {shortDate(entry.starts_at)} · {entry.status}
                  {entry.payment_status &&
                  entry.payment_status !== "not_required"
                    ? ` · pagamento: ${entry.payment_status}`
                    : ""}
                  {entry.certificate_issued ? " · certificado emitido" : ""}
                </p>
              </div>
            </article>
          ))}
          {(portalEventHistory.data?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={eventHistoryPage <= 1}
                onClick={() => setEventHistoryPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {portalEventHistory.data?.page} de{" "}
                {portalEventHistory.data?.pages}
              </span>
              <button
                className="button secondary"
                disabled={eventHistoryPage >= portalEventHistory.data?.pages}
                onClick={() => setEventHistoryPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {portalEvents.data?.items?.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Próximos eventos"
            subtitle="Inscreva-se pelo portal e acompanhe sua participação."
          />
          {portalEvents.data?.items?.map((event: RecordData) => (
            <article className="toolbar" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p>
                  {shortDate(event.starts_at)} · {event.kind}
                  {event.price_cents > 0
                    ? ` · ${money(event.price_cents)}`
                    : " · Gratuito"}
                </p>
                {event.registration_status && (
                  <small>
                    {event.registration_status === "waitlisted"
                      ? "Lista de espera"
                      : event.registration_status === "cancelled"
                        ? "Cancelada"
                        : "Inscrição confirmada"}
                  </small>
                )}
              </div>
              {event.registration_id &&
              event.registration_status !== "cancelled" ? (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const result = await api<RecordData>(
                        `/portal/events/${event.registration_id}/cancel`,
                        "POST",
                      );
                      props.notify(
                        result.refundRequired
                          ? "Inscrição cancelada; a devolução foi encaminhada à tesouraria."
                          : "Inscrição cancelada.",
                      );
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Cancelar inscrição
                </button>
              ) : eventForm?.id === event.id ? (
                <form
                  onSubmit={async (formEvent) => {
                    const values = formValues(formEvent);
                    const formData = Object.fromEntries(
                      Object.entries(values)
                        .filter(([key]) => key.startsWith("field_"))
                        .map(([key, value]) => [key.slice(6), String(value)]),
                    );
                    setBusy(true);
                    try {
                      await api(`/portal/events/${event.id}/register`, "POST", {
                        formData,
                      });
                      props.notify("Inscrição registrada.");
                      setEventForm(null);
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {(event.registration_fields ?? []).map(
                    (field: RecordData) => (
                      <Field
                        key={field.key}
                        label={`${field.label}${field.required ? " · obrigatório" : ""}`}
                      >
                        {field.type === "textarea" ? (
                          <textarea
                            name={`field_${field.key}`}
                            required={Boolean(field.required)}
                            maxLength={1000}
                          />
                        ) : field.type === "select" ? (
                          <select
                            name={`field_${field.key}`}
                            required={Boolean(field.required)}
                          >
                            <option value="">Selecione</option>
                            {(field.options ?? []).map((option: string) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            name={`field_${field.key}`}
                            type={
                              field.type === "number"
                                ? "number"
                                : field.type === "email"
                                  ? "email"
                                  : "text"
                            }
                            required={Boolean(field.required)}
                            maxLength={1000}
                          />
                        )}
                      </Field>
                    ),
                  )}
                  <label className="member-checkbox">
                    <input name="consent" type="checkbox" required /> Concordo
                    com o uso dos dados nesta inscrição.
                  </label>
                  <Submit busy={busy} label="Confirmar inscrição" />
                </form>
              ) : (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEventForm(event)}
                >
                  Inscrever-me
                </button>
              )}
            </article>
          ))}
          {(portalEvents.data?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={eventPage <= 1}
                onClick={() => setEventPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {portalEvents.data?.page ?? eventPage} de{" "}
                {portalEvents.data?.pages}
              </span>
              <button
                className="button secondary"
                disabled={eventPage >= (portalEvents.data?.pages ?? 1)}
                onClick={() => setEventPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {portalEducation.data?.classes?.length > 0 && (
        <section className="panel" style={{ padding: 24 }}>
          <SectionHead
            title="Cursos e EBD"
            subtitle="Veja as próximas turmas e participe da formação da igreja."
          />
          {portalEducation.data?.classes?.map((course: RecordData) => (
            <article className="toolbar" key={course.id}>
              <div>
                <strong>
                  {course.course_name} · {course.name}
                </strong>
                <p>
                  {shortDate(course.starts_on)}
                  {course.ends_on
                    ? ` até ${shortDate(course.ends_on)}`
                    : ""} · {course.description || "Formação da igreja"}
                </p>
                {course.enrollment_status && (
                  <small>
                    {course.enrollment_status === "waitlisted"
                      ? "Lista de espera"
                      : "Matriculado"}
                    {course.enrollment_status === "active"
                      ? ` · frequência ${course.attendance_present}/${course.attendance_total}`
                      : ""}
                    {course.certificate_code
                      ? ` · certificado ${course.certificate_code}`
                      : ""}
                  </small>
                )}
                {!!course.enrollment_id &&
                  course.materials?.map((material: RecordData) =>
                    material.kind === "link" && material.location ? (
                      <a
                        key={material.id}
                        href={material.location}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "block" }}
                      >
                        Material: {material.title}
                      </a>
                    ) : (
                      <small key={material.id} style={{ display: "block" }}>
                        Material: {material.title}
                        {material.kind ? ` · ${material.kind}` : ""}
                      </small>
                    ),
                  )}
              </div>
              {course.enrollment_id ? (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Cancelar esta matrícula?")) return;
                    setBusy(true);
                    try {
                      await api(
                        `/portal/education/enrollments/${course.enrollment_id}/cancel`,
                        "POST",
                      );
                      props.notify("Matrícula cancelada.");
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancelar matrícula
                </button>
              ) : (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(
                        `/portal/education/classes/${course.id}/enroll`,
                        "POST",
                      );
                      props.notify("Matrícula registrada.");
                      props.refresh();
                    } catch (e) {
                      props.notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {course.enrollment_status === "waitlisted"
                    ? "Entrar na lista de espera"
                    : "Matricular-me"}
                </button>
              )}
            </article>
          ))}
          {(portalEducation.data?.pages ?? 1) > 1 && (
            <div className="toolbar">
              <button
                className="button secondary"
                disabled={educationPage <= 1}
                onClick={() => setEducationPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span className="muted">
                Página {portalEducation.data?.page ?? educationPage} de{" "}
                {portalEducation.data?.pages}
              </span>
              <button
                className="button secondary"
                disabled={educationPage >= (portalEducation.data?.pages ?? 1)}
                onClick={() => setEducationPage((v) => v + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      <div className="portal-actions">
        <button onClick={() => setModal("pix")}>
          <span className="stat-icon green">
            <Icon name="wallet" />
          </span>
          <strong>Contribuir</strong>
          <small>Escolha um fundo e um valor</small>
          <Icon name="arrow" />
        </button>
        <button
          onClick={async () => {
            if (!d.person)
              return props.notify(
                "Seu usuário ainda não tem cadastro de membro vinculado.",
              );
            try {
              setCredential(
                await api("/credentials", "POST", { personId: d.person.id }),
              );
            } catch (e) {
              props.notify((e as Error).message);
            }
          }}
        >
          <span className="stat-icon purple">
            <Icon name="people" />
          </span>
          <strong>Minha credencial</strong>
          <small>Identidade na comunidade</small>
          <Icon name="arrow" />
        </button>
        <button onClick={() => setModal("prayer")}>
          <span className="stat-icon amber">
            <Icon name="heart" />
          </span>
          <strong>Pedir oração</strong>
          <small>Envio sigiloso e protegido</small>
          <Icon name="arrow" />
        </button>
        <button onClick={() => setModal("privacy")}>
          <span className="stat-icon blue">
            <Icon name="shield" />
          </span>
          <strong>Meus dados</strong>
          <small>Seus direitos e solicitações</small>
          <Icon name="arrow" />
        </button>
      </div>
      <div className="two-columns">
        <section className="panel">
          <SectionHead
            title="Servir com alegria"
            subtitle="Suas próximas escalas"
          />
          {d.schedules.length ? (
            d.schedules.map((v: RecordData) => (
              <div className="schedule" key={v.id}>
                <Badge tone="purple">{shortDate(v.starts_at)}</Badge>
                <h3>{v.ministry}</h3>
                <Badge tone={v.response === "accepted" ? "green" : "amber"}>
                  {
                    (
                      {
                        pending: "Aguardando resposta",
                        accepted: "Presença confirmada",
                        declined: "Indisponível",
                      } as RecordData
                    )[v.response]
                  }
                </Badge>
                <div className="row-actions">
                  {[
                    ["accepted", "Confirmar presença"],
                    ["declined", "Não poderei ir"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={
                        value === "accepted"
                          ? "button primary"
                          : "button secondary"
                      }
                      onClick={async () => {
                        try {
                          await api("/schedules/" + v.id, "PATCH", {
                            response: value,
                          });
                          props.refresh();
                        } catch (e) {
                          props.notify((e as Error).message);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <Empty>Você não possui escalas agendadas.</Empty>
          )}
        </section>
        <section className="panel">
          <SectionHead
            title="Minhas contribuições"
            subtitle="Histórico pessoal e confidencial"
          />
          {d.charges.length ? (
            d.charges.map((c: RecordData) => (
              <div className="simple-row" key={c.id}>
                <Icon name="wallet" />
                <div>
                  <strong>{money(c.amount_cents)}</strong>
                  <small>{shortDate(c.created_at)}</small>
                </div>
                <Badge tone={c.status === "settled" ? "green" : "amber"}>
                  {c.status === "settled"
                    ? "Conciliado"
                    : c.status === "refunded"
                      ? "Devolvido"
                      : "Aguardando"}
                </Badge>
                {["settled", "refunded"].includes(c.status) && (
                  <button
                    className="text-button"
                    onClick={() =>
                      downloadReceipt(c.id).catch((e) =>
                        props.notify(e.message),
                      )
                    }
                  >
                    Comprovante
                  </button>
                )}
              </div>
            ))
          ) : (
            <Empty>Seu histórico de contribuições aparecerá aqui.</Empty>
          )}
          <p className="panel-footnote">
            Comprovantes registram contribuições e não prometem dedução fiscal.
          </p>
        </section>
      </div>
      {d.privacy.length > 0 && (
        <section className="panel">
          <SectionHead title="Solicitações de privacidade" />
          {d.privacy.map((v: RecordData) => (
            <div className="simple-row" key={v.id}>
              <strong>
                {
                  (
                    {
                      access: "Acesso aos dados",
                      correction: "Correção de dados",
                      deletion: "Exclusão de dados",
                    } as RecordData
                  )[v.kind]
                }
              </strong>
              <span>{shortDate(v.created_at)}</span>
              <Badge
                tone={
                  v.status === "fulfilled"
                    ? "green"
                    : v.status === "retained"
                      ? "muted"
                      : "amber"
                }
              >
                {(
                  {
                    received: "Recebida",
                    reviewing: "Em análise",
                    fulfilled: "Atendida",
                    retained: "Retida",
                  } as RecordData
                )[v.status] ?? v.status}
              </Badge>
              {v.kind === "access" && v.status === "fulfilled" && (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/privacy/export", {
                        credentials: "same-origin",
                        headers: { "x-church-id": props.church },
                      });
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(
                          body.error ?? "Exportação indisponível.",
                        );
                      }
                      const url = URL.createObjectURL(await res.blob());
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "ecclesia-export.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Baixar meus dados
                </button>
              )}
            </div>
          ))}
          <p className="panel-footnote">
            A exportação contém os dados cadastrais e operacionais do próprio
            titular, sem notas pastorais, segredos ou dados de terceiros.
          </p>
        </section>
      )}
      {modal && (
        <Modal
          title={
            modal === "pix"
              ? "Contribuir com a comunidade"
              : modal === "prayer"
                ? "Pedido de oração sigiloso"
                : "Solicitação de privacidade"
          }
          onClose={() => setModal(null)}
        >
          <form onSubmit={submit}>
            {modal === "pix" ? (
              <>
                <Field label="Valor (R$)">
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </Field>
                <Field label="Fundo">
                  <select name="fundId" required>
                    {d.funds.map((f: RecordData) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">
                  Sem tarifa adicional fixa. A confirmação depende do provedor.
                </p>
              </>
            ) : modal === "prayer" ? (
              <>
                <Field label="Como podemos orar por você?">
                  <textarea
                    name="text"
                    required
                    minLength={5}
                    maxLength={4000}
                  />
                </Field>
                <p className="security-inline">
                  <Icon name="shield" size={16} />
                  Pedido criptografado, fora dos relatórios da rede.
                </p>
              </>
            ) : (
              <>
                <Field label="Tipo de solicitação">
                  <select name="kind">
                    <option value="access">Acesso aos meus dados</option>
                    <option value="correction">Correção</option>
                    <option value="deletion">Exclusão</option>
                  </select>
                </Field>
                <Field label="Detalhes">
                  <textarea
                    name="detail"
                    required
                    minLength={5}
                    maxLength={2000}
                  />
                </Field>
                <p className="muted">
                  A igreja avaliará sua solicitação e as retenções aplicáveis.
                </p>
              </>
            )}
            <Submit
              busy={busy}
              label={modal === "pix" ? "Gerar cobrança" : "Enviar solicitação"}
            />
          </form>
        </Modal>
      )}
      {charge && (
        <ChargeModal
          charge={charge}
          mode={props.mode}
          onClose={() => setCharge(null)}
          notify={props.notify}
        />
      )}
      {credential && (
        <Modal title="Sua credencial" onClose={() => setCredential(null)}>
          <div className="credential">
            <Icon name="home" size={35} />
            <h2>{credential.name}</h2>
            <img
              width="220"
              height="220"
              src={credential.qrDataUrl}
              alt="QR da sua credencial"
            />
            <Badge>Válida por 24 horas</Badge>
          </div>
        </Modal>
      )}
    </>
  );
}
