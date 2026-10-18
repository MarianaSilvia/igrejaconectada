CREATE TABLE education_courses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 name text NOT NULL, description text NOT NULL DEFAULT '', completion_percent int NOT NULL DEFAULT 75 CHECK(completion_percent BETWEEN 1 AND 100), active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(church_id,id)
);
CREATE TABLE education_classes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, course_id uuid NOT NULL, name text NOT NULL,
 starts_on date NOT NULL, ends_on date, instructor_id uuid, capacity int CHECK(capacity IS NULL OR capacity>0), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','finished')),
 FOREIGN KEY(church_id,course_id) REFERENCES education_courses(church_id,id), FOREIGN KEY(instructor_id,church_id) REFERENCES memberships(user_id,church_id), UNIQUE(church_id,id)
);
CREATE TABLE education_enrollments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, class_id uuid NOT NULL, person_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')), enrolled_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(class_id,person_id), UNIQUE(church_id,id), FOREIGN KEY(church_id,class_id) REFERENCES education_classes(church_id,id), FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
CREATE TABLE education_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, class_id uuid NOT NULL, held_on date NOT NULL, topic text NOT NULL DEFAULT '',
 UNIQUE(class_id,held_on), FOREIGN KEY(church_id,class_id) REFERENCES education_classes(church_id,id)
 ,UNIQUE(church_id,id)
);
CREATE TABLE education_attendance(
 church_id uuid NOT NULL, session_id uuid NOT NULL, enrollment_id uuid NOT NULL, present boolean NOT NULL,
 PRIMARY KEY(session_id,enrollment_id), FOREIGN KEY(church_id,session_id) REFERENCES education_sessions(church_id,id), FOREIGN KEY(church_id,enrollment_id) REFERENCES education_enrollments(church_id,id)
);
CREATE TABLE education_certificates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, class_id uuid NOT NULL, person_id uuid NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(), code text NOT NULL UNIQUE, FOREIGN KEY(church_id,class_id) REFERENCES education_classes(church_id,id), FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id), UNIQUE(class_id,person_id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['education_courses','education_classes','education_enrollments','education_sessions','education_attendance','education_certificates'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY education_course_read ON education_courses FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_course_write ON education_courses FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_class_read ON education_classes FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_class_write ON education_classes FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_enrollment_read ON education_enrollments FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY education_enrollment_write ON education_enrollments FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_session_read ON education_sessions FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_session_write ON education_sessions FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_attendance_read ON education_attendance FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_attendance_write ON education_attendance FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_certificate_read ON education_certificates FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY education_certificate_write ON education_certificates FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE ON education_courses,education_classes,education_enrollments,education_sessions,education_attendance,education_certificates TO ecclesia_app;
GRANT ALL ON education_courses,education_classes,education_enrollments,education_sessions,education_attendance,education_certificates TO ecclesia_service;
CREATE INDEX education_enrollments_class ON education_enrollments(church_id,class_id,status);
CREATE INDEX education_sessions_class ON education_sessions(church_id,class_id,held_on);
