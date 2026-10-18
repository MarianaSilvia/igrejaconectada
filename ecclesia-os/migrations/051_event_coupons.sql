CREATE TABLE IF NOT EXISTS event_coupons(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 church_id uuid NOT NULL,
 event_id uuid NOT NULL,
 code text NOT NULL,
 discount_kind text NOT NULL CHECK(discount_kind IN ('percent','fixed')),
 value_cents bigint NOT NULL CHECK(value_cents>0),
 max_uses int CHECK(max_uses IS NULL OR max_uses>0),
 used_count int NOT NULL DEFAULT 0 CHECK(used_count>=0),
 expires_on date,
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,code),
 FOREIGN KEY(church_id,event_id) REFERENCES church_events(church_id,id)
);
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS coupon_id uuid;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS discount_cents bigint NOT NULL DEFAULT 0 CHECK(discount_cents>=0);
ALTER TABLE event_registrations ADD CONSTRAINT event_registration_coupon_fk FOREIGN KEY(coupon_id) REFERENCES event_coupons(id);
ALTER TABLE event_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_coupons FORCE ROW LEVEL SECURITY;
CREATE POLICY event_coupon_read ON event_coupons FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY event_coupon_write ON event_coupons FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE ON event_coupons TO ecclesia_app;
GRANT ALL ON event_coupons TO ecclesia_service;
CREATE INDEX IF NOT EXISTS event_coupons_event ON event_coupons(church_id,event_id,active);
