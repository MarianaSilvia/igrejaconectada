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
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setup, setSetup] = useState<{ challenge: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("A confirmação não coincide com a nova senha.");
      return;
    }
    await run(async () => {
      await api("/auth/change-password", "POST", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Senha alterada. As sessões anteriores foram encerradas.");
    });
  }

  async function prepareMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const value = await api<{ challenge: string; secret: string }>("/account/mfa/setup", "POST", {
        password: mfaPassword,
      });
      setSetup(value);
      setMfaCode("");
      setBackupCodes([]);
      setMfaPassword("");
    });
  }

  async function confirmMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup) return;
    await run(async () => {
      const value = await api<{ backupCodes?: string[] }>("/auth/mfa-confirm", "POST", {
        challenge: setup.challenge,
        code: mfaCode,
      });
      setBackupCodes(value.backupCodes ?? []);
      setSetup(null);
      setMfaCode("");
      notify("MFA confirmado. Guarde os códigos de recuperação em local seguro.");
    });
  }

  return (
    <section className="stack">
      <div className="panel">
        <div className="eyebrow">SEGURANÇA DA CONTA</div>
        <h2>Minha conta e segurança</h2>
        <p className="muted">
          Altere sua senha e configure o autenticador de seis dígitos. Administradores e supervisores devem manter o MFA ativo.
        </p>
        <form onSubmit={changePassword} className="form-grid" style={{ maxWidth: 560 }}>
          <Field label="Senha atual">
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </Field>
          <Field label="Nova senha">
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} required />
          </Field>
          <Field label="Confirmar nova senha">
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={10} required />
          </Field>
          <Submit busy={busy} label="Alterar senha" />
        </form>
      </div>

      <div className="panel">
        <h3>Autenticador e recuperação</h3>
        {!setup ? (
          <form onSubmit={prepareMfa} className="form-grid" style={{ maxWidth: 560 }}>
            <p className="muted">Digite sua senha atual para preparar um novo autenticador. A chave será exibida uma única vez nesta sessão.</p>
            <Field label="Senha para confirmar a configuração do MFA">
              <input type="password" autoComplete="current-password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} required />
            </Field>
            <Submit busy={busy} label="Preparar novo autenticador" />
          </form>
        ) : (
          <form onSubmit={confirmMfa} className="form-grid" style={{ maxWidth: 560 }}>
            <p className="muted">Cadastre esta chave no Google Authenticator ou aplicativo compatível e informe o código atual.</p>
            <code style={{ display: "block", overflowWrap: "anywhere", padding: 12, background: "var(--surface-2)", borderRadius: 8 }}>{setup.secret}</code>
            <Field label="Código do autenticador">
              <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required />
            </Field>
            <Submit busy={busy} label="Confirmar autenticador" />
          </form>
        )}
        {backupCodes.length > 0 && (
          <div className="notice" role="status">
            <p>Guarde estes códigos. Cada código só pode ser usado uma vez:</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{backupCodes.join("\n")}</pre>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button secondary" type="button" disabled={busy} onClick={() => void run(async () => {
          await api("/account/revoke-sessions", "POST");
          notify("Todas as sessões foram encerradas.");
        })}>Encerrar todas as minhas sessões</button>
      </div>
    </section>
  );
}
