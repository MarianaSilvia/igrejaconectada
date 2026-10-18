CREATE TABLE member_profiles (
 church_id uuid NOT NULL REFERENCES churches,
 person_id uuid PRIMARY KEY,
 encrypted_profile text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
CREATE TABLE member_photos (
 church_id uuid NOT NULL REFERENCES churches,
 person_id uuid PRIMARY KEY,
 encrypted_data text NOT NULL,
 media_type text NOT NULL DEFAULT 'image/webp',
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
CREATE TABLE registration_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 church_id uuid NOT NULL REFERENCES churches,
 campus_id uuid,
 token_hash text NOT NULL UNIQUE,
 encrypted_token text NOT NULL,
 title text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 photo_required boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(church_id,id),
 FOREIGN KEY(church_id,campus_id) REFERENCES campuses(church_id,id)
);
CREATE TABLE registration_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 church_id uuid NOT NULL REFERENCES churches,
 link_id uuid NOT NULL,
 submission_key uuid NOT NULL,
 encrypted_payload text NOT NULL,
 encrypted_photo text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 person_id uuid,
 reviewed_by uuid REFERENCES users,
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 UNIQUE(link_id,submission_key),
 FOREIGN KEY(church_id,link_id) REFERENCES registration_links(church_id,id),
 FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['member_profiles','member_photos'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY member_read ON %I FOR SELECT USING(church_id=tenant_id() AND can_access(''people'') AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id))',t);
  EXECUTE format('CREATE POLICY member_insert ON %I FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access(''people'',true) AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id))',t);
  EXECUTE format('CREATE POLICY member_update ON %I FOR UPDATE USING(church_id=tenant_id() AND can_access(''people'',true) AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id)) WITH CHECK(church_id=tenant_id() AND can_access(''people'',true) AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['registration_links','registration_submissions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY link_local_scope ON registration_links USING(church_id=tenant_id() AND can_access('people',true) AND campus_allowed(campus_id)) WITH CHECK(church_id=tenant_id() AND can_access('people',true) AND campus_allowed(campus_id));
CREATE POLICY submission_local_scope ON registration_submissions USING(church_id=tenant_id() AND can_access('people',true) AND EXISTS(SELECT 1 FROM registration_links l WHERE l.id=link_id)) WITH CHECK(church_id=tenant_id() AND can_access('people',true) AND EXISTS(SELECT 1 FROM registration_links l WHERE l.id=link_id));
CREATE POLICY photo_remove ON member_photos FOR DELETE USING(church_id=tenant_id() AND can_access('people',true) AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id));
GRANT SELECT,INSERT,UPDATE ON member_profiles,member_photos,registration_links,registration_submissions TO ecclesia_app;
GRANT DELETE ON member_photos TO ecclesia_app;
GRANT ALL ON member_profiles,member_photos,registration_links,registration_submissions TO ecclesia_service;
CREATE INDEX pending_registrations ON registration_submissions(church_id,created_at DESC) WHERE status='pending';
