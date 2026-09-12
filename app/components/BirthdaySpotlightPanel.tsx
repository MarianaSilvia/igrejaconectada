import { birthdayLabel } from "../app-helpers";
import type { MemberRecord } from "../types";
import { ResponsiveImage } from "./ResponsiveImage";

type BirthdaySpotlightPanelProps = {
  canSendMessages: boolean;
  monthlyBirthdays: MemberRecord[];
  onOpenMessages: () => void;
};

export function BirthdaySpotlightPanel({ canSendMessages, monthlyBirthdays, onOpenMessages }: BirthdaySpotlightPanelProps) {
  return (
    <article className="surface birthday-spotlight wide">
      <div className="panel-heading">
        <div>
          <h2>Aniversariantes do mes</h2>
          <span>{monthlyBirthdays.length ? `${monthlyBirthdays.length} pessoas para celebrar` : "Nenhum aniversario neste mes"}</span>
        </div>
        {canSendMessages && (
          <button onClick={onOpenMessages} type="button">
            Enviar mensagem
          </button>
        )}
      </div>
      {monthlyBirthdays.length ? (
        <div className="birthday-spotlight-list">
          {monthlyBirthdays.slice(0, 8).map((member) => (
            <div className="birthday-person-card" key={member.id}>
              <div className="birthday-person-photo">
                {member.photoConsent && member.photoUrl ? <ResponsiveImage alt={member.fullName} sizes="52px" src={member.photoUrl} /> : member.fullName.slice(0, 1)}
              </div>
              <div>
                <strong>{member.fullName}</strong>
                <small>{birthdayLabel(member.birthDate)}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Assim que houver aniversariantes cadastrados neste mes, eles aparecem aqui com nome em destaque.</p>
      )}
    </article>
  );
}
