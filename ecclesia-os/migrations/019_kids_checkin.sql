CREATE TABLE kids_children(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  person_id uuid NOT NULL,
  birth_date date,
  medical_notes_encrypted text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id),
  UNIQUE(church_id,id), UNIQUE(church_id,person_id)
);
CREATE TABLE kids_guardians(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  child_id uuid NOT NULL,
  guardian_person_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT '',
  authorized boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid,
  FOREIGN KEY(church_id,child_id) REFERENCES kids_children(church_id,id) ON DELETE CASCADE,
  FOREIGN KEY(church_id,guardian_person_id) REFERENCES people(church_id,id),
  FOREIGN KEY(verified_by) REFERENCES users(id),
  UNIQUE(child_id,guardian_person_id)
);
CREATE TABLE kids_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  room text NOT NULL DEFAULT '',
  capacity int CHECK(capacity IS NULL OR capacity>0),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','completed','cancelled')),
  created_by uuid NOT NULL,
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,id), CHECK(ends_at>starts_at)
);
CREATE TABLE kids_checkins(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  session_id uuid NOT NULL,
  child_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  pickup_token_hash text NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  pickup_guardian_id uuid,
  status text NOT NULL DEFAULT 'checked_in' CHECK(status IN ('checked_in','checked_out','cancelled')),
  FOREIGN KEY(church_id,session_id) REFERENCES kids_sessions(church_id,id),
  FOREIGN KEY(church_id,child_id) REFERENCES kids_children(church_id,id),
  FOREIGN KEY(guardian_id) REFERENCES kids_guardians(id),
  FOREIGN KEY(pickup_guardian_id) REFERENCES kids_guardians(id),
  UNIQUE(session_id,child_id)
);
CREATE TABLE kids_exceptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  session_id uuid NOT NULL,
  child_id uuid NOT NULL,
  reason text NOT NULL,
  approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,session_id) REFERENCES kids_sessions(church_id,id),
  FOREIGN KEY(church_id,child_id) REFERENCES kids_children(church_id,id),
  FOREIGN KEY(approved_by) REFERENCES users(id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['kids_children','kids_guardians','kids_sessions','kids_checkins','kids_exceptions'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
END LOOP; END $$;
CREATE POLICY kids_child_read ON kids_children FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_child_write ON kids_children FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY kids_guardian_read ON kids_guardians FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_guardian_write ON kids_guardians FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY kids_session_read ON kids_sessions FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_session_write ON kids_sessions FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY kids_checkin_read ON kids_checkins FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_checkin_write ON kids_checkins FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY kids_exception_read ON kids_exceptions FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_exception_write ON kids_exceptions FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON kids_children,kids_guardians,kids_sessions,kids_checkins,kids_exceptions TO ecclesia_app;
GRANT ALL ON kids_children,kids_guardians,kids_sessions,kids_checkins,kids_exceptions TO ecclesia_service;
CREATE INDEX kids_sessions_time ON kids_sessions(church_id,starts_at,status);
CREATE INDEX kids_checkins_open ON kids_checkins(church_id,session_id,status);
