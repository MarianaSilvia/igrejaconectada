-- Execute somente depois de validar "Fale com a lideranca" em producao
-- e confirmar o backup em output/backups/chat-legado-2026-09-20.json.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime drop table public.chat_messages;
  end if;
end $$;

drop table if exists public.chat_blocks;
drop table if exists public.chat_moderation;
drop table if exists public.chat_messages;
drop table if exists public.chat_rooms;
