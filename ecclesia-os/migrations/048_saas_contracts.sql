CREATE TABLE saas_contracts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  plan text NOT NULL CHECK(plan IN ('piloto','essencial','rede','enterprise')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','suspended','cancelled')),
  monthly_cents bigint NOT NULL DEFAULT 0 CHECK(monthly_cents>=0),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  renews_on date,
  modules text[] NOT NULL DEFAULT ARRAY['people','cells','finance'],
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE saas_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY saas_contract_read ON saas_contracts FOR SELECT USING(church_id=tenant_id() AND local_role()='admin');
CREATE POLICY saas_contract_write ON saas_contracts FOR ALL USING(church_id=tenant_id() AND local_role()='admin') WITH CHECK(church_id=tenant_id() AND local_role()='admin');
GRANT SELECT,INSERT,UPDATE ON saas_contracts TO ecclesia_app;
GRANT ALL ON saas_contracts TO ecclesia_service;
CREATE INDEX saas_contracts_church ON saas_contracts(church_id,updated_at DESC);
