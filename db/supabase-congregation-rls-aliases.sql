-- Congregation aliases and RLS hardening applied in production.
-- Supabase migrations:
--   20261015210309_normalize_congregation_key
--   20261016013113_normalize_congregation_rls_aliases
--   20261016013141_restrict_members_update_policy_command
--   20261016013321_harden_congregation_key_and_rls_initplan

create or replace function public.congregation_key(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case regexp_replace(
    translate(lower(coalesce(value, '')),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]', '', 'g')
    when 'todas' then 'todas'
    when 'sede' then 'sedefarroupilha'
    when 'farroupilha' then 'sedefarroupilha'
    when 'sedefarroupilha' then 'sedefarroupilha'
    when 'maringa' then 'congremaringa'
    when 'congremaringa' then 'congremaringa'
    when 'pains' then 'congrepains'
    when 'congrepains' then 'congrepains'
    else regexp_replace(
      translate(lower(coalesce(value, '')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]', '', 'g')
  end;
$$;

-- The production policies compare normalized keys so legacy values such as
-- "Maringá" continue to match "Congre.Maringá" without rewriting records.
-- Full policy DDL remains in Supabase migration history.
