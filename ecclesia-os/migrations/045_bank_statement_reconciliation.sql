CREATE TABLE bank_statement_imports(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  account_id uuid NOT NULL,
  file_name text NOT NULL,
  source_hash text NOT NULL,
  imported_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id,account_id,source_hash),
  UNIQUE(church_id,id),
  FOREIGN KEY(church_id,account_id) REFERENCES accounts(church_id,id)
);
CREATE TABLE bank_statement_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  import_id uuid NOT NULL,
  account_id uuid NOT NULL,
  external_id text NOT NULL,
  occurred_on date NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents<>0),
  status text NOT NULL DEFAULT 'unmatched' CHECK(status IN ('unmatched','matched','ignored')),
  matched_payment_id uuid,
  matched_by uuid REFERENCES users,
  matched_at timestamptz,
  UNIQUE(church_id,import_id,external_id),
  FOREIGN KEY(church_id,import_id) REFERENCES bank_statement_imports(church_id,id),
  FOREIGN KEY(church_id,account_id) REFERENCES accounts(church_id,id),
  FOREIGN KEY(church_id,matched_payment_id) REFERENCES treasury_payments(church_id,id),
  CHECK((status='matched' AND matched_payment_id IS NOT NULL AND matched_by IS NOT NULL AND matched_at IS NOT NULL) OR (status<>'matched' AND matched_payment_id IS NULL))
);
ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY statement_import_read ON bank_statement_imports FOR SELECT USING(church_id=tenant_id() AND can_access('finance') AND finance_scope_allowed());
CREATE POLICY statement_import_write ON bank_statement_imports FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('finance',true) AND finance_scope_allowed() AND imported_by=actor_id());
CREATE POLICY statement_line_read ON bank_statement_lines FOR SELECT USING(church_id=tenant_id() AND can_access('finance') AND finance_scope_allowed());
CREATE POLICY statement_line_insert ON bank_statement_lines FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('finance',true) AND finance_scope_allowed());
CREATE POLICY statement_line_update ON bank_statement_lines FOR UPDATE USING(church_id=tenant_id() AND can_access('finance',true) AND finance_scope_allowed()) WITH CHECK(church_id=tenant_id() AND can_access('finance',true) AND finance_scope_allowed());
GRANT SELECT,INSERT ON bank_statement_imports TO ecclesia_app;
GRANT SELECT,INSERT,UPDATE ON bank_statement_lines TO ecclesia_app;
GRANT ALL ON bank_statement_imports,bank_statement_lines TO ecclesia_service;
CREATE INDEX statement_lines_pending ON bank_statement_lines(church_id,account_id,status,occurred_on);
