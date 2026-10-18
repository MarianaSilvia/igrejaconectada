ALTER TABLE church_events ADD COLUMN IF NOT EXISTS registration_deadline timestamptz;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS certificate_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE event_certificates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  event_id uuid NOT NULL,
  registration_id uuid NOT NULL UNIQUE,
  person_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  recipient_name text NOT NULL,
  event_title text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,event_id) REFERENCES church_events(church_id,id),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id),
  FOREIGN KEY(registration_id) REFERENCES event_registrations(id)
);
ALTER TABLE event_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY event_certificate_read ON event_certificates FOR SELECT USING(
  church_id=tenant_id() AND (can_access('people') OR person_id IN (SELECT id FROM people WHERE user_id=actor_id()))
);
CREATE POLICY event_certificate_write ON event_certificates FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT ON event_certificates TO ecclesia_app;
GRANT ALL ON event_certificates TO ecclesia_service;
CREATE INDEX event_certificates_event ON event_certificates(church_id,event_id,issued_at DESC);
