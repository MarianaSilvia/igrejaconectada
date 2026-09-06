import type { Dispatch, SetStateAction } from "react";
import { formatDate } from "../app-helpers";
import { blankTransaction } from "../data-normalization";
import type { MemberRecord, ReportKind, TransactionRecord } from "../types";

type TransactionForm = Omit<TransactionRecord, "id">;

type FinancePanelProps = {
  canCreateTransaction: boolean;
  canManageFinance: boolean;
  createTransaction: () => void;
  deleteTransaction: (transaction: TransactionRecord) => void;
  editTransaction: (transaction: TransactionRecord) => void;
  editingTransactionId: string | null;
  exportReport: (kind: ReportKind, format: "pdf" | "csv") => void;
  filteredTransactions: TransactionRecord[];
  financeTypeFilter: string;
  members: MemberRecord[];
  setEditingTransactionId: Dispatch<SetStateAction<string | null>>;
  setFinanceTypeFilter: Dispatch<SetStateAction<string>>;
  setTransactionForm: Dispatch<SetStateAction<TransactionForm>>;
  transactionForm: TransactionForm;
  transactions: TransactionRecord[];
};

export function FinancePanel({
  canCreateTransaction,
  canManageFinance,
  createTransaction,
  deleteTransaction,
  editTransaction,
  editingTransactionId,
  exportReport,
  filteredTransactions,
  financeTypeFilter,
  members,
  setEditingTransactionId,
  setFinanceTypeFilter,
  setTransactionForm,
  transactionForm,
  transactions,
}: FinancePanelProps) {
  const incomingTotal = transactions
    .filter((item) => item.type !== "Saida")
    .reduce((sum, item) => sum + item.amount, 0)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const outgoingTotal = transactions
    .filter((item) => item.type === "Saida")
    .reduce((sum, item) => sum + item.amount, 0)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <section className="content-grid">
      {canManageFinance && (
        <article className={editingTransactionId ? "surface editing-surface" : "surface"}>
          <div className="panel-heading">
            <h2>{editingTransactionId ? "Editar lancamento" : "Novo lancamento"}</h2>
            <span>Tesouraria inicial</span>
          </div>
          <div className="form-grid">
            <label>
              Data
              <input onChange={(event) => setTransactionForm((form) => ({ ...form, date: event.target.value }))} type="date" value={transactionForm.date} />
            </label>
            <label>
              Tipo
              <select onChange={(event) => setTransactionForm((form) => ({ ...form, type: event.target.value as TransactionRecord["type"] }))} value={transactionForm.type}>
                <option>Entrada</option>
                <option>Saida</option>
                <option>Dizimo</option>
                <option>Oferta</option>
              </select>
            </label>
            <label>
              Categoria
              <input onChange={(event) => setTransactionForm((form) => ({ ...form, category: event.target.value }))} placeholder="Ex.: Culto, manutencao, missao" value={transactionForm.category} />
            </label>
            <label>
              Valor
              <input min={0} onChange={(event) => setTransactionForm((form) => ({ ...form, amount: Number(event.target.value) }))} step="0.01" type="number" value={transactionForm.amount} />
            </label>
            <label className="full">
              Descricao
              <input onChange={(event) => setTransactionForm((form) => ({ ...form, description: event.target.value }))} placeholder="Resumo do lancamento" value={transactionForm.description} />
            </label>
            <label>
              Metodo
              <select onChange={(event) => setTransactionForm((form) => ({ ...form, method: event.target.value }))} value={transactionForm.method}>
                <option>Pix</option>
                <option>Dinheiro</option>
                <option>Cartao</option>
                <option>Transferencia</option>
              </select>
            </label>
            <label>
              Status
              <select onChange={(event) => setTransactionForm((form) => ({ ...form, status: event.target.value as TransactionRecord["status"] }))} value={transactionForm.status}>
                <option>Pendente</option>
                <option>Confirmado</option>
              </select>
            </label>
            <label>
              Membro vinculado
              <select onChange={(event) => setTransactionForm((form) => ({ ...form, memberName: event.target.value }))} value={transactionForm.memberName}>
                <option value="">Nao vinculado</option>
                {members.map((member) => (
                  <option key={member.id} value={member.fullName}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Observacoes
              <textarea onChange={(event) => setTransactionForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Observacoes internas da tesouraria" value={transactionForm.notes} />
            </label>
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateTransaction} onClick={createTransaction} type="button">
                {editingTransactionId ? "Atualizar lancamento" : "Salvar lancamento"}
              </button>
              {editingTransactionId && (
                <button className="secondary" onClick={() => { setTransactionForm(blankTransaction); setEditingTransactionId(null); }} type="button">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="surface wide">
        <div className="panel-heading">
          <h2>Resumo financeiro</h2>
          <span>{filteredTransactions.length} lancamentos</span>
        </div>
        <div className="stats-row">
          <div className="stat-card">
            <small>Entradas</small>
            <strong>{incomingTotal}</strong>
          </div>
          <div className="stat-card">
            <small>Saidas</small>
            <strong>{outgoingTotal}</strong>
          </div>
        </div>
        <div className="filter-bar">
          <label>
            Tipo
            <select onChange={(event) => setFinanceTypeFilter(event.target.value)} value={financeTypeFilter}>
              <option>Todos</option>
              <option>Entrada</option>
              <option>Saida</option>
              <option>Dizimo</option>
              <option>Oferta</option>
            </select>
          </label>
          <button className="secondary" onClick={() => exportReport("finance", "pdf")} type="button">
            PDF
          </button>
          <button className="secondary" onClick={() => exportReport("finance", "csv")} type="button">
            Excel
          </button>
        </div>
        <div className="row-list">
          {filteredTransactions.map((transaction) => (
            <div className="data-row access-user-row" key={transaction.id}>
              <span className="date-box">{formatDate(transaction.date)}</span>
              <div>
                <strong>{transaction.description}</strong>
                <small>{transaction.type} - {transaction.category} - {transaction.status}</small>
                <small>{transaction.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} - {transaction.method}</small>
              </div>
              {canManageFinance && (
                <div className="row-actions">
                  <button className="secondary" onClick={() => editTransaction(transaction)} type="button">
                    Editar
                  </button>
                  <button className="danger-action" onClick={() => deleteTransaction(transaction)} type="button">
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
          {!filteredTransactions.length && <p className="empty-state">Nenhum lancamento encontrado para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
