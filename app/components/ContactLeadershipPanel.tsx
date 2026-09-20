"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseClient, isSupabaseConfigured } from "../supabase-client";

type ContactDestination = {
  id: string;
  congregation: string;
  kind: string;
  label: string;
  assigned: boolean;
  assigneeName: string;
};

type ContactThread = {
  id: string;
  congregation: string;
  senderUserId: string;
  senderName: string;
  destinationId: string;
  destinationKind: string;
  destinationLabel: string;
  eligibleRole: string;
  assignedUserId: string;
  assignedName: string;
  subject: string;
  status: "unassigned" | "waiting_leadership" | "waiting_member" | "closed";
  lastSenderId: string;
  lastMessageAt: string;
  helpRequestedAt: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
  unread: boolean;
};

type ContactMessage = {
  id: string;
  threadId: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
};

type ContactResponder = { id: string; name: string; role: string };

type ContactResponse = {
  setupRequired?: boolean;
  currentUserId?: string;
  currentRole?: string;
  isGlobalAdmin?: boolean;
  destinations?: ContactDestination[];
  threads?: ContactThread[];
  selectedThread?: ContactThread | null;
  messages?: ContactMessage[];
  responders?: ContactResponder[];
  unreadCount?: number;
  retentionDays?: number;
  error?: string;
};

type ContactLeadershipPanelProps = {
  openPastoral: () => void;
};

async function currentToken() {
  const supabase = getSupabaseClient();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  return data.session?.access_token ?? "";
}

function formatDateTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: ContactThread["status"]) {
  if (status === "unassigned") return "Aguardando encaminhamento";
  if (status === "waiting_leadership") return "Aguardando liderança";
  if (status === "waiting_member") return "Aguardando membro";
  return "Concluída";
}

function statusClass(status: ContactThread["status"]) {
  return `contact-status contact-status-${status.replaceAll("_", "-")}`;
}

export function ContactUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isSupabaseConfigured()) return;
      const token = await currentToken();
      if (!token) return;
      const response = await fetch("/api/contact?summary=1", { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json().catch(() => ({}))) as ContactResponse;
      if (!cancelled && response.ok) setCount(result.unreadCount ?? 0);
    }
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!count) return null;
  return <span className="contact-unread-badge" aria-label={`${count} conversa(s) não lida(s)`}>{count > 99 ? "99+" : count}</span>;
}

export function ContactLeadershipPanel({ openPastoral }: ContactLeadershipPanelProps) {
  const [destinations, setDestinations] = useState<ContactDestination[]>([]);
  const [threads, setThreads] = useState<ContactThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [selectedThread, setSelectedThread] = useState<ContactThread | null>(null);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [responders, setResponders] = useState<ContactResponder[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [selectedResponderId, setSelectedResponderId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Carregando conversas...");
  const [filter, setFilter] = useState("open");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  const isStaff = currentRole !== "MEMBER";
  const filteredThreads = useMemo(() => threads.filter((thread) => {
    if (filter === "all") return true;
    if (filter === "open") return thread.status !== "closed";
    if (filter === "unassigned") return thread.status === "unassigned";
    if (filter === "mine") return thread.assignedUserId === currentUserId && thread.status !== "closed";
    if (filter === "waiting_member") return thread.status === "waiting_member";
    if (filter === "closed") return thread.status === "closed";
    return true;
  }), [currentUserId, filter, threads]);

  const loadContacts = useCallback(async (threadId: string, options?: { quiet?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setStatusMessage("Fale com a liderança precisa do Supabase ativo.");
      setIsLoading(false);
      return;
    }
    if (!options?.quiet) setIsLoading(true);
    const token = await currentToken();
    if (!token) {
      setStatusMessage("Entre novamente para carregar suas conversas.");
      setIsLoading(false);
      return;
    }
    const url = threadId ? `/api/contact?threadId=${encodeURIComponent(threadId)}` : "/api/contact";
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const result = (await response.json().catch(() => ({}))) as ContactResponse;
    if (result.setupRequired) {
      setSetupRequired(true);
      setStatusMessage(result.error ?? "As tabelas de atendimento ainda precisam ser preparadas.");
      setIsLoading(false);
      return;
    }
    if (!response.ok) {
      setStatusMessage(result.error ?? "Não foi possível carregar as conversas.");
      setIsLoading(false);
      return;
    }
    setSetupRequired(false);
    setDestinations(result.destinations ?? []);
    setThreads(result.threads ?? []);
    setSelectedThread(result.selectedThread ?? null);
    setMessages(result.messages ?? []);
    setResponders(result.responders ?? []);
    setCurrentUserId(result.currentUserId ?? "");
    setCurrentRole(result.currentRole ?? "MEMBER");
    setSelectedResponderId(result.selectedThread?.assignedUserId ?? "");
    if (result.destinations?.[0]) setDestinationId((current) => current || result.destinations![0].id);
    setStatusMessage("Conversas atualizadas.");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(""), 0);
    return () => window.clearTimeout(timer);
  }, [loadContacts]);

  useEffect(() => {
    if (!selectedThreadId || setupRequired) return;
    const supabase = getSupabaseClient();
    const pollTimer = window.setInterval(() => void loadContacts(selectedThreadId, { quiet: true }), 20_000);
    if (!supabase) return () => window.clearInterval(pollTimer);
    const channel = supabase
      .channel(`contact-thread-${selectedThreadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_messages", filter: `thread_id=eq.${selectedThreadId}` }, () => {
        void loadContacts(selectedThreadId, { quiet: true });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contact_threads", filter: `id=eq.${selectedThreadId}` }, () => {
        void loadContacts(selectedThreadId, { quiet: true });
      })
      .subscribe();
    return () => {
      window.clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadContacts, selectedThreadId, setupRequired]);

  async function openThread(threadId: string) {
    setSelectedThreadId(threadId);
    await loadContacts(threadId);
  }

  async function createThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!destinationId || !subject.trim() || !messageText.trim() || isSending) return;
    setIsSending(true);
    const token = await currentToken();
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "create", destinationId, subject, body: messageText }),
    });
    const result = (await response.json().catch(() => ({}))) as ContactResponse & { thread?: ContactThread };
    if (!response.ok) {
      setStatusMessage(result.error ?? "Não foi possível enviar a mensagem.");
      setIsSending(false);
      return;
    }
    setSubject("");
    setMessageText("");
    setStatusMessage("Mensagem enviada para a área escolhida.");
    setIsSending(false);
    const newThreadId = result.thread?.id ?? "";
    setSelectedThreadId(newThreadId);
    await loadContacts(newThreadId);
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread || !replyText.trim() || isSending) return;
    setIsSending(true);
    const token = await currentToken();
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "reply", threadId: selectedThread.id, body: replyText }),
    });
    const result = (await response.json().catch(() => ({}))) as ContactResponse;
    setStatusMessage(response.ok ? "Resposta enviada." : result.error ?? "Não foi possível responder.");
    if (response.ok) setReplyText("");
    setIsSending(false);
    await loadContacts(selectedThread.id, { quiet: true });
  }

  async function updateThread(action: "claim" | "close" | "transfer" | "release" | "help") {
    if (!selectedThread) return;
    if (action === "close" && !window.confirm("Concluir esta conversa? Ela ficará disponível por mais 90 dias.")) return;
    const note = action === "help" ? window.prompt("Explique brevemente por que precisa de ajuda nesta conversa:") ?? "" : "";
    if (action === "help" && !note.trim()) return;
    const token = await currentToken();
    const response = await fetch("/api/contact", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, threadId: selectedThread.id, assignedUserId: selectedResponderId, note }),
    });
    const result = (await response.json().catch(() => ({}))) as ContactResponse;
    const successText = action === "claim" ? "Conversa assumida." : action === "close" ? "Conversa concluída." : action === "transfer" ? "Conversa transferida." : action === "release" ? "Conversa devolvida para a fila." : "Ajuda solicitada ao administrador geral.";
    setStatusMessage(response.ok ? successText : result.error ?? "Não foi possível atualizar a conversa.");
    await loadContacts(selectedThread.id, { quiet: true });
  }

  const canReply = selectedThread && selectedThread.status !== "closed" && (selectedThread.senderUserId === currentUserId || selectedThread.assignedUserId === currentUserId);
  const canClaim = selectedThread?.status === "unassigned" && selectedThread.senderUserId !== currentUserId;
  const canManageAssignment = selectedThread?.assignedUserId === currentUserId || currentRole === "ADMIN";

  return (
    <section className="contact-layout">
      <article className="surface contact-intro">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Canal privado</p>
            <h2>Fale com a liderança</h2>
          </div>
          <span>Respostas por área</span>
        </div>
        <p>Escolha a área correta. Somente você, o responsável e o administrador geral podem acompanhar o conteúdo depois do encaminhamento.</p>
        <button className="secondary" onClick={openPastoral} type="button">Oração, visita ou aconselhamento</button>
      </article>

      <article className="surface contact-new-thread">
        <div className="panel-heading"><h2>Nova mensagem</h2><span>Até 1.000 caracteres</span></div>
        {setupRequired ? (
          <p className="empty-state">Prepare as tabelas usando <strong>db/supabase-contact-leadership.sql</strong>.</p>
        ) : (
          <form className="form-grid" onSubmit={createThread}>
            <label className="full">Área responsável
              <select onChange={(event) => setDestinationId(event.target.value)} required value={destinationId}>
                <option value="">Selecione a área</option>
                {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.label}</option>)}
              </select>
            </label>
            <label className="full">Assunto
              <input maxLength={160} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: Dúvida sobre a reunião do grupo" required value={subject} />
            </label>
            <label className="full">Mensagem
              <textarea maxLength={1000} onChange={(event) => setMessageText(event.target.value)} placeholder="Escreva sua mensagem com clareza" required value={messageText} />
              <small>{messageText.length}/1000</small>
            </label>
            <button className="primary-action" disabled={isSending || !destinations.length} type="submit">{isSending ? "Enviando..." : "Enviar mensagem"}</button>
          </form>
        )}
      </article>

      <article className="surface contact-inbox">
        <div className="panel-heading"><h2>{isStaff ? "Caixa de atendimento" : "Minhas conversas"}</h2><span>{threads.filter((thread) => thread.unread).length} não lidas</span></div>
        <div className="contact-tabs" role="tablist" aria-label="Filtros de conversa">
          <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")} type="button">Em aberto</button>
          {isStaff && <button className={filter === "unassigned" ? "active" : ""} onClick={() => setFilter("unassigned")} type="button">Encaminhar</button>}
          {isStaff && <button className={filter === "mine" ? "active" : ""} onClick={() => setFilter("mine")} type="button">Minhas</button>}
          {isStaff && <button className={filter === "waiting_member" ? "active" : ""} onClick={() => setFilter("waiting_member")} type="button">Aguardando membro</button>}
          <button className={filter === "closed" ? "active" : ""} onClick={() => setFilter("closed")} type="button">Concluídas</button>
        </div>
        <div className="contact-thread-list">
          {filteredThreads.map((thread) => (
            <button className={`contact-thread-card ${selectedThreadId === thread.id ? "selected" : ""}`} key={thread.id} onClick={() => void openThread(thread.id)} type="button">
              <span className={statusClass(thread.status)}>{statusLabel(thread.status)}</span>
              {thread.unread && <span className="contact-thread-unread">Nova</span>}
              <strong>{thread.subject}</strong>
              <small>{isStaff ? thread.senderName : thread.destinationLabel}</small>
              <small>{thread.assignedName || "Secretaria fará o encaminhamento"}</small>
              <time>{formatDateTime(thread.lastMessageAt)}</time>
            </button>
          ))}
          {!filteredThreads.length && <p className="empty-state">Nenhuma conversa neste filtro.</p>}
        </div>
      </article>

      <article className="surface contact-conversation">
        {!selectedThread ? (
          <p className="empty-state">Selecione uma conversa para acompanhar as respostas.</p>
        ) : (
          <>
            <div className="panel-heading">
              <div><h2>{selectedThread.subject}</h2><p>{selectedThread.destinationLabel} · {selectedThread.senderName}</p></div>
              <span className={statusClass(selectedThread.status)}>{statusLabel(selectedThread.status)}</span>
            </div>
            <div className="contact-conversation-meta">
              <span>Responsável: <strong>{selectedThread.assignedName || "Aguardando encaminhamento"}</strong></span>
              <span>Congregação: <strong>{selectedThread.congregation}</strong></span>
            </div>
            <div className="contact-messages" aria-live="polite">
              {messages.map((message) => (
                <article className={message.authorUserId === currentUserId ? "contact-message mine" : "contact-message"} key={message.id}>
                  <div><strong>{message.authorName}</strong><time>{formatDateTime(message.createdAt)}</time></div>
                  <p>{message.body}</p>
                </article>
              ))}
              {!messages.length && !isLoading && <p className="empty-state">Nenhuma mensagem encontrada.</p>}
            </div>
            {canReply && (
              <form className="contact-reply" onSubmit={reply}>
                <textarea maxLength={1000} onChange={(event) => setReplyText(event.target.value)} placeholder="Escreva sua resposta" required value={replyText} />
                <button className="primary-action" disabled={isSending} type="submit">Responder</button>
              </form>
            )}
            <div className="contact-actions">
              {canClaim && <button onClick={() => void updateThread("claim")} type="button">Assumir conversa</button>}
              {canManageAssignment && responders.length > 0 && selectedThread.status !== "closed" && (
                <>
                  <select aria-label="Transferir para" onChange={(event) => setSelectedResponderId(event.target.value)} value={selectedResponderId}>
                    <option value="">Escolha o responsável</option>
                    {responders.map((responder) => <option key={responder.id} value={responder.id}>{responder.name}</option>)}
                  </select>
                  <button disabled={!selectedResponderId} onClick={() => void updateThread("transfer")} type="button">Transferir</button>
                  <button className="secondary" onClick={() => void updateThread("release")} type="button">Devolver à fila</button>
                </>
              )}
              {selectedThread.status !== "closed" && <button className="secondary" onClick={() => void updateThread("help")} type="button">Solicitar ajuda</button>}
              {selectedThread.status !== "closed" && (selectedThread.senderUserId === currentUserId || selectedThread.assignedUserId === currentUserId || currentRole === "ADMIN") && <button className="danger" onClick={() => void updateThread("close")} type="button">Concluir</button>}
            </div>
          </>
        )}
      </article>
      <p className="status-line" role="status">{statusMessage}</p>
      <p className="contact-retention-note">Conversas concluídas são mantidas por até 90 dias. Mensagens abertas permanecem disponíveis até o encerramento.</p>
    </section>
  );
}
