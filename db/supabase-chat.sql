-- Chat por congregacao do Igreja Conectada.
-- Execute depois de baixar backup pelo painel do sistema.
-- O app usa APIs server-side com service_role; estas politicas protegem leituras Realtime/Data API.

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  congregation text not null,
  kind text not null default 'congregation',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (congregation, kind)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  congregation text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_role text not null,
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  report_count integer not null default 0,
  hidden_by uuid references auth.users(id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_moderation (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages(id) on delete set null,
  room_id uuid references public.chat_rooms(id) on delete set null,
  congregation text,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.chat_rooms (title, congregation, kind, is_active)
values
  ('Chat sede/Farroupilha', 'sede/Farroupilha', 'congregation', true),
  ('Chat Congre.Maringá', 'Congre.Maringá', 'congregation', true),
  ('Chat Congre.Pains', 'Congre.Pains', 'congregation', true)
on conflict (congregation, kind) do update
set title = excluded.title,
    is_active = true,
    updated_at = now();

create index if not exists idx_chat_rooms_congregation
  on public.chat_rooms (congregation, kind)
  where is_active = true;

create index if not exists idx_chat_messages_room_created
  on public.chat_messages (room_id, created_at desc);

create index if not exists idx_chat_messages_retention
  on public.chat_messages (created_at);

create index if not exists idx_chat_messages_congregation_created
  on public.chat_messages (congregation, created_at desc);

alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_moderation enable row level security;

grant select on public.chat_rooms to authenticated;
grant select on public.chat_messages to authenticated;
grant select on public.chat_moderation to authenticated;

drop policy if exists "chat rooms visible by congregation" on public.chat_rooms;
create policy "chat rooms visible by congregation"
on public.chat_rooms
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'church_gp_role', '') = 'ADMIN'
  or congregation = coalesce(auth.jwt() -> 'app_metadata' ->> 'church_gp_congregation_scope', '')
  or exists (
    select 1
    from public.members m
    where m.auth_user_id = (select auth.uid())
      and m.congregation = chat_rooms.congregation
  )
);

drop policy if exists "chat messages visible by congregation" on public.chat_messages;
create policy "chat messages visible by congregation"
on public.chat_messages
for select
to authenticated
using (
  status = 'visible'
  and (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'church_gp_role', '') = 'ADMIN'
    or congregation = coalesce(auth.jwt() -> 'app_metadata' ->> 'church_gp_congregation_scope', '')
    or exists (
      select 1
      from public.members m
      where m.auth_user_id = (select auth.uid())
        and m.congregation = chat_messages.congregation
    )
  )
);

drop policy if exists "chat moderation visible to admins" on public.chat_moderation;
create policy "chat moderation visible to admins"
on public.chat_moderation
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'church_gp_role', '') = 'ADMIN'
  or congregation = coalesce(auth.jwt() -> 'app_metadata' ->> 'church_gp_congregation_scope', '')
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Limpeza manual alternativa, caso nao use Vercel Cron:
-- delete from public.chat_messages where created_at < now() - interval '90 days';
--
-- Se pg_cron estiver habilitado no seu projeto Supabase, voce pode agendar direto no banco:
-- select cron.schedule(
--   'limpar-chat-igreja-conectada',
--   '0 3 * * *',
--   $$delete from public.chat_messages where created_at < now() - interval '90 days'$$
-- );
