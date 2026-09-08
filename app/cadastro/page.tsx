"use client";

import { FormEvent, useState } from "react";

type PublicRegistrationForm = {
  fullName: string;
  fatherName: string;
  motherName: string;
  cpf: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  zipCode: string;
  city: string;
  neighborhood: string;
  maritalStatus: string;
  education: string;
  spouseName: string;
  requestedStatus: string;
  notes: string;
  website: string;
};

const initialForm: PublicRegistrationForm = {
  fullName: "",
  fatherName: "",
  motherName: "",
  cpf: "",
  phone: "",
  email: "",
  birthDate: "",
  gender: "",
  address: "",
  zipCode: "",
  city: "",
  neighborhood: "",
  maritalStatus: "Solteiro(a)",
  education: "",
  spouseName: "",
  requestedStatus: "Visitante",
  notes: "",
  website: "",
};

export default function PublicRegistrationPage() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("Enviando cadastro...");

    const response = await fetch("/api/public/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Nao foi possivel enviar o cadastro.");
      return;
    }

    setForm(initialForm);
    setStatus("sent");
    setMessage("Cadastro enviado com sucesso. A secretaria vai conferir seus dados.");
  }

  return (
    <main className="public-registration-page">
      <section className="public-registration-hero">
        <div className="brand-block">
          <div className="brand-mark">IC</div>
          <p className="brand-name">Igreja Conectada</p>
        </div>
        <div>
          <p className="access-kicker">Cadastro online</p>
          <h1>Envie seus dados para a secretaria.</h1>
          <p>Preencha a ficha com calma. O envio nao cria login no sistema; a equipe da igreja confere os dados depois.</p>
        </div>
      </section>

      <form className="public-registration-form surface" onSubmit={submitRegistration}>
        <input
          aria-hidden="true"
          autoComplete="off"
          className="honeypot-field"
          tabIndex={-1}
          value={form.website}
          name="website"
          onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
        />
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Pre-cadastro</p>
            <h2>Dados principais</h2>
          </div>
          <span>{status === "sending" ? "Enviando..." : "Fila da secretaria"}</span>
        </div>

        {message && (
          <p className={status === "error" ? "form-message error" : "form-message"} role="status">
            {message}
          </p>
        )}

        <div className="form-grid">
          <label>
            Nome completo *
            <input minLength={6} maxLength={140} required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
          </label>
          <label>
            Telefone/WhatsApp *
            <input maxLength={40} required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label>
            CPF
            <input maxLength={20} value={form.cpf} onChange={(event) => setForm((current) => ({ ...current, cpf: event.target.value }))} />
          </label>
          <label>
            E-mail
            <input maxLength={140} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label>
            Data de nascimento
            <input type="date" value={form.birthDate} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} />
          </label>
          <label>
            Sexo
            <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}>
              <option value="">Selecione</option>
              <option>Feminino</option>
              <option>Masculino</option>
            </select>
          </label>
          <label>
            Nome do pai
            <input maxLength={180} value={form.fatherName} onChange={(event) => setForm((current) => ({ ...current, fatherName: event.target.value }))} />
          </label>
          <label>
            Nome da mae
            <input maxLength={180} value={form.motherName} onChange={(event) => setForm((current) => ({ ...current, motherName: event.target.value }))} />
          </label>
          <label>
            Estado civil
            <select value={form.maritalStatus} onChange={(event) => setForm((current) => ({ ...current, maritalStatus: event.target.value }))}>
              <option>Solteiro(a)</option>
              <option>Casado(a)</option>
              <option>Divorciado(a)</option>
              <option>Viuvo(a)</option>
            </select>
          </label>
          <label>
            Nome do conjuge
            <input maxLength={140} value={form.spouseName} onChange={(event) => setForm((current) => ({ ...current, spouseName: event.target.value }))} />
          </label>
          <label>
            Escolaridade
            <input maxLength={80} value={form.education} onChange={(event) => setForm((current) => ({ ...current, education: event.target.value }))} />
          </label>
          <label>
            Como deseja ser cadastrado?
            <select value={form.requestedStatus} onChange={(event) => setForm((current) => ({ ...current, requestedStatus: event.target.value }))}>
              <option>Visitante</option>
              <option>Novo convertido</option>
              <option>Membro ativo</option>
            </select>
          </label>
          <label className="span-2">
            Endereco
            <input maxLength={220} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
          </label>
          <label>
            CEP
            <input maxLength={20} value={form.zipCode} onChange={(event) => setForm((current) => ({ ...current, zipCode: event.target.value }))} />
          </label>
          <label>
            Cidade
            <input maxLength={80} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
          </label>
          <label>
            Bairro
            <input maxLength={80} value={form.neighborhood} onChange={(event) => setForm((current) => ({ ...current, neighborhood: event.target.value }))} />
          </label>
          <label className="span-2">
            Observacoes
            <textarea maxLength={600} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
        </div>

        <button disabled={status === "sending"} type="submit">
          {status === "sending" ? "Enviando..." : "Enviar cadastro"}
        </button>
      </form>
    </main>
  );
}
