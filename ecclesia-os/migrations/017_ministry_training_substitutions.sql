-- Requisitos de treinamento e substituições preservam a operação da escala.
ALTER TABLE schedules ADD CONSTRAINT schedules_church_id_unique UNIQUE(church_id,id);
CREATE TABLE ministry_training(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  user_id uuid NOT NULL,
  team_id uuid,
  name text NOT NULL,
  completed_at date NOT NULL,
  expires_at date,
  verified_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,church_id) REFERENCES memberships(user_id,church_id),
  FOREIGN KEY(team_id,church_id) REFERENCES ministry_teams(id,church_id),
  FOREIGN KEY(verified_by,church_id) REFERENCES memberships(user_id,church_id),
  UNIQUE(church_id,id)
);
CREATE TABLE schedule_substitutions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  original_user_id uuid NOT NULL,
  substitute_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  requested_by uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  FOREIGN KEY(church_id,schedule_id) REFERENCES schedules(church_id,id),
  FOREIGN KEY(original_user_id,church_id) REFERENCES memberships(user_id,church_id),
  FOREIGN KEY(substitute_user_id,church_id) REFERENCES memberships(user_id,church_id),
  FOREIGN KEY(requested_by,church_id) REFERENCES memberships(user_id,church_id),
  UNIQUE(schedule_id,substitute_user_id)
);
ALTER TABLE ministry_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_training FORCE ROW LEVEL SECURITY;
CREATE POLICY ministry_training_read ON ministry_training FOR SELECT USING(church_id=tenant_id() AND (user_id=actor_id() OR can_access('cells',true)));
CREATE POLICY ministry_training_write ON ministry_training FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('cells',true));
ALTER TABLE schedule_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_substitutions FORCE ROW LEVEL SECURITY;
CREATE POLICY substitution_read ON schedule_substitutions FOR SELECT USING(church_id=tenant_id() AND (requested_by=actor_id() OR substitute_user_id=actor_id() OR original_user_id=actor_id() OR can_access('cells',true)));
CREATE POLICY substitution_insert ON schedule_substitutions FOR INSERT WITH CHECK(church_id=tenant_id() AND (requested_by=actor_id() OR can_access('cells',true)));
CREATE POLICY substitution_update ON schedule_substitutions FOR UPDATE USING(church_id=tenant_id() AND (substitute_user_id=actor_id() OR requested_by=actor_id() OR can_access('cells',true))) WITH CHECK(church_id=tenant_id() AND (substitute_user_id=actor_id() OR requested_by=actor_id() OR can_access('cells',true)));
GRANT SELECT,INSERT ON ministry_training TO ecclesia_app;
GRANT SELECT,INSERT,UPDATE ON schedule_substitutions TO ecclesia_app;
GRANT UPDATE(user_id,response) ON schedules TO ecclesia_app;
GRANT ALL ON ministry_training,schedule_substitutions TO ecclesia_service;
CREATE INDEX ministry_training_person ON ministry_training(church_id,user_id,expires_at);
CREATE INDEX substitution_user ON schedule_substitutions(church_id,substitute_user_id,status);
