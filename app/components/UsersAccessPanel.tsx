import type { Dispatch, SetStateAction } from "react";
import type { AccessUser, AccessUserForm, AppData, MemberRecord } from "../types";

type UsersAccessPanelProps = {
  canCreateUser: boolean;
  createUser: () => void;
  data: AppData;
  deleteAccessUser: (user: AccessUser) => void;
  selectedAccessExistingUser?: AccessUser;
  selectedAccessMember?: MemberRecord;
  selectedAccessMemberId: string;
  selectAccessMember: (memberId: string) => void;
  setUserForm: Dispatch<SetStateAction<AccessUserForm>>;
  updateAccessUserStatus: (user: AccessUser, status: AccessUser["status"]) => void;
  userForm: AccessUserForm;
};

export function UsersAccessPanel({
  canCreateUser,
  createUser,
  data,
  deleteAccessUser,
  selectedAccessExistingUser,
  selectedAccessMember,
  selectedAccessMemberId,
  selectAccessMember,
  setUserForm,
  updateAccessUserStatus,
  userForm,
}: UsersAccessPanelProps) {
  return (
    <section className="content-grid">
      <article className="surface">
        <div className="panel-heading">
          <h2>Novo usuario</h2>
          <span>Acesso interno</span>
        </div>
        <div className="form-grid">
          <label className="full">
            Selecionar membro cadastrado
            <select onChange={(event) => selectAccessMember(event.target.value)} value={selectedAccessMemberId}>
              <option value="">Criar acesso sem vincular membro</option>
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} - {member.email || "sem e-mail"} - {member.memberType}
                </option>
              ))}
            </select>
          </label>
          {selectedAccessMember && (
            <div className="selected-member-access full">
              <div className="member-avatar">{selectedAccessMember.fullName.slice(0, 1)}</div>
              <div>
                <strong>{selectedAccessMember.fullName}</strong>
                <small>
                  {selectedAccessMember.memberType} - {selectedAccessMember.status} - {selectedAccessMember.phone}
                </small>
                <small>
                  {selectedAccessExistingUser
                    ? `Acesso existente: ${selectedAccessExistingUser.role} - sera atualizado`
                    : "Pronto para virar acesso administrativo"}
                </small>
              </div>
            </div>
          )}
          <label className="full">
            Nome
            <input onChange={(event) => setUserForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ex.: Lider de jovens" value={userForm.name} />
          </label>
          <label className="full">
            E-mail
            <input onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))} placeholder="usuario@email.com" type="email" value={userForm.email} />
          </label>
          <label className="full">
            {selectedAccessExistingUser ? "Nova senha (opcional)" : "Senha inicial"}
            <input
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))}
              placeholder={selectedAccessExistingUser ? "Preencha somente se quiser trocar" : "Minimo de 6 caracteres"}
              type="password"
              value={userForm.password}
            />
          </label>
          <label>
            Perfil
            <select onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as AccessUser["role"] }))} value={userForm.role}>
              <option>Administrador</option>
              <option>Lider</option>
              <option>Professor</option>
              <option>Secretario</option>
              <option>Tesoureiro</option>
            </select>
          </label>
          <label>
            Status
            <select onChange={(event) => setUserForm((form) => ({ ...form, status: event.target.value as AccessUser["status"] }))} value={userForm.status}>
              <option>Ativo</option>
              <option>Pendente</option>
              <option>Bloqueado</option>
            </select>
          </label>
          <button className="primary-action" disabled={!canCreateUser} onClick={createUser} type="button">
            {selectedAccessExistingUser ? "Atualizar acesso" : "Adicionar usuario"}
          </button>
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Usuarios cadastrados</h2>
          <span>{data.users.length} acessos</span>
        </div>
        <div className="row-list">
          {data.users.map((user) => (
            <div className="data-row access-user-row" key={user.id}>
              <span className={user.status === "Bloqueado" ? "bullet-mark danger-mark" : "bullet-mark"} />
              <div>
                <strong>{user.name}</strong>
                <small>{user.role} - {user.status} - {user.email}</small>
              </div>
              <div className="row-actions">
                <button className={user.status === "Bloqueado" ? "secondary" : "danger-action"} onClick={() => updateAccessUserStatus(user, user.status === "Bloqueado" ? "Ativo" : "Bloqueado")} type="button">
                  {user.status === "Bloqueado" ? "Reativar" : "Cancelar acesso"}
                </button>
                <button className="danger-action" onClick={() => deleteAccessUser(user)} type="button">
                  Excluir acesso
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
