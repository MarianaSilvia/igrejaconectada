-- Canal privado "Fale com a lideranca".
-- Execute depois de baixar o backup e antes de publicar a nova interface.

create table if not exists public.contact_destinations (
  id uuid primary key default gen_random_uuid(),
  congregation text not null,
  kind text not null check (kind in ('secretary', 'leadership', 'group', 'school', 'discipleship')),
  scope_record_id text not null default '',
  label text not null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_name text not null default '',
  eligible_role text not null check (eligible_role in ('ADMIN', 'LEADER', 'PROFESSOR', 'SECRETARY')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (congregation, kind, scope_record_id)
);

create table if not exists public.contact_threads (
  id uuid primary key default gen_random_uuid(),
  congregation text not null,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  sender_name text not null,
  destination_id uuid references public.contact_destinations(id) on delete restrict,
  destination_kind text not null,
  destination_label text not null,
  eligible_role text not null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_name text not null default '',
  subject text not null check (char_length(subject) between 1 and 160),
  status text not null default 'unassigned' check (status in ('unassigned', 'waiting_leadership', 'waiting_member', 'closed')),
  last_sender_id uuid references auth.users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_reminder_at timestamptz,
  help_requested_at timestamptz,
  help_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.contact_threads(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null,
  author_role text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.contact_thread_reads (
  thread_id uuid not null references public.contact_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.contact_audit (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.contact_threads(id) on delete set null,
  congregation text,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contact_destinations_scope_idx on public.contact_destinations (congregation, kind) where is_active = true;
create index if not exists contact_destinations_assignee_idx on public.contact_destinations (assignee_user_id);
create index if not exists contact_threads_sender_idx on public.contact_threads (sender_user_id, last_message_at desc);
create index if not exists contact_threads_assignee_idx on public.contact_threads (assigned_user_id, last_message_at desc);
create index if not exists contact_threads_destination_idx on public.contact_threads (destination_id);
create index if not exists contact_threads_last_sender_idx on public.contact_threads (last_sender_id);
create index if not exists contact_threads_queue_idx on public.contact_threads (congregation, status, eligible_role, last_message_at desc);
create index if not exists contact_threads_retention_idx on public.contact_threads (closed_at) where status = 'closed';
create index if not exists contact_messages_thread_idx on public.contact_messages (thread_id, created_at);
create index if not exists contact_messages_author_idx on public.contact_messages (author_user_id, created_at desc);
create index if not exists contact_audit_thread_idx on public.contact_audit (thread_id, created_at desc);
create index if not exists contact_audit_actor_idx on public.contact_audit (actor_id);
create index if not exists contact_thread_reads_user_idx on public.contact_thread_reads (user_id);

alter table public.contact_destinations enable row level security;
alter table public.contact_threads enable row level security;
alter table public.contact_messages enable row level security;
alter table public.contact_thread_reads enable row level security;
alter table public.contact_audit enable row level security;

revoke all on public.contact_destinations from anon, authenticated;
revoke all on public.contact_threads from anon, authenticated;
revoke all on public.contact_messages from anon, authenticated;
revoke all on public.contact_thread_reads from anon, authenticated;
revoke all on public.contact_audit from anon, authenticated;
grant select on public.contact_destinations, public.contact_threads, public.contact_messages to authenticated;

drop policy if exists "contact reads server only" on public.contact_thread_reads;
create policy "contact reads server only" on public.contact_thread_reads
as restrictive for all to authenticated using (false) with check (false);

drop policy if exists "contact audit server only" on public.contact_audit;
create policy "contact audit server only" on public.contact_audit
as restrictive for all to authenticated using (false) with check (false);

drop policy if exists "contact destinations visible by congregation" on public.contact_destinations;
create policy "contact destinations visible by congregation"
on public.contact_destinations for select to authenticated
using (
  (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role', '') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope', '') = 'Todas'
  )
  or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope', '')
  or exists (
    select 1 from public.members m
    where m.auth_user_id = (select auth.uid())
      and m.congregation = contact_destinations.congregation
  )
);

drop policy if exists "contact threads private participants" on public.contact_threads;
create policy "contact threads private participants"
on public.contact_threads for select to authenticated
using (
  sender_user_id = (select auth.uid())
  or assigned_user_id = (select auth.uid())
  or (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role', '') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope', '') = 'Todas'
  )
);

drop policy if exists "contact messages private participants" on public.contact_messages;
create policy "contact messages private participants"
on public.contact_messages for select to authenticated
using (
  exists (
    select 1 from public.contact_threads thread
    where thread.id = contact_messages.thread_id
      and (
        thread.sender_user_id = (select auth.uid())
        or thread.assigned_user_id = (select auth.uid())
        or (
          coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role', '') = 'ADMIN'
          and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope', '') = 'Todas'
        )
      )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_threads'
  ) then
    alter publication supabase_realtime add table public.contact_threads;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_messages'
  ) then
    alter publication supabase_realtime add table public.contact_messages;
  end if;
end $$;

comment on table public.contact_threads is 'Conversas privadas entre membros e a lideranca, separadas por congregacao.';
comment on table public.contact_messages is 'Mensagens privadas; removidas por cascata 90 dias apos a conclusao da conversa.';
