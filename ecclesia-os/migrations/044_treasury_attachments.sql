ALTER TABLE treasury_payments
  ADD CONSTRAINT treasury_payments_church_id_id_key UNIQUE(church_id,id);

CREATE TABLE treasury_attachments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  bill_id uuid,
  payment_id uuid,
  name text NOT NULL,
  media_type text NOT NULL CHECK(media_type IN ('application/pdf','text/plain','image/png','image/jpeg')),
  bytes integer NOT NULL CHECK(bytes>0 AND bytes<=250000),
  encrypted_content text NOT NULL,
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((bill_id IS NOT NULL AND payment_id IS NULL) OR (bill_id IS NULL AND payment_id IS NOT NULL)),
  FOREIGN KEY(church_id,bill_id) REFERENCES treasury_bills(church_id,id),
  FOREIGN KEY(church_id,payment_id) REFERENCES treasury_payments(church_id,id)
);
ALTER TABLE treasury_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY treasury_attachment_read ON treasury_attachments
  FOR SELECT USING(church_id=tenant_id() AND can_access('finance') AND finance_scope_allowed());
CREATE POLICY treasury_attachment_write ON treasury_attachments
  FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('finance',true) AND finance_scope_allowed() AND created_by=actor_id());
GRANT SELECT,INSERT ON treasury_attachments TO ecclesia_app;
GRANT ALL ON treasury_attachments TO ecclesia_service;
CREATE INDEX treasury_attachment_bill ON treasury_attachments(church_id,bill_id,created_at DESC);
CREATE INDEX treasury_attachment_payment ON treasury_attachments(church_id,payment_id,created_at DESC);
