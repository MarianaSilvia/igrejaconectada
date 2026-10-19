import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon, Badge, Empty, Modal } from "./ui";
import {
  type ActivityLogEntry,
  fetchRecentActivityLogs,
  runFirebaseDiagnostics,
  exportLogsToJson,
  exportLogsToCsv,
  logFirebaseActivity,
  type DiagnosticsResult,
} from "./activityLogs";
import { auth, syncSaaSToFirestore } from "./firebase";
import { api } from "./api";

export interface FirebaseActivityLogsProps {
  church?: string;
  context?: any;
  notify?: (msg: string) => void;
  refresh?: () => void;
}

export function FirebaseActivityLogs({
  church,
  context,
  notify,
  refresh,
}: FirebaseActivityLogsProps) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<ActivityLogEntry | null>(null);
  const [diagResult, setDiagResult] = useState<DiagnosticsResult | null>(null);
  const [runningDiag, setRunningDiag] = useState(false);
  const [testingSync, setTestingSync] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const loadLogs = useCallback(async () => {
    try {
      const list = await fetchRecentActivityLogs();
      setLogs(list);
    } catch (err: any) {
      console.error("Error loading activity logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // Auto-refresh a cada 15 segundos se ativo
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadLogs();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  // Métricas calculadas
  const metrics = useMemo(() => {
    const total = logs.length;
    const successes = logs.filter((l) => l.severity === "success" || l.status === "success").length;
    const warnings = logs.filter((l) => l.severity === "warning").length;
    const errors = logs.filter((l) => l.severity === "error" || l.status === "failure").length;
    const authEvents = logs.filter((l) => l.category === "auth").length;
    const syncEvents = logs.filter((l) => l.category === "sync").length;

    return { total, successes, warnings, errors, authEvents, syncEvents };
  }, [logs]);

  // Itens filtrados
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
      if (severityFilter !== "all") {
        if (severityFilter === "error" && l.severity !== "error" && l.status !== "failure") return false;
        if (severityFilter === "warning" && l.severity !== "warning") return false;
        if (severityFilter === "success" && l.severity !== "success") return false;
        if (severityFilter === "info" && l.severity !== "info") return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const str = `${l.action} ${l.summary} ${l.actorEmail || ""} ${l.actorUid || ""} ${l.target || ""} ${l.id}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [logs, categoryFilter, severityFilter, search]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await runFirebaseDiagnostics();
      setDiagResult(res);
      await loadLogs();
      notify?.("Diagnóstico executado com sucesso.");
    } catch (err: any) {
      notify?.(`Falha no diagnóstico: ${err?.message || err}`);
    } finally {
      setRunningDiag(false);
    }
  };

  const handleTestSync = async () => {
    setTestingSync(true);
    try {
      let peopleList: any[] = [];
      try {
        peopleList = await api("/people");
      } catch {
        peopleList = [];
      }
      const res = await syncSaaSToFirestore(context, peopleList);
      await logFirebaseActivity({
        category: "sync",
        action: "db.manual_sync_completed",
        severity: "success",
        target: "firestore/saas-sync",
        status: "success",
        summary: `Sincronização manual acionada pelo admin: ${res.churchesCount} igrejas e ${res.membersCount} membros.`,
        details: res,
      });
      await loadLogs();
      notify?.(`Sincronização concluída: ${res.churchesCount} congregação(ões) e ${res.membersCount} membro(s).`);
      refresh?.();
    } catch (err: any) {
      await logFirebaseActivity({
        category: "sync",
        action: "db.manual_sync_failed",
        severity: "error",
        target: "firestore/saas-sync",
        status: "failure",
        summary: `Falha na sincronização manual: ${err?.message || err}`,
        details: { error: String(err) },
      });
      await loadLogs();
      notify?.(`Erro na sincronização: ${err?.message || err}`);
    } finally {
      setTestingSync(false);
    }
  };

  const handleClearLogs = () => {
    if (confirm("Deseja realmente limpar os registros de atividade locais?")) {
      try {
        localStorage.removeItem("ecclesia_activity_logs_v1");
        void loadLogs();
        notify?.("Logs locais redefinidos.");
      } catch (e: any) {
        notify?.(e.message);
      }
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const timeAgo = (iso: string) => {
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "agora mesmo";
      if (mins < 60) return `há ${mins} min`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `há ${hours}h`;
      return `há ${Math.floor(hours / 24)}d`;
    } catch {
      return "";
    }
  };

  const getSeverityBadge = (severity: ActivityLogEntry["severity"], status?: string) => {
    if (status === "failure" || severity === "error") {
      return <Badge tone="red">Falha / Erro</Badge>;
    }
    if (severity === "warning") {
      return <Badge tone="gold">Aviso de Segurança</Badge>;
    }
    if (severity === "success") {
      return <Badge tone="green">Sucesso</Badge>;
    }
    return <Badge tone="purple">Informativo</Badge>;
  };

  const getCategoryLabel = (category: ActivityLogEntry["category"]) => {
    switch (category) {
      case "auth":
        return "Firebase Auth";
      case "sync":
        return "Sincronização SaaS";
      case "security":
        return "Segurança & Regras";
      case "database":
        return "Cloud Firestore";
      default:
        return category;
    }
  };

  return (
    <section className="panel" style={{ padding: "24px" }}>
      {/* Header com Status do Subsistema */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ display: "inline-flex", padding: "6px", borderRadius: "8px", background: "rgba(112, 98, 219, 0.15)", color: "var(--accent)" }}>
              <Icon name="shield" size={24} />
            </span>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>
              Monitoramento & Logs de Atividade Firebase
            </h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "14px" }}>
            Auditoria em tempo real de autenticações de usuários, integridade de sessões, sincronização no Cloud Firestore e alertas de segurança.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            className="button secondary"
            disabled={runningDiag}
            onClick={handleRunDiagnostics}
            title="Executa testes de latência e integridade em tempo real"
          >
            <Icon name="activity" size={16} />
            {runningDiag ? "Testando conectividade…" : "Executar Diagnóstico"}
          </button>
          <button
            className="button primary"
            disabled={testingSync}
            onClick={handleTestSync}
            title="Sincroniza os dados do SaaS diretamente para o Firestore"
          >
            <Icon name="check" size={16} />
            {testingSync ? "Sincronizando…" : "Testar Sincronização"}
          </button>
        </div>
      </div>

      {/* Alerta de Falha Recente se houver erros nos logs */}
      {metrics.errors > 0 && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            background: "rgba(229, 115, 115, 0.12)",
            border: "1px solid #e57373",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#e57373", display: "inline-flex" }}>
              <Icon name="alert-triangle" size={22} />
            </span>
            <div>
              <strong style={{ color: "#e57373", fontSize: "14px" }}>
                Atenção: {metrics.errors} falha(s) de sincronização ou autenticação registrada(s)
              </strong>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--foreground)" }}>
                Monitore potenciais instabilidades de rede ou inconsistências no esquema do banco de dados.
              </p>
            </div>
          </div>
          <button
            className="button secondary"
            style={{ fontSize: "12px", padding: "6px 12px", height: "auto" }}
            onClick={() => {
              setSeverityFilter("error");
              setCategoryFilter("all");
            }}
          >
            Ver Apenas Falhas
          </button>
        </div>
      )}

      {/* Cards de Métricas e Indicadores Principais */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "14px",
          marginBottom: "24px",
        }}
      >
        <div style={{ padding: "16px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="muted" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Total de Registros</span>
            <Icon name="grid" size={18} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--foreground)" }}>
            {metrics.total}
          </div>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Histórico auditado e deduplicado
          </span>
        </div>

        <div style={{ padding: "16px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="muted" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Operações com Sucesso</span>
            <span style={{ color: "#48bb78" }}><Icon name="check" size={18} /></span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#48bb78" }}>
            {metrics.successes}
          </div>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Autenticações e gravações OK
          </span>
        </div>

        <div style={{ padding: "16px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="muted" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Avisos de Segurança</span>
            <span style={{ color: "#f5a623" }}><Icon name="shield" size={18} /></span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: metrics.warnings > 0 ? "#f5a623" : "var(--foreground)" }}>
            {metrics.warnings}
          </div>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Credenciais incorretas / Alertas
          </span>
        </div>

        <div style={{ padding: "16px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="muted" style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Falhas de Sincronização</span>
            <span style={{ color: metrics.errors > 0 ? "#e57373" : "#48bb78" }}>
              <Icon name={metrics.errors > 0 ? "alert-triangle" : "check"} size={18} />
            </span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: metrics.errors > 0 ? "#e57373" : "#48bb78" }}>
            {metrics.errors}
          </div>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {metrics.errors === 0 ? "Nenhuma falha detectada" : "Requer atenção imediata"}
          </span>
        </div>
      </div>

      {/* Painel de Diagnóstico em Tempo Real se executado */}
      {diagResult && (
        <div
          style={{
            padding: "18px",
            borderRadius: "10px",
            background: "var(--surface)",
            border: "1px solid var(--accent)",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="activity" size={20} />
              <strong style={{ fontSize: "16px" }}>Resultado do Diagnóstico de Saúde do Sistema</strong>
            </div>
            <Badge tone={diagResult.overallScore >= 80 ? "green" : diagResult.overallScore >= 50 ? "gold" : "red"}>
              Saúde Geral: {diagResult.overallScore}%
            </Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Firebase Authentication</span>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{diagResult.authLatencyMs}ms</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px" }}>{diagResult.authMessage}</p>
            </div>

            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Cloud Firestore</span>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{diagResult.firestoreLatencyMs}ms</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px" }}>{diagResult.firestoreMessage}</p>
            </div>

            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Sincronização Backend (SaaS)</span>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{diagResult.syncLatencyMs}ms</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px" }}>{diagResult.syncMessage}</p>
            </div>
          </div>

          {diagResult.recommendations.length > 0 && (
            <div style={{ fontSize: "13px", color: "var(--muted)", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
              <strong>Recomendações:</strong>
              <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                {diagResult.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Barra de Filtros, Busca e Ações Rápidas */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flex: 1 }}>
          <div style={{ minWidth: "240px", flex: 1, position: "relative" }}>
            <input
              type="text"
              placeholder="Buscar por usuário, ação, código de erro ou destino…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px" }}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: "8px 12px", borderRadius: "6px" }}
          >
            <option value="all">Todas as Categorias</option>
            <option value="auth">Firebase Auth</option>
            <option value="sync">Sincronização SaaS</option>
            <option value="security">Segurança & Regras</option>
            <option value="database">Cloud Firestore</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: "8px 12px", borderRadius: "6px" }}
          >
            <option value="all">Todas as Severidades</option>
            <option value="error">Apenas Falhas / Erros</option>
            <option value="warning">Apenas Avisos de Segurança</option>
            <option value="success">Apenas Sucessos</option>
            <option value="info">Apenas Informativos</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-atualizar (15s)
          </label>

          <button
            className="button secondary"
            onClick={() => void loadLogs()}
            title="Atualizar lista de logs agora"
          >
            <Icon name="refresh" size={14} />
            Atualizar
          </button>

          <button
            className="button secondary"
            onClick={() => exportLogsToJson(filteredLogs)}
            title="Exportar logs em formato JSON"
          >
            JSON
          </button>

          <button
            className="button secondary"
            onClick={() => exportLogsToCsv(filteredLogs)}
            title="Exportar logs em formato CSV"
          >
            CSV
          </button>

          <button
            className="text-button"
            style={{ color: "var(--muted)", fontSize: "12px" }}
            onClick={handleClearLogs}
            title="Limpar logs armazenados no navegador"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela de Logs de Atividade */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }} role="status">
          <Icon name="activity" size={32} />
          <p style={{ marginTop: "12px", color: "var(--muted)" }}>Carregando trilha de auditoria e logs do Firebase…</p>
        </div>
      ) : paginatedLogs.length === 0 ? (
        <Empty>
          Nenhum log encontrado para os critérios de busca selecionados.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table style={{ width: "100%", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ width: "130px" }}>Status</th>
                <th style={{ width: "150px" }}>Data / Hora</th>
                <th style={{ width: "160px" }}>Categoria / Ação</th>
                <th style={{ width: "180px" }}>Usuário / Ator</th>
                <th>Resumo da Operação</th>
                <th style={{ width: "140px" }}>Destino</th>
                <th style={{ width: "90px", textAlign: "right" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map((log) => (
                <tr
                  key={log.id}
                  style={{
                    cursor: "pointer",
                    background: log.severity === "error" || log.status === "failure"
                      ? "rgba(229, 115, 115, 0.04)"
                      : log.severity === "warning"
                        ? "rgba(245, 166, 35, 0.04)"
                        : undefined,
                  }}
                  onClick={() => setSelectedLog(log)}
                >
                  <td>
                    {getSeverityBadge(log.severity, log.status)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{formatDateTime(log.timestamp)}</div>
                    <small className="muted">{timeAgo(log.timestamp)}</small>
                  </td>
                  <td>
                    <Badge tone="purple">{getCategoryLabel(log.category)}</Badge>
                    <div style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--accent)", marginTop: "4px" }}>
                      {log.action}
                    </div>
                  </td>
                  <td>
                    {log.actorEmail ? (
                      <div>
                        <strong>{log.actorEmail}</strong>
                        {log.actorRole && (
                          <div>
                            <small className="muted">Perfil: {log.actorRole}</small>
                          </div>
                        )}
                      </div>
                    ) : log.actorUid ? (
                      <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
                        UID: {log.actorUid.slice(0, 12)}…
                      </span>
                    ) : (
                      <span className="muted">Sistema / Anônimo</span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{log.summary}</div>
                    {log.details?.error && (
                      <div style={{ color: "#e57373", fontSize: "11px", marginTop: "2px", fontFamily: "monospace" }}>
                        Erro: {log.details.error.slice(0, 120)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--muted)" }}>
                      {log.target || "firestore"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="button secondary"
                      style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLog(log);
                      }}
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
          <button
            className="button secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="muted" style={{ fontSize: "13px" }}>
            Página {currentPage} de {totalPages} ({filteredLogs.length} eventos encontrados)
          </span>
          <button
            className="button secondary"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      {/* Modal de Detalhes Técnicos e Auditoria do Log */}
      {selectedLog && (
        <Modal title="Detalhes do Log de Auditoria & Segurança" onClose={() => setSelectedLog(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <span style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}>Identificador</span>
                <div style={{ fontFamily: "monospace", fontSize: "12px" }}>{selectedLog.id}</div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {getSeverityBadge(selectedLog.severity, selectedLog.status)}
                <Badge tone="purple">{getCategoryLabel(selectedLog.category)}</Badge>
              </div>
            </div>

            <div style={{ padding: "12px", borderRadius: "8px", background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>
                {selectedLog.summary}
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                Horário do evento: {formatDateTime(selectedLog.timestamp)} ({selectedLog.timestamp})
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ padding: "12px", borderRadius: "8px", background: "var(--surface)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--muted)" }}>Ator / Usuário</span>
                <div style={{ marginTop: "4px", fontSize: "13px" }}>
                  <strong>{selectedLog.actorEmail || "Não especificado"}</strong>
                  {selectedLog.actorUid && (
                    <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--muted)" }}>
                      UID: {selectedLog.actorUid}
                    </div>
                  )}
                  {selectedLog.actorRole && (
                    <div style={{ marginTop: "4px" }}>
                      <Badge tone="green">{selectedLog.actorRole}</Badge>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: "12px", borderRadius: "8px", background: "var(--surface)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--muted)" }}>Ação & Destino</span>
                <div style={{ marginTop: "4px", fontSize: "13px" }}>
                  <code style={{ color: "var(--accent)", fontSize: "12px" }}>{selectedLog.action}</code>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--muted)" }}>
                    Destino: {selectedLog.target || "firestore"}
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnóstico ou Instruções de Remediação */}
            {selectedLog.severity === "error" || selectedLog.status === "failure" ? (
              <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(229, 115, 115, 0.1)", border: "1px solid #e57373" }}>
                <strong style={{ color: "#e57373", fontSize: "13px" }}>Análise de Segurança e Sincronização:</strong>
                <p style={{ margin: "4px 0 0", fontSize: "13px" }}>
                  {selectedLog.details?.remediation ||
                    "Se este erro persistir, verifique a integridade do esquema das tabelas no backend e valide se as credenciais do usuário possuem permissões adequadas nas regras do Firestore."}
                </p>
              </div>
            ) : null}

            {/* Payload Técnico JSON */}
            {selectedLog.details && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Metadados Técnicos (JSON)</span>
                  <button
                    className="text-button"
                    style={{ fontSize: "12px" }}
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
                      notify?.("JSON copiado para a área de transferência.");
                    }}
                  >
                    Copiar JSON
                  </button>
                </div>
                <pre
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "12px",
                    fontSize: "11px",
                    maxHeight: "180px",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button className="button primary" onClick={() => setSelectedLog(null)}>
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
export default FirebaseActivityLogs;
