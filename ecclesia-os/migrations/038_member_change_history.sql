CREATE TABLE member_change_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  person_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users,
  actor_name text NOT NULL,
  changed_fields jsonb NOT NULL CHECK (jsonb_typeof(changed_fields) = 'array'),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
ALTER TABLE member_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY member_change_read ON member_change_log
  FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY member_change_write ON member_change_log
  FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT ON member_change_log TO ecclesia_app;
GRANT ALL ON member_change_log TO ecclesia_service;
CREATE INDEX member_change_log_person ON member_change_log(church_id,person_id,changed_at DESC);
