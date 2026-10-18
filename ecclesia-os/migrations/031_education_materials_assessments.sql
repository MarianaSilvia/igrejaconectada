CREATE TABLE education_materials(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL,
 course_id uuid,
 class_id uuid,
 title text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('file','link','text')),
 location text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 position int NOT NULL DEFAULT 0,
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(church_id,course_id) REFERENCES education_courses(church_id,id),
 FOREIGN KEY(church_id,class_id) REFERENCES education_classes(church_id,id),
 CHECK(course_id IS NOT NULL OR class_id IS NOT NULL),
 UNIQUE(church_id,id)
);
CREATE TABLE education_assessments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL,
 class_id uuid NOT NULL, title text NOT NULL, max_score numeric(10,2) NOT NULL CHECK(max_score>0),
 published boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(church_id,class_id) REFERENCES education_classes(church_id,id), UNIQUE(church_id,id)
);
CREATE TABLE education_assessment_results(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL,
 assessment_id uuid NOT NULL, enrollment_id uuid NOT NULL, score numeric(10,2) NOT NULL CHECK(score>=0),
 feedback text NOT NULL DEFAULT '', graded_by uuid NOT NULL REFERENCES users, graded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(church_id,assessment_id) REFERENCES education_assessments(church_id,id),
 FOREIGN KEY(church_id,enrollment_id) REFERENCES education_enrollments(church_id,id),
 UNIQUE(assessment_id,enrollment_id), UNIQUE(church_id,id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['education_materials','education_assessments','education_assessment_results'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY education_material_read ON education_materials FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_material_write ON education_materials FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_assessment_read ON education_assessments FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_assessment_write ON education_assessments FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY education_result_read ON education_assessment_results FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY education_result_write ON education_assessment_results FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON education_materials,education_assessments,education_assessment_results TO ecclesia_app;
GRANT ALL ON education_materials,education_assessments,education_assessment_results TO ecclesia_service;
CREATE INDEX education_materials_scope ON education_materials(church_id,course_id,class_id,position);
CREATE INDEX education_assessments_class ON education_assessments(church_id,class_id,created_at);
