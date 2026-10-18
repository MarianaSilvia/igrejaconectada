CREATE TABLE event_change_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  event_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users,
  actor_name text NOT NULL,
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object'),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,event_id) REFERENCES church_events(church_id,id)
);
ALTER TABLE event_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY event_change_read ON event_change_log
  FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY event_change_write ON event_change_log
  FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT ON event_change_log TO ecclesia_app;
GRANT ALL ON event_change_log TO ecclesia_service;
CREATE INDEX event_change_log_event ON event_change_log(church_id,event_id,changed_at DESC);
