-- Preparacao Supabase para separacao por congregacao.
-- Execute somente depois de baixar backup pelo painel do sistema.

alter table public.registration_requests
  add column if not exists congregation text not null default '';

alter table public.push_subscriptions
  add column if not exists congregation_scope text not null default 'Todas';

create index if not exists idx_registration_requests_congregation_status
  on public.registration_requests (congregation, status, created_at desc);

create index if not exists idx_push_subscriptions_role_congregation
  on public.push_subscriptions (church_role, congregation_scope)
  where enabled = true;
