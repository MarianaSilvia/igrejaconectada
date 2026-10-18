CREATE TABLE saas_invoices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES saas_contracts,
  church_id uuid NOT NULL REFERENCES churches,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_on date NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>=0),
  status text NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','paid','overdue','void')),
  paid_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(period_end>=period_start)
);
ALTER TABLE saas_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY saas_invoice_read ON saas_invoices FOR SELECT USING(church_id=tenant_id() AND local_role()='admin');
CREATE POLICY saas_invoice_write ON saas_invoices FOR ALL USING(church_id=tenant_id() AND local_role()='admin') WITH CHECK(church_id=tenant_id() AND local_role()='admin');
GRANT SELECT,INSERT,UPDATE ON saas_invoices TO ecclesia_app;
GRANT ALL ON saas_invoices TO ecclesia_service;
CREATE INDEX saas_invoices_church_due ON saas_invoices(church_id,due_on DESC);
