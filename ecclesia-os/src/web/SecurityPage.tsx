import { useState, type FormEvent } from "react";
import { api } from "./api";
import { Field, Submit } from "./ui";

type Props = {
  church: string;
  revision: number;
  notify: (message: string) => void;
};

export default function SecurityPage({ notify }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("A confirmação não coincide com a nova senha.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", "POST", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Senha alterada. As sessões anteriores foram encerradas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <div className="eyebrow">SEGURANÇA DA CONTA</div>
        <h2>Minha conta e segurança</h2>
        <p className="muted">
          Altere sua senha de acesso. Administradores e supervisores também devem manter o MFA configurado.
        </p>
        <form onSubmit={submit} className="form-grid" style={{ maxWidth: 560 }}>
          <Field label="Senha atual">
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </Field>
          <Field label="Nova senha">
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} required />
          </Field>
          <Field label="Confirmar nova senha">
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={10} required />
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <Submit busy={busy} label="Alterar senha" />
        </form>
      </div>
      <div className="panel">
        <h3>Primeiro acesso</h3>
        <p className="muted">Após a troca, entre novamente se necessário e conclua o código de seis dígitos do autenticador quando o sistema solicitar.</p>
      </div>
    </section>
  );
}
