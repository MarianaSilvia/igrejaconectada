import { formatDateTime } from "../app-helpers";
import type { AppData, KidRecord, MemberRecord, Notice } from "../types";

type SettingsPanelProps = {
  activeNotices: Notice[];
  data: AppData;
  log: (action: string) => void;
  monthlyBirthdays: MemberRecord[];
  monthlyKidsBirthdays: KidRecord[];
  resetLocalData: () => void;
};

export function SettingsPanel({ activeNotices, data, log, monthlyBirthdays, monthlyKidsBirthdays, resetLocalData }: SettingsPanelProps) {
  return (
    <section className="content-grid">
      <article className="surface wide">
        <div className="panel-heading">
          <h2>Backup e recuperacao local</h2>
          <span>JSON validado</span>
        </div>
        <p className="body-copy">
          Esta copia roda neste computador. O backup abaixo representa os dados locais do navegador e ajuda a validar a estrutura antes de conectar novamente ao Supabase.
        </p>
        <div className="backup-box">
          <strong>Cobertura do backup</strong>
          <span>100%</span>
          <small>
            {data.members.length} membros, {monthlyBirthdays.length} aniversariantes no mes, {data.kids.length} criancas no Kids,{" "}
            {data.visitors.length} visitantes, {data.schedules.length} escalas, {monthlyKidsBirthdays.length} aniversariantes Kids no mes,{" "}
            {data.users.length} usuarios, {data.careRequests.length} atendimentos, {data.events.length} eventos, {data.schoolClasses.length} classes EBD,{" "}
            {data.discipleshipClasses.length} classes Discipulado, {activeNotices.length} comunicados ativos, {data.mural.length} itens de mural,{" "}
            {data.transactions.length} lancamentos financeiros, {data.assets.length} itens de patrimonio, {data.devotionals.length} devocionais e{" "}
            {data.audit.length} auditorias.
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
  );
}
