BEGIN;

-- Network congregation helpers are called by the trusted application
-- connection after it has established the actor context. They must not
-- be callable through PostgREST by anonymous or ordinary authenticated users.
REVOKE EXECUTE ON FUNCTION public.list_network_congregations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_network_congregation(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_network_congregation(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_network_congregations() TO ecclesia_app, ecclesia_service;
GRANT EXECUTE ON FUNCTION public.create_network_congregation(uuid, text, uuid) TO ecclesia_app, ecclesia_service;
GRANT EXECUTE ON FUNCTION public.update_network_congregation(uuid, text, boolean) TO ecclesia_app, ecclesia_service;

INSERT INTO schema_migrations(version,name)
VALUES ('094','revoke_public_network_helpers')
ON CONFLICT (version) DO NOTHING;

COMMIT;