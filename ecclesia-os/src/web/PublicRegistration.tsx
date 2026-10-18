import { useEffect, useState } from "react";
import { api, type RecordData } from "./api";
import { Badge, Icon } from "./ui";
import MemberForm from "./MemberForm";
import "./registration.css";
export default function PublicRegistration({
  registrationToken,
}: {
  registrationToken: string;
}) {
  const [info, setInfo] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<RecordData | null>(null),
    [submissionKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    api("/public/registration/" + encodeURIComponent(registrationToken))
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [registrationToken]);
  return (
    <div className="registration-page">
      <header className="registration-top">
        <a href="/" className="registration-brand">
          <span className="brand-mark">
            <Icon name="home" size={25} />
          </span>
          <span>
            ecclesia<span>OS</span>
          </span>
        </a>
        <span>
          <Icon name="shield" size={15} /> Cadastro de membros
        </span>
      </header>
      <main className="registration-layout">
        <aside className="registration-story">
          <Badge tone="purple">CADA PESSOA TEM UMA HISTÓRIA</Badge>
          <h1>
            Uma comunidade começa com <em>conexões.</em>
          </h1>
          <p>
            Sua ficha ajuda a secretaria a manter o cadastro atualizado e a
            conhecer melhor quem faz parte da igreja.
          </p>
          <div className="registration-story-item">
            <Icon name="people" />
            <div>
              <strong>Seu lugar na comunidade</strong>
              <p>
                Escreva manualmente a igreja ou congregação da qual você faz
                parte.
              </p>
            </div>
          </div>
          <div className="registration-story-item">
            <Icon name="shield" />
            <div>
              <strong>Conferência pela secretaria</strong>
              <p>
                O envio não altera automaticamente um cadastro já existente.
              </p>
            </div>
          </div>
          <div className="registration-story-note">
            Preencha em um momento tranquilo.
            <br />
            Você pode usar o celular ou o computador.
          </div>
        </aside>
        <section className="registration-card">
          {error ? (
            <div className="registration-unavailable">
              <Icon name="shield" size={38} />
              <h2>Ficha indisponível</h2>
              <p role="alert">{error}</p>
            </div>
          ) : !info ? (
            <p role="status" className="loading">
              Preparando sua ficha…
            </p>
          ) : receipt ? (
            <div className="registration-success" role="status">
              <span>
                <Icon name="check" size={39} />
              </span>
              <Badge>ENVIO CONCLUÍDO</Badge>
              <h1>Recebemos sua ficha!</h1>
              <p>{receipt.message}</p>
              <div className="registration-protocol">
                <small>GUARDE SEU PROTOCOLO</small>
                <strong>{receipt.protocol}</strong>
              </div>
              <p className="muted">
                Se precisar corrigir alguma informação, entre em contato com a
                secretaria e informe este protocolo.
              </p>
            </div>
          ) : (
            <>
              {info.demo && (
                <div className="registration-demo">
                  <span className="status-dot" />
                  Prévia local · use somente dados fictícios. A publicação
                  ficará para depois.
                </div>
              )}
              <div className="registration-title">
                <p>CADASTRO ONLINE</p>
                <h1>{info.title}</h1>
                <span>
                  Os campos marcados com * são necessários para o envio.
                </span>
              </div>
              <MemberForm
                publicForm
                photoRequired={info.photoRequired}
                privacyNotice={info.privacyNotice}
                onSave={async (body) => {
                  try {
                    const response = await api(
                      "/public/registration/" + registrationToken,
                      "POST",
                      {
                        ...body,
                        photo: body.photo ?? undefined,
                        challenge: info.challenge,
                        submissionKey,
                      },
                    );
                    setReceipt(response);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } catch (e) {
                    throw e;
                  }
                }}
              />
            </>
          )}
        </section>
      </main>
      <footer className="registration-bottom">
        <Icon name="home" size={15} />
        EcclesiaOS · Pessoas no centro. Gestão com propósito.
      </footer>
    </div>
  );
}
