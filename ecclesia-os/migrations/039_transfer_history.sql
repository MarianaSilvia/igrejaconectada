CREATE TABLE transfer_change_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  transfer_id uuid NOT NULL REFERENCES transfers(id),
  actor_id uuid NOT NULL REFERENCES users,
  actor_name text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','accepted','rejected','cancelled')),
  note text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE transfer_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY transfer_change_read ON transfer_change_log
  FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY transfer_change_write ON transfer_change_log
  FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT ON transfer_change_log TO ecclesia_app;
GRANT ALL ON transfer_change_log TO ecclesia_service;
CREATE INDEX transfer_change_log_transfer ON transfer_change_log(church_id,transfer_id,changed_at DESC);
