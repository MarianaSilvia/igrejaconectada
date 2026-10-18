ALTER TABLE church_events ADD COLUMN IF NOT EXISTS price_cents bigint NOT NULL DEFAULT 0 CHECK(price_cents>=0);
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required' CHECK(payment_status IN ('not_required','pending','paid','failed','refunded'));
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS pix_charge_id uuid UNIQUE REFERENCES pix_charges(id);
CREATE INDEX event_registrations_payment ON event_registrations(church_id,event_id,payment_status);
