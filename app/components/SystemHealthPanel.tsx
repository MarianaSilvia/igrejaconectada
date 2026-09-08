import type { SaveState } from "../types";

type SystemHealthPanelProps = {
  agendaCount: number;
  canReload: boolean;
  isSupabaseReady: boolean;
  kidsCount: number;
  lastSavedAt: string;
  membersCount: number;
  pendingRegistrationsCount: number;
  saveState: SaveState;
  syncStatus: string;
  visitorsCount: number;
  onReload: () => void | Promise<void> | Promise<boolean>;
};

function saveStateLabel(saveState: SaveState) {
  if (saveState === "saving") return "Salvando";
  if (saveState === "saved") return "Salvo";
  if (saveState === "error") return "Erro";
  if (saveState === "conflict") return "Conflito";
  return "Pronto";
}

export function SystemHealthPanel({
  agendaCount,
  canReload,
  isSupabaseReady,
  kidsCount,
  lastSavedAt,
  membersCount,
  pendingRegistrationsCount,
  saveState,
  syncStatus,
  visitorsCount,
  onReload,
}: SystemHealthPanelProps) {
  return (
    <article className={`surface wide system-health-panel system-health-${saveState}`}>
      <div className="panel-heading">
        <div>
          <h2>Saude do sistema</h2>
          <span>{isSupabaseReady ? "Base Supabase ativa" : "Modo local sem sincronizacao"}</span>
        </div>
        <strong className={`status-chip ${saveState}`}>{saveStateLabel(saveState)}</strong>
      </div>

      <div className="system-health-grid">
        <div>
          <strong>{membersCount}</strong>
          <small>Membros</small>
        </div>
        <div>
          <strong>{visitorsCount}</strong>
          <small>Visitantes</small>
        </div>
        <div>
          <strong>{kidsCount}</strong>
          <small>Kids</small>
        </div>
        <div>
          <strong>{agendaCount}</strong>
          <small>Agenda</small>
        </div>
        <div>
          <strong>{pendingRegistrationsCount}</strong>
          <small>Pre-cadastros</small>
        </div>
      </div>

      <div className="system-health-footer">
        <div>
          <strong>{syncStatus}</strong>
          <small>{lastSavedAt ? `Ultimo salvamento confirmado as ${lastSavedAt}.` : "Nenhum salvamento confirmado nesta sessao."}</small>
        </div>
        {canReload && (
          <button className="secondary" onClick={onReload} type="button">
            Atualizar dados da base
          </button>
        )}
      </div>
    </article>
  );
}
