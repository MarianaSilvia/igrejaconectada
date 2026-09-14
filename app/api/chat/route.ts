import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  congregationMatchesScope,
  congregationOptions,
  globalCongregationScope,
  normalizeCongregationScope,
} from "../../congregation-scope";
import type { ChurchRole } from "../../permissions";
import { adminClient, requireSession } from "../admin/auth";

type JsonRecord = Record<string, unknown>;

const messageLimit = 80;
const maxMessageLength = 1000;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function userEmail(value: unknown) {
  return textValue(value, 220).toLowerCase();
}

async function readAppPayload(client: SupabaseClient) {
  const { data, error } = await client.from("church_app_state").select("payload").eq("id", "main").maybeSingle();
  if (error) return {};
  return isRecord(data?.payload) ? data.payload : {};
}

function findAccessUser(payload: JsonRecord, email: string) {
  return recordsFrom(payload.users).find((user) => userEmail(user.email) === email);
}

function findMemberForUser(payload: JsonRecord, userId: string, email: string) {
  return recordsFrom(payload.members).find((member) => {
    const authUserId = textValue(member.authUserId, 120);
    const memberEmail = userEmail(member.email);
    return Boolean((authUserId && authUserId === userId) || (memberEmail && memberEmail === email));
  });
}

function displayName(payload: JsonRecord, email: string, fallback: string) {
  const accessUser = findAccessUser(payload, email);
  if (accessUser) return textValue(accessUser.name, 180) || fallback;

  const member = recordsFrom(payload.members).find((item) => userEmail(item.email) === email);
  return textValue(member?.fullName, 180) || fallback;
}

function roleCanModerate(role: ChurchRole) {
  return role === "ADMIN" || role === "LEADER" || role === "SECRETARY";
}

function setupRequired(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /chat_rooms|chat_messages|chat_moderation|schema cache|relation .* does not exist/i.test(message);
}

async function chatContext(request: Request) {
  const session = await requireSession(request);
  if (session.response || !session.user) return { response: session.response };

  const client = adminClient();
  if (!client) return { response: NextResponse.json({ error: "Supabase administrativo não configurado." }, { status: 503 }) };

  const payload = await readAppPayload(client);
  const email = userEmail(session.user.email);
  const accessUser = findAccessUser(payload, email);
  const member = findMemberForUser(payload, session.user.id, email);
  const metadataScope = session.user.app_metadata?.church_gp_congregation_scope ?? session.user.app_metadata?.congregation_scope;
  const accessScope = normalizeCongregationScope(accessUser?.congregationScope ?? metadataScope);
  const memberScope = normalizeCongregationScope(member?.congregation);
  const scope = session.role === "ADMIN"
    ? accessScope
    : accessScope === globalCongregationScope
      ? memberScope
      : accessScope;

  if (session.role !== "ADMIN" && scope === globalCongregationScope) {
    return {
      response: NextResponse.json(
        { error: "Este acesso ainda não tem congregação vinculada para usar o chat." },
        { status: 403 },
      ),
    };
  }

  return {
    client,
    user: session.user,
    role: session.role,
    payload,
    email,
    scope,
    name: displayName(payload, email, session.user.email ?? "Usuário"),
    canModerate: roleCanModerate(session.role),
  };
}

function roomRowsForScope(scope: string) {
  const congregations = scope === globalCongregationScope ? [...congregationOptions] : [scope];
  return congregations.map((congregation) => ({
    congregation,
    title: `Chat ${congregation}`,
    kind: "congregation",
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
}

async function ensureRooms(client: SupabaseClient, scope: string) {
  const { error } = await client
    .from("chat_rooms")
    .upsert(roomRowsForScope(scope), { onConflict: "congregation,kind" });

  if (error) return { error };
  return {};
}

async function accessibleRooms(client: SupabaseClient, scope: string) {
  let query = client
    .from("chat_rooms")
    .select("id,title,congregation,kind,is_active,created_at,updated_at")
    .eq("is_active", true)
    .order("congregation", { ascending: true });

  if (scope !== globalCongregationScope) {
    query = query.eq("congregation", scope);
  }

  const { data, error } = await query;
  if (error) return { error };

  return { rooms: (data ?? []).filter((room) => congregationMatchesScope(room.congregation, scope)) };
}

async function accessibleRoom(client: SupabaseClient, scope: string, roomId: string) {
  const { rooms, error } = await accessibleRooms(client, scope);
  if (error) return { error };
  return { room: rooms?.find((room) => textValue(room.id, 120) === roomId) };
}

export async function GET(request: Request) {
  const context = await chatContext(request);
  if ("response" in context && context.response) return context.response;

  const ensureResult = await ensureRooms(context.client, context.scope);
  if ("error" in ensureResult && ensureResult.error) {
    if (setupRequired(ensureResult.error)) {
      return NextResponse.json({
        setupRequired: true,
        rooms: [],
        messages: [],
        message: "Chat ainda precisa das tabelas Supabase. Execute db/supabase-chat.sql antes de liberar para os membros.",
      });
    }
    return NextResponse.json({ error: "Não foi possível preparar as salas do chat." }, { status: 400 });
  }

  const roomsResult = await accessibleRooms(context.client, context.scope);
  if ("error" in roomsResult && roomsResult.error) {
    if (setupRequired(roomsResult.error)) {
      return NextResponse.json({
        setupRequired: true,
        rooms: [],
        messages: [],
        message: "Chat ainda precisa das tabelas Supabase. Execute db/supabase-chat.sql antes de liberar para os membros.",
      });
    }
    return NextResponse.json({ error: "Não foi possível carregar as salas do chat." }, { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const requestedRoomId = textValue(requestUrl.searchParams.get("roomId"), 120);
  const selectedRoom = roomsResult.rooms?.find((room) => textValue(room.id, 120) === requestedRoomId) ?? roomsResult.rooms?.[0];

  if (!selectedRoom) {
    return NextResponse.json({ rooms: [], messages: [], retentionDays: 90, canModerate: context.canModerate });
  }

  let query = context.client
    .from("chat_messages")
    .select("id,room_id,congregation,user_id,author_name,author_role,body,status,report_count,created_at,hidden_at")
    .eq("room_id", selectedRoom.id)
    .order("created_at", { ascending: false })
    .limit(messageLimit);

  if (!context.canModerate) query = query.eq("status", "visible");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens do chat." }, { status: 400 });

  return NextResponse.json({
    rooms: roomsResult.rooms,
    selectedRoomId: selectedRoom.id,
    messages: (data ?? []).reverse(),
    retentionDays: 90,
    canModerate: context.canModerate,
    currentUserId: context.user.id,
  });
}

export async function POST(request: Request) {
  const context = await chatContext(request);
  if ("response" in context && context.response) return context.response;

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const roomId = textValue(body?.roomId, 120);
  const message = textValue(body?.body, maxMessageLength);

  if (!roomId || !message) {
    return NextResponse.json({ error: "Escolha uma sala e escreva uma mensagem." }, { status: 400 });
  }

  const roomResult = await accessibleRoom(context.client, context.scope, roomId);
  if ("error" in roomResult && roomResult.error) {
    return NextResponse.json({ error: "Não foi possível conferir a sala do chat." }, { status: 400 });
  }

  if (!roomResult.room) {
    return NextResponse.json({ error: "Você não tem permissão para enviar mensagem nesta congregação." }, { status: 403 });
  }

  const { data, error } = await context.client
    .from("chat_messages")
    .insert({
      room_id: roomResult.room.id,
      congregation: roomResult.room.congregation,
      user_id: context.user.id,
      author_name: context.name,
      author_role: context.role,
      body: message,
      status: "visible",
    })
    .select("id,room_id,congregation,user_id,author_name,author_role,body,status,report_count,created_at,hidden_at")
    .single();

  if (error) {
    if (setupRequired(error)) return NextResponse.json({ error: "Chat ainda precisa das tabelas Supabase." }, { status: 503 });
    return NextResponse.json({ error: "Não foi possível enviar a mensagem." }, { status: 400 });
  }

  return NextResponse.json({ message: data });
}

export async function PATCH(request: Request) {
  const context = await chatContext(request);
  if ("response" in context && context.response) return context.response;

  const body = (await request.json().catch(() => null)) as JsonRecord | null;
  const action = textValue(body?.action, 40);
  const messageId = textValue(body?.messageId, 120);
  const note = textValue(body?.note, 300);

  if (!messageId || !["report", "hide"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida para o chat." }, { status: 400 });
  }

  const { data: message, error: messageError } = await context.client
    .from("chat_messages")
    .select("id,room_id,congregation,report_count,status")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError || !message) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });
  if (!congregationMatchesScope(message.congregation, context.scope)) {
    return NextResponse.json({ error: "Você não tem permissão para alterar mensagem desta congregação." }, { status: 403 });
  }

  if (action === "hide" && !context.canModerate) {
    return NextResponse.json({ error: "Apenas liderança pode ocultar mensagens." }, { status: 403 });
  }

  const updates = action === "hide"
    ? { status: "hidden", hidden_by: context.user.id, hidden_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { report_count: Number(message.report_count ?? 0) + 1, updated_at: new Date().toISOString() };

  const { error } = await context.client.from("chat_messages").update(updates).eq("id", messageId);
  if (error) return NextResponse.json({ error: "Não foi possível atualizar a mensagem." }, { status: 400 });

  await context.client.from("chat_moderation").insert({
    message_id: messageId,
    room_id: message.room_id,
    congregation: message.congregation,
    action,
    actor_id: context.user.id,
    actor_email: context.email,
    note,
  });

  return NextResponse.json({ ok: true });
}
