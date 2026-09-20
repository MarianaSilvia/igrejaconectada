import { NextResponse } from "next/server";

import type { ChurchRole } from "../../permissions";
import { sendPushToRolesByCongregation, sendPushToUser } from "../../push-service";
import {
  auditContact,
  canTriageThread,
  canViewThread,
  type ContactContext,
  contactContext,
  globalAdminIds,
  isRecord,
  type JsonRecord,
  responderOptions,
  setupRequired,
  setupResponse,
  syncDestinations,
  textValue,
} from "./contact-server";

const maxMessageLength = 1000;
const maxSubjectLength = 160;
const threadLimit = 120;

const threadColumns = "id,congregation,sender_user_id,sender_name,destination_id,destination_kind,destination_label,eligible_role,assigned_user_id,assigned_name,subject,status,last_sender_id,last_message_at,last_reminder_at,help_requested_at,created_at,updated_at,closed_at" as const;

function publicThread(thread: JsonRecord, unread = false) {
  return {
    id: textValue(thread.id, 120),
    congregation: textValue(thread.congregation, 120),
    senderUserId: textValue(thread.sender_user_id, 120),
    senderName: textValue(thread.sender_name, 180),
    destinationId: textValue(thread.destination_id, 120),
    destinationKind: textValue(thread.destination_kind, 40),
    destinationLabel: textValue(thread.destination_label, 180),
    eligibleRole: textValue(thread.eligible_role, 40),
    assignedUserId: textValue(thread.assigned_user_id, 120),
    assignedName: textValue(thread.assigned_name, 180),
    subject: textValue(thread.subject, maxSubjectLength),
    status: textValue(thread.status, 40),
    lastSenderId: textValue(thread.last_sender_id, 120),
    lastMessageAt: textValue(thread.last_message_at, 80),
    helpRequestedAt: textValue(thread.help_requested_at, 80),
    createdAt: textValue(thread.created_at, 80),
    updatedAt: textValue(thread.updated_at, 80),
    closedAt: textValue(thread.closed_at, 80),
    unread,
  };
}

function publicDestination(destination: JsonRecord) {
  return {
    id: textValue(destination.id, 120),
    congregation: textValue(destination.congregation, 120),
    kind: textValue(destination.kind, 40),
    label: textValue(destination.label, 180),
    assigned: Boolean(textValue(destination.assignee_user_id, 120)),
    assigneeName: textValue(destination.assignee_name, 180),
  };
}

function publicMessage(message: JsonRecord) {
  return {
    id: textValue(message.id, 120),
    threadId: textValue(message.thread_id, 120),
    authorUserId: textValue(message.author_user_id, 120),
    authorName: textValue(message.author_name, 180),
    authorRole: textValue(message.author_role, 40),
    body: textValue(message.body, maxMessageLength),
    createdAt: textValue(message.created_at, 80),
  };
}

async function findThread(context: ContactContext, threadId: string) {
  const { data, error } = await context.client.from("contact_threads").select(threadColumns).eq("id", threadId).maybeSingle();
  if (error) return { error };
  return { thread: isRecord(data) ? data : null };
}

async function unreadMap(context: ContactContext, threads: JsonRecord[]) {
  if (!threads.length) return new Map<string, boolean>();
  const ids = threads.map((thread) => textValue(thread.id, 120));
  const { data } = await context.client
    .from("contact_thread_reads")
    .select("thread_id,last_read_at")
    .eq("user_id", context.user.id)
    .in("thread_id", ids);
  const readAtByThread = new Map((data ?? []).map((row) => [String(row.thread_id), String(row.last_read_at)]));
  return new Map(threads.map((thread) => {
    const id = textValue(thread.id, 120);
    const readAt = readAtByThread.get(id) ?? "";
    const unread = textValue(thread.last_sender_id, 120) !== context.user.id && textValue(thread.last_message_at, 80) > readAt;
    return [id, unread];
  }));
}

async function markRead(context: ContactContext, threadId: string) {
  return context.client.from("contact_thread_reads").upsert({
    thread_id: threadId,
    user_id: context.user.id,
    last_read_at: new Date().toISOString(),
  }, { onConflict: "thread_id,user_id" });
}

async function rateLimitMessage(context: ContactContext, body: string) {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { data } = await context.client
    .from("contact_messages")
    .select("body,created_at")
    .eq("author_user_id", context.user.id)
    .gte("created_at", oneMinuteAgo)
    .order("created_at", { ascending: false })
    .limit(6);
  const recent = data ?? [];
  if (recent.length >= 5) return "Aguarde um minuto antes de enviar novas mensagens.";
  if (recent.some((message) => textValue(message.body, maxMessageLength) === body)) return "Esta mensagem já foi enviada recentemente.";
  return "";
}

async function notifyNewThread(
  context: ContactContext,
  thread: JsonRecord,
) {
  const assignedUserId = textValue(thread.assigned_user_id, 120);
  const payload = {
    title: "Nova mensagem para a liderança",
    body: `${textValue(thread.sender_name, 180)} enviou uma mensagem para ${textValue(thread.destination_label, 180)}.`,
    module: "contact" as const,
  };
  if (assignedUserId) return sendPushToUser(context.client, assignedUserId, payload);

  const eligibleRole = textValue(thread.eligible_role, 40) as ChurchRole;
  const roles = Array.from(new Set<ChurchRole>([eligibleRole, "SECRETARY"].filter(Boolean) as ChurchRole[]));
  return sendPushToRolesByCongregation(context.client, roles, textValue(thread.congregation, 120), payload);
}

async function notifyReply(
  context: ContactContext,
  thread: JsonRecord,
) {
  const senderId = textValue(thread.sender_user_id, 120);
  const assignedId = textValue(thread.assigned_user_id, 120);
  const targetId = context.user.id === senderId ? assignedId : senderId;
  if (!targetId) return;
  await sendPushToUser(context.client, targetId, {
    title: "Nova resposta",
    body: `Há uma nova resposta em: ${textValue(thread.subject, maxSubjectLength)}.`,
    module: "contact",
  });
}

export async function GET(request: Request) {
  const context = await contactContext(request);
  if ("response" in context) return context.response;

  const requestUrl = new URL(request.url);
  const threadId = textValue(requestUrl.searchParams.get("threadId"), 120);
  const summaryOnly = requestUrl.searchParams.get("summary") === "1";

  let query = context.client
    .from("contact_threads")
    .select(threadColumns)
    .order("last_message_at", { ascending: false })
    .limit(threadLimit);
  if (!context.isGlobalAdmin) query = query.eq("congregation", context.scope);
  const { data, error } = await query;
  if (error) return setupRequired(error) ? setupResponse() : NextResponse.json({ error: "Não foi possível carregar as conversas." }, { status: 400 });

  const visibleThreads = (data ?? []).filter(isRecord).filter((thread) => canViewThread(context, thread));
  const unreadByThread = await unreadMap(context, visibleThreads);
  const unreadCount = [...unreadByThread.values()].filter(Boolean).length;

  if (summaryOnly) return NextResponse.json({ unreadCount });

  const destinationResult = await syncDestinations(context);
  if ("error" in destinationResult && destinationResult.error) {
    return setupRequired(destinationResult.error)
      ? setupResponse()
      : NextResponse.json({ error: "Não foi possível preparar os destinos de atendimento." }, { status: 400 });
  }

  let selectedThread: JsonRecord | undefined;
  let messages: JsonRecord[] = [];
  let responders: Array<{ id: string; name: string; role: ChurchRole }> = [];
  if (threadId) {
    selectedThread = visibleThreads.find((thread) => textValue(thread.id, 120) === threadId);
    if (!selectedThread) return NextResponse.json({ error: "Conversa não encontrada ou sem permissão de acesso." }, { status: 404 });
    const messageResult = await context.client
      .from("contact_messages")
      .select("id,thread_id,author_user_id,author_name,author_role,body,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (messageResult.error) return NextResponse.json({ error: "Não foi possível carregar as mensagens." }, { status: 400 });
    messages = (messageResult.data ?? []).filter(isRecord);
    if (context.isGlobalAdmin || textValue(selectedThread.assigned_user_id, 120) === context.user.id) {
      responders = responderOptions(context, selectedThread);
    }
    await markRead(context, threadId);
  }

  return NextResponse.json({
    currentUserId: context.user.id,
    currentRole: context.role,
    isGlobalAdmin: context.isGlobalAdmin,
    destinations: (destinationResult.destinations ?? []).map((destination) => publicDestination(destination as unknown as JsonRecord)),
    threads: visibleThreads.map((thread) => publicThread(thread, unreadByThread.get(textValue(thread.id, 120)) ?? false)),
    selectedThread: selectedThread ? publicThread(selectedThread, false) : null,
    messages: messages.map(publicMessage),
    responders,
    unreadCount,
    retentionDays: 90,
  });
}

export async function POST(request: Request) {
  const context = await contactContext(request);
  if ("response" in context) return context.response;
  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const action = textValue(body?.action, 30) || "create";
  const messageBody = textValue(body?.body, maxMessageLength);
  if (!messageBody) return NextResponse.json({ error: "Escreva uma mensagem antes de enviar." }, { status: 400 });
  const limited = await rateLimitMessage(context, messageBody);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  if (action === "create") {
    const destinationId = textValue(body?.destinationId, 120);
    const subject = textValue(body?.subject, maxSubjectLength);
    if (!destinationId || !subject) return NextResponse.json({ error: "Escolha a área e informe o assunto." }, { status: 400 });
    const destinationResult = await syncDestinations(context);
    if ("error" in destinationResult && destinationResult.error) return setupRequired(destinationResult.error) ? setupResponse() : NextResponse.json({ error: "Não foi possível conferir o destino." }, { status: 400 });
    const destination = destinationResult.destinations?.find((item) => item.id === destinationId);
    if (!destination) return NextResponse.json({ error: "Esta área não está disponível para o seu acesso." }, { status: 403 });

    const now = new Date().toISOString();
    const threadInsert = await context.client.from("contact_threads").insert({
      congregation: destination.congregation,
      sender_user_id: context.user.id,
      sender_name: context.name,
      destination_id: destination.id,
      destination_kind: destination.kind,
      destination_label: destination.label,
      eligible_role: destination.eligible_role,
      assigned_user_id: destination.assignee_user_id,
      assigned_name: destination.assignee_name,
      subject,
      status: destination.assignee_user_id ? "waiting_leadership" : "unassigned",
      last_sender_id: context.user.id,
      last_message_at: now,
      updated_at: now,
    }).select(threadColumns).single();
    if (threadInsert.error || !isRecord(threadInsert.data)) return setupRequired(threadInsert.error) ? setupResponse() : NextResponse.json({ error: "Não foi possível abrir a conversa." }, { status: 400 });
    const thread = threadInsert.data;
    const messageInsert = await context.client.from("contact_messages").insert({
      thread_id: textValue(thread.id, 120),
      author_user_id: context.user.id,
      author_name: context.name,
      author_role: context.role,
      body: messageBody,
    });
    if (messageInsert.error) {
      await context.client.from("contact_threads").delete().eq("id", textValue(thread.id, 120));
      return NextResponse.json({ error: "Não foi possível enviar a mensagem inicial." }, { status: 400 });
    }
    await markRead(context, textValue(thread.id, 120));
    await auditContact(context.client, thread, "created", context, { destination: destination.label });
    await notifyNewThread(context, thread);
    return NextResponse.json({ thread: publicThread(thread) });
  }

  if (action === "reply") {
    const threadId = textValue(body?.threadId, 120);
    const result = await findThread(context, threadId);
    if (result.error || !result.thread) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    const thread = result.thread;
    if (!canViewThread(context, thread)) return NextResponse.json({ error: "Você não tem acesso a esta conversa." }, { status: 403 });
    const isSender = textValue(thread.sender_user_id, 120) === context.user.id;
    const isAssignee = textValue(thread.assigned_user_id, 120) === context.user.id;
    if (!isSender && !isAssignee) return NextResponse.json({ error: "Assuma ou encaminhe a conversa antes de responder." }, { status: 403 });
    if (textValue(thread.status, 40) === "closed") return NextResponse.json({ error: "Esta conversa já foi concluída." }, { status: 400 });

    const now = new Date().toISOString();
    const messageResult = await context.client.from("contact_messages").insert({
      thread_id: threadId,
      author_user_id: context.user.id,
      author_name: context.name,
      author_role: context.role,
      body: messageBody,
    });
    if (messageResult.error) return NextResponse.json({ error: "Não foi possível enviar a resposta." }, { status: 400 });
    const nextStatus = isSender ? "waiting_leadership" : "waiting_member";
    await context.client.from("contact_threads").update({
      status: nextStatus,
      last_sender_id: context.user.id,
      last_message_at: now,
      last_reminder_at: null,
      updated_at: now,
    }).eq("id", threadId);
    await markRead(context, threadId);
    await notifyReply(context, thread);
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const context = await contactContext(request);
  if ("response" in context) return context.response;
  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const action = textValue(body?.action, 30);
  const threadId = textValue(body?.threadId, 120);
  if (!action || !threadId) return NextResponse.json({ error: "Informe a conversa e a ação." }, { status: 400 });
  const result = await findThread(context, threadId);
  if (result.error || !result.thread) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  const thread = result.thread;
  if (!canViewThread(context, thread)) return NextResponse.json({ error: "Você não tem acesso a esta conversa." }, { status: 403 });
  const now = new Date().toISOString();

  if (action === "read") {
    const { error } = await markRead(context, threadId);
    return error ? NextResponse.json({ error: "Não foi possível marcar como lida." }, { status: 400 }) : NextResponse.json({ ok: true });
  }

  if (action === "claim") {
    if (!canTriageThread(context, thread)) return NextResponse.json({ error: "Esta conversa não está disponível para você assumir." }, { status: 403 });
    const { data, error } = await context.client.from("contact_threads").update({
      assigned_user_id: context.user.id,
      assigned_name: context.name,
      status: "waiting_leadership",
      updated_at: now,
    }).eq("id", threadId).is("assigned_user_id", null).select(threadColumns).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Outra pessoa já assumiu esta conversa. Atualize a lista." }, { status: 409 });
    await auditContact(context.client, data as JsonRecord, "claimed", context);
    return NextResponse.json({ ok: true });
  }

  if (action === "close") {
    const isParticipant = textValue(thread.sender_user_id, 120) === context.user.id || textValue(thread.assigned_user_id, 120) === context.user.id;
    if (!isParticipant && !context.isGlobalAdmin) return NextResponse.json({ error: "Apenas os participantes podem concluir esta conversa." }, { status: 403 });
    const { error } = await context.client.from("contact_threads").update({ status: "closed", closed_at: now, updated_at: now }).eq("id", threadId);
    if (error) return NextResponse.json({ error: "Não foi possível concluir a conversa." }, { status: 400 });
    await auditContact(context.client, thread, "closed", context);
    return NextResponse.json({ ok: true });
  }

  if (action === "transfer") {
    const canTransfer = context.isGlobalAdmin || textValue(thread.assigned_user_id, 120) === context.user.id;
    if (!canTransfer) return NextResponse.json({ error: "Apenas o responsável atual pode transferir a conversa." }, { status: 403 });
    const assignedUserId = textValue(body?.assignedUserId, 120);
    const responder = responderOptions(context, thread).find((item) => item.id === assignedUserId);
    if (!responder) return NextResponse.json({ error: "Escolha um responsável válido desta área." }, { status: 400 });
    const { error } = await context.client.from("contact_threads").update({
      assigned_user_id: responder.id,
      assigned_name: responder.name,
      status: "waiting_leadership",
      last_reminder_at: null,
      updated_at: now,
    }).eq("id", threadId);
    if (error) return NextResponse.json({ error: "Não foi possível transferir a conversa." }, { status: 400 });
    await auditContact(context.client, thread, "transferred", context, { assignedUserId: responder.id, assignedName: responder.name });
    await sendPushToUser(context.client, responder.id, {
      title: "Conversa encaminhada para você",
      body: `${textValue(thread.sender_name, 180)} aguarda sua resposta.`,
      module: "contact",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "release") {
    const canRelease = context.isGlobalAdmin || textValue(thread.assigned_user_id, 120) === context.user.id;
    if (!canRelease) return NextResponse.json({ error: "Apenas o responsável atual pode devolver a conversa para a fila." }, { status: 403 });
    const { error } = await context.client.from("contact_threads").update({
      assigned_user_id: null,
      assigned_name: "",
      status: "unassigned",
      last_reminder_at: null,
      updated_at: now,
    }).eq("id", threadId);
    if (error) return NextResponse.json({ error: "Não foi possível devolver a conversa para a secretaria." }, { status: 400 });
    await auditContact(context.client, thread, "released", context);
    return NextResponse.json({ ok: true });
  }

  if (action === "help") {
    const note = textValue(body?.note, 300);
    const { error } = await context.client.from("contact_threads").update({ help_requested_at: now, help_note: note, updated_at: now }).eq("id", threadId);
    if (error) return NextResponse.json({ error: "Não foi possível solicitar ajuda." }, { status: 400 });
    await auditContact(context.client, thread, "help_requested", context, { note });
    for (const adminId of globalAdminIds(context)) {
      await sendPushToUser(context.client, adminId, {
        title: "Ajuda solicitada em uma conversa",
        body: `Revise a conversa de ${textValue(thread.sender_name, 180)}.`,
        module: "contact",
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
