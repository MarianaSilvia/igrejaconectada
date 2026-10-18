ALTER TABLE communication_deliveries ADD COLUMN read_at timestamptz;
DROP POLICY communication_delivery_read ON communication_deliveries;
CREATE POLICY communication_delivery_read ON communication_deliveries FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY communication_delivery_member_update ON communication_deliveries FOR UPDATE USING(church_id=tenant_id() AND channel='portal' AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())) WITH CHECK(church_id=tenant_id() AND channel='portal' AND EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id()));
CREATE INDEX communication_deliveries_unread ON communication_deliveries(church_id,person_id,read_at) WHERE channel='portal' AND read_at IS NULL;
