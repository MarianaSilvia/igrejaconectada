ALTER TABLE church_events
  ADD COLUMN registration_fields jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(registration_fields) = 'array');
ALTER TABLE event_registrations
  ADD COLUMN form_data jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(form_data) = 'object');
