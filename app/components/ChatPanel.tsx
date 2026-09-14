"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseClient, isSupabaseConfigured } from "../supabase-client";

type ChatRoom = {
  id: string;
  title: string;
  congregation: string;
  kind: string;
  is_active: boolean;
};

type ChatMessage = {
  id: string;
  room_id: string;
  congregation: string;
  user_id: string;
  author_name: string;
  author_role: string;
  body: string;
  status: "visible" | "hidden";
  report_count: number;
  created_at: string;
  hidden_at?: string | null;
};

type ChatResponse = {
  setupRequired?: boolean;
  rooms?: ChatRoom[];
  selectedRoomId?: string;
  messages?: ChatMessage[];
  retentionDays?: number;
  canModerate?: boolean;
  currentUserId?: string;
  message?: string;
  error?: string;
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

export function ChatPanel() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [statusMessage, setStatusMessage] = useState("Carregando chat...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [canModerate, setCanModerate] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
  );

  const loadChat = useCallback(async (roomId = selectedRoomId, options?: { quiet?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      setStatusMessage("Chat precisa do Supabase ativo para funcionar.");
      return;
    }

    if (!options?.quiet) setIsLoading(true);
    const token = await currentToken();
    if (!token) {
      setIsLoading(false);
      setStatusMessage("Entre novamente para carregar o chat.");
      return;
    }

    const url = roomId ? `/api/chat?roomId=${encodeURIComponent(roomId)}` : "/api/chat";
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const result = (await response.json().catch(() => ({}))) as ChatResponse;

    if (result.setupRequired) {
      setSetupRequired(true);
      setRooms([]);
      setMessages([]);
      setStatusMessage(result.message ?? "Chat aguardando configuração no Supabase.");
      setIsLoading(false);
      return;
    }

    if (!response.ok) {
      setStatusMessage(result.error ?? "Não foi possível carregar o chat.");
      setIsLoading(false);
      return;
    }

    setSetupRequired(false);
    setRooms(result.rooms ?? []);
    setMessages(result.messages ?? []);
    setRetentionDays(result.retentionDays ?? 90);
    setCanModerate(Boolean(result.canModerate));
    setCurrentUserId(result.currentUserId ?? "");
    setSelectedRoomId(result.selectedRoomId ?? result.rooms?.[0]?.id ?? "");
    setStatusMessage((result.rooms?.length ?? 0) ? "Chat atualizado." : "Nenhuma sala disponível para este acesso.");
    setIsLoading(false);
  }, [selectedRoomId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChat("");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadChat]);

  useEffect(() => {
    if (!selectedRoomId || setupRequired) return;

    const supabase = getSupabaseClient();
    const pollTimer = window.setInterval(() => {
      void loadChat(selectedRoomId, { quiet: true });
    }, 15000);

    if (!supabase) {
      return () => window.clearInterval(pollTimer);
    }

    const channel = supabase
      .channel(`chat-room-${selectedRoomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${selectedRoomId}` },
        () => {
          void loadChat(selectedRoomId, { quiet: true });
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadChat, selectedRoomId, setupRequired]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageText.trim();
    if (!selectedRoom || !body || isSending) return;

    setIsSending(true);
    const token = await currentToken();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId: selectedRoom.id, body }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setStatusMessage(result.error ?? "Não foi possível enviar a mensagem.");
      setIsSending(false);
      return;
    }

    setMessageText("");
    setStatusMessage("Mensagem enviada.");
    setIsSending(false);
    await loadChat(selectedRoom.id, { quiet: true });
  }

  async function updateMessage(messageId: string, action: "report" | "hide") {
    const token = await currentToken();
    const response = await fetch("/api/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messageId, action }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setStatusMessage(response.ok ? (action === "hide" ? "Mensagem ocultada." : "Mensagem denunciada para a liderança.") : result.error ?? "Não foi possível atualizar a mensagem.");
    await loadChat(selectedRoom?.id ?? "", { quiet: true });
  }

  return (
    <section className="content-grid chat-layout">
      <article className="surface chat-info-card">
        <div className="panel-heading">
          <div>
            <h2>Chat da congregação</h2>
            <span>Conversas leves, separadas por congregação.</span>
          </div>
        </div>
        <p>
          As mensagens ficam disponíveis por até <strong>{retentionDays} dias</strong>. Depois disso, o histórico antigo é removido automaticamente para manter o sistema leve e preservar a privacidade.
        </p>
        <small>Use o chat para avisos rápidos e comunhão. Informações oficiais continuam nos módulos Agenda, Mural, Pastoral e Comunicados.</small>
      </article>

      <article className="surface wide chat-panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedRoom?.title ?? "Chat"}</h2>
            <span>{selectedRoom?.congregation ?? "Selecione uma sala"}</span>
          </div>
          <button className="secondary" disabled={isLoading} onClick={() => loadChat(selectedRoom?.id ?? "")} type="button">
            Atualizar
          </button>
        </div>

        {setupRequired ? (
          <div className="empty-state chat-setup-warning">
            <strong>Chat aguardando preparação no Supabase</strong>
            <span>{statusMessage}</span>
          </div>
        ) : (
          <>
            {rooms.length > 1 && (
              <label className="field-label">
                Congregação
                <select onChange={(event) => void loadChat(event.target.value)} value={selectedRoom?.id ?? ""}>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="chat-messages" aria-live="polite">
              {messages.map((message) => (
                <div
                  className={[
                    "chat-message",
                    message.user_id === currentUserId ? "mine" : "",
                    message.status === "hidden" ? "hidden" : "",
                  ].filter(Boolean).join(" ")}
                  key={message.id}
                >
                  <div className="chat-message-meta">
                    <strong>{message.author_name}</strong>
                    <span>{formatDateTime(message.created_at)}</span>
                  </div>
                  <p>{message.status === "hidden" ? "Mensagem ocultada pela liderança." : message.body}</p>
                  <div className="chat-message-actions">
                    {message.report_count > 0 && <span>{message.report_count} denúncia(s)</span>}
                    {message.status === "visible" && (
                      <button className="link-button" onClick={() => updateMessage(message.id, "report")} type="button">
                        Denunciar
                      </button>
                    )}
                    {canModerate && message.status === "visible" && (
                      <button className="link-button danger" onClick={() => updateMessage(message.id, "hide")} type="button">
                        Ocultar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!messages.length && <p className="empty-state">Nenhuma mensagem nesta sala ainda.</p>}
            </div>

            <form className="chat-composer" onSubmit={submitMessage}>
              <textarea
                maxLength={1000}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Escreva uma mensagem para sua congregação..."
                value={messageText}
              />
              <div>
                <small>{messageText.trim().length}/1000 caracteres</small>
                <button disabled={!messageText.trim() || !selectedRoom || isSending} type="submit">
                  {isSending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </form>
          </>
        )}

        <p className="form-message">{statusMessage}</p>
      </article>
    </section>
  );
}
