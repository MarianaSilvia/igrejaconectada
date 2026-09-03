"use client";

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";

type ModuleKey =
  | "overview"
  | "users"
  | "members"
  | "events"
  | "ministries"
  | "notices"
  | "mural"
  | "pastoral"
  | "school"
  | "reports"
  | "settings";

type AccessMode = "login" | "recover" | "register";

type CareStatus = "Pendente" | "Em analise" | "Agendado" | "Concluido";

type CareRequest = {
  id: string;
  member: string;
  phone: string;
  category: string;
  status: CareStatus;
  responsible: string;
  scheduleDate: string;
  scheduleTime: string;
  summary: string;
  returnNote: string;
  createdAt: string;
  updatedAt: string;
};

type ChurchEvent = {
  id: string;
  title: string;
  date: string;
  ministry: string;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  status: "Publicado" | "Rascunho";
};

type MuralItem = {
  id: string;
  title: string;
  category: string;
  published: boolean;
  featured: boolean;
  expiresAt: string;
};

type AuditItem = {
  id: string;
  action: string;
  when: string;
};

type AppData = {
  careRequests: CareRequest[];
  events: ChurchEvent[];
  notices: Notice[];
  mural: MuralItem[];
  audit: AuditItem[];
  notificationReadIds: string[];
};

type RegistrationForm = {
  fullName: string;
  phone: string;
  email: string;
  birthDate: string;
  maritalStatus: string;
  address: string;
  congregationInterest: string;
  registrationType: string;
  previousChurch: string;
  password: string;
  passwordConfirm: string;
  waterBaptized: boolean;
  holySpiritBaptized: boolean;
  interestedMinistries: string;
  notesOrPrayer: string;
};

const storageKey = "igreja-gestao-local-v1";

const modules: { key: ModuleKey; label: string; short: string }[] = [
  { key: "overview", label: "Visao geral", short: "Painel" },
  { key: "users", label: "Usuarios e acessos", short: "Acessos" },
  { key: "members", label: "Membros", short: "Membros" },
  { key: "events", label: "Agenda", short: "Agenda" },
  { key: "ministries", label: "Ministerios", short: "Ministerios" },
  { key: "notices", label: "Comunicados", short: "Avisos" },
  { key: "mural", label: "Mural", short: "Mural" },
  { key: "pastoral", label: "Atendimento pastoral", short: "Pastoral" },
  { key: "school", label: "Escola Biblica", short: "EBD" },
  { key: "reports", label: "Relatorios", short: "Relatorios" },
  { key: "settings", label: "Configuracoes", short: "Config" },
];

const statusFlow: CareStatus[] = ["Pendente", "Em analise", "Agendado", "Concluido"];

const initialData: AppData = {
  careRequests: [
    {
      id: "care-1",
      member: "Ana Ribeiro",
      phone: "(11) 98888-1201",
      category: "Aconselhamento familiar",
      status: "Agendado",
      responsible: "Pr. Marcos",
      scheduleDate: "2026-09-04",
      scheduleTime: "19:30",
      summary: "Solicitou conversa com a lideranca sobre acompanhamento familiar.",
      returnNote: "Confirmar presenca um dia antes e registrar encaminhamento.",
      createdAt: "2026-09-01T18:20:00.000Z",
      updatedAt: "2026-09-02T12:10:00.000Z",
    },
    {
      id: "care-2",
      member: "Carlos Lima",
      phone: "(21) 97777-5402",
      category: "Pedido de visita",
      status: "Pendente",
      responsible: "",
      scheduleDate: "",
      scheduleTime: "",
      summary: "Pediu visita pastoral para esta semana.",
      returnNote: "",
      createdAt: "2026-09-02T09:00:00.000Z",
      updatedAt: "2026-09-02T09:00:00.000Z",
    },
  ],
  events: [
    { id: "event-1", title: "Culto da familia", date: "2026-09-06", ministry: "Todos" },
    { id: "event-2", title: "Congresso de jovens", date: "2026-09-12", ministry: "Jovens" },
    { id: "event-3", title: "Escola Biblica", date: "2026-09-13", ministry: "EBD" },
  ],
  notices: [
    {
      id: "notice-1",
      title: "Escala de setembro disponivel",
      body: "Lideres ja podem conferir e ajustar a escala mensal.",
      status: "Publicado",
    },
    {
      id: "notice-2",
      title: "Cadastro de novos alunos EBD",
      body: "Secretaria deve revisar as turmas antes de domingo.",
      status: "Publicado",
    },
  ],
  mural: [
    {
      id: "mural-1",
      title: "Campanha de arrecadacao",
      category: "Acao social",
      published: true,
      featured: true,
      expiresAt: "2026-09-20",
    },
    {
      id: "mural-2",
      title: "Encontro de casais",
      category: "Familia",
      published: true,
      featured: false,
      expiresAt: "2026-09-18",
    },
    {
      id: "mural-3",
      title: "Inscricoes para batismo",
      category: "Secretaria",
      published: false,
      featured: false,
      expiresAt: "2026-09-30",
    },
  ],
  audit: [
    { id: "audit-1", action: "Central de notificacoes criada", when: "2026-09-02T15:10:00.000Z" },
    { id: "audit-2", action: "Modulo de backup validado", when: "2026-09-02T14:42:00.000Z" },
  ],
  notificationReadIds: [],
};

const blankCare: Omit<CareRequest, "id" | "createdAt" | "updatedAt"> = {
  member: "",
  phone: "",
  category: "Aconselhamento",
  status: "Pendente",
  responsible: "",
  scheduleDate: "",
  scheduleTime: "",
  summary: "",
  returnNote: "",
};

const blankRegistration: RegistrationForm = {
  fullName: "",
  phone: "",
  email: "",
  birthDate: "",
  maritalStatus: "Solteiro(a)",
  address: "",
  congregationInterest: "",
  registrationType: "Membro novo",
  previousChurch: "",
  password: "",
  passwordConfirm: "",
  waterBaptized: false,
  holySpiritBaptized: false,
  interestedMinistries: "",
  notesOrPrayer: "",
};

function formatDate(value: string) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextStatus(status: CareStatus): CareStatus {
  const current = statusFlow.indexOf(status);
  return statusFlow[Math.min(current + 1, statusFlow.length - 1)];
}

function suggestedNextStep(request: CareRequest) {
  if (request.status === "Pendente") return "Definir responsavel";
  if (request.status === "Em analise") return "Agendar atendimento";
  if (request.status === "Agendado") return "Registrar retorno";
  return "Arquivado no historico";
}

export default function Home() {
  const [hasSession, setHasSession] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("login");
  const [accessMessage, setAccessMessage] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>(blankRegistration);
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [data, setData] = useState<AppData>(initialData);
  const [careForm, setCareForm] = useState(blankCare);
  const [selectedRequestId, setSelectedRequestId] = useState("care-1");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;

    try {
      setData(JSON.parse(stored) as AppData);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data]);

  const selectedRequest = data.careRequests.find((request) => request.id === selectedRequestId) ?? data.careRequests[0];

  const notifications = useMemo(() => {
    const pendingCare = data.careRequests
      .filter((request) => request.status !== "Concluido")
      .map((request) => ({
        id: `care-${request.id}-${request.status}`,
        title: `${request.member}: ${suggestedNextStep(request)}`,
        body: request.category,
        module: "pastoral" as ModuleKey,
      }));

    const upcomingEvents = data.events.slice(0, 3).map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      body: `${formatDate(event.date)} - ${event.ministry}`,
      module: "events" as ModuleKey,
    }));

    const publishedMural = data.mural
      .filter((item) => item.published)
      .map((item) => ({
        id: `mural-${item.id}`,
        title: item.title,
        body: item.featured ? "Destaque no mural" : item.category,
        module: "mural" as ModuleKey,
      }));

    return [...pendingCare, ...upcomingEvents, ...publishedMural];
  }, [data.careRequests, data.events, data.mural]);

  const unreadCount = notifications.filter((notice) => !data.notificationReadIds.includes(notice.id)).length;

  function log(action: string) {
    setData((current) => ({
      ...current,
      audit: [{ id: uid("audit"), action, when: new Date().toISOString() }, ...current.audit].slice(0, 12),
    }));
  }

  function createCareRequest() {
    if (!careForm.member.trim() || !careForm.summary.trim()) return;

    const now = new Date().toISOString();
    const request: CareRequest = {
      ...careForm,
      id: uid("care"),
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      careRequests: [request, ...current.careRequests],
      audit: [{ id: uid("audit"), action: `Pedido pastoral criado para ${request.member}`, when: now }, ...current.audit],
    }));
    setSelectedRequestId(request.id);
    setCareForm(blankCare);
    setActiveModule("pastoral");
  }

  function updateCareRequest(id: string, patch: Partial<CareRequest>, action: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      careRequests: current.careRequests.map((request) =>
        request.id === id ? { ...request, ...patch, updatedAt: now } : request,
      ),
      audit: [{ id: uid("audit"), action, when: now }, ...current.audit].slice(0, 12),
    }));
  }

  function toggleMural(id: string, field: "published" | "featured") {
    setData((current) => ({
      ...current,
      mural: current.mural.map((item) => (item.id === id ? { ...item, [field]: !item[field] } : item)),
      audit: [{ id: uid("audit"), action: "Mural atualizado", when: new Date().toISOString() }, ...current.audit],
    }));
  }

  function markAllNotificationsRead() {
    setData((current) => ({
      ...current,
      notificationReadIds: notifications.map((notice) => notice.id),
    }));
  }

  function resetLocalData() {
    setData(initialData);
    setSelectedRequestId("care-1");
    setCareForm(blankCare);
  }

  const stats = [
    { label: "Membros ativos", value: "0", hint: "cadastros visiveis" },
    { label: "Eventos proximos", value: data.events.length.toString(), hint: "na agenda" },
    { label: "Ministerios", value: "4", hint: "em atividade" },
    {
      label: "Atendimentos",
      value: data.careRequests.filter((request) => request.status !== "Concluido").length.toString(),
      hint: "em acompanhamento",
    },
  ];

  function switchAccessMode(mode: AccessMode) {
    setAccessMode(mode);
    setAccessMessage("");
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage("");
    setHasSession(true);
  }

  function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessMessage("Se o e-mail estiver cadastrado, a administracao recebera o pedido de recuperacao.");
  }

  function handleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (registrationForm.password !== registrationForm.passwordConfirm) {
      setAccessMessage("As senhas precisam ser iguais antes de enviar.");
      return;
    }

    setAccessMessage("Cadastro recebido para analise da administracao.");
    setRegistrationForm(blankRegistration);
  }

  if (!hasSession) {
    return (
      <AccessScreen
        accessMessage={accessMessage}
        loginPasswordVisible={loginPasswordVisible}
        mode={accessMode}
        onLogin={handleLogin}
        onRecover={handleRecover}
        onRegister={handleRegistration}
        onSwitchMode={switchAccessMode}
        registrationForm={registrationForm}
        registerPasswordVisible={registerPasswordVisible}
        setLoginPasswordVisible={setLoginPasswordVisible}
        setRegistrationForm={setRegistrationForm}
        setRegisterPasswordVisible={setRegisterPasswordVisible}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="app-shell">
        <aside className="sidebar" aria-label="Navegacao principal">
          <div className="brand-block">
            <div className="brand-mark">IG</div>
            <div>
              <p className="brand-name">Igreja Gestao</p>
              <p className="brand-caption">Painel administrativo</p>
            </div>
          </div>

          <nav className="module-list" aria-label="Modulos do sistema">
            {modules.map((module) => (
              <button
                className={activeModule === module.key ? "module-button active" : "module-button"}
                key={module.key}
                onClick={() => setActiveModule(module.key)}
                type="button"
              >
                <span>{module.short}</span>
                <strong>{module.label}</strong>
              </button>
            ))}
          </nav>

          <div className="connection-card">
            <span className="status-dot" />
            <div>
              <strong>Modo local ativo</strong>
              <span>Dados salvos neste computador</span>
            </div>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">Quarta-feira, 2 de setembro</p>
              <h1>{modules.find((module) => module.key === activeModule)?.label}</h1>
            </div>

            <div className="topbar-actions">
              <button
                aria-expanded={notificationsOpen}
                className="notification-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                type="button"
              >
                <span>Sino</span>
                {unreadCount > 0 && <strong>{unreadCount}</strong>}
              </button>
              <div className="profile-pill">
                <span>M</span>
                <div>
                  <strong>marianabsilva1987</strong>
                  <small>Administrador</small>
                </div>
              </div>
            </div>

            {notificationsOpen && (
              <div className="notifications-panel">
                <div className="panel-heading">
                  <h2>Central de notificacoes</h2>
                  <button onClick={markAllNotificationsRead} type="button">
                    Marcar tudo como lido
                  </button>
                </div>
                <div className="notification-list">
                  {notifications.map((notice) => (
                    <button
                      className={data.notificationReadIds.includes(notice.id) ? "notification-card read" : "notification-card"}
                      key={notice.id}
                      onClick={() => {
                        setActiveModule(notice.module);
                        setNotificationsOpen(false);
                        setData((current) => ({
                          ...current,
                          notificationReadIds: Array.from(new Set([...current.notificationReadIds, notice.id])),
                        }));
                      }}
                      type="button"
                    >
                      <strong>{notice.title}</strong>
                      <span>{notice.body}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </header>

          {activeModule === "overview" && (
            <section className="content-grid">
              <div className="hero-panel">
                <p className="eyebrow">Administracao e cuidado em um so lugar</p>
                <h2>O painel local esta pronto para continuar o sistema daqui.</h2>
                <p>
                  Use esta versao para validar fluxo pastoral, notificacoes, mural,
                  backup e organizacao dos modulos antes de religar tudo ao banco.
                </p>
                <div className="hero-actions">
                  <button onClick={() => setActiveModule("pastoral")} type="button">
                    Testar atendimento pastoral
                  </button>
                  <button className="secondary" onClick={() => setActiveModule("settings")} type="button">
                    Gerar backup local
                  </button>
                </div>
              </div>

              <div className="stats-grid">
                {stats.map((stat) => (
                  <article className="stat-card" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.hint}</small>
                  </article>
                ))}
              </div>

              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Proximos encontros</h2>
                  <button onClick={() => setActiveModule("events")} type="button">
                    Ver agenda
                  </button>
                </div>
                <div className="row-list">
                  {data.events.map((event) => (
                    <div className="data-row" key={event.id}>
                      <span className="date-box">{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <small>{event.ministry}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Mural da igreja</h2>
                  <span>{data.mural.filter((item) => item.published).length} de 5 publicados</span>
                </div>
                <div className="mural-stack">
                  {data.mural
                    .filter((item) => item.published)
                    .map((item) => (
                      <div className={item.featured ? "mural-card featured" : "mural-card"} key={item.id}>
                        <strong>{item.title}</strong>
                        <small>{item.category}</small>
                      </div>
                    ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "pastoral" && selectedRequest && (
            <section className="pastoral-layout">
              <article className="surface">
                <div className="panel-heading">
                  <h2>Novo pedido pastoral</h2>
                  <span>Fluxo real</span>
                </div>
                <div className="form-grid">
                  <label>
                    Nome do membro
                    <input
                      onChange={(event) => setCareForm((form) => ({ ...form, member: event.target.value }))}
                      placeholder="Ex.: Maria Oliveira"
                      value={careForm.member}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      onChange={(event) => setCareForm((form) => ({ ...form, phone: event.target.value }))}
                      placeholder="(00) 00000-0000"
                      value={careForm.phone}
                    />
                  </label>
                  <label>
                    Categoria
                    <select
                      onChange={(event) => setCareForm((form) => ({ ...form, category: event.target.value }))}
                      value={careForm.category}
                    >
                      <option>Aconselhamento</option>
                      <option>Pedido de visita</option>
                      <option>Oracao</option>
                      <option>Familia</option>
                      <option>Urgente</option>
                    </select>
                  </label>
                  <label className="full">
                    Descricao do pedido
                    <textarea
                      onChange={(event) => setCareForm((form) => ({ ...form, summary: event.target.value }))}
                      placeholder="Escreva o motivo do atendimento"
                      value={careForm.summary}
                    />
                  </label>
                  <button className="primary-action" onClick={createCareRequest} type="button">
                    Criar atendimento
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Fila pastoral</h2>
                  <span>{data.careRequests.length} registros</span>
                </div>
                <div className="care-list">
                  {data.careRequests.map((request) => (
                    <button
                      className={request.id === selectedRequest.id ? "care-list-item selected" : "care-list-item"}
                      key={request.id}
                      onClick={() => setSelectedRequestId(request.id)}
                      type="button"
                    >
                      <span className={`status-chip ${request.status.toLowerCase().replaceAll(" ", "-")}`}>
                        {request.status}
                      </span>
                      <strong>{request.member}</strong>
                      <small>{suggestedNextStep(request)}</small>
                    </button>
                  ))}
                </div>
              </article>

              <article className="surface care-detail">
                <div className="panel-heading">
                  <h2>{selectedRequest.member}</h2>
                  <span>{selectedRequest.category}</span>
                </div>
                <p>{selectedRequest.summary}</p>

                <div className="flow-line" aria-label="Etapas do atendimento">
                  {statusFlow.map((status) => (
                    <span
                      className={statusFlow.indexOf(status) <= statusFlow.indexOf(selectedRequest.status) ? "flow-step done" : "flow-step"}
                      key={status}
                    >
                      {status}
                    </span>
                  ))}
                </div>

                <div className="detail-grid">
                  <label>
                    Responsavel
                    <input
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { responsible: event.target.value }, "Responsavel pastoral atualizado")
                      }
                      placeholder="Nome do pastor ou lider"
                      value={selectedRequest.responsible}
                    />
                  </label>
                  <label>
                    Data
                    <input
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { scheduleDate: event.target.value }, "Data do atendimento atualizada")
                      }
                      type="date"
                      value={selectedRequest.scheduleDate}
                    />
                  </label>
                  <label>
                    Horario
                    <input
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { scheduleTime: event.target.value }, "Horario do atendimento atualizado")
                      }
                      type="time"
                      value={selectedRequest.scheduleTime}
                    />
                  </label>
                  <label className="full">
                    Retorno e encaminhamento
                    <textarea
                      onChange={(event) =>
                        updateCareRequest(selectedRequest.id, { returnNote: event.target.value }, "Retorno pastoral registrado")
                      }
                      placeholder="Registre conversa, retorno, decisao e proximo passo"
                      value={selectedRequest.returnNote}
                    />
                  </label>
                </div>

                <div className="detail-actions">
                  <button
                    onClick={() =>
                      updateCareRequest(
                        selectedRequest.id,
                        { status: nextStatus(selectedRequest.status) },
                        `Status alterado para ${nextStatus(selectedRequest.status)}`,
                      )
                    }
                    type="button"
                  >
                    Avancar etapa
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      updateCareRequest(selectedRequest.id, { status: "Concluido" }, "Atendimento pastoral concluido")
                    }
                    type="button"
                  >
                    Concluir
                  </button>
                </div>
              </article>
            </section>
          )}

          {activeModule === "mural" && (
            <section className="content-grid">
              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Administrar mural</h2>
                  <span>{data.mural.filter((item) => item.published).length} publicados</span>
                </div>
                <div className="table-like">
                  {data.mural.map((item) => (
                    <div className="table-row" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.category} - expira em {formatDate(item.expiresAt)}</small>
                      </div>
                      <label className="switch">
                        Publicado
                        <input checked={item.published} onChange={() => toggleMural(item.id, "published")} type="checkbox" />
                      </label>
                      <label className="switch">
                        Destaque
                        <input checked={item.featured} onChange={() => toggleMural(item.id, "featured")} type="checkbox" />
                      </label>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeModule === "events" && (
            <SimpleModule
              action={() => log("Agenda revisada")}
              button="Registrar revisao"
              description="A agenda local mostra encontros proximos e sera a base para integrar escalas, confirmacoes e notificacoes."
              rows={data.events.map((event) => `${formatDate(event.date)} - ${event.title} (${event.ministry})`)}
              title="Agenda da igreja"
            />
          )}

          {activeModule === "notices" && (
            <SimpleModule
              action={() => log("Comunicados revisados")}
              button="Registrar revisao"
              description="Comunicados publicados entram automaticamente na central de notificacoes."
              rows={data.notices.map((notice) => `${notice.status} - ${notice.title}: ${notice.body}`)}
              title="Comunicados"
            />
          )}

          {activeModule === "users" && (
            <SimpleModule
              action={() => log("Permissoes revisadas")}
              button="Registrar auditoria"
              description="Separacao planejada: administrador, lider e membro. A proxima etapa tecnica e religar essas permissoes ao Auth/RLS."
              rows={["Administrador - acesso completo", "Lider - ministerios e atendimentos atribuidos", "Membro - painel pessoal"]}
              title="Usuarios e acessos"
            />
          )}

          {activeModule === "members" && (
            <SimpleModule
              action={() => log("Cadastro de membros revisado")}
              button="Registrar revisao"
              description="Modulo preparado para listagem, filtros, familia, status e historico espiritual."
              rows={["0 membros visiveis no ambiente local", "Campos previstos: telefone, email, familia, batismo e status"]}
              title="Membros"
            />
          )}

          {activeModule === "ministries" && (
            <SimpleModule
              action={() => log("Ministerios revisados")}
              button="Registrar revisao"
              description="Organize equipes, lideres e escalas por ministerio."
              rows={["Louvor", "Jovens", "Intercessao", "EBD"]}
              title="Ministerios"
            />
          )}

          {activeModule === "school" && (
            <SimpleModule
              action={() => log("Escola Biblica revisada")}
              button="Registrar revisao"
              description="Base inicial para turmas, aulas, presenca e materiais."
              rows={["Classe adultos", "Classe jovens", "Classe novos convertidos"]}
              title="Escola Biblica"
            />
          )}

          {activeModule === "reports" && (
            <SimpleModule
              action={() => log("Relatorio operacional gerado")}
              button="Gerar registro"
              description="Resumo local para acompanhar operacao antes da integracao final."
              rows={[
                `${data.careRequests.length} atendimentos pastorais`,
                `${data.events.length} eventos cadastrados`,
                `${unreadCount} notificacoes nao lidas`,
              ]}
              title="Relatorios"
            />
          )}

          {activeModule === "settings" && (
            <section className="content-grid">
              <article className="surface wide">
                <div className="panel-heading">
                  <h2>Backup e recuperacao local</h2>
                  <span>JSON validado</span>
                </div>
                <p className="body-copy">
                  Esta copia roda neste computador. O backup abaixo representa os dados locais do navegador e ajuda a
                  validar a estrutura antes de conectar novamente ao Supabase.
                </p>
                <div className="backup-box">
                  <strong>Cobertura do backup</strong>
                  <span>100%</span>
                  <small>
                    {data.careRequests.length} atendimentos, {data.events.length} eventos, {data.notices.length} comunicados,
                    {" "}
                    {data.mural.length} itens de mural e {data.audit.length} auditorias.
                  </small>
                </div>
                <textarea className="backup-json" readOnly value={JSON.stringify(data, null, 2)} />
                <div className="detail-actions">
                  <button onClick={() => log("Backup local gerado")} type="button">
                    Registrar backup
                  </button>
                  <button className="secondary" onClick={resetLocalData} type="button">
                    Restaurar dados exemplo
                  </button>
                </div>
              </article>

              <article className="surface">
                <div className="panel-heading">
                  <h2>Auditoria</h2>
                  <span>{data.audit.length} eventos</span>
                </div>
                <div className="audit-list">
                  {data.audit.map((item) => (
                    <div className="audit-item" key={item.id}>
                      <strong>{item.action}</strong>
                      <small>{formatDateTime(item.when)}</small>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function AccessScreen({
  accessMessage,
  loginPasswordVisible,
  mode,
  onLogin,
  onRecover,
  onRegister,
  onSwitchMode,
  registrationForm,
  registerPasswordVisible,
  setLoginPasswordVisible,
  setRegistrationForm,
  setRegisterPasswordVisible,
}: {
  accessMessage: string;
  loginPasswordVisible: boolean;
  mode: AccessMode;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onRecover: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: AccessMode) => void;
  registrationForm: RegistrationForm;
  registerPasswordVisible: boolean;
  setLoginPasswordVisible: Dispatch<SetStateAction<boolean>>;
  setRegistrationForm: Dispatch<SetStateAction<RegistrationForm>>;
  setRegisterPasswordVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const isLogin = mode === "login";
  const isRecover = mode === "recover";
  const title = isLogin ? "Bem-vindo de volta" : isRecover ? "Recuperar acesso" : "Solicitar cadastro";
  const eyebrow = isLogin || isRecover ? "Area segura" : "Cadastro online";
  const description = isLogin
    ? "Use seu e-mail e senha para acessar o painel correto."
    : isRecover
      ? "Informe seu e-mail para pedir a redefinicao da senha."
      : "Preencha seus dados para a administracao analisar e liberar o acesso.";

  return (
    <main className="access-page">
      <section className="access-intro" aria-label="Apresentacao do sistema">
        <div className="brand-block">
          <div className="brand-mark">IG</div>
          <p className="brand-name">Igreja Gestao</p>
        </div>
        <div>
          <p className="access-kicker">Cuidar - Servir - Conectar</p>
          <h1>Toda a igreja, mais perto.</h1>
          <p>Uma plataforma segura para fortalecer o cuidado com pessoas, ministerios e a missao.</p>
        </div>
        <blockquote>
          <p>"Sirvam uns aos outros, cada um conforme o dom que recebeu."</p>
          <cite>1 Pedro 4:10</cite>
        </blockquote>
      </section>

      <section className="access-panel" aria-label={title}>
        <div className="access-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        {accessMessage && (
          <p className="form-message" role="status">
            {accessMessage}
          </p>
        )}

        {isLogin && (
          <form className="access-form" method="post" onSubmit={onLogin}>
            <label>
              E-mail
              <input autoComplete="email" name="email" placeholder="voce@email.com" required type="email" />
            </label>
            <label>
              Senha
              <span className="password-field">
                <input
                  autoComplete="current-password"
                  name="password"
                  placeholder="Sua senha"
                  required
                  type={loginPasswordVisible ? "text" : "password"}
                />
                <button
                  aria-label={loginPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setLoginPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {loginPasswordVisible ? "Ocultar" : "Mostrar"}
                </button>
              </span>
            </label>
            <button className="access-primary" type="submit">
              Entrar no sistema
            </button>
          </form>
        )}

        {isRecover && (
          <form className="access-form" method="post" onSubmit={onRecover}>
            <label>
              E-mail
              <input autoComplete="email" name="recovery_email" placeholder="voce@email.com" required type="email" />
            </label>
            <button className="access-primary" type="submit">
              Enviar instrucoes
            </button>
          </form>
        )}

        {mode === "register" && (
          <form className="access-form registration-form" method="post" onSubmit={onRegister}>
            <label className="full">
              Nome completo
              <input
                autoComplete="name"
                minLength={3}
                name="full_name"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, fullName: event.target.value }))}
                required
                value={registrationForm.fullName}
              />
            </label>
            <label>
              Telefone
              <input
                autoComplete="tel"
                minLength={8}
                name="phone"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, phone: event.target.value }))}
                required
                value={registrationForm.phone}
              />
            </label>
            <label>
              E-mail
              <input
                autoComplete="email"
                name="email"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, email: event.target.value }))}
                required
                type="email"
                value={registrationForm.email}
              />
            </label>
            <label>
              Nascimento
              <input
                autoComplete="bday"
                name="birth_date"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, birthDate: event.target.value }))}
                required
                type="date"
                value={registrationForm.birthDate}
              />
            </label>
            <label>
              Estado civil
              <select
                name="marital_status"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, maritalStatus: event.target.value }))}
                value={registrationForm.maritalStatus}
              >
                <option>Solteiro(a)</option>
                <option>Casado(a)</option>
                <option>Viuvo(a)</option>
                <option>Divorciado(a)</option>
              </select>
            </label>
            <label className="full">
              Endereco
              <input
                autoComplete="street-address"
                name="address"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, address: event.target.value }))}
                value={registrationForm.address}
              />
            </label>
            <label>
              Congregacao de interesse
              <input
                name="congregation_interest"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, congregationInterest: event.target.value }))}
                placeholder="Ex.: Maringa"
                value={registrationForm.congregationInterest}
              />
            </label>
            <label>
              Tipo de cadastro
              <select
                name="registration_type"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, registrationType: event.target.value }))}
                value={registrationForm.registrationType}
              >
                <option>Membro novo</option>
                <option>Novo convertido</option>
                <option>Visitante frequente</option>
                <option>Transferencia</option>
              </select>
            </label>
            <label className="full">
              Igreja anterior
              <input
                name="previous_church"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, previousChurch: event.target.value }))}
                value={registrationForm.previousChurch}
              />
            </label>
            <label>
              Criar senha de acesso
              <span className="password-field">
                <input
                  autoComplete="new-password"
                  minLength={10}
                  name="login_password"
                  onChange={(event) => setRegistrationForm((form) => ({ ...form, password: event.target.value }))}
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}"
                  required
                  title="Use pelo menos 10 caracteres, com maiuscula, minuscula, numero e simbolo."
                  type={registerPasswordVisible ? "text" : "password"}
                  value={registrationForm.password}
                />
                <button
                  aria-label={registerPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setRegisterPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {registerPasswordVisible ? "Ocultar" : "Mostrar"}
                </button>
              </span>
              <small>Essa senha sera usada no login depois da aprovacao.</small>
            </label>
            <label>
              Confirmar senha
              <input
                autoComplete="new-password"
                minLength={10}
                name="login_password_confirm"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, passwordConfirm: event.target.value }))}
                required
                type={registerPasswordVisible ? "text" : "password"}
                value={registrationForm.passwordConfirm}
              />
            </label>
            <label className="check-card">
              <input
                checked={registrationForm.waterBaptized}
                name="is_water_baptized"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, waterBaptized: event.target.checked }))}
                type="checkbox"
              />
              Batizado em aguas
            </label>
            <label className="check-card">
              <input
                checked={registrationForm.holySpiritBaptized}
                name="is_holy_spirit_baptized"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, holySpiritBaptized: event.target.checked }))}
                type="checkbox"
              />
              Batizado no Espirito Santo
            </label>
            <label className="full">
              Ministerios de interesse
              <input
                name="interested_ministries"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, interestedMinistries: event.target.value }))}
                placeholder="Louvor, jovens, acao social"
                value={registrationForm.interestedMinistries}
              />
            </label>
            <label className="full">
              Observacao ou pedido de oracao
              <textarea
                name="notes_or_prayer"
                onChange={(event) => setRegistrationForm((form) => ({ ...form, notesOrPrayer: event.target.value }))}
                value={registrationForm.notesOrPrayer}
              />
            </label>
            <button className="access-primary full" type="submit">
              Enviar cadastro
            </button>
          </form>
        )}

        <div className="access-links">
          {!isRecover && (
            <button onClick={() => onSwitchMode("recover")} type="button">
              Esqueci minha senha
            </button>
          )}
          {mode !== "register" && (
            <button onClick={() => onSwitchMode("register")} type="button">
              Fazer cadastro online
            </button>
          )}
          {!isLogin && (
            <button onClick={() => onSwitchMode("login")} type="button">
              Voltar ao login
            </button>
          )}
        </div>

        <div className="access-profile-note">
          <strong>Acesso por perfil</strong>
          <span>O sistema identifica membros, lideres e administradores.</span>
        </div>
      </section>
    </main>
  );
}

function SimpleModule({
  action,
  button,
  description,
  rows,
  title,
}: {
  action: () => void;
  button: string;
  description: string;
  rows: string[];
  title: string;
}) {
  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>{title}</h2>
          <button onClick={action} type="button">
            {button}
          </button>
        </div>
        <p className="body-copy">{description}</p>
        <div className="row-list">
          {rows.map((row) => (
            <div className="data-row" key={row}>
              <span className="bullet-mark" />
              <div>
                <strong>{row}</strong>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
