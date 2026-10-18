import { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, selectChurch, money, shortDate, type RecordData } from "./api";
import { Icon, Badge, Empty, Field, Modal, Submit, formValues } from "./ui";
import {
  Dashboard,
  People,
  Cells,
  Finance,
  Governance,
  Portal,
  Network,
} from "./pages";
import OperationsPage from "./OperationsPage";
import TreasuryPage from "./TreasuryPage";
import AgendaPage from "./AgendaPage";
import ParticipationPage from "./ParticipationPage";
import CommunicationPage from "./CommunicationPage";
import EducationPage from "./EducationPage";
import WorshipPage from "./WorshipPage";
import KidsPage from "./KidsPage";
import InstitutionalPage from "./InstitutionalPage";
import AssemblyPage from "./AssemblyPage";
import AssetsPage from "./AssetsPage";
import LibraryPage from "./LibraryPage";
import AssistancePage from "./AssistancePage";
import MediaPage from "./MediaPage";
import PlatformBillingPage from "./PlatformBillingPage";
type Page =
  | "dashboard"
  | "network"
  | "people"
  | "cells"
  | "finance"
  | "governance"
  | "operations"
  | "treasury"
  | "agenda"
  | "participation"
  | "communication"
  | "education"
  | "worship"
  | "kids"
  | "institutional"
  | "assemblies"
  | "assets"
  | "library"
  | "assistance"
  | "media"
  | "portal"
  | "platform";
type Area =
  | "dashboard" | "secretariat" | "groups" | "treasury" | "operations"
  | "participation" | "communication" | "governance" | "portal";
type AreaTab = { page: Page; label: string };
const areaTabs: Record<Area, AreaTab[]> = {
  dashboard: [{ page: "dashboard", label: "Visão geral" }],
  secretariat: [{ page: "people", label: "Pessoas e famílias" }, { page: "operations", label: "Cadastros e documentos" }],
  groups: [{ page: "cells", label: "Grupos e cuidado" }],
  treasury: [{ page: "finance", label: "Visão financeira" }, { page: "treasury", label: "Contas e aprovações" }],
  operations: [{ page: "agenda", label: "Agenda e recursos" }, { page: "worship", label: "Cultos e equipes" }],
  participation: [{ page: "participation", label: "Eventos e processos" }, { page: "education", label: "Ensino e formação" }, { page: "kids", label: "Kids e check-in" }],
  communication: [{ page: "communication", label: "Comunicação" }, { page: "media", label: "Mural e mídia" }],
  governance: [
    { page: "governance", label: "Rede e permissões" }, { page: "network", label: "Minha rede" },
    { page: "institutional", label: "Institucional" }, { page: "assemblies", label: "Assembleias" },
    { page: "assets", label: "Patrimônio" }, { page: "library", label: "Biblioteca" },
    { page: "assistance", label: "Assistência social" }, { page: "platform", label: "Operação comercial" },
  ],
  portal: [{ page: "portal", label: "Portal do membro" }],
};
const nav = [
  { page: "dashboard", label: "Visão geral", icon: "grid", area: "dashboard" },
  { page: "people", label: "Secretaria", icon: "people", area: "secretariat" },
  { page: "cells", label: "Grupos e cuidado", icon: "cells", area: "groups" },
  { page: "finance", label: "Tesouraria", icon: "wallet", area: "treasury" },
  { page: "agenda", label: "Agenda e operação", icon: "calendar", area: "operations" },
  { page: "participation", label: "Participação e formação", icon: "heart", area: "participation" },
  { page: "communication", label: "Comunicação e conteúdo", icon: "bell", area: "communication" },
  { page: "governance", label: "Governança", icon: "shield", area: "governance" },
  { page: "portal", label: "Portal do membro", icon: "heart", area: "portal" },
] as const;
const pageArea: Record<Page, Area> = Object.fromEntries(
  (Object.entries(areaTabs) as [Area, AreaTab[]][]).flatMap(([area, tabs]) => tabs.map(({ page }) => [page, area])),
) as Record<Page, Area>;
const legacyPaths: Record<string, Page> = {
  "/cells": "cells", "/finance": "finance", "/treasury": "treasury", "/operations": "operations", "/media": "media",
  "/app/secretaria": "people", "/app/grupos": "cells", "/app/tesouraria": "finance",
  "/app/operacao": "agenda", "/app/participacao": "participation",
  "/app/comunicacao": "communication", "/app/governanca": "governance",
};
const initialPage = legacyPaths[window.location.pathname];
export default function App() {
  const [context, setContext] = useState<RecordData | null>(null),
    [checking, setChecking] = useState(true),
    [church, setChurch] = useState(""),
    [page, setPage] = useState<Page>(legacyPaths[window.location.pathname] ?? "dashboard"),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState(""),
    [theme, setTheme] = useState(
      () => localStorage.getItem("ecclesia-theme") ?? "dark",
    ),
    [senior, setSenior] = useState(
      () => localStorage.getItem("ecclesia-senior") === "true",
    ),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    try {
      const c = await api("/context");
      setContext(c);
      if (c.churches.length) {
        setChurch((old) => old || c.churches[0].id);
        selectChurch(c.churches[0].id);
      }
      setPage(
        initialPage ??
          (c.networks.length
            ? "network"
            : c.churches[0]?.role === "member"
              ? "portal"
              : "dashboard"),
      );
    } catch {
      setContext(null);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.senior = String(senior);
    localStorage.setItem("ecclesia-theme", theme);
    localStorage.setItem("ecclesia-senior", String(senior));
  }, [theme, senior]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const notify = (s: string) => setNotice(s);
  const refresh = () => setRevision((v) => v + 1);
  const current = context?.churches.find((c: RecordData) => c.id === church);
  const activeArea = pageArea[page] ?? "dashboard";
  const pageLabel = areaTabs[activeArea].find((tab) => tab.page === page)?.label ?? nav.find((n) => n.page === page)?.label;
  useEffect(() => {
    const color = current?.primary_color ?? "#7062db";
    const palette: Record<string, string> = {
      "#7062db": "#b7a8ff",
      "#317b68": "#8cdbbd",
      "#386fa4": "#9bc9f5",
    };
    document.documentElement.style.setProperty("--primary", color);
    document.documentElement.style.setProperty(
      "--accent",
      theme === "light" ? color : (palette[color] ?? "#b7a8ff"),
    );
  }, [current?.primary_color, theme]);
  if (checking)
    return (
      <div className="loading-screen">
        <Icon name="home" size={40} />
        <p>Preparando sua comunidade…</p>
      </div>
    );
  if (!context) return <Login onLogin={load} />;
  const props = { church, revision, notify, refresh, pastoralRead: Boolean(current?.permissions?.pastoralRead) };
  return (
    <div className="app-shell">
      <a href="#content" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <Icon name="home" size={25} />
          </span>
          <span>
            ecclesia<span className="brand-os">OS</span>
            <small>GESTÃO QUE APROXIMA</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-symbol">CE</span>
          <div>
            <strong>Seu espaço de cuidado</strong>
            <small>
              {context.networks[0]?.name ?? "Rede Caminho de Esperança"}
            </small>
          </div>
        </div>
        <div className="nav-label">COMUNIDADE</div>
        <nav aria-label="Menu principal">
          {nav
            .filter((n) => n.area !== "governance" || context.networks.length || current?.role === "admin" || !!context.platformRole)
            .filter((n) => n.area !== "portal" || !!current?.role)
            .map((n) => (
              <button
                key={n.area}
                aria-label={n.label}
                className={'nav-item ' + (pageArea[page] === n.area ? "active" : "")}
                onClick={() => {
                  setPage(n.page);
                  setSearch("");
                }}
              >
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-note">
            <Icon name="shield" />
            <strong>Cuidado também é proteção.</strong>
            <p>
              Dados de cada igreja, preservados. Uma rede conectada com
              confiança.
            </p>
            <span>
              Privacidade desde a origem <Icon name="check" size={13} />
            </span>
          </div>
          <button
            className="account"
            onClick={async () => {
              await api("/auth/logout", "POST");
              setChurch("");
              selectChurch("");
              setContext(null);
            }}
          >
            <span className="avatar">
              {context.user.name
                .split(" ")
                .map((v: string) => v[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{context.user.name}</strong>
              <small>
                {current?.role === "member"
                  ? "Membro"
                  : context.networks.length
                    ? "Supervisão da rede"
                    : "Administração local"}
              </small>
            </span>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{pageLabel}</strong>
          </div>
          <div className="header-actions">
            <label className="church-select">
              <Icon name="home" size={17} />
              <span className="sr-only">Igreja ativa</span>
              <select
                aria-label="Igreja ativa"
                value={church}
                onChange={(e) => {
                  setChurch(e.target.value);
                  selectChurch(e.target.value);
                  refresh();
                }}
              >
                {context.churches.map((c: RecordData) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              aria-label={
                theme === "dark" ? "Ativar modo Alvorada" : "Ativar modo Cosmos"
              }
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              <Icon name="sun" />
            </button>
            <button
              className="icon-button senior"
              aria-label="Modo sênior"
              aria-pressed={senior}
              onClick={() => setSenior((s) => !s)}
            >
              A+
            </button>
            <span className="avatar mini">{context.user.name[0]}</span>
          </div>
        </header>
        {activeArea !== "dashboard" && areaTabs[activeArea].length > 1 && (
          <nav className="module-tabs" aria-label={'Abas de ' + (nav.find((item) => item.area === activeArea)?.label ?? "módulo")}>
            {areaTabs[activeArea].map((tab) => (
              <button
                key={tab.page}
                className={'module-tab ' + (page === tab.page ? "active" : "")}
                onClick={() => setPage(tab.page)}
                aria-current={page === tab.page ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
        <main id="content" tabIndex={-1}>
          <div className="environment">
            <span className="status-dot" />
            {context.mode === "demo"
              ? "DEMONSTRAÇÃO · DADOS FICTÍCIOS"
              : "HOMOLOGAÇÃO · SEM PAGAMENTOS DE PRODUÇÃO"}
            <span className="environment-date">
              {new Date().toLocaleDateString("pt-BR", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
              })}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{current?.name ?? "EcclesiaOS"}</div>
              <h1>
                {page === "dashboard"
                  ? `Olá, ${context.user.name.split(" ")[0]}. Vamos cuidar?`
                  : nav.find((n) => n.page === page)?.label}
              </h1>
              <p>
                {
                  {
                    dashboard:
                      "Uma visão clara da comunidade. Mais tempo para o que importa.",
                    network: "Autonomia nas igrejas. Clareza para toda a rede.",
                    people:
                      "Cada cadastro tem uma história. Cada família, um lugar.",
                    cells:
                      "Pequenos encontros. Vínculos que fazem a diferença.",
                    finance:
                      "Cada contribuição com destino, registro e transparência.",
                    governance:
                      "Permissões explícitas. Confiança em cada acesso.",
                    portal: "Sua comunidade, sempre por perto.",
                    operations:
                      "Rotinas, responsáveis e acessos em um só lugar.",
                    treasury:
                      "Solicitação, aprovação independente e baixas rastreáveis.",
                    agenda: "Atividades, recursos, equipes e próximos passos.",
                    participation:
                      "Inscrições, processos e acompanhamento conectado às pessoas.",
                    communication:
                      "Preferências, avisos e histórico de comunicação.",
                    education:
                      "Cursos, frequência e formação conectados às pessoas.",
                    worship:
                      "Ordem, equipe e materiais preparados para cada celebração.",
                    kids:
                      "Proteção, presença e retirada segura para as crianças.",
                    institutional:
                      "Filiação, credenciais e responsabilidades da igreja na rede.",
                    assemblies:
                      "Convocações, delegados, quorum e documentos oficiais.",
                    assets:
                      "Inventário, responsáveis e manutenção da estrutura da igreja.",
                    library:
                      "Catálogo, empréstimos e devoluções vinculados às pessoas.",
                    assistance:
                      "Pedidos protegidos, encaminhamentos e resultados com acesso restrito.",
                    media:
                      "Avisos, vídeos e galerias publicados com segurança.",
                  }[page]
                }
              </p>
            </div>
            {page === "dashboard" && (
              <button
                className="button secondary"
                onClick={() => setPage("people")}
              >
                <Icon name="plus" size={17} />
                Cadastrar pessoa
              </button>
            )}
          </div>
          {page === "dashboard" && (
            <Dashboard {...props} onNavigate={setPage} />
          )}
          {page === "network" && <Network {...props} onNavigate={setPage} />}
          {page === "people" && (
            <People
              key={church}
              {...props}
              search={search}
              setSearch={setSearch}
            />
          )}
          {page === "cells" && <Cells key={church} {...props} />}
          {page === "finance" && (
            <Finance key={church} {...props} mode={context.mode} />
          )}
          {page === "operations" && (
            <OperationsPage key={church} {...props} current={current} />
          )}
          {page === "treasury" && <TreasuryPage key={church} {...props} />}
          {page === "agenda" && (
            <AgendaPage key={church} {...props} current={current} />
          )}
          {page === "participation" && (
            <ParticipationPage key={church} {...props} />
          )}
          {page === "communication" && (
            <CommunicationPage key={church} {...props} />
          )}
          {page === "education" && <EducationPage key={church} {...props} />}
          {page === "worship" && <WorshipPage key={church} {...props} />}
          {page === "kids" && <KidsPage key={church} {...props} />}
          {page === "institutional" && <InstitutionalPage key={church} {...props} />}
          {page === "assemblies" && <AssemblyPage key={church} {...props} />}
          {page === "assets" && <AssetsPage key={church} {...props} />}
          {page === "library" && <LibraryPage key={church} {...props} />}
          {page === "assistance" && <AssistancePage key={church} {...props} />}
          {page === "media" && <MediaPage key={church} {...props} />}\n          {page === "platform" && <PlatformBillingPage key={church} {...props} />}
          {page === "governance" && (
            <Governance
              {...props}
              current={current}
              reloadContext={async () => {
                const c = await api("/context");
                setContext(c);
              }}
            />
          )}
          {page === "portal" && (
            <Portal key={church} {...props} mode={context.mode} />
          )}
          <footer className="footer">
            <span>
              <Icon name="home" size={14} />
              EcclesiaOS <span>·</span> Pessoas no centro. Gestão com propósito.
            </span>
            <span>
              <span className="status-dot" /> Ambiente{" "}
              {context.mode === "demo"
                ? "local de demonstração"
                : "de homologação"}
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role="status" className="toast">
          <Icon name="bell" size={18} />
          {notice}
          <button onClick={() => setNotice("")} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [demo, setDemo] = useState<RecordData | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/demo-info")
      .then(setDemo)
      .catch(() => {});
  }, []);
  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await api("/auth/mfa", "POST", { challenge, code });
        await onLogin();
      } else {
        const r = await api("/auth/login", "POST", { email, password });
        if (r.mfaRequired) {
          setChallenge(r.challenge);
          if (demo) {
            const d = await api("/demo-info");
            setCode(d.code);
          }
        } else await onLogin();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-layout">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="home" size={30} />
          </span>
          ecclesiaOS
        </div>
        <Badge tone="purple">UMA REDE. MUITAS COMUNIDADES.</Badge>
        <h1>
          Gestão que organiza.
          <br />
          <span>Cuidado que aproxima.</span>
        </h1>
        <p>
          Conecte igrejas, fortaleça vínculos e acompanhe sua rede com clareza,
          respeito e propósito.
        </p>
        <div className="login-orbit">
          <span>
            <Icon name="people" size={32} />
          </span>
          <span>
            <Icon name="home" size={48} />
          </span>
          <span>
            <Icon name="heart" size={32} />
          </span>
        </div>
        <small>
          Autonomia local · Supervisão responsável · Privacidade pastoral
        </small>
      </section>
      <section className="login-card">
        <div className="eyebrow">BEM-VINDO À SUA COMUNIDADE</div>
        <h2>{challenge ? "Confirme sua identidade" : "Entre no EcclesiaOS"}</h2>
        <p>
          {challenge
            ? "Informe o código do seu autenticador."
            : "Um espaço seguro para servir melhor."}
        </p>
        <form onSubmit={login}>
          {challenge ? (
            <Field label="Código de autenticação">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                pattern="[0-9]{6}"
              />
            </Field>
          ) : (
            <>
              <Field label="E-mail">
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Senha">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Submit
            busy={busy}
            label={challenge ? "Confirmar e entrar" : "Entrar na comunidade"}
          />
        </form>
        <p>
          <a href="/recuperar-autenticador">
            Recuperar acesso com código de segurança
          </a>
        </p>
        {demo && (
          <div className="demo-accounts">
            <span className="eyebrow">EXPLORE COM DADOS FICTÍCIOS</span>
            <p>
              Escolha um perfil. Senha e MFA demonstrativos serão preenchidos.
            </p>
            {demo.accounts.map((a: RecordData) => (
              <button
                key={a.email}
                className="demo-account"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(demo.password);
                  setChallenge("");
                }}
              >
                <span>
                  {a.label}
                  <small>{a.email}</small>
                </span>
                <Icon name="arrow" size={17} />
              </button>
            ))}
          </div>
        )}
        <small className="login-privacy">
          <Icon name="shield" size={14} /> Informações protegidas, acessos com
          responsabilidade.
        </small>
      </section>
    </div>
  );
}


