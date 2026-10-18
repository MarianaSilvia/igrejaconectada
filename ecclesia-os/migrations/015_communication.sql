CREATE TABLE communication_preferences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, person_id uuid NOT NULL,
 email_opt_in boolean NOT NULL DEFAULT false, portal_opt_in boolean NOT NULL DEFAULT true, sms_opt_in boolean NOT NULL DEFAULT false,
 updated_by uuid REFERENCES users, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(church_id,person_id), FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
CREATE TABLE communication_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 channel text NOT NULL CHECK(channel IN ('portal','email','sms')), subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','sent','failed')),
 audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), queued_at timestamptz, sent_at timestamptz
);
CREATE TABLE communication_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, message_id uuid NOT NULL REFERENCES communication_messages,
 person_id uuid NOT NULL, channel text NOT NULL CHECK(channel IN ('portal','email','sms')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed','skipped')),
 consent_snapshot boolean NOT NULL, address_snapshot text, error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY; ALTER TABLE communication_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY; ALTER TABLE communication_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE communication_deliveries ENABLE ROW LEVEL SECURITY; ALTER TABLE communication_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY communication_preferences_read ON communication_preferences FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY communication_preferences_write ON communication_preferences FOR INSERT WITH CHECK(church_id=tenant_id() AND (can_access('people',true) OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY communication_preferences_update ON communication_preferences FOR UPDATE USING(church_id=tenant_id() AND (can_access('people',true) OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id()))) WITH CHECK(church_id=tenant_id());
CREATE POLICY communication_message_read ON communication_messages FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY communication_message_write ON communication_messages FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY communication_delivery_read ON communication_deliveries FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY communication_delivery_write ON communication_deliveries FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY communication_delivery_update ON communication_deliveries FOR UPDATE USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE ON communication_preferences TO ecclesia_app;
GRANT SELECT,INSERT,UPDATE ON communication_messages,communication_deliveries TO ecclesia_app;
GRANT ALL ON communication_preferences,communication_messages,communication_deliveries TO ecclesia_service;
CREATE INDEX communication_messages_recent ON communication_messages(church_id,created_at DESC);
CREATE INDEX communication_deliveries_message ON communication_deliveries(church_id,message_id,status);
