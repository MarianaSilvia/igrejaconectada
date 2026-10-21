-- Network congregation helpers are called by the trusted application
-- connection after it has established the actor context. They must not
-- be callable through PostgREST by anonymous or ordinary authenticated users.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['public','anon','authenticated'] LOOP
    IF target='public'
       OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=target) THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.list_network_congregations() FROM %I',
        target
      );
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.create_network_congregation(uuid, text, uuid) FROM %I',
        target
      );
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.update_network_congregation(uuid, text, boolean) FROM %I',
        target
      );
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.list_network_congregations() TO ecclesia_app, ecclesia_service;
GRANT EXECUTE ON FUNCTION public.create_network_congregation(uuid, text, uuid) TO ecclesia_app, ecclesia_service;
GRANT EXECUTE ON FUNCTION public.update_network_congregation(uuid, text, boolean) TO ecclesia_app, ecclesia_service;