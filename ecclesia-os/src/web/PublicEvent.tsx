import { useEffect, useState, type FormEvent } from "react";
import { api, type RecordData } from "./api";
import { Field, Icon, Submit } from "./ui";

export default function PublicEvent({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState<RecordData | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/public/events/${eventId}`)
      .then(setEvent)
      .catch((e) => setError(e.message));
  }, [eventId]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await api(`/public/events/${eventId}/register`, "POST", {
        guestName: data.name,
        guestEmail: data.email,
        guestPhone: data.phone || undefined,
        couponCode: data.couponCode || undefined,
        formData: Object.fromEntries(
          Object.entries(data)
            .filter(([key]) => key.startsWith("field_"))
            .map(([key, value]) => [key.slice(6), String(value)]),
        ),
      });
      setDone(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <main className="registration-page">
        <section className="registration-card">
          <Icon name="shield" size={32} />
          <h1>Inscrição indisponível</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  if (!event)
    return (
      <main className="registration-page">
        <section className="registration-card">
          <p>Carregando evento…</p>
        </section>
      </main>
    );
  const full =
    event.capacity !== null &&
    Number(event.registeredCount) >= Number(event.capacity);
  return (
    <main className="registration-page">
      <section className="registration-card">
        <div className="registration-title">
          <span className="badge green">INSCRIÇÃO ONLINE</span>
          <h1>{event.title}</h1>
          <p>
            {new Date(event.starts_at).toLocaleString("pt-BR", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            })}
            <br />
            até{" "}
            {new Date(event.ends_at).toLocaleTimeString("pt-BR", {
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            })}
          </p>
        </div>
        {done ? (
          <div className="registration-success">
            <Icon name="check" size={32} />
            <h2>
              {done.status === "waitlisted"
                ? "Você entrou na lista de espera"
                : "Inscrição realizada"}
            </h2>
            <p>
              {done.status === "waitlisted"
                ? "A secretaria poderá chamar você quando surgir uma vaga."
                : "Sua participação foi registrada. Guarde este aviso."}
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p>
              {full
                ? "O evento atingiu a capacidade. Você ainda pode solicitar entrada na lista de espera."
                : "Preencha seus dados para participar."}
            </p>
            <Field label="Nome completo">
              <input name="name" minLength={2} maxLength={160} required />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" required />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input name="phone" type="tel" maxLength={30} />
            </Field>
            {Number(event.price_cents ?? 0) > 0 && <Field label="Cupom de desconto (opcional)">
              <input name="couponCode" maxLength={40} autoCapitalize="characters" />
            </Field>}
            {(event.registration_fields ?? []).map((field: RecordData) => (
              <Field key={field.key} label={`${field.label}${field.required ? " · obrigatório" : ""}`}>
                {field.type === "textarea" ? (
                  <textarea name={`field_${field.key}`} required={Boolean(field.required)} maxLength={1000} />
                ) : field.type === "select" ? (
                  <select name={`field_${field.key}`} required={Boolean(field.required)}>
                    <option value="">Selecione</option>
                    {(field.options ?? []).map((option: string) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input name={`field_${field.key}`} type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"} required={Boolean(field.required)} maxLength={1000} />
                )}
              </Field>
            ))}
            <label className="member-checkbox">
              <input type="checkbox" required />
              <span>
                Concordo que a igreja use estes dados para organizar esta
                inscrição.
              </span>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Submit
              busy={busy}
              label={full ? "Entrar na lista de espera" : "Confirmar inscrição"}
            />
          </form>
        )}
      </section>
    </main>
  );
}
