CREATE TABLE education_interest_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  class_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','contacted','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,class_id) REFERENCES education_classes(church_id,id)
);
ALTER TABLE education_interest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_interest_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY education_interest_read ON education_interest_requests FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_interest_update ON education_interest_requests FOR UPDATE USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,UPDATE ON education_interest_requests TO ecclesia_app;
GRANT ALL ON education_interest_requests TO ecclesia_service;
CREATE INDEX education_interest_queue ON education_interest_requests(church_id,status,created_at DESC);
