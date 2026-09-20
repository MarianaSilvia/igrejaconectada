"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function DeleteAccountPage() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("Enviando solicitação...");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/public/account-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: String(form.get("identifier") ?? ""),
        reason: String(form.get("reason") ?? ""),
        confirmation: form.get("confirmation") === "on",
        website: String(form.get("website") ?? ""),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    setSending(false);
    setMessage(response.ok ? result.message ?? "Solicitação registrada." : result.error ?? "Não foi possível enviar a solicitação.");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <main className="legal-page">
      <form className="surface legal-document" onSubmit={submit}>
        <input aria-hidden="true" autoComplete="off" className="honeypot-field" name="website" tabIndex={-1} />
        <p className="eyebrow">Privacidade</p>
        <h1>Excluir minha conta</h1>
        <p>Informe seu e-mail de acesso ou código de membro. A secretaria confirmará sua identidade antes de apagar a conta e os dados que possam ser removidos.</p>
        <label>E-mail ou código CDG<input maxLength={180} name="identifier" placeholder="seunome@email.com ou CDG0001" required /></label>
        <label>Motivo (opcional)<textarea maxLength={500} name="reason" /></label>
        <label className="consent-field"><input name="confirmation" required type="checkbox" /><span>Confirmo que desejo excluir minha conta e compreendo que poderei perder o acesso ao sistema.</span></label>
        <button disabled={sending} type="submit">{sending ? "Enviando..." : "Solicitar exclusão"}</button>
        {message && <p className="form-message" role="status">{message}</p>}
        <p><Link href="/">Voltar ao Igreja Conectada</Link></p>
      </form>
    </main>
  );
}
