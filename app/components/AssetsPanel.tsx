import type { Dispatch, SetStateAction } from "react";
import { formatDate } from "../app-helpers";
import { blankAsset } from "../data-normalization";
import type { AssetRecord, ReportKind } from "../types";

type AssetForm = Omit<AssetRecord, "id">;

type AssetsPanelProps = {
  assetConditionFilter: string;
  assetForm: AssetForm;
  canCreateAsset: boolean;
  canManageAssets: boolean;
  createAsset: () => void;
  deleteAsset: (asset: AssetRecord) => void;
  editAsset: (asset: AssetRecord) => void;
  editingAssetId: string | null;
  exportReport: (kind: ReportKind, format: "pdf" | "excel") => void;
  filteredAssets: AssetRecord[];
  setAssetConditionFilter: Dispatch<SetStateAction<string>>;
  setAssetForm: Dispatch<SetStateAction<AssetForm>>;
  setEditingAssetId: Dispatch<SetStateAction<string | null>>;
};

export function AssetsPanel({
  assetConditionFilter,
  assetForm,
  canCreateAsset,
  canManageAssets,
  createAsset,
  deleteAsset,
  editAsset,
  editingAssetId,
  exportReport,
  filteredAssets,
  setAssetConditionFilter,
  setAssetForm,
  setEditingAssetId,
}: AssetsPanelProps) {
  return (
    <section className="content-grid">
      {canManageAssets && (
        <article className={editingAssetId ? "surface editing-surface" : "surface"}>
          <div className="panel-heading">
            <h2>{editingAssetId ? "Editar patrimônio" : "Novo patrimônio"}</h2>
            <span>Equipamentos e bens</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Item
              <input onChange={(event) => setAssetForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ex.: Teclado, caixa de som, cadeira" value={assetForm.name} />
            </label>
            <label>
              Categoria
              <input onChange={(event) => setAssetForm((form) => ({ ...form, category: event.target.value }))} placeholder="Som, música, móveis" value={assetForm.category} />
            </label>
            <label>
              Local
              <input onChange={(event) => setAssetForm((form) => ({ ...form, location: event.target.value }))} placeholder="Templo, sala Kids, secretaria" value={assetForm.location} />
            </label>
            <label>
              Responsável
              <input onChange={(event) => setAssetForm((form) => ({ ...form, responsible: event.target.value }))} placeholder="Pessoa ou equipe" value={assetForm.responsible} />
            </label>
            <label>
              Estado
              <select onChange={(event) => setAssetForm((form) => ({ ...form, condition: event.target.value as AssetRecord["condition"] }))} value={assetForm.condition}>
                <option>Novo</option>
                <option>Bom</option>
                <option value="Manutencao">Manutenção</option>
                <option>Baixado</option>
              </select>
            </label>
            <label>
              Última manutenção
              <input onChange={(event) => setAssetForm((form) => ({ ...form, lastMaintenance: event.target.value }))} type="date" value={assetForm.lastMaintenance} />
            </label>
            <label className="full">
              Observações
              <textarea onChange={(event) => setAssetForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Estado de conservação, manutenção, compra ou observação" value={assetForm.notes} />
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateAsset} onClick={createAsset} type="button">
                {editingAssetId ? "Atualizar patrimônio" : "Salvar patrimônio"}
              </button>
              {editingAssetId && (
                <button className="secondary" onClick={() => { setAssetForm(blankAsset); setEditingAssetId(null); }} type="button">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Patrimônio cadastrado</h2>
          <span>{filteredAssets.length} itens</span>
        </div>
        <details className="module-compact-drawer assets-filter-drawer" open={assetConditionFilter !== "Todos" || undefined}>
          <summary>
            <span>
              <strong>Filtros e exportação</strong>
              <small>{assetConditionFilter === "Todos" ? "Use para localizar bens por estado ou gerar relatório." : `Filtro ativo: ${assetConditionFilter}`}</small>
            </span>
            <b>{assetConditionFilter === "Todos" ? "Abrir filtros" : "Filtrando"}</b>
          </summary>
          <div className="filter-bar">
            <label>
              Estado
              <select onChange={(event) => setAssetConditionFilter(event.target.value)} value={assetConditionFilter}>
                <option>Todos</option>
                <option>Novo</option>
                <option>Bom</option>
                <option value="Manutencao">Manutenção</option>
                <option>Baixado</option>
              </select>
            </label>
            <button className="secondary" onClick={() => exportReport("assets", "pdf")} type="button">
              PDF
            </button>
            <button className="secondary" onClick={() => exportReport("assets", "excel")} type="button">
              Excel
            </button>
          </div>
        </details>
        <div className="row-list assets-record-list">
          {filteredAssets.map((asset) => (
            <div className="data-row access-user-row" key={asset.id}>
              <span className="status-chip">{asset.condition}</span>
              <div>
                <strong>{asset.name}</strong>
                <div className="message-card-tags" aria-label="Resumo do patrimônio">
                  <span>{asset.category || "Sem categoria"}</span>
                  <span>{asset.location || "Sem local"}</span>
                  <span>{asset.responsible || "Sem responsável"}</span>
                </div>
                <small>{asset.lastMaintenance ? `Manutenção: ${formatDate(asset.lastMaintenance)}` : "Sem manutenção registrada"}</small>
                {asset.notes && (
                  <details className="record-sensitive-details asset-notes-details">
                    <summary>Ver observações</summary>
                    <div className="record-sensitive-grid">
                      <small>{asset.notes}</small>
                    </div>
                  </details>
                )}
              </div>
              {canManageAssets && (
                <div className="row-actions">
                  <button className="secondary" onClick={() => editAsset(asset)} type="button">
                    Editar
                  </button>
                  <button className="danger-action" onClick={() => deleteAsset(asset)} type="button">
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
          {!filteredAssets.length && <p className="empty-state">Nenhum item de patrimônio encontrado para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
