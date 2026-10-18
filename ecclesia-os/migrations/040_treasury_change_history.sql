CREATE TABLE treasury_change_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  resource_type text NOT NULL CHECK(resource_type IN ('bill','payment','integration')),
  resource_id uuid NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users,
  actor_name text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE treasury_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY treasury_change_read ON treasury_change_log
  FOR SELECT USING(church_id=tenant_id() AND can_access('finance'));
CREATE POLICY treasury_change_write ON treasury_change_log
  FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('finance',true));
GRANT SELECT,INSERT ON treasury_change_log TO ecclesia_app;
GRANT ALL ON treasury_change_log TO ecclesia_service;
CREATE INDEX treasury_change_log_resource ON treasury_change_log(church_id,resource_type,resource_id,changed_at DESC);
