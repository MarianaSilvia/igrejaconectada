import { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, selectChurch, money, shortDate, type RecordData } from "./api";
import { Icon, Badge, Empty, Field, Modal, Submit, formValues } from "./ui";
import {
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  resetPassword,
  getUserProfile,
  translateFirebaseAuthError,
  logoutFirebase,
  syncFirstAdminProfile,
  syncSaaSToFirestore,
  auth,
  onAuthStateChanged,
  type User,
} from "./firebase";
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
import HistoryPage from "./HistoryPage";
import PeopleInsightsPage from "./PeopleInsightsPage";
import SecurityPage from "./SecurityPage";
import FirebaseActivityLogs from "./FirebaseActivityLogs";
import { logFirebaseActivity } from "./activityLogs";
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
  | "history"
  | "people-insights"
  | "security"
  | "portal"
  | "firebase-logs";
type Area =
  | "dashboard" | "secretariat" | "groups" | "treasury" | "operations"
  | "participation" | "communication" | "governance" | "portal";
type AreaTab = { page: Page; label: string };
const areaTabs: Record<Area, AreaTab[]> = {
  dashboard: [{ page: "dashboard", label: "Visão geral" }],
  secretariat: [{ page: "people", label: "Pessoas e famílias" }, { page: "operations", label: "Cadastros e documentos" }, { page: "history", label: "Histórico e relatórios" }, { page: "people-insights", label: "Comemorações e qualidade" }, { page: "security", label: "Minha conta e segurança" }],
  groups: [{ page: "cells", label: "Grupos e cuidado" }],
  treasury: [{ page: "finance", label: "Visão financeira" }, { page: "treasury", label: "Contas e aprovações" }],
  operations: [{ page: "agenda", label: "Agenda e recursos" }, { page: "worship", label: "Cultos e equipes" }],
  participation: [{ page: "participation", label: "Eventos e processos" }, { page: "education", label: "Ensino e formação" }, { page: "kids", label: "Kids e check-in" }],
  communication: [{ page: "communication", label: "Comunicação" }, { page: "media", label: "Mural e mídia" }],
  governance: [
    { page: "governance", label: "Rede e permissões" },
    { page: "firebase-logs", label: "Logs Firebase & Segurança" },
    { page: "network", label: "Minha rede" },
    { page: "institutional", label: "Institucional" },
    { page: "assemblies", label: "Assembleias" },
    { page: "assets", label: "Patrimônio" },
    { page: "library", label: "Biblioteca" },
    { page: "assistance", label: "Assistência social" },
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
const legacyRedirects: Record<string, string> = {
  "/cells": "/app/grupos",
  "/finance": "/app/tesouraria",
  "/treasury": "/app/tesouraria",
  "/operations": "/app/secretaria",
  "/media": "/app/comunicacao",
};
export interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onLogin?: () => Promise<void>;
}

/**
 * Componente wrapper de Rota Protegida que verifica o estado de autenticação
 * do Firebase. Se o usuário não estiver autenticado, redireciona-o automaticamente
 * para a tela de login.
 */
export function ProtectedRoute({
  children,
  fallback,
  onLogin,
}: ProtectedRouteProps) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
  const [backendAuthenticated, setBackendAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [backendChecking, setBackendChecking] = useState(true);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const syncBackendSession = async (user: User | null) => {
      if (!user) {
        if (!cancelled) {
          setBackendAuthenticated(false);
          setBackendChecking(false);
          setSyncError("");
        }
        return;
      }
      setBackendChecking(true);
      try {
        await api("/context");
        if (!cancelled) {
          setBackendAuthenticated(true);
          // Recarrega o contexto do aplicativo assim que a sessão Firebase
          // estiver confirmada. Isso evita que o estado inicial vazio mantenha
          // a tela de login após um login bem-sucedido.
          if (onLogin) void onLogin().catch(() => undefined);
        }
      } catch {
        try {
          const idToken = await user.getIdToken(true);
          await api(
            "/auth/firebase-sync",
            "POST",
            { name: user.displayName || undefined },
            { Authorization: `Bearer ${idToken}` },
          );
          if (!cancelled) {
            setBackendAuthenticated(true);
            // A sessão foi criada no backend; agora carregue igreja, papel e
            // permissões antes de renderizar a aplicação.
            if (onLogin) void onLogin().catch(() => undefined);
          }
        } catch (err) {
          if (!cancelled) {
            setBackendAuthenticated(false);
            setSyncError(err instanceof Error ? err.message : "Não foi possível sincronizar sua conta com o sistema.");
          }
        }
      } finally {
        if (!cancelled) setBackendChecking(false);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthChecking(false);
      void syncBackendSession(user);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (authChecking || backendChecking) {
    return (
      <div className="loading-screen" role="status">
        <Icon name="shield" size={40} />
        <p>Verificando credenciais e acessos do Firebase…</p>
      </div>
    );
  }

  // Firebase autenticado sem sessão EcclesiaOS não é um estado válido. Isso
  // evita mostrar telas administrativas quando a sincronização falhou.
  if (!firebaseUser || !backendAuthenticated) {
    return (
      <>
        {syncError ? <div className="toast error" role="alert" aria-live="assertive">{syncError}</div> : null}
        {fallback ? <>{fallback}</> : <Login onLogin={onLogin || (async () => {})} />}
      </>
    );
  }

  return <>{children}</>;
}

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
    [search, setSearch] = useState(""),
    [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      let c;
      try {
        c = await api("/context");
      } catch (err) {
        if (auth.currentUser) {
          const idToken = await auth.currentUser.getIdToken(true);
          await api("/auth/firebase-sync", "POST", {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email || "",
            name: auth.currentUser.displayName || undefined,
            role: "member",
          }, { Authorization: `Bearer ${idToken}` });
          c = await api("/context");
        } else {
          throw err;
        }
      }
      setContext(c);
      void syncSaaSToFirestore(c);
      if (c.churches.length) {
        setChurch((old) => old || c.churches[0].id);
        selectChurch(c.churches[0].id);
      }
      const passwordMustChange = Boolean(c.passwordMustChange ?? c.password_must_change ?? c.user?.passwordMustChange ?? c.user?.password_must_change);
      setPage(
        passwordMustChange
          ? "security"
          : initialPage ??
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
  }, [initialPage]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setContext(null);
      }
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    if (Boolean(context?.passwordMustChange ?? context?.password_must_change ?? context?.user?.passwordMustChange ?? context?.user?.password_must_change) && page !== "security") {
      setPage("security");
    }
  }, [context?.passwordMustChange, context?.password_must_change, context?.user?.passwordMustChange, context?.user?.password_must_change, page]);
  useEffect(() => {
    const canonical = legacyRedirects[window.location.pathname];
    if (canonical) window.history.replaceState({}, "", canonical);
  }, []);
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
  const props = { church, revision, notify, refresh, pastoralRead: Boolean(current?.permissions?.pastoralRead) };
  return (
    <ProtectedRoute onLogin={load} fallback={<Login onLogin={load} />}>
      {checking ? (
        <div className="loading-screen">
          <Icon name="home" size={40} />
          <p>Preparando sua comunidade…</p>
        </div>
      ) : !context ? (
        <Login onLogin={load} />
      ) : (
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
              void logFirebaseActivity({
                category: "auth",
                action: "auth.logout",
                severity: "info",
                actorEmail: context?.user?.email,
                actorUid: context?.user?.id,
                status: "success",
                summary: `Usuário ${context?.user?.email || "sessão"} desconectado do sistema.`,
              });
              try {
                await logoutFirebase();
              } catch {}
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
            <div className="account-menu-wrap">
              <button
                className="account-trigger"
                aria-label="Abrir menu da conta"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                <span className="avatar mini">{context.user.name[0]}</span>
                <span className="sr-only">Conta de {context.user.name}</span>
              </button>
              {accountMenuOpen && (
                <div className="account-menu" role="menu" aria-label="Opções da conta">
                  <div className="account-menu-heading">
                    <strong>{context.user.name}</strong>
                    <small>{context.user.email}</small>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPage("security");
                      setAccountMenuOpen(false);
                    }}
                  >
                    Minha conta e segurança
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      void logoutFirebase();
                      await api("/auth/logout", "POST");
                      setChurch("");
                      selectChurch("");
                      setContext(null);
                      setAccountMenuOpen(false);
                    }}
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
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
            AMBIENTE DE HOMOLOGAÇÃO · DADOS PROTEGIDOS
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
                  : pageLabel}
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
                    history:
                      "Linha do tempo de pessoas e congregações, com indicadores e relatórios autorizados.",
                    "people-insights":
                      "Marcos de pessoas e revisão de possíveis duplicidades dentro da igreja.",
                    security:
                      "Senha, MFA e sessões protegidas da sua conta.",
                    "firebase-logs":
                      "Auditoria e monitoramento de autenticação Firebase, sincronização com Firestore e integridade de segurança.",
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
          {page === "institutional" && <InstitutionalPage key={church} {...props} reloadContext={async () => setContext(await api("/context"))} />}
          {page === "assemblies" && <AssemblyPage key={church} {...props} />}
          {page === "assets" && <AssetsPage key={church} {...props} />}
          {page === "library" && <LibraryPage key={church} {...props} />}
          {page === "assistance" && <AssistancePage key={church} {...props} />}
          {page === "media" && <MediaPage key={church} {...props} />}
          {page === "history" && <HistoryPage key={church} {...props} />}
          {page === "people-insights" && <PeopleInsightsPage key={church} {...props} />}
          {page === "security" && <SecurityPage key={church} {...props} />}
          {page === "governance" && (
            <Governance
              {...props}
              current={current}
              context={context}
              reloadContext={async () => {
                const c = await api("/context");
                setContext(c);
              }}
            />
          )}
          {page === "firebase-logs" && (
            <FirebaseActivityLogs key={church} {...props} context={context} />
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
      )}
    </ProtectedRoute>
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "member" | "register" | "recovery">("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [error, setError] = useState(""),
    [successNotice, setSuccessNotice] = useState(""),
    [busy, setBusy] = useState(false);

  const passwordRequirements = [
    {
      id: "len",
      label:
        password.length >= 14
          ? "Mínimo de 14 caracteres (atingido)"
          : `Mínimo de 14 caracteres (${password.length}/14)`,
      met: password.length >= 14,
    },
    {
      id: "upper",
      label: "Pelo menos uma letra maiúscula (A-Z)",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lower",
      label: "Pelo menos uma letra minúscula (a-z)",
      met: /[a-z]/.test(password),
    },
    {
      id: "num",
      label: "Pelo menos um número (0-9)",
      met: /[0-9]/.test(password),
    },
  ];

  const metCount = passwordRequirements.filter((r) => r.met).length;
  const isStrongPassword = metCount === passwordRequirements.length;

  let strengthLabel = "Digite sua senha";
  let strengthColor = "var(--muted)";
  let meterClass = "";
  if (password.length > 0) {
    if (metCount <= 1) {
      strengthLabel = "Muito fraca";
      strengthColor = "#e57373";
      meterClass = "active-weak";
    } else if (metCount === 2 || metCount === 3) {
      strengthLabel = metCount === 2 ? "Razoável" : "Quase lá (boa)";
      strengthColor = "#f5a623";
      meterClass = "active-medium";
    } else {
      strengthLabel = "Senha forte e segura";
      strengthColor = "#48bb78";
      meterClass = "active-strong";
    }
  }

  const handleFirebaseSync = async (
    uid: string,
    userEmail: string,
    userName?: string,
    userRole: "admin" | "member" | "leader" | "pastor" = "member",
  ) => {
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Não foi possível validar a sessão do Firebase.");
      await api("/auth/firebase-sync", "POST", {
        uid,
        email: userEmail,
        name: userName || userEmail.split("@")[0],
        role: userRole,
      }, { Authorization: `Bearer ${idToken}` });
      void logFirebaseActivity({
        category: "sync",
        action: "auth.sync_session_success",
        severity: "success",
        actorEmail: userEmail,
        actorUid: uid,
        actorRole: userRole,
        target: "/api/auth/firebase-sync",
        status: "success",
        summary: `Sessão Firebase sincronizada no banco de dados para ${userEmail}.`,
      });
      await onLogin();
    } catch (err: any) {
      console.error("Firebase sync error:", err);
      void logFirebaseActivity({
        category: "sync",
        action: "auth.sync_session_failure",
        severity: "error",
        actorEmail: userEmail,
        actorUid: uid,
        target: "/api/auth/firebase-sync",
        status: "failure",
        summary: `Falha na sincronização Firebase com o backend: ${err?.message || err}`,
        details: { error: String(err) },
      });
      await logoutFirebase();
      throw err;
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setError("");
    setSuccessNotice("");
    try {
      const user = await loginWithGoogle();
      let profile = await getUserProfile(user.uid);
      if (!profile) {
        profile = await syncFirstAdminProfile(user);
      }
      void logFirebaseActivity({
        category: "auth",
        action: "auth.google_login_success",
        severity: "success",
        actorEmail: user.email || "",
        actorUid: user.uid,
        actorRole: profile?.role || "member",
        status: "success",
        summary: `Login com Google OAuth realizado com sucesso para ${user.email}.`,
      });
      await handleFirebaseSync(
        user.uid,
        user.email || "",
        profile?.name || user.displayName || undefined,
        profile?.role || "member",
      );
    } catch (err: any) {
      const msg = translateFirebaseAuthError(err);
      setError(msg);
      void logFirebaseActivity({
        category: "security",
        action: "auth.google_login_failed",
        severity: "warning",
        status: "failure",
        summary: `Tentativa de login via Google cancelada ou com erro: ${msg}`,
        details: { error: err?.message, code: err?.code },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccessNotice("");

    try {
      if (mode === "recovery") {
        if (!email.trim()) throw new Error("Por favor, informe seu e-mail.");
        await resetPassword(email);
        void logFirebaseActivity({
          category: "auth",
          action: "auth.password_reset_sent",
          severity: "info",
          actorEmail: email,
          status: "success",
          summary: `Instruções de redefinição de senha enviadas via Firebase Auth para ${email}.`,
        });
        setSuccessNotice(
          "Enviamos as instruções para redefinição de senha para o seu e-mail pelo Firebase Authentication. Verifique sua caixa de entrada e spam.",
        );
        return;
      }

      if (mode === "member") {
        if (!email.trim() || !password) throw new Error("Informe o código e o PIN.");
        await api("/auth/login", "POST", { identifier: email.trim(), password });
        await onLogin();
        return;
      }

      if (mode === "register") {
        if (!name.trim()) throw new Error("Por favor, informe seu nome completo.");
        if (!isStrongPassword) {
          throw new Error(
            "A senha deve cumprir todos os requisitos de segurança forte: no mínimo 14 caracteres, letras maiúsculas, minúsculas e números.",
          );
        }

        const user = await registerWithEmail(email, password, name, "member");
        void logFirebaseActivity({
          category: "auth",
          action: "auth.register_success",
          severity: "success",
          actorEmail: email,
          actorUid: user.uid,
          actorRole: "member",
          status: "success",
          summary: `Novo cadastro de membro criado no Firebase Auth: ${email}.`,
        });
        await handleFirebaseSync(user.uid, email, name, "member");
        return;
      }

      // mode === "login"
      if (!email.trim() || !password) throw new Error("Informe e-mail e senha.");
      const user = await loginWithEmail(email, password);
      let profile = await getUserProfile(user.uid);
      if (!profile) {
        profile = await syncFirstAdminProfile(user);
      }
      void logFirebaseActivity({
        category: "auth",
        action: "auth.login_success",
        severity: "success",
        actorEmail: email,
        actorUid: user.uid,
        actorRole: profile?.role || "member",
        status: "success",
        summary: `Autenticação por e-mail e senha efetuada com sucesso: ${email}.`,
      });
      await handleFirebaseSync(
        user.uid,
        user.email || email,
        profile?.name || user.displayName || undefined,
        profile?.role || "member",
      );
    } catch (err: any) {
      const msg = translateFirebaseAuthError(err);
      setError(msg);
      void logFirebaseActivity({
        category: "security",
        action: "auth.login_failed",
        severity: "warning",
        actorEmail: email,
        status: "failure",
        summary: `Falha de autenticação do usuário (${email || "não informado"}): ${msg}`,
        details: { error: err?.message, code: err?.code },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-layout">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark"><Icon name="home" size={30} /></span>
          ecclesiaOS
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
          <Badge tone="purple">UMA REDE. MUITAS COMUNIDADES.</Badge>
          <Badge tone="green">Firebase Auth Ativo</Badge>
        </div>
        <h1>Gestão que organiza.<br /><span>Cuidado que aproxima.</span></h1>
        <p>Autenticação segura via Firebase Authentication com perfis para membros e administradores salvos no banco de dados.</p>
        <div className="login-orbit">
          <span><Icon name="people" size={32} /></span>
          <span><Icon name="home" size={48} /></span>
          <span><Icon name="heart" size={32} /></span>
        </div>
        <small>Segurança Firebase · Perfis de Administrador e Membro · Recuperação por E-mail</small>
      </section>

      <section className="login-card">
        <div className="eyebrow">ACESSO SEGURO VIA FIREBASE</div>
        <h2>
          {mode === "register"
            ? "Criar conta no EcclesiaOS"
            : mode === "recovery"
              ? "Recuperar senha"
              : "Entre no EcclesiaOS"}
        </h2>
        <p>
          {mode === "register"
            ? "Preencha seus dados para criar sua conta de membro. Acesso administrativo exige convite."
            : mode === "recovery"
              ? "Digite seu e-mail cadastrado para receber um link de redefinição pelo Firebase."
              : "Acesse sua conta com seu e-mail e senha registrados no Firebase."}
        </p>

        <div style={{ display: "flex", gap: "8px", margin: "16px 0" }}>
          <button
            type="button"
            className={mode === "login" ? "" : "secondary"}
            style={{ flex: 1, height: "38px" }}
            onClick={() => { setMode("login"); setError(""); setSuccessNotice(""); }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={mode === "member" ? "" : "secondary"}
            style={{ flex: 1, height: "38px" }}
            onClick={() => { setMode("member"); setError(""); setSuccessNotice(""); }}
          >
            Código do membro
          </button>
          <button
            type="button"
            className={mode === "register" ? "" : "secondary"}
            style={{ flex: 1, height: "38px" }}
            onClick={() => { setMode("register"); setError(""); setSuccessNotice(""); }}
          >
            Criar conta
          </button>
          <button
            type="button"
            className={mode === "recovery" ? "" : "secondary"}
            style={{ flex: 1, height: "38px" }}
            onClick={() => { setMode("recovery"); setError(""); setSuccessNotice(""); }}
          >
            Recuperar senha
          </button>
        </div>

        {successNotice && (
          <p className="notice" role="status" style={{ background: "rgba(131, 214, 181, 0.15)", border: "1px solid var(--green)", color: "var(--green)", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
            {successNotice}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <Field label="Nome completo">
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Perfil de acesso">
                <p className="notice" role="status">
                  Cadastro público cria um perfil de membro. Acesso administrativo é concedido
                  somente por convite da liderança da rede.
                </p>
              </Field>
            </>
          )}

          <Field label={mode === "member" ? "Código de acesso" : "E-mail"}>
            <input
              type={mode === "member" ? "text" : "email"}
              autoComplete="username"
              placeholder={mode === "member" ? "EC-XXXXXXXXXX" : "seuemail@exemplo.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          {mode !== "recovery" && (
            <Field label={mode === "member" ? "PIN provisório" : "Senha"}>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  placeholder={
                    mode === "register"
                      ? "Mínimo de 14 caracteres (maiúsculas, minúsculas e números)"
                      : "Sua senha de acesso"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Ocultar senha" : "Ver senha"}
                  aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    padding: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={showPassword ? "shield" : "search"} size={16} />
                </button>
              </div>

              {mode === "register" && (
                <div className="password-requirements" aria-live="polite">
                  <div className="password-strength-label">
                    <span>Requisitos de senha forte</span>
                    <span style={{ color: strengthColor, fontWeight: 700 }}>
                      {strengthLabel}
                    </span>
                  </div>
                  <div
                    className="password-meter"
                    role="progressbar"
                    aria-valuenow={metCount}
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-label="Indicador de força da senha"
                  >
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className={`password-meter-segment ${
                          index < metCount ? meterClass : ""
                        }`}
                      />
                    ))}
                  </div>
                  <div className="password-rule-list">
                    {passwordRequirements.map((rule) => (
                      <div
                        key={rule.id}
                        className={`password-rule-item ${rule.met ? "met" : ""}`}
                      >
                        <span className="password-rule-icon">
                          {rule.met ? <Icon name="check" size={11} /> : "•"}
                        </span>
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Field>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          <Submit
            busy={busy}
            label={
              mode === "register"
                ? "Criar conta no Firebase"
                : mode === "recovery"
                  ? "Enviar link de recuperação"
                  : "Entrar com Firebase"
            }
          />
        </form>

        {mode !== "recovery" && (
          <div style={{ marginTop: "14px" }}>
            <button
              type="button"
              className="secondary"
              onClick={handleGoogleLogin}
              disabled={busy}
              style={{ width: "100%", height: "42px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              <Icon name="shield" size={16} />
              <span>Entrar com conta Google (Firebase)</span>
            </button>
          </div>
        )}

        {mode === "login" && (
          <p style={{ marginTop: "14px", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => { setMode("recovery"); setError(""); setSuccessNotice(""); }}
              style={{ background: "transparent", border: "none", color: "var(--accent)", textDecoration: "underline", padding: 0 }}
            >
              Esqueceu sua senha? Clique para recuperar
            </button>
          </p>
        )}

        {mode === "recovery" && (
          <p style={{ marginTop: "14px", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); setSuccessNotice(""); }}
              style={{ background: "transparent", border: "none", color: "var(--accent)", textDecoration: "underline", padding: 0 }}
            >
              Lembrou sua senha? Voltar para o login
            </button>
          </p>
        )}

        <small className="login-privacy" style={{ marginTop: "20px" }}>
          <Icon name="shield" size={14} /> Autenticação oficial Firebase com credenciais em nuvem.
        </small>
      </section>
    </div>
  );
}

