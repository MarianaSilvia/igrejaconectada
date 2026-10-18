CREATE TABLE church_affiliations(
  church_id uuid PRIMARY KEY REFERENCES churches,
  official_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','suspended','ended')),
  joined_on date,
  notes_encrypted text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ministerial_affiliations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  person_id uuid NOT NULL,
  ministry_role text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','ended')),
  notes_encrypted text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,id), CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE TABLE ministerial_credentials(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  person_id uuid NOT NULL,
  credential_type text NOT NULL,
  credential_number text NOT NULL DEFAULT '',
  issued_on date NOT NULL,
  expires_on date,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')),
  notes_encrypted text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,id), CHECK(expires_on IS NULL OR expires_on>=issued_on)
);
CREATE TABLE convention_dues(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  reference_year int NOT NULL CHECK(reference_year BETWEEN 2000 AND 2200),
  amount_cents bigint NOT NULL CHECK(amount_cents>=0),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','waived','cancelled')),
  paid_on date,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id) REFERENCES churches,
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,reference_year)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['church_affiliations','ministerial_affiliations','ministerial_credentials','convention_dues'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
END LOOP; END $$;
CREATE POLICY affiliation_read ON church_affiliations FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY affiliation_write ON church_affiliations FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY ministry_affiliation_read ON ministerial_affiliations FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY ministry_affiliation_write ON ministerial_affiliations FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY ministry_credential_read ON ministerial_credentials FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY ministry_credential_write ON ministerial_credentials FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY convention_due_read ON convention_dues FOR SELECT USING(church_id=tenant_id() AND can_access('finance'));
CREATE POLICY convention_due_write ON convention_dues FOR ALL USING(church_id=tenant_id() AND can_access('finance',true)) WITH CHECK(church_id=tenant_id() AND can_access('finance',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON church_affiliations,ministerial_affiliations,ministerial_credentials,convention_dues TO ecclesia_app;
GRANT ALL ON church_affiliations,ministerial_affiliations,ministerial_credentials,convention_dues TO ecclesia_service;
CREATE INDEX ministerial_affiliations_person ON ministerial_affiliations(church_id,person_id,status);
CREATE INDEX ministerial_credentials_expiry ON ministerial_credentials(church_id,expires_on,status);
