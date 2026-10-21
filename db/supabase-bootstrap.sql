-- Igreja Conectada: bootstrap minimo para um projeto Supabase novo.
-- Execute no SQL Editor do projeto novo antes do primeiro deploy.
-- O app acessa estas tabelas somente por rotas server-side com service role.
-- Nao cole chaves ou dados reais neste arquivo.

create extension if not exists pgcrypto;

create table if not exists public.church_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id text primary key,
  registration_number text not null default '',
  full_name text not null,
  photo_url text,
  status text not null default '',
  congregation text not null default '',
  water_baptism_date text not null default '',
  ministerial_role text not null default '',
  birth_date text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  assigned_ministries text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  cpf text not null default '',
  marital_status text not null default '',
  spouse_name text not null default '',
  auth_user_id uuid references auth.users(id) on delete set null,
  father_name text not null default '',
  mother_name text not null default '',
  age_group text not null default '',
  age text not null default '',
  gender text not null default '',
  member_type text not null default '',
  categories text not null default '',
  ministry text not null default '',
  school_class_id text not null default '',
  discipleship_class_id text not null default '',
  zip_code text not null default '',
  city text not null default '',
  neighborhood text not null default '',
  education text not null default '',
  previous_church text not null default '',
  conversion_date text not null default '',
  baptism_date text not null default '',
  registration_source text not null default '',
  pastoral_status text not null default '',
  member_visible_notes text not null default '',
  water_baptized boolean not null default false,
  holy_spirit_baptized boolean not null default false,
  joined_at text not null default '',
  updated_at timestamptz not null default now(),
  cpf_digits text not null default '',
  phone_digits text not null default '',
  app_payload jsonb not null default '{}'::jsonb,
  mirror_source text not null default 'church_app_state'
);

create index if not exists members_congregation_idx on public.members (congregation);
create index if not exists members_email_idx on public.members (lower(email));
create index if not exists members_auth_user_idx on public.members (auth_user_id);

create table if not exists public.registration_requests (
  id text primary key,
  congregation text not null default '',
  full_name text not null,
  father_name text not null default '',
  mother_name text not null default '',
  cpf text not null default '',
  cpf_digits text not null default '',
  phone text not null,
  phone_digits text not null default '',
  email text not null default '',
  birth_date text not null default '',
  gender text not null default '',
  address text not null default '',
  zip_code text not null default '',
  city text not null default '',
  neighborhood text not null default '',
  marital_status text not null default 'Solteiro(a)',
  education text not null default '',
  spouse_name text not null default '',
  requested_status text not null default 'Visitante',
  registration_source text not null default 'Cadastro via link WhatsApp',
  notes text not null default '',
  status text not null default 'Aguardando aprovacao',
  reviewed_at timestamptz,
  review_note text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  privacy_consent boolean not null default false,
  privacy_consent_at timestamptz,
  privacy_policy_version text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists registration_requests_status_idx on public.registration_requests (status, created_at desc);
create index if not exists registration_requests_congregation_idx on public.registration_requests (congregation, created_at desc);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null default '',
  church_role text not null default '',
  congregation_scope text not null default 'Todas',
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text not null default '',
  enabled boolean not null default true,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, enabled);
create index if not exists push_subscriptions_scope_idx on public.push_subscriptions (church_role, congregation_scope) where enabled = true;

create table if not exists public.kids_profiles (
  id text primary key,
  child_name text not null,
  birth_date text,
  age_group text not null,
  class_name text,
  photo_url text,
  allergies text,
  notes text,
  guardian_name text not null,
  guardian_phone text not null,
  guardian_email text,
  relationship text,
  authorized_pickup text,
  consent_image boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id text primary key,
  label text not null,
  audience text,
  body text not null,
  is_birthday boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.message_campaigns (
  id text primary key,
  title text not null default '',
  audience text not null,
  body text not null,
  channel text not null default 'whatsapp_manual',
  status text not null default 'prepared',
  recipient_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_recipients (
  id text primary key,
  campaign_id text not null references public.message_campaigns(id) on delete cascade,
  recipient_type text not null default 'member',
  recipient_id text not null default '',
  recipient_name text not null,
  phone text not null,
  whatsapp_url text not null,
  send_status text not null default 'opened',
  created_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','verified','completed','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  notes text not null default ''
);

-- Defesa em profundidade: o app usa service_role no servidor e nao expoe estas tabelas diretamente.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'church_app_state','members','registration_requests','push_subscriptions',
    'kids_profiles','message_templates','message_campaigns','message_recipients',
    'account_deletion_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('member-photos', 'member-photos', false, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;
