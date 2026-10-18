CREATE TABLE ministry_training_requirements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL,
 team_id uuid NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(church_id,team_id) REFERENCES ministry_teams(church_id,id), UNIQUE(church_id,id), UNIQUE(team_id,name)
);
ALTER TABLE ministry_training_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_training_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY training_requirement_read ON ministry_training_requirements FOR SELECT USING(church_id=tenant_id() AND can_access('cells'));
CREATE POLICY training_requirement_write ON ministry_training_requirements FOR ALL USING(church_id=tenant_id() AND can_access('cells',true)) WITH CHECK(church_id=tenant_id() AND can_access('cells',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON ministry_training_requirements TO ecclesia_app;
GRANT ALL ON ministry_training_requirements TO ecclesia_service;
CREATE INDEX training_requirements_team ON ministry_training_requirements(church_id,team_id,active);
