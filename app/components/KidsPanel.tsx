import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { birthdayLabel } from "../app-helpers";
import type { KidRecord } from "../types";

type KidForm = Omit<KidRecord, "id">;

type KidsPanelProps = {
  canCreateKid: boolean;
  canManageKids: boolean;
  createKid: () => void;
  deleteKid: (kid: KidRecord) => void;
  filteredKids: KidRecord[];
  kids: KidRecord[];
  kidClassFilter: string;
  kidForm: KidForm;
  monthlyKidsBirthdays: KidRecord[];
  readPhoto: (event: ChangeEvent<HTMLInputElement>, onReady: (photoDataUrl: string) => void) => void;
  setKidClassFilter: Dispatch<SetStateAction<string>>;
  setKidForm: Dispatch<SetStateAction<KidForm>>;
};

export function KidsPanel({
  canCreateKid,
  canManageKids,
  createKid,
  deleteKid,
  filteredKids,
  kids,
  kidClassFilter,
  kidForm,
  monthlyKidsBirthdays,
  readPhoto,
  setKidClassFilter,
  setKidForm,
}: KidsPanelProps) {
  const kidClassOptions = Array.from(new Set(kids.flatMap((kid) => [kid.ageGroup, kid.className]).filter(Boolean)));
  const guardianCount = new Set(kids.map((kid) => kid.guardianPhone)).size;

  return (
    <section className="content-grid">
      {canManageKids && (
        <article className="surface">
          <div className="panel-heading">
            <h2>Cadastro Kids</h2>
            <span>Crianca e responsavel</span>
          </div>
          <div className="form-grid">
            <div className="photo-uploader full">
              <div className="photo-preview kids-preview">{kidForm.photoDataUrl ? <img alt="" src={kidForm.photoDataUrl} /> : <span>Kids</span>}</div>
              <label>
                Foto da crianca
                <input accept="image/*" onChange={(event) => readPhoto(event, (photoDataUrl) => setKidForm((form) => ({ ...form, photoDataUrl })))} type="file" />
              </label>
            </div>
            <label className="full">
              Nome da crianca
              <input onChange={(event) => setKidForm((form) => ({ ...form, childName: event.target.value }))} placeholder="Ex.: Julia Santos" value={kidForm.childName} />
            </label>
            <label>
              Nascimento
              <input onChange={(event) => setKidForm((form) => ({ ...form, birthDate: event.target.value }))} type="date" value={kidForm.birthDate} />
            </label>
            <label>
              Faixa
              <select onChange={(event) => setKidForm((form) => ({ ...form, ageGroup: event.target.value as KidRecord["ageGroup"] }))} value={kidForm.ageGroup}>
                <option>Bercario</option>
                <option>Maternal</option>
                <option>Kids</option>
                <option>Juniores</option>
              </select>
            </label>
            <label>
              Turma
              <input onChange={(event) => setKidForm((form) => ({ ...form, className: event.target.value }))} placeholder="Ex.: Kids 6 a 8" value={kidForm.className} />
            </label>
            <label>
              Desde
              <input onChange={(event) => setKidForm((form) => ({ ...form, joinedAt: event.target.value }))} type="date" value={kidForm.joinedAt} />
            </label>
            <label className="full">
              Alergias ou cuidados
              <input onChange={(event) => setKidForm((form) => ({ ...form, allergies: event.target.value }))} placeholder="Ex.: alergia alimentar, medicamento, observacao medica" value={kidForm.allergies} />
            </label>
            <label>
              Responsavel
              <input onChange={(event) => setKidForm((form) => ({ ...form, guardianName: event.target.value }))} placeholder="Nome do responsavel" value={kidForm.guardianName} />
            </label>
            <label>
              Parentesco
              <input onChange={(event) => setKidForm((form) => ({ ...form, relationship: event.target.value }))} placeholder="Mae, pai, avo, tutor" value={kidForm.relationship} />
            </label>
            <label>
              Telefone do responsavel
              <input onChange={(event) => setKidForm((form) => ({ ...form, guardianPhone: event.target.value }))} placeholder="(00) 00000-0000" value={kidForm.guardianPhone} />
            </label>
            <label>
              E-mail do responsavel
              <input onChange={(event) => setKidForm((form) => ({ ...form, guardianEmail: event.target.value }))} placeholder="responsavel@email.com" type="email" value={kidForm.guardianEmail} />
            </label>
            <label className="full">
              Pessoas autorizadas a buscar
              <input onChange={(event) => setKidForm((form) => ({ ...form, authorizedPickup: event.target.value }))} placeholder="Informe quem pode retirar a crianca" value={kidForm.authorizedPickup} />
            </label>
            <label className="check-card full">
              <input checked={kidForm.consentImage} onChange={(event) => setKidForm((form) => ({ ...form, consentImage: event.target.checked }))} type="checkbox" />
              Responsavel autorizou uso de imagem
            </label>
            <label className="full">
              Observacoes
              <textarea onChange={(event) => setKidForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Rotina, restricoes, acompanhamento ou informacoes para professores" value={kidForm.notes} />
            </label>
            <button className="primary-action" disabled={!canCreateKid} onClick={createKid} type="button">
              Salvar Kids
            </button>
          </div>
        </article>
      )}

      <article className="surface">
        <div className="panel-heading">
          <h2>{canManageKids ? "Kids cadastrados" : "Area Kids vinculada"}</h2>
          <span>
            {filteredKids.length} crianca{filteredKids.length === 1 ? "" : "s"}
          </span>
        </div>
        {canManageKids && (
          <div className="filter-bar">
            <label>
              Turma ou faixa
              <select onChange={(event) => setKidClassFilter(event.target.value)} value={kidClassFilter}>
                <option>Todos</option>
                {kidClassOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {canManageKids && (
          <div className="birthday-grid">
            <div className="birthday-card kids-birthday">
              <strong>Aniversariantes Kids do mes</strong>
              <span>{monthlyKidsBirthdays.length}</span>
              <small>
                {monthlyKidsBirthdays.length ? monthlyKidsBirthdays.map((kid) => `${kid.childName} (${birthdayLabel(kid.birthDate)})`).join(", ") : "Nenhum aniversario Kids neste mes."}
              </small>
            </div>
            <div className="birthday-card kids-birthday">
              <strong>Responsaveis</strong>
              <span>{guardianCount}</span>
              <small>Contatos para check-in, retirada e avisos do departamento.</small>
            </div>
          </div>
        )}
        <div className="row-list">
          {filteredKids.map((kid) => (
            <div className="member-record kids-record" key={kid.id}>
              <div className="data-row member-row">
                <div className="member-avatar kids-avatar">{kid.photoDataUrl ? <img alt="" src={kid.photoDataUrl} /> : kid.childName.slice(0, 1)}</div>
                <div>
                  <strong>{kid.childName}</strong>
                  <small>
                    {kid.ageGroup} - {kid.className || "Turma nao informada"} - Aniv. {birthdayLabel(kid.birthDate)}
                  </small>
                  <small>
                    Resp. {kid.guardianName} - {kid.guardianPhone} - Retirada: {kid.authorizedPickup || "nao informada"}
                  </small>
                </div>
              </div>
              <div className="record-actions">
                {canManageKids && (
                  <button className="danger-action" onClick={() => deleteKid(kid)} type="button">
                    Excluir cadastro
                  </button>
                )}
              </div>
            </div>
          ))}
          {!filteredKids.length && <p className="empty-state">Nenhum cadastro Kids encontrado para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
