begin;

create table if not exists public.church_app_state_backups (
  id bigint generated always as identity primary key,
  state_id text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.church_app_state_backups enable row level security;
revoke all on public.church_app_state_backups from anon, authenticated;
create policy "server only state backups" on public.church_app_state_backups
as restrictive for all to authenticated using (false) with check (false);
insert into public.church_app_state_backups (state_id, payload, source_updated_at, reason)
select id, payload, updated_at, 'Antes das correções de segurança e preparação mobile'
from public.church_app_state
where id = 'main';

alter table public.registration_requests add column if not exists privacy_consent boolean not null default false;
alter table public.registration_requests add column if not exists privacy_consent_at timestamptz;
alter table public.registration_requests add column if not exists privacy_policy_version text not null default '';

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'verified', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  notes text not null default ''
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
create policy "server only deletion requests" on public.account_deletion_requests
as restrictive for all to authenticated using (false) with check (false);
create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests (status, requested_at desc);
create index if not exists account_deletion_requests_reviewed_by_idx on public.account_deletion_requests (reviewed_by);

drop policy if exists "server only push subscriptions" on public.push_subscriptions;
create policy "server only push subscriptions" on public.push_subscriptions
as restrictive for all to authenticated using (false) with check (false);
revoke all on public.push_subscriptions from anon, authenticated;

drop policy if exists "gp_members_select" on public.members;
create policy "gp_members_select" on public.members for select to authenticated using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access'), '') = 'approved'
  and (
    auth_user_id = (select auth.uid())
    or (
      coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role'), '') in ('ADMIN', 'LEADER', 'PROFESSOR', 'SECRETARY')
      and (
        coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role'), '') = 'ADMIN'
        and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope'), 'Todas') = 'Todas'
        or congregation = coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope'), '')
      )
    )
  )
);

drop policy if exists "gp_church_events_select" on public.church_events;
create policy "gp_church_events_select" on public.church_events for select to authenticated using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access'), '') = 'approved'
  and (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role'), '') = 'ADMIN'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope'), 'Todas') = 'Todas'
    or congregation = coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope'), '')
  )
);

update storage.buckets
set public = false,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'member-photos';

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'church-gp-assets';

alter policy "gp_devotionals_insert" on public.devotionals
with check (((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access') = 'approved' and ((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_discipleship_classes_insert" on public.discipleship_classes
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_discipleship_classes_update" on public.discipleship_classes
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_discipleship_enrollments_insert" on public.discipleship_enrollments
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_discipleship_enrollments_update" on public.discipleship_enrollments
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_discipleship_lessons_insert" on public.discipleship_lessons
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_discipleship_lessons_update" on public.discipleship_lessons
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','PROFESSOR'));
alter policy "gp_ebd_attendance_delete" on public.ebd_attendance
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'));
alter policy "gp_ebd_attendance_insert" on public.ebd_attendance
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'));
alter policy "gp_ebd_attendance_update" on public.ebd_attendance
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'));
alter policy "gp_ebd_classes_insert" on public.ebd_classes
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'));
alter policy "gp_ebd_classes_update" on public.ebd_classes
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved' and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','PROFESSOR'));

-- Escritas nas tabelas normalizadas respeitam o escopo de congregacao do JWT.
alter policy "gp_members_insert" on public.members
with check (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
);
alter policy "gp_members_update" on public.members
using (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
)
with check (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
);
alter policy "gp_members_delete" on public.members
using (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
);

alter policy "gp_church_events_insert" on public.church_events
with check (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
);
alter policy "gp_church_events_update" on public.church_events
using (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
)
with check (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
);
alter policy "gp_church_events_delete" on public.church_events
using (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_access','') = 'approved'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') in ('ADMIN','LEADER','SECRETARY')
  and ((coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_role','') = 'ADMIN'
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope','Todas') = 'Todas')
    or congregation = coalesce((select auth.jwt()) -> 'app_metadata' ->> 'church_gp_congregation_scope',''))
);

commit;
