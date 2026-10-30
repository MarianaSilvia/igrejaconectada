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
  onSave: (body: RecordData) => Promise<RecordData | void>;
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
  const [cepLoading, setCepLoading] = useState(false),
    [cepMessage, setCepMessage] = useState("");
  const [website, setWebsite] = useState("");
  const fileRef = useRef<HTMLInputElement>(null),
    photoSequence = useRef(0),
    cepSequence = useRef(0);
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
  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const sequence = ++cepSequence.current;
    setCepLoading(true);
    setCepMessage("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Não foi possível consultar o CEP.");
      const result = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (sequence !== cepSequence.current) return;
      if (result.erro) {
        setCepMessage("CEP não encontrado. Confira os números.");
        return;
      }
      setProfile((old) => ({
        ...old,
        address: {
          ...old.address,
          street: old.address.street || result.logradouro || "",
          neighborhood: old.address.neighborhood || result.bairro || "",
          city: old.address.city || result.localidade || "",
          state: old.address.state || result.uf || "",
        },
      }));
      setCepMessage("Endereço localizado. Confira e informe o número da casa.");
    } catch {
      if (sequence === cepSequence.current) setCepMessage("Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.");
    } finally {
      if (sequence === cepSequence.current) setCepLoading(false);
    }
  }
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
      const original = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Não foi possível ler a foto."));
        reader.readAsDataURL(file);
      });
      const value = await new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) return reject(new Error("Não foi possível preparar a foto."));
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/webp", 0.82));
        };
        image.onerror = () => reject(new Error("Não foi possível preparar a foto."));
        image.src = original;
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
          <Field label="Nacionalidade">
            <input value={profile.nationality} maxLength={80} onChange={(e) => change("nationality", e.target.value)} />
          </Field>
          <Field label="Profissão">
            <input value={profile.profession} maxLength={120} onChange={(e) => change("profession", e.target.value)} />
          </Field>
          <Field label="Local de nascimento">
            <input value={profile.birthPlace} maxLength={120} onChange={(e) => change("birthPlace", e.target.value)} />
          </Field>
          <Field label="Título de eleitor">
            <input value={profile.voterTitle} maxLength={40} onChange={(e) => change("voterTitle", e.target.value)} />
          </Field>
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <span>02</span>
          <div><h3>Filiação e família</h3><p>Informações familiares usadas na ficha cadastral.</p></div>
        </div>
        <div className="member-fields">
          <Field label="Nome do pai"><input value={profile.fatherName} maxLength={150} onChange={(e) => change("fatherName", e.target.value)} /></Field>
          <Field label="Nome da mãe"><input value={profile.motherName} maxLength={150} onChange={(e) => change("motherName", e.target.value)} /></Field>
          <Field label="Nome do cônjuge"><input value={profile.spouseName} maxLength={150} onChange={(e) => change("spouseName", e.target.value)} /></Field>
          <Field label="Data do casamento"><input type="date" max={todayInBrazil()} value={profile.marriageDate} onChange={(e) => change("marriageDate", e.target.value)} /></Field>
          <Field label="ID/registro do casamento"><input value={profile.marriageId} maxLength={60} onChange={(e) => change("marriageId", e.target.value)} /></Field>
          <Field label="Quantidade de filhos"><input type="number" min="0" max="50" value={profile.childrenCount} onChange={(e) => change("childrenCount", e.target.value)} /></Field>
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title">
          <span>03</span>
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
          <span>04</span>
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
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9-]/g, "").slice(0, 9);
                address("postalCode", value);
                if (value.replace(/\D/g, "").length === 8) void lookupCep(value);
              }}
              onBlur={(e) => void lookupCep(e.target.value)}
            />
            <small className="muted" aria-live="polite">{cepLoading ? "Consultando CEP…" : cepMessage || "Digite o CEP para preencher rua, bairro e cidade."}</small>
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
          <span>05</span>
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
          <Field label="Tipo de admissão">
            <input value={profile.admissionType} maxLength={80} placeholder="Ex.: batismo, transferência" onChange={(e) => change("admissionType", e.target.value)} />
          </Field>
          <Field label="Setor">
            <input value={profile.sector} maxLength={120} onChange={(e) => change("sector", e.target.value)} />
          </Field>
        </div>
      </section>
      <section className="member-section">
        <div className="member-section-title"><span>06</span><div><h3>Batismo e recebimento</h3><p>Detalhes complementares da trajetória de membresia.</p></div></div>
        <div className="member-fields">
          <Field label="Origem"><input value={profile.origin} maxLength={300} onChange={(e) => change("origin", e.target.value)} /></Field>
          <Field label="Local de batismo"><input value={profile.baptismLocation} maxLength={150} onChange={(e) => change("baptismLocation", e.target.value)} /></Field>
          <Field label="Data de batismo"><input type="date" max={todayInBrazil()} value={profile.baptismDate} onChange={(e) => change("baptismDate", e.target.value)} /></Field>
          <Field label="Batismo no Espírito Santo"><select value={profile.holySpiritBaptism} onChange={(e) => change("holySpiritBaptism", e.target.value as MemberProfile["holySpiritBaptism"])}><option value="not_informed">Não informado</option><option value="yes">Sim</option><option value="no">Não</option></select></Field>
          <Field label="Data do batismo no Espírito Santo"><input type="date" max={todayInBrazil()} value={profile.holySpiritBaptismDate} onChange={(e) => change("holySpiritBaptismDate", e.target.value)} /></Field>
          <Field label="Forma de recebimento"><input value={profile.receptionType} maxLength={100} onChange={(e) => change("receptionType", e.target.value)} /></Field>
          <Field label="Data de recebimento"><input type="date" max={todayInBrazil()} value={profile.receptionDate} onChange={(e) => change("receptionDate", e.target.value)} /></Field>
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
            <Field label="Parentesco do responsável">
              <input
                name="guardianRelationship"
                maxLength={80}
                value={profile.guardianRelationship}
                onChange={(e) => change("guardianRelationship", e.target.value)}
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
      <section className="member-section">
        <div className="member-section-title"><span>07</span><div><h3>Autorizações</h3><p>Consentimentos separados do cadastro e da imagem.</p></div></div>
        <label className="member-checkbox">
          <input type="checkbox" checked={profile.imageAuthorization} onChange={(e) => change("imageAuthorization", e.target.checked)} />
          <span>Autorizo o uso da minha imagem em documentos e comunicações institucionais da igreja.</span>
        </label>
      </section>
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
                <option value="congregado">Congregado</option>
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
