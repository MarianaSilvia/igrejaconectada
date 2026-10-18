import { useEffect, useState, type FormEvent } from "react";
import { api, type RecordData } from "./api";
import { Field, Submit, formValues } from "./ui";
export default function PublicAccess({
  kind,
  token,
}: {
  kind: "invite" | "recovery" | "mfa";
  token?: string;
}) {
  const [info, setInfo] = useState<RecordData | null>(null),
    [setup, setSetup] = useState<RecordData | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    if (kind === "mfa") return;
    let active = true;
    api(`/auth/${kind === "invite" ? "invites" : "recovery"}/${token}`)
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, token]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    const b = formValues(e);
    setBusy(true);
    setError("");
    try {
      if (setup) {
        const r = await api("/auth/mfa-confirm", "POST", {
          challenge: setup.challenge,
          code: b.code,
        });
        setCodes(r.backupCodes);
        setDone(true);
      } else if (kind === "invite") {
        await api(`/auth/invites/${token}`, "POST", info?.existing ? {} : b);
        setDone(true);
      } else if (kind === "recovery") {
        await api(`/auth/recovery/${token}`, "POST", b);
        setDone(true);
      } else setSetup(await api("/auth/mfa-recovery", "POST", b));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section
        className="panel"
        style={{ maxWidth: 560, width: "100%", padding: 28, margin: "auto" }}
      >
        <h1>
          {done
            ? "Acesso atualizado"
            : kind === "invite"
              ? "Convite EcclesiaOS"
              : kind === "recovery"
                ? "Recuperar senha"
                : "Recuperar autenticador"}
        </h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done ? (
          <>
            <p>
              Entre novamente na sua conta. Se usou um código do autenticador
              agora, aguarde o próximo código.
            </p>
            {codes.length > 0 && (
              <>
                <p>
                  Guarde estes códigos em local seguro. Cada código pode ser
                  usado uma vez para recuperar seu autenticador.
                </p>
                <pre style={{ whiteSpace: "pre-wrap", userSelect: "all" }}>
                  {codes.join("\n")}
                </pre>
              </>
            )}
            <a className="button primary" href="/">
              Ir para o login
            </a>
          </>
        ) : (
          <form onSubmit={submit}>
            {kind === "invite" && !info ? (
              <p>Consultando convite…</p>
            ) : (
              <>
                {info && (
                  <p>
                    {info.name} · {info.email}
                  </p>
                )}
                {info?.existing ? (
                  <p>
                    Este convite vincula sua conta existente a uma igreja.{" "}
                    <a href="/" target="_blank" rel="noopener noreferrer">
                      Entre com MFA em outra aba
                    </a>{" "}
                    e volte para aceitar.
                  </p>
                ) : (
                  <>
                    {setup || info?.secret ? (
                      <>
                        <p>
                          Adicione a chave abaixo ao seu aplicativo
                          autenticador. Guarde-a em particular.
                        </p>
                        <code
                          style={{
                            overflowWrap: "anywhere",
                            display: "block",
                            marginBottom: 16,
                          }}
                        >
                          {setup?.secret ?? info?.secret}
                        </code>
                      </>
                    ) : null}
                    {kind === "mfa" && !setup && (
                      <>
                        <Field label="E-mail">
                          <input
                            name="email"
                            type="email"
                            autoComplete="username"
                            required
                          />
                        </Field>
                        <Field label="Senha atual">
                          <input
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                          />
                        </Field>
                        <Field label="Código de recuperação de uso único">
                          <input
                            name="backupCode"
                            autoComplete="off"
                            required
                            maxLength={100}
                          />
                        </Field>
                      </>
                    )}
                    {!setup && kind !== "mfa" && (
                      <Field label="Nova senha · mínimo de 14 caracteres">
                        <input
                          name="password"
                          type="password"
                          minLength={14}
                          maxLength={200}
                          autoComplete="new-password"
                          required
                        />
                      </Field>
                    )}
                    {(setup ||
                      kind === "invite" ||
                      (kind === "recovery" && info?.requiresAuthenticator)) && (
                      <Field label="Código do autenticador">
                        <input
                          name="code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                        />
                      </Field>
                    )}
                  </>
                )}
                <Submit
                  busy={busy}
                  label={
                    kind === "invite"
                      ? "Aceitar convite"
                      : setup
                        ? "Confirmar novo autenticador"
                        : "Continuar"
                  }
                />
              </>
            )}
          </form>
        )}
        {!done && (
          <p>
            <a href="/">Voltar ao login</a>
          </p>
        )}
      </section>
    </main>
  );
}
