import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import {
  ageFromBirthDate,
  ageGroupFromBirthDate,
  birthdayLabel,
  formatDate,
  memberGroupLabel,
  memberGroupNames,
  normalizeWhatsappPhone,
  whatsappUrl,
} from "../app-helpers";
import { classNameById } from "../attendance-helpers";
import { ResponsiveImage } from "./ResponsiveImage";
import type { AppData, MemberFormTab, MemberRecord } from "../types";

const ministerialFunctionOptions = ["", "Auxiliar oficial", "Diácono", "Presbítero", "Evangelista", "Pastor"];

type MemberForm = Omit<MemberRecord, "id">;
type MemberCredentialForm = {
  memberId: string;
  email: string;
  password: string;
};

type MembersPanelProps = {
  availableMemberFormTabs: MemberFormTab[];
  canCreateMember: boolean;
  canManageMembers: boolean;
  canManageUsers: boolean;
  canSaveMemberAccess: boolean;
  cancelMemberEdit: () => void;
  currentMember?: MemberRecord;
  data: AppData;
  deleteMember: (member: MemberRecord) => void;
  editMember: (member: MemberRecord) => void;
  editingMemberId: string | null;
  filteredMembers: MemberRecord[];
  groupOptions: string[];
  memberAccessMessage: (member: MemberRecord) => string;
  memberCredentialForm: MemberCredentialForm;
  memberDuplicateCandidate?: MemberRecord;
  memberDuplicateWarnings: string[];
  memberDiscipleshipFilter: string;
  memberForm: MemberForm;
  memberFormTab: MemberFormTab;
  memberGroupFilter: string;
  memberPastoralFilter: string;
  memberRolesToText: (values: string[]) => string;
  memberSchoolFilter: string;
  memberStatusFilter: string;
  memberTypeFilter: string;
  monthlyBirthdays: MemberRecord[];
  removeMemberPhoto: () => void | Promise<void>;
  roleOptions: string[];
  saveMemberAccess: (member: MemberRecord) => void | Promise<void>;
  selectedMemberRoles: string[];
  setMemberCredentialForm: Dispatch<SetStateAction<MemberCredentialForm>>;
  setMemberDiscipleshipFilter: Dispatch<SetStateAction<string>>;
  setMemberForm: Dispatch<SetStateAction<MemberForm>>;
  setMemberFormTab: Dispatch<SetStateAction<MemberFormTab>>;
  setMemberGroupFilter: Dispatch<SetStateAction<string>>;
  setMemberPastoralFilter: Dispatch<SetStateAction<string>>;
  setMemberSchoolFilter: Dispatch<SetStateAction<string>>;
  setMemberStatusFilter: Dispatch<SetStateAction<string>>;
  setMemberTypeFilter: Dispatch<SetStateAction<string>>;
  toggleMemberCredentials: (member: MemberRecord) => void;
  uploadMemberPhoto: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  weeklyBirthdays: MemberRecord[];
  createMember: () => void;
};

function missingMemberFields(member: Pick<MemberRecord, "birthDate" | "categories" | "cpf" | "fullName" | "memberCode" | "ministry" | "ministries" | "phone">) {
  return [
    !member.fullName.trim() ? "nome" : "",
    !member.phone.trim() ? "telefone" : "",
    !member.cpf.trim() ? "CPF" : "",
    !member.birthDate.trim() ? "nascimento" : "",
    !member.categories.trim() ? "categoria" : "",
    !memberGroupNames(member).length ? "grupo" : "",
    !member.memberCode.trim() ? "código" : "",
  ].filter(Boolean);
}

export function MembersPanel({
  availableMemberFormTabs,
  canCreateMember,
  canManageMembers,
  canManageUsers,
  canSaveMemberAccess,
  cancelMemberEdit,
  currentMember,
  data,
  deleteMember,
  editMember,
  editingMemberId,
  filteredMembers,
  groupOptions,
  memberAccessMessage,
  memberCredentialForm,
  memberDuplicateCandidate,
  memberDuplicateWarnings,
  memberDiscipleshipFilter,
  memberForm,
  memberFormTab,
  memberGroupFilter,
  memberPastoralFilter,
  memberRolesToText,
  memberSchoolFilter,
  memberStatusFilter,
  memberTypeFilter,
  monthlyBirthdays,
  removeMemberPhoto,
  roleOptions,
  saveMemberAccess,
  selectedMemberRoles,
  setMemberCredentialForm,
  setMemberDiscipleshipFilter,
  setMemberForm,
  setMemberFormTab,
  setMemberGroupFilter,
  setMemberPastoralFilter,
  setMemberSchoolFilter,
  setMemberStatusFilter,
  setMemberTypeFilter,
  toggleMemberCredentials,
  uploadMemberPhoto,
  weeklyBirthdays,
  createMember,
}: MembersPanelProps) {
  const canShowForm = canManageMembers || editingMemberId === currentMember?.id;
  const missingFormFields = missingMemberFields(memberForm);
  const updateMemberName = (fullName: string) => {
    setMemberForm((form) => ({ ...form, fullName }));
  };
  const updateMemberBirthDate = (birthDate: string) => {
    setMemberForm((form) => ({
      ...form,
      birthDate,
      age: ageFromBirthDate(birthDate),
      ageGroup: ageGroupFromBirthDate(birthDate),
    }));
  };
  const toggleMemberGroup = (group: string) => {
    setMemberForm((form) => {
      const currentGroups = memberGroupNames(form);
      const nextGroups = currentGroups.includes(group) ? currentGroups.filter((item) => item !== group) : [...currentGroups, group];
      return { ...form, ministry: nextGroups[0] ?? "", ministries: nextGroups };
    });
  };
  const memberFormPhotoSrc = memberForm.photoUrl || memberForm.photoDataUrl;
  const memberPhotoSrc = (member: MemberRecord) =>
    canManageMembers || member.id === currentMember?.id || member.photoConsent ? member.photoUrl || member.photoDataUrl : "";

  return (
    <section className="content-grid">
      {canShowForm ? (
        <article className={editingMemberId ? "surface editing-surface" : "surface"} id="member-form-panel">
          <div className="panel-heading">
            <h2>{editingMemberId ? "Editar ficha" : "Ficha completa"}</h2>
            <span>{canManageMembers ? (editingMemberId ? "Atualizando cadastro" : "Membro ou visitante") : "Meu cadastro"}</span>
          </div>
          <div className="form-grid" data-current-member-tab={memberFormTab}>
            <div className="member-form-tabs full" role="tablist" aria-label="Seções do cadastro">
              {availableMemberFormTabs.map((tab) => (
                <button className={memberFormTab === tab ? "active" : ""} key={tab} onClick={() => setMemberFormTab(tab)} type="button">
                  {tab}
                </button>
              ))}
            </div>
            <div className="member-section-banner full">
              <strong>{memberFormTab}</strong>
              <small>
                {memberFormTab === "Dados" && "Revise nome, filiação, CPF, contato, nascimento e endereço."}
                {memberFormTab === "Igreja" && "Revise tipo, status, funções, grupo, congregação, datas espirituais e batismos."}
                {memberFormTab === "Classes" && "Revise matrícula na EBD e no Discipulado."}
                {memberFormTab === "Observacoes" && "Revise observações visíveis ao membro e registros internos."}
                {memberFormTab === "Acesso" && "O login e senha são enviados pelo card do membro já salvo."}
              </small>
            </div>
            <div className="member-access-note full" data-member-section="Acesso">
              <strong>Acesso do membro</strong>
              <small>O login e a senha ficam no card do cadastro já salvo, com envio pelo WhatsApp e link do sistema.</small>
            </div>
            {memberDuplicateWarnings.length > 0 && (
              <div className="duplicate-alert full">
                <strong>Possível cadastro já existente</strong>
                <small>{memberDuplicateWarnings.join(" ")}</small>
                {memberDuplicateCandidate && (
                  <button className="secondary" onClick={() => editMember(memberDuplicateCandidate)} type="button">
                    Atualizar cadastro existente
                  </button>
                )}
              </div>
            )}
            {missingFormFields.length > 0 && (
              <div className="member-checklist-alert full">
                <strong>Ficha ainda incompleta</strong>
                <small>Faltam: {missingFormFields.join(", ")}.</small>
              </div>
            )}
            <div className="photo-uploader full" data-member-section="Dados">
              <div className="photo-preview member-photo-preview">
                {memberFormPhotoSrc ? <ResponsiveImage alt={memberForm.fullName || "Foto do membro"} sizes="76px" src={memberFormPhotoSrc} /> : <span>Foto</span>}
              </div>
              <div className="photo-uploader-actions">
                <label>
                  Foto do membro
                  <input accept="image/*" onChange={(event) => { void uploadMemberPhoto(event); }} type="file" />
                  <small className="form-hint">A imagem será reduzida automaticamente e salva fora do cadastro principal.</small>
                </label>
                <label className="check-card compact-check member-photo-consent">
                  <input checked={memberForm.photoConsent} onChange={(event) => setMemberForm((form) => ({ ...form, photoConsent: event.target.checked }))} type="checkbox" />
                  Autoriza exibir foto no sistema
                </label>
                {memberFormPhotoSrc && (
                  <button className="danger-action" onClick={() => { void removeMemberPhoto(); }} type="button">
                    Remover foto
                  </button>
                )}
              </div>
            </div>
            <label className="full" data-member-section="Dados">
              Nome completo
              <input id="member-full-name" onChange={(event) => updateMemberName(event.target.value)} placeholder="Ex.: Maria Oliveira" value={memberForm.fullName} />
            </label>
            <label data-member-section="Dados">
              Código de membro
              <input readOnly value={memberForm.memberCode || "Gerado automaticamente ao salvar"} />
              <small className="form-hint">Sequência padrão CDG0001, CDG0002, CDG0003...</small>
            </label>
            <label data-member-section="Dados">
              Data de nascimento
              <input onChange={(event) => updateMemberBirthDate(event.target.value)} type="date" value={memberForm.birthDate} />
              <small className="form-hint">Ao informar a data, idade e faixa etária são preenchidas automaticamente.</small>
            </label>
            <label data-member-section="Dados">
              Telefones
              <input onChange={(event) => setMemberForm((form) => ({ ...form, phone: event.target.value }))} placeholder="(00) 00000-0000 / (00) 00000-0000" value={memberForm.phone} />
            </label>
            <label data-member-section="Dados">
              Faixa etária
              <select onChange={(event) => setMemberForm((form) => ({ ...form, ageGroup: event.target.value }))} value={memberForm.ageGroup}>
                <option value="">Não informado</option>
                <option>Criança</option>
                <option>Adolescente</option>
                <option>Jovem</option>
                <option>Adulto</option>
                <option>Idoso</option>
              </select>
              <small className="form-hint">Preenchida automaticamente pela data de nascimento.</small>
            </label>
            <label data-member-section="Dados">
              Idade
              <input min={0} onChange={(event) => setMemberForm((form) => ({ ...form, age: event.target.value }))} placeholder="Ex.: 35" readOnly type="number" value={memberForm.age} />
            </label>
            <label data-member-section="Dados">
              Sexo
              <select onChange={(event) => setMemberForm((form) => ({ ...form, gender: event.target.value }))} value={memberForm.gender}>
                <option value="">Não informado</option>
                <option>Feminino</option>
                <option>Masculino</option>
              </select>
            </label>
            <label className="full" data-member-section="Dados">
              Endereço
              <input onChange={(event) => setMemberForm((form) => ({ ...form, address: event.target.value }))} placeholder="Rua, número e complemento" value={memberForm.address} />
            </label>
            <label data-member-section="Dados">
              CEP
              <input inputMode="numeric" onChange={(event) => setMemberForm((form) => ({ ...form, zipCode: event.target.value }))} placeholder="00000-000" value={memberForm.zipCode} />
            </label>
            <label data-member-section="Dados">
              Cidade
              <input onChange={(event) => setMemberForm((form) => ({ ...form, city: event.target.value }))} placeholder="Cidade" value={memberForm.city} />
            </label>
            <label data-member-section="Dados">
              Bairro
              <input onChange={(event) => setMemberForm((form) => ({ ...form, neighborhood: event.target.value }))} placeholder="Bairro" value={memberForm.neighborhood} />
            </label>
            <label data-member-section="Dados">
              Nome do pai
              <input onChange={(event) => setMemberForm((form) => ({ ...form, fatherName: event.target.value }))} placeholder="Nome completo do pai" value={memberForm.fatherName} />
            </label>
            <label data-member-section="Dados">
              Nome da mãe
              <input onChange={(event) => setMemberForm((form) => ({ ...form, motherName: event.target.value }))} placeholder="Nome completo da mãe" value={memberForm.motherName} />
            </label>
            <label data-member-section="Dados">
              CPF
              <input inputMode="numeric" onChange={(event) => setMemberForm((form) => ({ ...form, cpf: event.target.value }))} placeholder="000.000.000-00" value={memberForm.cpf} />
            </label>
            <label data-member-section="Dados">
              Estado civil
              <select onChange={(event) => setMemberForm((form) => ({ ...form, maritalStatus: event.target.value }))} value={memberForm.maritalStatus}>
                <option>Solteiro(a)</option>
                <option>Casado(a)</option>
                <option>Viúvo(a)</option>
                <option>Divorciado(a)</option>
              </select>
            </label>
            <label data-member-section="Dados">
              Escolaridade
              <select onChange={(event) => setMemberForm((form) => ({ ...form, education: event.target.value }))} value={memberForm.education}>
                <option value="">Não informado</option>
                <option>Ensino fundamental incompleto</option>
                <option>Ensino fundamental completo</option>
                <option>Ensino médio incompleto</option>
                <option>Ensino médio completo</option>
                <option>Ensino superior incompleto</option>
                <option>Ensino superior completo</option>
                <option>Pós-graduação</option>
              </select>
            </label>
            <label data-member-section="Dados">
              Nome do cônjuge
              <input onChange={(event) => setMemberForm((form) => ({ ...form, spouseName: event.target.value }))} placeholder="Nome completo do cônjuge" value={memberForm.spouseName} />
            </label>
            <label data-member-section="Dados">
              Criado em
              <input onChange={(event) => setMemberForm((form) => ({ ...form, createdAt: event.target.value }))} type="date" value={memberForm.createdAt.slice(0, 10)} />
            </label>
            <label data-member-section="Dados">
              E-mail
              <input onChange={(event) => setMemberForm((form) => ({ ...form, email: event.target.value }))} placeholder="E-mail real do membro (opcional)" type="email" value={memberForm.email} />
              <small>Não use e-mail fictício. Sem e-mail, o acesso poderá ser feito pelo código do membro.</small>
              <small className="form-hint">Gerado automaticamente pelo nome. Se precisar, você ainda pode editar manualmente.</small>
            </label>
            {canManageMembers && (
              <label data-member-section="Igreja">
                Tipo de pessoa
                <select onChange={(event) => setMemberForm((form) => ({ ...form, memberType: event.target.value as MemberRecord["memberType"] }))} value={memberForm.memberType}>
                  <option>Membro</option>
                  <option>Visitante</option>
                  <option>Congregado</option>
                  <option>Lideranca</option>
                </select>
              </label>
            )}
            {canManageMembers && (
              <label data-member-section="Igreja">
                Status
                <select onChange={(event) => setMemberForm((form) => ({ ...form, status: event.target.value as MemberRecord["status"] }))} value={memberForm.status}>
                  <option>Membro ativo</option>
                  <option>Visitante</option>
                  <option>Novo convertido</option>
                  <option>Transferencia</option>
                </select>
              </label>
            )}
            {canManageMembers && (
              <label data-member-section="Igreja">
                Cargos
                <select
                  className="multi-select"
                  multiple
                  onChange={(event) =>
                    setMemberForm((form) => ({
                      ...form,
                      role: memberRolesToText(Array.from(event.target.selectedOptions, (option) => option.value)),
                    }))
                  }
                  size={7}
                  value={selectedMemberRoles}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <small className="form-hint">No computador, segure Ctrl para marcar mais de uma função; no celular, toque nas funções desejadas.</small>
              </label>
            )}
            {canManageMembers && (
              <label data-member-section="Igreja">
                Função ministerial
                <select
                  onChange={(event) => setMemberForm((form) => ({ ...form, ministerialFunction: event.target.value }))}
                  value={memberForm.ministerialFunction}
                >
                  {ministerialFunctionOptions.map((option) => (
                    <option key={option || "empty"} value={option}>
                      {option || "Não informado"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canManageMembers && (
              <label data-member-section="Igreja">
                Categorias
                <select onChange={(event) => setMemberForm((form) => ({ ...form, categories: event.target.value }))} value={memberForm.categories}>
                  <option value="">Não informado</option>
                  <option>Membro</option>
                  <option>Visitante</option>
                  <option>Novo convertido</option>
                  <option>Congregado</option>
                  <option>Kids</option>
                  <option>Lideranca</option>
                  <option>Obreiro</option>
                </select>
              </label>
            )}
            {canManageMembers && (
              <div className="field-block full" data-member-section="Igreja">
                <span className="field-label">Grupos</span>
                <div className="checkbox-grid">
                  {groupOptions.map((group) => {
                    const checked = memberGroupNames(memberForm).includes(group);
                    return (
                      <label className="check-card compact-check" key={group}>
                        <input checked={checked} onChange={() => toggleMemberGroup(group)} type="checkbox" />
                        {group}
                      </label>
                    );
                  })}
                  {!groupOptions.length && <small className="form-hint">Cadastre grupos no módulo Grupos para vincular membros.</small>}
                </div>
                <small className="form-hint">Marque todos os grupos em que este membro participa.</small>
              </div>
            )}
            <label data-member-section="Classes">
              Classe EBD
              <select onChange={(event) => setMemberForm((form) => ({ ...form, schoolClassId: event.target.value }))} value={memberForm.schoolClassId}>
                <option value="">Não matriculado</option>
                {data.schoolClasses.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </select>
            </label>
            <label data-member-section="Classes">
              Classe Discipulado
              <select onChange={(event) => setMemberForm((form) => ({ ...form, discipleshipClassId: event.target.value }))} value={memberForm.discipleshipClassId}>
                <option value="">Não matriculado</option>
                {data.discipleshipClasses.map((discipleshipClass) => (
                  <option key={discipleshipClass.id} value={discipleshipClass.id}>
                    {discipleshipClass.name}
                  </option>
                ))}
              </select>
            </label>
            <label data-member-section="Igreja">
              Congregação
              <select onChange={(event) => setMemberForm((form) => ({ ...form, congregation: event.target.value }))} value={memberForm.congregation}>
                <option value="">Selecione a congregação</option>
                <option>sede/Farroupilha</option>
                <option>Congre.Maringá</option>
                <option>Congre.Pains</option>
              </select>
            </label>
            <label data-member-section="Igreja">
              Desde
              <input onChange={(event) => setMemberForm((form) => ({ ...form, joinedAt: event.target.value }))} type="date" value={memberForm.joinedAt} />
            </label>
            <label className="full" data-member-section="Igreja">
              Igreja anterior
              <input onChange={(event) => setMemberForm((form) => ({ ...form, previousChurch: event.target.value }))} placeholder="Opcional" value={memberForm.previousChurch} />
            </label>
            <label data-member-section="Igreja">
              Data de conversão
              <input onChange={(event) => setMemberForm((form) => ({ ...form, conversionDate: event.target.value }))} type="date" value={memberForm.conversionDate} />
            </label>
            <label data-member-section="Igreja">
              Data de batismo
              <input onChange={(event) => setMemberForm((form) => ({ ...form, baptismDate: event.target.value }))} type="date" value={memberForm.baptismDate} />
            </label>
            <label data-member-section="Igreja">
              Origem do cadastro
              <select onChange={(event) => setMemberForm((form) => ({ ...form, registrationSource: event.target.value }))} value={memberForm.registrationSource}>
                <option value="">Não informado</option>
                <option>Cadastro interno</option>
                <option>Visita presencial</option>
                <option>Indicação</option>
                <option>Evento</option>
                <option>Transferencia</option>
              </select>
            </label>
            {canManageMembers && (
              <label data-member-section="Igreja">
                Situacao pastoral
                <select onChange={(event) => setMemberForm((form) => ({ ...form, pastoralStatus: event.target.value }))} value={memberForm.pastoralStatus}>
                  <option>Sem acompanhamento definido</option>
                  <option>Acompanhamento regular</option>
                  <option>Precisa de contato</option>
                  <option>Em discipulado</option>
                  <option>Integrado</option>
                </select>
              </label>
            )}
            <label className="full" data-member-section="Observacoes">
              Observação visível ao membro
              <textarea onChange={(event) => setMemberForm((form) => ({ ...form, memberVisibleNotes: event.target.value }))} placeholder="Mensagem ou orientação que o membro pode visualizar" value={memberForm.memberVisibleNotes} />
            </label>
            <label className="check-card" data-member-section="Igreja">
              <input checked={memberForm.waterBaptized} onChange={(event) => setMemberForm((form) => ({ ...form, waterBaptized: event.target.checked }))} type="checkbox" />
              Batizado em águas
            </label>
            <label className="check-card" data-member-section="Igreja">
              <input checked={memberForm.holySpiritBaptized} onChange={(event) => setMemberForm((form) => ({ ...form, holySpiritBaptized: event.target.checked }))} type="checkbox" />
              Batizado no Espírito Santo
            </label>
            {canManageMembers && (
              <label className="full" data-member-section="Observacoes">
                Observações internas
                <textarea onChange={(event) => setMemberForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Histórico, acompanhamento, restrições ou observações pastorais" value={memberForm.notes} />
              </label>
            )}
            <div className="form-actions full">
              <button className="primary-action" disabled={!canCreateMember} onClick={createMember} type="button">
                {editingMemberId ? "Atualizar ficha" : "Salvar ficha"}
              </button>
              {editingMemberId && (
                <button className="secondary" onClick={cancelMemberEdit} type="button">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </article>
      ) : (
        <article className="surface" id="member-form-panel">
          <div className="panel-heading">
            <h2>Meu cadastro</h2>
            <span>{currentMember ? "Visualização pessoal" : "Não vinculado"}</span>
          </div>
          <p className="empty-state">
            {currentMember
              ? "Use o botão Editar ficha no seu cadastro para atualizar seus dados pessoais."
              : "Não encontramos uma ficha vinculada a este login. Fale com a secretaria para revisar o acesso."}
          </p>
        </article>
      )}

      <article className="surface member-list-panel">
        <div className="panel-heading">
          <h2>{canManageMembers ? "Membros cadastrados" : "Meu cadastro"}</h2>
          <span>
            {filteredMembers.length} registro{filteredMembers.length === 1 ? "" : "s"}
          </span>
        </div>
        {canManageMembers && (
          <div className="filter-bar">
            <label>
              Status
              <select onChange={(event) => setMemberStatusFilter(event.target.value)} value={memberStatusFilter}>
                <option>Todos</option>
                <option>Membro ativo</option>
                <option>Visitante</option>
                <option>Novo convertido</option>
                <option>Transferencia</option>
              </select>
            </label>
            <label>
              Tipo
              <select onChange={(event) => setMemberTypeFilter(event.target.value)} value={memberTypeFilter}>
                <option>Todos</option>
                <option>Membro</option>
                <option>Visitante</option>
                <option>Congregado</option>
                <option>Lideranca</option>
              </select>
            </label>
            <label>
              Grupo
              <select onChange={(event) => setMemberGroupFilter(event.target.value)} value={memberGroupFilter}>
                <option>Todos</option>
                {groupOptions.map((group) => (
                  <option key={group}>{group}</option>
                ))}
              </select>
            </label>
            <label>
              Classe EBD
              <select onChange={(event) => setMemberSchoolFilter(event.target.value)} value={memberSchoolFilter}>
                <option>Todos</option>
                {data.schoolClasses.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Discipulado
              <select onChange={(event) => setMemberDiscipleshipFilter(event.target.value)} value={memberDiscipleshipFilter}>
                <option>Todos</option>
                {data.discipleshipClasses.map((discipleshipClass) => (
                  <option key={discipleshipClass.id} value={discipleshipClass.id}>
                    {discipleshipClass.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Situacao pastoral
              <select onChange={(event) => setMemberPastoralFilter(event.target.value)} value={memberPastoralFilter}>
                <option>Todos</option>
                <option>Sem acompanhamento definido</option>
                <option>Acompanhamento regular</option>
                <option>Precisa de contato</option>
                <option>Em discipulado</option>
                <option>Integrado</option>
              </select>
            </label>
          </div>
        )}
        {canManageMembers && (
          <div className="birthday-grid">
            <div className="birthday-card">
              <strong>Aniversariantes da semana</strong>
              <span>{weeklyBirthdays.length}</span>
              <small>
                {weeklyBirthdays.length
                  ? weeklyBirthdays.map((member) => `${member.fullName} (${birthdayLabel(member.birthDate)})`).join(", ")
                  : "Nenhum aniversário nesta semana."}
              </small>
            </div>
            <div className="birthday-card">
              <strong>Aniversariantes do mês</strong>
              <span>{monthlyBirthdays.length}</span>
              <small>
                {monthlyBirthdays.length
                  ? monthlyBirthdays.map((member) => `${member.fullName} (${birthdayLabel(member.birthDate)})`).join(", ")
                  : "Nenhum aniversário neste mês."}
              </small>
            </div>
          </div>
        )}
        <div className="row-list member-record-list">
          {filteredMembers.map((member) => {
            const schoolClassName = classNameById(data.schoolClasses, member.schoolClassId);
            const discipleshipClassName = classNameById(data.discipleshipClasses, member.discipleshipClassId);
            const missingFields = missingMemberFields(member);
            const groupsLabel = memberGroupLabel(member);

            return (
              <div className="member-record" key={member.id}>
                <div className="data-row member-row">
                  <div className="member-avatar">
                    {memberPhotoSrc(member) ? <ResponsiveImage alt={member.fullName} sizes="76px" src={memberPhotoSrc(member)} /> : member.fullName.slice(0, 1)}
                  </div>
                  <div>
                    <strong>{member.fullName}</strong>
                    <small className="member-code-line">Código: {member.memberCode || "Aguardando código"}</small>
                    <small>
                      {member.memberType} - {member.status} - {member.role || "Sem função"} - {member.phone}
                    </small>
                    <small>
                      CPF: {member.cpf || "Não informado"} - Sexo: {member.gender || "Não informado"} - Idade: {member.age || "Não informada"}
                    </small>
                    <small>
                      Faixa etária: {member.ageGroup || "Não informada"} - Escolaridade: {member.education || "Não informada"}
                    </small>
                    {(member.fatherName || member.motherName) && (
                      <small>
                        Filiação: {member.fatherName || "Pai não informado"} / {member.motherName || "Mãe não informada"}
                      </small>
                    )}
                    {member.spouseName && <small>Cônjuge: {member.spouseName}</small>}
                    <small>
                      Endereço: {member.address || "Não informado"}
                      {member.neighborhood ? ` - ${member.neighborhood}` : ""}
                      {member.city ? ` - ${member.city}` : ""}
                      {member.zipCode ? ` - CEP ${member.zipCode}` : ""}
                    </small>
                    <small>
                      Grupos: {groupsLabel} - {member.congregation || "Congregação não informada"} - Aniv. {birthdayLabel(member.birthDate)}
                    </small>
                    <small>
                      Função ministerial: {member.ministerialFunction || "Não informada"}
                    </small>
                    <small>
                      Cargos: {member.role || "Sem cargo"} - Categorias: {member.categories || "Não informado"}
                    </small>
                    <small>
                      EBD: {schoolClassName || "Não matriculado"} - Discipulado: {discipleshipClassName || "Não matriculado"}
                    </small>
                    <small>
                      Origem: {member.registrationSource || "Não informada"} - Situação: {member.pastoralStatus || "Sem acompanhamento definido"}
                    </small>
                    {(member.conversionDate || member.baptismDate) && (
                      <small>
                        Conversão: {formatDate(member.conversionDate)} - Batismo: {formatDate(member.baptismDate)}
                      </small>
                    )}
                    {member.createdAt && <small>Criado em: {formatDate(member.createdAt.slice(0, 10))}</small>}
                    {member.memberVisibleNotes && <small>Nota ao membro: {member.memberVisibleNotes}</small>}
                    {missingFields.length > 0 && (
                      <small className="member-incomplete-line">Ficha incompleta: {missingFields.join(", ")}</small>
                    )}
                  </div>
                </div>
                <div className="record-actions">
                  <button className="secondary" onClick={() => editMember(member)} type="button">
                    Editar ficha
                  </button>
                  {canManageUsers && (
                    <button className="secondary" onClick={() => toggleMemberCredentials(member)} type="button">
                      Login e senha
                    </button>
                  )}
                  {canManageMembers && (
                    <button className="danger-action" onClick={() => deleteMember(member)} type="button">
                      Excluir ficha
                    </button>
                  )}
                </div>
                {canManageUsers && memberCredentialForm.memberId === member.id && (
                  <div className="credential-panel">
                    <div className="panel-heading compact-heading">
                      <h2>Acesso do membro</h2>
                      <span>{member.authUserId ? "Login vinculado" : "Novo login"}</span>
                    </div>
                    <div className="form-grid">
                      <label>
                        Login / e-mail
                        <input onChange={(event) => setMemberCredentialForm((form) => ({ ...form, email: event.target.value }))} placeholder="membro@email.com" type="email" value={memberCredentialForm.email} />
                      </label>
                      <label>
                        Senha
                        <input autoComplete="new-password" minLength={8} onChange={(event) => setMemberCredentialForm((form) => ({ ...form, password: event.target.value }))} placeholder="Senha temporária individual" type="password" value={memberCredentialForm.password} />
                        <small className="form-hint">Senha inicial padrão para o primeiro envio.</small>
                      </label>
                      <button className="primary-action" disabled={!canSaveMemberAccess} onClick={() => { void saveMemberAccess(member); }} type="button">
                        Criar ou atualizar login
                      </button>
                      <a
                        aria-disabled={!normalizeWhatsappPhone(member.phone) || !memberCredentialForm.email.trim()}
                        className={!normalizeWhatsappPhone(member.phone) || !memberCredentialForm.email.trim() ? "whatsapp-link full disabled" : "whatsapp-link full"}
                        href={whatsappUrl(member.phone, memberAccessMessage(member), member.fullName)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Enviar login pelo WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!filteredMembers.length && <p className="empty-state">Nenhuma ficha encontrada para este filtro.</p>}
        </div>
      </article>
    </section>
  );
}
