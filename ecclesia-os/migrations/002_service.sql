-- Separate internal service role from the role used for tenant requests.
CREATE ROLE ecclesia_service NOLOGIN NOSUPERUSER BYPASSRLS;
GRANT USAGE ON SCHEMA public TO ecclesia_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ecclesia_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ecclesia_service;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_events FOR SELECT USING(church_id=tenant_id() AND local_role()='admin');
CREATE POLICY audit_write ON audit_events FOR INSERT WITH CHECK(church_id=tenant_id() AND actor_id=actor_id());
GRANT SELECT,INSERT ON audit_events TO ecclesia_app;
