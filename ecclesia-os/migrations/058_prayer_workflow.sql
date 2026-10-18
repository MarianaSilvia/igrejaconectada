ALTER TABLE prayer_requests
  ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  ADD COLUMN assigned_to uuid REFERENCES users,
  ADD COLUMN resolution_ciphertext text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX prayer_requests_queue ON prayer_requests(church_id,status,created_at DESC);
CREATE INDEX prayer_requests_assignee ON prayer_requests(church_id,assigned_to,status);

CREATE POLICY prayer_update ON prayer_requests
  FOR UPDATE
  USING(church_id=tenant_id() AND can_access('pastoral'))
  WITH CHECK(church_id=tenant_id() AND can_access('pastoral',true));

GRANT SELECT,UPDATE ON prayer_requests TO ecclesia_app;
GRANT ALL ON prayer_requests TO ecclesia_service;
