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
  exportReport: (kind: ReportKind, format: "pdf" | "csv") => void;
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
            <h2>{editingAssetId ? "Editar patrimonio" : "Novo patrimonio"}</h2>
            <span>Equipamentos e bens</span>
          </div>
          <div className="form-grid">
            <label className="full">
              Item
              <input onChange={(event) => setAssetForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ex.: Teclado, caixa de som, cadeira" value={assetForm.name} />
            </label>
            <label>
              Categoria
              <input onChange={(event) => setAssetForm((form) => ({ ...form, category: event.target.value }))} placeholder="Som, musica, moveis" value={assetForm.category} />
            </label>
            <label>
              Local
              <input onChange={(event) => setAssetForm((form) => ({ ...form, location: event.target.value }))} placeholder="Templo, sala Kids, secretaria" value={assetForm.location} />
            </label>
            <label>
              Responsavel
              <input onChange={(event) => setAssetForm((form) => ({ ...form, responsible: event.target.value }))} placeholder="Pessoa ou equipe" value={assetForm.responsible} />
            </label>
            <label>
              Estado
              <select onChange={(event) => setAssetForm((form) => ({ ...form, condition: event.target.value as AssetRecord["condition"] }))} value={assetForm.condition}>
                <option>Novo</option>
                <option>Bom</option>
                <option>Manutencao</option>
                <option>Baixado</option>
              </select>
            </label>
            <label>
              Ultima manutencao
              <input onChange={(event) => setAssetForm((form) => ({ ...form, lastMaintenance: event.target.value }))} type="date" value={assetForm.lastMaintenance} />
            </label>
            <label className="full">
              Observacoes
              <textarea onChange={(event) => setAssetForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Estado de conservacao, manutencao, compra ou observacao" value={assetForm.notes} />
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateAsset} onClick={createAsset} type="button">
                {editingAssetId ? "Atualizar patrimonio" : "Salvar patrimonio"}
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
          <h2>Patrimonio cadastrado</h2>
          <span>{filteredAssets.length} itens</span>
        </div>
        <div className="filter-bar">
          <label>
            Estado
            <select onChange={(event) => setAssetConditionFilter(event.target.value)} value={assetConditionFilter}>
              <option>Todos</option>
              <option>Novo</option>
              <option>Bom</option>
              <option>Manutencao</option>
              <option>Baixado</option>
            </select>
          </label>
          <button className="secondary" onClick={() => exportReport("assets", "pdf")} type="button">
            PDF
          </button>
          <button className="secondary" onClick={() => exportReport("assets", "csv")} type="button">
            Excel
          </button>
        </div>
        <div className="row-list">
          {filteredAssets.map((asset) => (
            <div className="data-row access-user-row" key={asset.id}>
              <span className="status-chip">{asset.condition}</span>
              <div>
                <strong>{asset.name}</strong>
                <small>{asset.category} - {asset.location || "Sem local"} - {asset.responsible || "Sem responsavel"}</small>
                <small>{asset.lastMaintenance ? `Manutencao: ${formatDate(asset.lastMaintenance)}` : "Sem manutencao registrada"}</small>
                {asset.notes && <small>{asset.notes}</small>}
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
          {!filteredAssets.length && <p className="empty-state">Nenhum item de patrimonio encontrado para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
