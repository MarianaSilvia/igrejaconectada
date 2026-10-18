import { useState, useRef, type FormEvent, type ReactNode } from "react";
import { Field, Icon, Submit, Badge } from "./ui";
import {
  defaultProfile,
  defaultAdministration,
  ageOn,
  ageGroup,
  sexOptions,
  educationOptions,
  maritalOptions,
  todayInBrazil,
  type MemberProfile,
  type MemberAdministration,
} from "../shared/registration";
import type { RecordData } from "./api";

export interface MemberFormProps {
  initial?: RecordData | null;
  publicForm?: boolean;
  photoRequired?: boolean;
  directory?: RecordData | null;
  defaultCampusId?: string | null;
  onSave: (body: RecordData) => Promise<void>;
  submitLabel?: string;
  privacyNotice?: string;
  extra?: ReactNode;
  disabled?: boolean;
}
function tokens(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
export default function MemberForm({
  initial,
  publicForm = false,
  photoRequired = false,
  directory,
  defaultCampusId,
  onSave,
  submitLabel,
  privacyNotice,
  extra,
  disabled,
}: MemberFormProps) {
  const [profile, setProfile] = useState<MemberProfile>(
    () => initial?.profile ?? defaultProfile(),
  );
  const [administration, setAdministration] = useState<MemberAdministration>(
    () => initial?.administration ?? defaultAdministration(),
  );
  const [categories, setCategories] = useState(
      administration.categories.join(", "),
    ),
    [positions, setPositions] = useState(administration.positions.join(", "));
  const [householdId, setHouseholdId] = useState(initial?.householdId ?? ""),
    [campusId, setCampusId] = useState(
      initial?.campusId ?? defaultCampusId ?? "",
    );
  const [photo, setPhoto] = useState<string | null | undefined>(undefined),
    [photoError, setPhotoError] = useState(""),
    [reading, setReading] = useState(false),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [website, setWebsite] = useState("");
  const fileRef = useRef<HTMLInputElement>(null),
    photoSequence = useRef(0);
  const shownPhoto = photo === undefined ? initial?.photoDataUrl : photo;
  const change = <K extends keyof MemberProfile>(
    key: K,
    value: MemberProfile[K],
  ) => setProfile((old) => ({ ...old, [key]: value }));
  const address = (key: keyof MemberProfile["address"], value: string) =>
    setProfile((old) => ({
      ...old,
      address: { ...old.address, [key]: value },
    }));
  const minor = (ageOn(profile.birthDate) ?? 18) < 18;
  async function pickPhoto(file?: File) {
    if (!file) return;
    const sequence = ++photoSequence.current;
    setPhotoError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 3 * 1024 * 1024
    ) {
      setPhotoError("Escolha uma foto JPG, PNG ou WebP de até 3 MB.");
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setReading(true);
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Não foi possível ler a foto."));
        reader.readAsDataURL(file);
      });
      if (sequence === photoSequence.current) setPhoto(value);
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      if (sequence === photoSequence.current) setReading(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photoRequired && !shownPhoto) {
      setPhotoError("Adicione sua foto para enviar a ficha.");
      fileRef.current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const body: RecordData = {
        profile,
        ...(photo !== undefined ? { photo } : {}),
      };
      if (publicForm) {
        body.acceptedPrivacyNotice = accepted;
        body.website = website;
      } else {
        body.administration = {
          ...administration,
          categories: tokens(categories),
          positions: tokens(positions),
        };
        body.version = initial?.version ?? 0;
        body.householdId = householdId || null;
        body.campusId = campusId || null;
      }
      await onSave(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="member-editor" onSubmit={submit}>
      <div className="member-form-intro">
        <div>
          <Badge tone="purple">FICHA DE MEMBROS</Badge>
          <h2>
            {publicForm
              ? "Vamos conhecer você melhor."
              : initial?.id
                ? "Editar ficha do membro"
                : "Novo cadastro de membro"}
          </h2>
          <p>
            {publicForm
              ? "Preencha com calma. Os campos sem asterisco são opcionais."
              : "Cadastro manual e edição pela secretaria. Os campos internos não aparecem na ficha online."}
          </p>
        </div>
        <span className="form-version">Modelo 01</span>
      </div>
      {extra}
      <section
        className="member-photo-block"
        aria-labelledby="member-photo-title"
      >
        <div className="member-photo-preview">
          {shownPhoto ? (
            <img src={shownPhoto} alt="Prévia da foto do membro" />
          ) : (
            <Icon name="people" size={35} />
          )}
        </div>
        <div>
          <h3 id="member-photo-title">
            Foto do membro{photoRequired ? " *" : ""}
          </h3>
          <p>
            Uma foto de rosto ajuda a secretaria a identificar você.
            <br />
            JPG, PNG ou WebP · até 3 MB.
          </p>
          <div className="photo-actions">
            <label className="button secondary photo-picker">
              {shownPhoto ? "Trocar foto" : "Adicionar foto"}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload da foto do membro"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
            </label>
            {shownPhoto && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  ++photoSequence.current;
                  setPhoto(null);
                  setReading(false);
                  setPhotoError("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Remover foto
              </button>
            )}
          </div>
          {reading && <small role="status">Preparando a foto…</small>}
          {photoError && (
            <p role="alert" className="error">
              {photoError}
            </p>
          )}
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <span>01</span>
          <div>
            <h3>Dados pessoais</h3>
            <p>Seu nome e informações básicas.</p>
          </div>
        </div>
        <div className="member-fields">
          <Field label="Nome *">
            <input
              name="firstName"
              autoComplete="given-name"
              required
              maxLength={100}
              value={profile.firstName}
              onChange={(e) => change("firstName", e.target.value)}
            />
          </Field>
          <Field label="Sobrenome">
            <input
              name="lastName"
              autoComplete="family-name"
              maxLength={150}
              value={profile.lastName}
              onChange={(e) => change("lastName", e.target.value)}
            />
          </Field>
          <Field label="Data de nascimento">
            <input
              name="birthDate"
              type="date"
              autoComplete="bday"
              max={todayInBrazil()}
              value={profile.birthDate}
              onChange={(e) => change("birthDate", e.target.value)}
            />
          </Field>
          <div className="age-fields">
            <Field label="Idade">
              <input
                value={
                  ageOn(profile.birthDate) === null
                    ? "Não informada"
                    : `${ageOn(profile.birthDate)} anos`
                }
                readOnly
              />
            </Field>
            <Field label="Faixa etária">
              <input value={ageGroup(profile.birthDate)} readOnly />
            </Field>
          </div>
          <Field label="Sexo">
            <select
              value={profile.sex}
              onChange={(e) => change("sex", e.target.value)}
            >
              {sexOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Escolaridade">
            <select
              value={profile.education}
              onChange={(e) => change("education", e.target.value)}
            >
              {educationOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Estado civil">
            <select
              value={profile.maritalStatus}
              onChange={(e) => change("maritalStatus", e.target.value)}
            >
              {maritalOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="CPF (opcional)">
            <input
              name="cpf"
              inputMode="numeric"
              maxLength={14}
              placeholder="000.000.000-00"
              value={profile.cpf}
              onChange={(e) => change("cpf", e.target.value)}
            />
          </Field>
          <Field label="RG (opcional)">
            <input
              name="rg"
              maxLength={30}
              value={profile.rg}
              onChange={(e) => change("rg", e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <span>02</span>
          <div>
            <h3>Contatos</h3>
            <p>
              {publicForm
                ? "Informe pelo menos um telefone ou e-mail."
                : "Como a secretaria pode entrar em contato."}
            </p>
          </div>
        </div>
        <div className="member-fields">
          <Field label="Telefone 1 / WhatsApp">
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              value={profile.phone}
              onChange={(e) => change("phone", e.target.value)}
            />
          </Field>
          <Field label="Telefone 2">
            <input
              name="phone2"
              type="tel"
              maxLength={30}
              value={profile.phone2}
              onChange={(e) => change("phone2", e.target.value)}
            />
          </Field>
          <Field label="E-mail">
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={profile.email}
              onChange={(e) => change("email", e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <span>03</span>
          <div>
            <h3>Endereço</h3>
            <p>Onde você mora atualmente.</p>
          </div>
        </div>
        <div className="member-fields">
          <Field label="Endereço / logradouro">
            <input
              name="street"
              autoComplete="address-line1"
              maxLength={200}
              value={profile.address.street}
              onChange={(e) => address("street", e.target.value)}
            />
          </Field>
          <Field label="Número">
            <input
              name="number"
              maxLength={30}
              value={profile.address.number}
              onChange={(e) => address("number", e.target.value)}
            />
          </Field>
          <Field label="Bairro">
            <input
              name="neighborhood"
              maxLength={100}
              value={profile.address.neighborhood}
              onChange={(e) => address("neighborhood", e.target.value)}
            />
          </Field>
          <Field label="CEP">
            <input
              name="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={9}
              placeholder="00000-000"
              value={profile.address.postalCode}
              onChange={(e) => address("postalCode", e.target.value)}
            />
          </Field>
          <Field label="Cidade">
            <input
              name="city"
              autoComplete="address-level2"
              maxLength={100}
              value={profile.address.city}
              onChange={(e) => address("city", e.target.value)}
            />
          </Field>
          <Field label="Estado">
            <input
              name="state"
              autoComplete="address-level1"
              maxLength={80}
              placeholder="Ex.: São Paulo"
              value={profile.address.state}
              onChange={(e) => address("state", e.target.value)}
            />
          </Field>
          <Field label="País">
            <input
              name="country"
              autoComplete="country-name"
              maxLength={80}
              value={profile.address.country}
              onChange={(e) => address("country", e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <span>04</span>
          <div>
            <h3>Igreja e vida cristã</h3>
            <p>A comunidade da qual você faz parte.</p>
          </div>
        </div>
        <div className="member-fields">
          <Field label={`Igreja / congregação${publicForm ? " *" : ""}`}>
            <input
              name="congregation"
              maxLength={160}
              placeholder="Escreva o nome da sua igreja ou congregação"
              required={publicForm}
              value={profile.congregation}
              onChange={(e) => change("congregation", e.target.value)}
            />
          </Field>
          <Field label="Data de conversão">
            <input
              name="conversionDate"
              type="date"
              max={todayInBrazil()}
              value={profile.conversionDate}
              onChange={(e) => change("conversionDate", e.target.value)}
            />
          </Field>
          <Field label="É batizado(a)?">
            <select
              name="baptized"
              value={profile.baptized}
              onChange={(e) =>
                change("baptized", e.target.value as MemberProfile["baptized"])
              }
            >
              <option value="not_informed">Não informado</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          </Field>
        </div>
      </section>
      {minor && (
        <section className="member-section guardian-section">
          <div className="member-section-title">
            <span>
              <Icon name="shield" size={18} />
            </span>
            <div>
              <h3>Responsável pelo menor</h3>
              <p>Informe o responsável que está preenchendo esta ficha.</p>
            </div>
          </div>
          <div className="member-fields">
            <Field label={`Nome do responsável${publicForm ? " *" : ""}`}>
              <input
                name="guardianName"
                required={publicForm}
                maxLength={150}
                value={profile.guardianName}
                onChange={(e) => change("guardianName", e.target.value)}
              />
            </Field>
            <Field label={`Contato do responsável${publicForm ? " *" : ""}`}>
              <input
                name="guardianContact"
                required={publicForm}
                maxLength={100}
                value={profile.guardianContact}
                onChange={(e) => change("guardianContact", e.target.value)}
              />
            </Field>
          </div>
          {publicForm && (
            <label className="member-checkbox">
              <input
                type="checkbox"
                required
                checked={profile.guardianDeclaration}
                onChange={(e) =>
                  change("guardianDeclaration", e.target.checked)
                }
              />
              <span>
                Declaro ser responsável por este menor e estar enviando as
                informações para a secretaria.
              </span>
            </label>
          )}
        </section>
      )}
      {!publicForm && (
        <section className="member-section member-internal">
          <div className="member-section-title">
            <span>
              <Icon name="shield" size={18} />
            </span>
            <div>
              <h3>Uso da secretaria</h3>
              <p>
                Informações internas, preenchidas por quem administra o
                cadastro.
              </p>
            </div>
          </div>
          <div className="member-fields">
            <Field label="Vínculo">
              <select
                value={administration.status}
                onChange={(e) =>
                  setAdministration((v) => ({
                    ...v,
                    status: e.target.value as MemberAdministration["status"],
                  }))
                }
              >
                <option value="member">Membro</option>
                <option value="visitor">Visitante</option>
                <option value="worker">Obreiro</option>
                <option value="inactive">Inativo</option>
              </select>
            </Field>
            <Field label="Situação de comunhão">
              <select
                value={administration.communion}
                onChange={(e) =>
                  setAdministration((v) => ({
                    ...v,
                    communion: e.target
                      .value as MemberAdministration["communion"],
                  }))
                }
              >
                <option value="not_informed">Não informado</option>
                <option value="active">Ativo / em comunhão</option>
                <option value="disciplined">Disciplinado</option>
              </select>
            </Field>
            <Field label="Categorias (separe por vírgula)">
              <input
                value={categories}
                maxLength={1600}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="Ex.: Jovens, voluntários"
              />
            </Field>
            <Field label="Cargos (separe por vírgula)">
              <input
                value={positions}
                maxLength={2000}
                onChange={(e) => setPositions(e.target.value)}
                placeholder="Ex.: Diácono, líder"
              />
            </Field>
            <Field label="Família">
              <select
                value={householdId}
                onChange={(e) => setHouseholdId(e.target.value)}
              >
                <option value="">Sem vínculo familiar</option>
                {directory?.households?.map((h: RecordData) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campus administrativo">
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
              >
                <option value="">Igreja / sem campus específico</option>
                {directory?.campuses?.map((c: RecordData) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grupos / ministérios">
              <input
                value={administration.groups}
                maxLength={1000}
                onChange={(e) =>
                  setAdministration((v) => ({ ...v, groups: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Anotações administrativas">
            <textarea
              value={administration.notes}
              maxLength={4000}
              onChange={(e) =>
                setAdministration((v) => ({ ...v, notes: e.target.value }))
              }
            />
          </Field>
          <p className="panel-footnote">
            Anotações pastorais sigilosas e registros financeiros continuam nos
            respectivos módulos.
          </p>
          {initial?.id && (
            <p className="member-record-meta">
              ID: {initial.id}
              <br />
              Perfil criado em:{" "}
              {new Date(initial.createdAt).toLocaleString("pt-BR")}
            </p>
          )}
        </section>
      )}
      {publicForm && (
        <>
          <div className="registration-honeypot" aria-hidden="true">
            <label>
              Website
              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>
          <section className="member-privacy">
            <Icon name="shield" size={23} />
            <div>
              <h3>Suas informações são cuidadas.</h3>
              <p>{privacyNotice}</p>
              <label className="member-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  Li o aviso e concordo em enviar meus dados para análise da
                  secretaria. *
                </span>
              </label>
            </div>
          </section>
        </>
      )}
      {error && (
        <div className="member-form-error" role="alert">
          {error}
        </div>
      )}
      <div className="member-form-footer">
        <small>
          {publicForm
            ? "Sua ficha será conferida antes de entrar no cadastro de membros."
            : "Alterações registradas na trilha de auditoria."}
        </small>
        <Submit
          busy={busy || reading}
          disabled={disabled}
          label={
            submitLabel ??
            (publicForm ? "Enviar minha ficha" : "Salvar ficha do membro")
          }
        />
      </div>
    </form>
  );
}
