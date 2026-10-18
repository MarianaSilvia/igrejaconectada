CREATE TABLE workflow_trigger_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 church_id uuid NOT NULL REFERENCES churches,
 trigger text NOT NULL CHECK(trigger IN ('visitor','event_registration','volunteer','baptism','transfer')),
 person_id uuid NOT NULL,
 source_key text NOT NULL,
 actor_id uuid REFERENCES users,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')),
 attempts int NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 lease_token uuid,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(church_id,trigger,person_id,source_key),
 FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
ALTER TABLE workflow_trigger_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_trigger_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_trigger_read ON workflow_trigger_jobs FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY workflow_trigger_insert ON workflow_trigger_jobs FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT ON workflow_trigger_jobs TO ecclesia_app;
GRANT ALL ON workflow_trigger_jobs TO ecclesia_service;
CREATE INDEX workflow_trigger_ready ON workflow_trigger_jobs(status,available_at);
