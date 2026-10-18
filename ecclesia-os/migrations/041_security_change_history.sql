CREATE TABLE security_change_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  target_id uuid,
  action text NOT NULL,
  scope text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users,
  actor_name text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE security_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY security_change_read ON security_change_log
  FOR SELECT USING(church_id=tenant_id() AND local_role()='admin');
CREATE POLICY security_change_write ON security_change_log
  FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT ON security_change_log TO ecclesia_app;
GRANT ALL ON security_change_log TO ecclesia_service;
CREATE INDEX security_change_log_church ON security_change_log(church_id,changed_at DESC);
