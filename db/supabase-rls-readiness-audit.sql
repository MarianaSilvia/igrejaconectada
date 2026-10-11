-- Auditoria somente leitura para seguranca, RLS e normalizacao.
-- Nao altera tabelas, politicas, storage ou usuarios.
-- Use no Supabase SQL Editor antes de qualquer migracao real.
-- Revise os resultados com calma e nao compartilhe saidas com dados sensiveis.

-- 1) Tabelas expostas no schema public sem RLS habilitado.
select
  'public_tables_without_rls' as check_name,
  n.nspname as schema_name,
  c.relname as object_name,
  case
    when c.relrowsecurity then 'OK'
    else 'REVISAR: RLS desativado'
  end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname not like 'pg_%'
  and not c.relrowsecurity
order by c.relname;

-- 2) Politicas que ainda usam auth.role().
-- Recomendacao atual: usar TO anon/authenticated e predicados de autorizacao.
select
  'policies_using_auth_role' as check_name,
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where coalesce(qual, '') ilike '%auth.role()%'
   or coalesce(with_check, '') ilike '%auth.role()%'
order by schemaname, tablename, policyname;

-- 3) Politicas muito amplas para usuarios autenticados.
-- Esta consulta aponta candidatos para revisao manual, nao necessariamente erros.
select
  'broad_authenticated_policies' as check_name,
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where roles::text ilike '%authenticated%'
  and (
    coalesce(qual, '') in ('true', '')
    or (
      coalesce(qual, '') not ilike '%auth.uid()%'
      and coalesce(qual, '') not ilike '%auth.jwt()%'
      and coalesce(qual, '') not ilike '%current_setting%'
    )
  )
order by schemaname, tablename, policyname;

-- 4) Politicas de UPDATE/INSERT sem WITH CHECK.
-- UPDATE precisa de USING e WITH CHECK para impedir alteracao de escopo/dono.
select
  'write_policies_without_with_check' as check_name,
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where cmd in ('INSERT', 'UPDATE', 'ALL')
  and coalesce(with_check, '') = ''
order by schemaname, tablename, policyname;

-- 5) Views no public sem security_invoker=true.
-- Views podem contornar RLS se nao forem cuidadosamente configuradas.
select
  'public_views_security_invoker' as check_name,
  n.nspname as schema_name,
  c.relname as view_name,
  case
    when array_to_string(coalesce(c.reloptions, array[]::text[]), ',') ilike '%security_invoker=true%' then 'OK'
    else 'REVISAR: view sem security_invoker=true'
  end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v', 'm')
order by c.relname;

-- 6) Funcoes SECURITY DEFINER no schema public.
-- Se forem necessarias, prefira schema privado e revogue EXECUTE de PUBLIC.
select
  'public_security_definer_functions' as check_name,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case
    when p.prosecdef then 'REVISAR: SECURITY DEFINER'
    else 'OK'
  end as status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 7) Grants de EXECUTE em funcoes do public para anon/authenticated/public.
select
  'public_function_execute_grants' as check_name,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  r.rolname as granted_to
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on has_function_privilege(r.oid, p.oid, 'EXECUTE')
where n.nspname = 'public'
  and r.rolname in ('anon', 'authenticated', 'public')
order by p.proname, r.rolname;

-- 8) Buckets de storage publicos ou com tipos arriscados.
select
  'storage_buckets_visibility' as check_name,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  case
    when public then 'REVISAR: bucket publico'
    when allowed_mime_types::text ilike '%text/html%' or allowed_mime_types::text ilike '%javascript%' then 'REVISAR: mime type arriscado'
    else 'OK'
  end as status
from storage.buckets
order by id;

-- 9) Chaves estrangeiras sem indice na coluna de origem.
-- Ajuda desempenho e evita lentidao em DELETE/UPDATE nas tabelas pais.
with fk_columns as (
  select
    con.oid as constraint_oid,
    con.conname,
    con.conrelid,
    ns.nspname as schema_name,
    rel.relname as table_name,
    att.attname as column_name,
    con.conkey
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality as cols(attnum, ord) on true
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = cols.attnum
  where con.contype = 'f'
    and ns.nspname = 'public'
),
indexed_fk as (
  select distinct
    fk.constraint_oid
  from fk_columns fk
  join pg_index idx on idx.indrelid = fk.conrelid
  where idx.indkey::smallint[] @> fk.conkey
)
select
  'foreign_keys_without_index' as check_name,
  fk.schema_name,
  fk.table_name,
  fk.conname as constraint_name,
  string_agg(fk.column_name, ', ' order by fk.column_name) as columns_to_index
from fk_columns fk
left join indexed_fk indexed on indexed.constraint_oid = fk.constraint_oid
where indexed.constraint_oid is null
group by fk.schema_name, fk.table_name, fk.conname
order by fk.table_name, fk.conname;

-- 10) Resumo de perfis em app_metadata.
-- Nao lista e-mails; serve para conferir roles, status e escopo por congregacao.
select
  'auth_app_metadata_summary' as check_name,
  raw_app_meta_data ->> 'church_gp_role' as church_role,
  coalesce(raw_app_meta_data ->> 'church_gp_access', 'sem_access') as church_access,
  coalesce(raw_app_meta_data ->> 'status', 'sem_status') as status,
  coalesce(raw_app_meta_data ->> 'church_gp_congregation_scope', 'sem_escopo') as congregation_scope,
  count(*) as total
from auth.users
group by
  raw_app_meta_data ->> 'church_gp_role',
  coalesce(raw_app_meta_data ->> 'church_gp_access', 'sem_access'),
  coalesce(raw_app_meta_data ->> 'status', 'sem_status'),
  coalesce(raw_app_meta_data ->> 'church_gp_congregation_scope', 'sem_escopo')
order by church_role, church_access, status, congregation_scope;
