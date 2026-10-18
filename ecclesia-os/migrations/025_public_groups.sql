ALTER TABLE cells ADD COLUMN IF NOT EXISTS public_directory boolean NOT NULL DEFAULT false;
ALTER TABLE cells ADD COLUMN IF NOT EXISTS public_description text NOT NULL DEFAULT '';
ALTER TABLE cells ADD COLUMN IF NOT EXISTS public_contact text NOT NULL DEFAULT '';
CREATE TABLE cell_interest_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  cell_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','contacted','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,cell_id) REFERENCES cells(church_id,id)
);
ALTER TABLE cell_interest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_interest_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY cell_interest_read ON cell_interest_requests FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY cell_interest_update ON cell_interest_requests FOR UPDATE USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,UPDATE ON cell_interest_requests TO ecclesia_app;
GRANT ALL ON cell_interest_requests TO ecclesia_service;
CREATE INDEX cell_interest_queue ON cell_interest_requests(church_id,status,created_at DESC);
