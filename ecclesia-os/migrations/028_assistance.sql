CREATE TABLE assistance_cases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  person_id uuid,
  requester_name text NOT NULL,
  requester_email text NOT NULL DEFAULT '',
  category text NOT NULL,
  description_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','analyzing','referred','assisted','closed')),
  assigned_to uuid REFERENCES users,
  outcome_ciphertext text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE(church_id,id),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
CREATE TABLE assistance_actions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  case_id uuid NOT NULL,
  action text NOT NULL,
  note_ciphertext text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,case_id) REFERENCES assistance_cases(church_id,id) ON DELETE CASCADE
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['assistance_cases','assistance_actions'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t); EXECUTE format('CREATE POLICY assistance_read ON %I FOR SELECT USING(church_id=tenant_id() AND local_role() IN (''admin'',''secretary''))',t); EXECUTE format('CREATE POLICY assistance_write ON %I FOR ALL USING(church_id=tenant_id() AND local_role() IN (''admin'',''secretary'')) WITH CHECK(church_id=tenant_id() AND local_role() IN (''admin'',''secretary''))',t); EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO ecclesia_app',t); EXECUTE format('GRANT ALL ON %I TO ecclesia_service',t); END LOOP; END $$;
CREATE INDEX assistance_queue ON assistance_cases(church_id,status,created_at DESC);
CREATE INDEX assistance_actions_case ON assistance_actions(church_id,case_id,created_at DESC);
