import type { Dispatch, SetStateAction } from "react";
import { formatDateTime, messageFor, whatsappUrl } from "../app-helpers";
import type { AppData, MessageAudience, MessageRecipient, MessageTemplateItem } from "../types";

type CommunicationPanelProps = {
  availableMessageTemplates: MessageTemplateItem[];
  customTemplateLabel: string;
  customTemplateText: string;
  data: AppData;
  messageAudience: MessageAudience;
  messageAudiences: MessageAudience[];
  messageBatchLimit: number;
  messageRecipients: MessageRecipient[];
  messageTemplateId: string;
  messageText: string;
  openBulkWhatsapp: () => void;
  saveCustomMessageTemplate: () => void;
  selectMessageTemplate: (templateId: string) => void;
  selectedMessageRecipientIds: string[];
  selectedMessageRecipients: MessageRecipient[];
  setCustomTemplateLabel: Dispatch<SetStateAction<string>>;
  setCustomTemplateText: Dispatch<SetStateAction<string>>;
  setMessageAudience: Dispatch<SetStateAction<MessageAudience>>;
  setMessageBatchLimit: Dispatch<SetStateAction<number>>;
  setMessageText: Dispatch<SetStateAction<string>>;
  setSelectedMessageRecipientIds: Dispatch<SetStateAction<string[]>>;
};

export function CommunicationPanel({
  availableMessageTemplates,
  customTemplateLabel,
  customTemplateText,
  data,
  messageAudience,
  messageAudiences,
  messageBatchLimit,
  messageRecipients,
  messageTemplateId,
  messageText,
  openBulkWhatsapp,
  saveCustomMessageTemplate,
  selectMessageTemplate,
  selectedMessageRecipientIds,
  selectedMessageRecipients,
  setCustomTemplateLabel,
  setCustomTemplateText,
  setMessageAudience,
  setMessageBatchLimit,
  setMessageText,
  setSelectedMessageRecipientIds,
}: CommunicationPanelProps) {
  return (
    <section className="content-grid">
      <article className="surface">
        <div className="panel-heading">
          <h2>Comunicacao por WhatsApp</h2>
          <span>{messageRecipients.length} contatos</span>
        </div>
        <div className="form-grid">
          <label>
            Publico
            <select
              onChange={(event) => {
                setMessageAudience(event.target.value as MessageAudience);
                setSelectedMessageRecipientIds([]);
              }}
              value={messageAudience}
            >
              {messageAudiences.map((audience) => (
                <option key={audience}>{audience}</option>
              ))}
            </select>
          </label>
          <label>
            Modelo pronto
            <select onChange={(event) => selectMessageTemplate(event.target.value)} value={messageTemplateId}>
              {availableMessageTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Limite por lote
            <input min={1} max={20} onChange={(event) => setMessageBatchLimit(Number(event.target.value))} type="number" value={messageBatchLimit} />
          </label>
          <label className="full">
            Mensagem
            <textarea
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Use {nome} para personalizar com o nome de cada pessoa."
              value={messageText}
            />
          </label>
          <div className="message-preview full">
            <strong>Previa individual</strong>
            <small>
              {selectedMessageRecipients.length} selecionado{selectedMessageRecipients.length === 1 ? "" : "s"} de {messageRecipients.length} contato
              {messageRecipients.length === 1 ? "" : "s"}
            </small>
            <span>{selectedMessageRecipients[0] ? messageFor(messageText, selectedMessageRecipients[0].name) : "Nenhum contato encontrado para este publico."}</span>
          </div>
          <div className="form-actions full">
            <button className="primary-action" disabled={!selectedMessageRecipients.length || !messageText.trim()} onClick={openBulkWhatsapp} type="button">
              Abrir lote selecionado
            </button>
            <button className="secondary" onClick={() => setSelectedMessageRecipientIds(messageRecipients.map((recipient) => recipient.id))} type="button">
              Selecionar todos
            </button>
          </div>
          <label className="full">
            Nome do novo modelo
            <input onChange={(event) => setCustomTemplateLabel(event.target.value)} placeholder="Ex.: Convite culto de domingo" value={customTemplateLabel} />
          </label>
          <label className="full">
            Texto do novo modelo
            <textarea onChange={(event) => setCustomTemplateText(event.target.value)} placeholder="Use {nome} para personalizar." value={customTemplateText} />
          </label>
          <button className="secondary full" disabled={!customTemplateLabel.trim() || !customTemplateText.trim()} onClick={saveCustomMessageTemplate} type="button">
            Salvar modelo
          </button>
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Lista de envio</h2>
          <span>{selectedMessageRecipients.length} no lote atual</span>
        </div>
        <p className="body-copy">O WhatsApp pode bloquear muitas abas ao mesmo tempo. Se necessario, envie pela lista individual abaixo.</p>
        <div className="row-list">
          {messageRecipients.length === 0 ? (
            <div className="data-row">
              <span className="bullet-mark" />
              <div>
                <strong>Nenhum contato encontrado</strong>
                <small>Cadastre telefone nos membros, professores, grupos ou responsaveis Kids.</small>
              </div>
            </div>
          ) : (
            messageRecipients.map((recipient) => (
              <div className="data-row message-row" key={`${recipient.id}-${recipient.phone}`}>
                <input
                  checked={selectedMessageRecipientIds.includes(recipient.id)}
                  onChange={(event) =>
                    setSelectedMessageRecipientIds((current) =>
                      event.target.checked ? Array.from(new Set([...current, recipient.id])) : current.filter((id) => id !== recipient.id),
                    )
                  }
                  type="checkbox"
                />
                <div>
                  <strong>{recipient.name}</strong>
                  <small>
                    {recipient.group} - {recipient.phone}
                  </small>
                </div>
                <a className="whatsapp-link" href={whatsappUrl(recipient.phone, messageText, recipient.name)} rel="noreferrer" target="_blank">
                  Enviar
                </a>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="surface">
        <div className="panel-heading">
          <h2>Historico de campanhas</h2>
          <span>{data.messageCampaigns.length} registros</span>
        </div>
        <div className="row-list">
          {data.messageCampaigns.map((campaign) => (
            <div className="data-row" key={campaign.id}>
              <span className="date-box">{campaign.recipientCount}</span>
              <div>
                <strong>{campaign.audience}</strong>
                <small>
                  {formatDateTime(campaign.createdAt)} - modelo {campaign.templateId}
                </small>
                <small>{campaign.text.slice(0, 120)}</small>
              </div>
            </div>
          ))}
          {!data.messageCampaigns.length && <p className="empty-state">Nenhuma campanha registrada ainda.</p>}
        </div>
      </article>
    </section>
  );
}
