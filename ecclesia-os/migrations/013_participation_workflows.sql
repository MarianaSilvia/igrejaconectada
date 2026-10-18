ALTER TABLE church_events ADD COLUMN IF NOT EXISTS capacity int CHECK(capacity IS NULL OR capacity>0);
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS public_registration boolean NOT NULL DEFAULT false;

CREATE TABLE workflow_definitions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 name text NOT NULL, trigger text NOT NULL CHECK(trigger IN ('manual','visitor','event_registration','volunteer','baptism','transfer')),
 active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(church_id,id)
);
CREATE TABLE workflow_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, definition_id uuid NOT NULL,
 position int NOT NULL CHECK(position>=0), title text NOT NULL, due_days int NOT NULL DEFAULT 0 CHECK(due_days BETWEEN 0 AND 3650),
 UNIQUE(definition_id,position), FOREIGN KEY(church_id,definition_id) REFERENCES workflow_definitions(church_id,id)
);
CREATE TABLE workflow_instances(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, definition_id uuid NOT NULL, person_id uuid NOT NULL,
 current_step int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
 owner_id uuid, due_on date, version int NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(church_id,definition_id) REFERENCES workflow_definitions(church_id,id), FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id), FOREIGN KEY(owner_id,church_id) REFERENCES memberships(user_id,church_id)
);
CREATE TABLE workflow_instance_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches, instance_id uuid NOT NULL REFERENCES workflow_instances,
 actor_id uuid REFERENCES users, from_step int, to_step int, note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_registrations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, event_id uuid NOT NULL, person_id uuid,
 guest_name text, guest_email text, guest_phone text, status text NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','waitlisted','cancelled','attended')),
 amount_cents bigint NOT NULL DEFAULT 0 CHECK(amount_cents>=0), consent_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,person_id), UNIQUE(event_id,guest_email), FOREIGN KEY(church_id,event_id) REFERENCES church_events(church_id,id), FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id), CHECK(person_id IS NOT NULL OR guest_email IS NOT NULL)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workflow_definitions','workflow_steps','workflow_instances','workflow_instance_events','event_registrations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY workflow_definition_read ON workflow_definitions FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY workflow_definition_write ON workflow_definitions FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY workflow_step_read ON workflow_steps FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY workflow_step_write ON workflow_steps FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY workflow_instance_read ON workflow_instances FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY workflow_instance_write ON workflow_instances FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY workflow_instance_update ON workflow_instances FOR UPDATE USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY workflow_history_read ON workflow_instance_events FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY workflow_history_write ON workflow_instance_events FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY registration_read ON event_registrations FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY registration_write ON event_registrations FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY registration_update ON event_registrations FOR UPDATE USING(church_id=tenant_id() AND (can_access('people',true) OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id()))) WITH CHECK(church_id=tenant_id());
GRANT SELECT,INSERT,UPDATE ON workflow_definitions,workflow_steps,workflow_instances,workflow_instance_events,event_registrations TO ecclesia_app;
GRANT ALL ON workflow_definitions,workflow_steps,workflow_instances,workflow_instance_events,event_registrations TO ecclesia_service;
CREATE INDEX workflow_instances_due ON workflow_instances(church_id,status,due_on);
CREATE INDEX event_registrations_event ON event_registrations(church_id,event_id,status);
