CREATE TABLE IF NOT EXISTS historical_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('person','church','network')),
  subject_id uuid NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'other' CHECK (event_type IN ('foundation','leadership','membership','discipleship','education','family','ministry','department','campaign','festival','visit','transfer','other')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'administrative' CHECK (visibility IN ('administrative','leadership','private')),
  source_type text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historical_events_scope_date_idx ON historical_events(church_id,subject_type,subject_id,event_date DESC);
CREATE INDEX IF NOT EXISTS historical_events_date_idx ON historical_events(church_id,event_date DESC);
ALTER TABLE historical_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historical_events_read ON historical_events;
CREATE POLICY historical_events_read ON historical_events FOR SELECT USING (church_id=tenant_id());
DROP POLICY IF EXISTS historical_events_write ON historical_events;
CREATE POLICY historical_events_write ON historical_events FOR INSERT WITH CHECK (church_id=tenant_id() AND can_access('people',true));
DROP POLICY IF EXISTS historical_events_update ON historical_events;
CREATE POLICY historical_events_update ON historical_events FOR UPDATE USING (church_id=tenant_id() AND can_access('people',true)) WITH CHECK (church_id=tenant_id());
DROP POLICY IF EXISTS historical_events_delete ON historical_events;
CREATE POLICY historical_events_delete ON historical_events FOR DELETE USING (church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON historical_events TO ecclesia_app;