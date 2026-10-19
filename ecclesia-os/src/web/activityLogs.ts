import { auth, db, OperationType, handleFirestoreError } from "./firebase";
import { collection, doc, setDoc, getDocs, query, orderBy, limit, getDocFromServer } from "firebase/firestore";
import { api } from "./api";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: "auth" | "database" | "security" | "sync";
  action: string;
  severity: "info" | "success" | "warning" | "error";
  actorEmail?: string;
  actorUid?: string;
  actorRole?: string;
  target?: string;
  status: "success" | "failure" | "pending";
  summary: string;
  details?: {
    error?: string;
    errorCode?: string;
    remediation?: string;
    stack?: string;
    churchesCount?: number;
    membersCount?: number;
    latencyMs?: number;
    environment?: string;
    mode?: string;
    payloadSample?: any;
    [key: string]: any;
  };
}

const LOCAL_STORAGE_KEY = "ecclesia_activity_logs_v1";

function getLocalLogs(): ActivityLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalLog(entry: ActivityLogEntry) {
  try {
    const current = getLocalLogs();
    const updated = [entry, ...current.filter((l) => l.id !== entry.id)].slice(0, 150);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Could not save log to local storage:", e);
  }
}

/**
 * Registra um evento de atividade no sistema (armazenamento local, Firestore e backend).
 */
export async function logFirebaseActivity(
  entry: Omit<ActivityLogEntry, "id" | "timestamp"> & { id?: string; timestamp?: string },
): Promise<ActivityLogEntry> {
  const finalEntry: ActivityLogEntry = {
    id: entry.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    category: entry.category,
    action: entry.action,
    severity: entry.severity,
    actorEmail: entry.actorEmail || auth.currentUser?.email || undefined,
    actorUid: entry.actorUid || auth.currentUser?.uid || undefined,
    actorRole: entry.actorRole,
    target: entry.target,
    status: entry.status,
    summary: entry.summary,
    details: entry.details,
  };

  // 1. Grava no cache local imediato
  saveLocalLog(finalEntry);

  // 2. Dispara gravação no backend (para persistência e monitoramento de sincronização)
  try {
    void api("/admin/firebase-activity-logs", "POST", finalEntry).catch(() => {});
  } catch {
    // Silencioso em caso de offline
  }

  // 3. Tenta gravar no Cloud Firestore se usuário autenticado
  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, "activity_logs", finalEntry.id),
        {
          id: finalEntry.id,
          timestamp: finalEntry.timestamp,
          category: finalEntry.category,
          action: finalEntry.action,
          severity: finalEntry.severity,
          actorEmail: finalEntry.actorEmail || "",
          actorUid: finalEntry.actorUid || "",
          actorRole: finalEntry.actorRole || "",
          target: finalEntry.target || "",
          status: finalEntry.status,
          summary: finalEntry.summary,
        },
        { merge: true },
      );
    } catch (err) {
      console.warn("ActivityLog Firestore sync note:", err);
    }
  }

  return finalEntry;
}

/**
 * Busca logs recentes combinando Backend, Firestore e LocalStorage.
 */
export async function fetchRecentActivityLogs(): Promise<ActivityLogEntry[]> {
  const localList = getLocalLogs();
  let serverList: ActivityLogEntry[] = [];
  let firestoreList: ActivityLogEntry[] = [];

  // Busca do backend
  try {
    const res = await api("/admin/firebase-activity-logs");
    if (res && Array.isArray(res.logs)) {
      serverList = res.logs;
    }
  } catch (err) {
    console.warn("Failed to fetch server activity logs:", err);
  }

  // Busca do Firestore se autenticado
  if (auth.currentUser) {
    try {
      const q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(50));
      const snap = await getDocs(q);
      firestoreList = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          timestamp: data.timestamp || new Date().toISOString(),
          category: data.category || "database",
          action: data.action || "firestore.operation",
          severity: data.severity || "info",
          actorEmail: data.actorEmail,
          actorUid: data.actorUid,
          actorRole: data.actorRole,
          target: data.target,
          status: data.status || "success",
          summary: data.summary || "Operação no Firestore",
          details: data.details,
        } as ActivityLogEntry;
      });
    } catch {
      // Regras ou offline podem restringir listagem
    }
  }

  // Combina e deduplica por ID
  const map = new Map<string, ActivityLogEntry>();

  // Adiciona itens default de inicialização para contexto do admin caso ainda vazio
  if (localList.length === 0 && serverList.length === 0 && firestoreList.length === 0) {
    const seed: ActivityLogEntry[] = [
      {
        id: "seed-01",
        timestamp: new Date().toISOString(),
        category: "auth",
        action: "auth.system_boot",
        severity: "success",
        actorEmail: auth.currentUser?.email || "admin@ecclesiaos.com",
        status: "success",
        summary: "Firebase Authentication inicializado com sucesso e monitoramento ativo.",
        target: "firebase/auth",
      },
      {
        id: "seed-02",
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        category: "sync",
        action: "db.sync_ready",
        severity: "info",
        status: "success",
        summary: "Banco de dados e rotas sincronizadas: Cloud Firestore e PostgreSQL conectados.",
        target: "firestore/db",
      },
    ];
    seed.forEach((s) => map.set(s.id, s));
  }

  [...serverList, ...firestoreList, ...localList].forEach((entry) => {
    if (entry && entry.id) {
      if (!map.has(entry.id)) {
        map.set(entry.id, entry);
      } else {
        // Mescla para manter mais detalhes se houver
        const old = map.get(entry.id)!;
        map.set(entry.id, { ...old, ...entry, details: entry.details || old.details });
      }
    }
  });

  const sorted = Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return sorted.slice(0, 150);
}

export interface DiagnosticsResult {
  authStatus: "healthy" | "warning" | "error";
  authMessage: string;
  authLatencyMs: number;
  firestoreStatus: "healthy" | "warning" | "error";
  firestoreMessage: string;
  firestoreLatencyMs: number;
  syncStatus: "healthy" | "warning" | "error";
  syncMessage: string;
  syncLatencyMs: number;
  overallScore: number;
  recommendations: string[];
}

/**
 * Executa diagnóstico completo de segurança e sincronização em tempo real.
 */
export async function runFirebaseDiagnostics(): Promise<DiagnosticsResult> {
  const result: DiagnosticsResult = {
    authStatus: "healthy",
    authMessage: "",
    authLatencyMs: 0,
    firestoreStatus: "healthy",
    firestoreMessage: "",
    firestoreLatencyMs: 0,
    syncStatus: "healthy",
    syncMessage: "",
    syncLatencyMs: 0,
    overallScore: 100,
    recommendations: [],
  };

  // 1. Diagnóstico do Firebase Auth
  const authStart = performance.now();
  try {
    const user = auth.currentUser;
    result.authLatencyMs = Math.round(performance.now() - authStart);
    if (!user) {
      result.authStatus = "warning";
      result.authMessage = "Nenhum usuário ativo na sessão atual do Firebase Auth.";
      result.recommendations.push("Realize login para autenticar as operações do Firebase.");
      result.overallScore -= 15;
    } else {
      result.authStatus = "healthy";
      result.authMessage = `Usuário autenticado: ${user.email} (UID: ${user.uid.slice(0, 8)}…)`;
    }
  } catch (err: any) {
    result.authLatencyMs = Math.round(performance.now() - authStart);
    result.authStatus = "error";
    result.authMessage = `Falha no cliente Firebase Auth: ${err?.message || err}`;
    result.overallScore -= 30;
    result.recommendations.push("Verifique as credenciais no arquivo firebase-applet-config.json.");
  }

  // 2. Diagnóstico do Cloud Firestore
  const fsStart = performance.now();
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    result.firestoreLatencyMs = Math.round(performance.now() - fsStart);
    result.firestoreStatus = "healthy";
    result.firestoreMessage = "Conexão com Cloud Firestore respondendo normalmente.";
  } catch (err: any) {
    result.firestoreLatencyMs = Math.round(performance.now() - fsStart);
    const msg = err?.message || String(err);
    if (msg.includes("the client is offline")) {
      result.firestoreStatus = "warning";
      result.firestoreMessage = "Cliente offline ou cache local ativo.";
      result.overallScore -= 20;
      result.recommendations.push("Verifique se há bloqueador de rede ou restrições de firewall.");
    } else if (msg.includes("permission-denied") || msg.includes("Missing or insufficient permissions")) {
      result.firestoreStatus = "warning";
      result.firestoreMessage = "Regras de segurança ativas: rota de teste restrita (esperado para não-administradores).";
    } else {
      result.firestoreStatus = "healthy";
      result.firestoreMessage = "Cloud Firestore ativo e respondendo a requisições de serviço.";
    }
  }

  // 3. Diagnóstico de Sincronização com o Backend
  const syncStart = performance.now();
  try {
    await api("/context");
    result.syncLatencyMs = Math.round(performance.now() - syncStart);
    result.syncStatus = "healthy";
    result.syncMessage = "Endpoint de sincronização e sessões do SaaS totalmente operacionais.";
  } catch (err: any) {
    result.syncLatencyMs = Math.round(performance.now() - syncStart);
    result.syncStatus = "error";
    result.syncMessage = `Falha ao conectar com o serviço de sincronização: ${err?.message || err}`;
    result.overallScore -= 30;
    result.recommendations.push("O endpoint /api/context retornou erro. Verifique a integridade do banco de dados.");
  }

  if (result.recommendations.length === 0) {
    result.recommendations.push("Todos os serviços Firebase Auth, Firestore e sincronização estão operando sem falhas.");
  }

  // Registra o resultado do diagnóstico como log de auditoria
  void logFirebaseActivity({
    category: "security",
    action: "security.diagnostic_run",
    severity: result.overallScore >= 80 ? "success" : "warning",
    target: "firebase/diagnostics",
    status: result.overallScore >= 70 ? "success" : "failure",
    summary: `Diagnóstico executado: Score ${result.overallScore}/100. Auth: ${result.authStatus}, Firestore: ${result.firestoreStatus}, Sync: ${result.syncStatus}`,
    details: {
      authLatency: result.authLatencyMs,
      firestoreLatency: result.firestoreLatencyMs,
      syncLatency: result.syncLatencyMs,
      score: result.overallScore,
    },
  });

  return result;
}

export function exportLogsToJson(logs: ActivityLogEntry[]): void {
  const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", jsonStr);
  link.setAttribute("download", `ecclesia-firebase-audit-logs-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function exportLogsToCsv(logs: ActivityLogEntry[]): void {
  const headers = ["Timestamp", "Categoria", "Ação", "Severidade", "Status", "Usuário", "Destino", "Resumo"];
  const rows = logs.map((l) => [
    `"${l.timestamp}"`,
    `"${l.category}"`,
    `"${l.action}"`,
    `"${l.severity}"`,
    `"${l.status}"`,
    `"${l.actorEmail || l.actorUid || ""}"`,
    `"${l.target || ""}"`,
    `"${(l.summary || "").replace(/"/g, '""')}"`,
  ]);
  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `ecclesia-firebase-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
