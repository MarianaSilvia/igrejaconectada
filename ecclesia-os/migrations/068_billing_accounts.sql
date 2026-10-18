CREATE TABLE IF NOT EXISTS platform_memberships(
  user_id uuid PRIMARY KEY REFERENCES users(id),
  role text NOT NULL CHECK(role IN ('platform_admin','platform_billing')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_membership_self ON platform_memberships FOR SELECT USING(user_id=actor_id());
GRANT SELECT ON platform_memberships TO ecclesia_app;
GRANT ALL ON platform_memberships TO ecclesia_service;

CREATE TABLE IF NOT EXISTS billing_accounts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_church_id uuid NOT NULL REFERENCES churches(id),
  tax_id text NOT NULL DEFAULT '',
  billing_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','cancelled')),
  currency text NOT NULL DEFAULT 'BRL',
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','quarterly','annual')),
  provider text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_account_read ON billing_accounts FOR SELECT USING(
  EXISTS(SELECT 1 FROM churches c WHERE c.id=billing_accounts.owner_church_id AND c.id=tenant_id() AND local_role()='admin')
  OR EXISTS(SELECT 1 FROM churches c WHERE c.id=billing_accounts.owner_church_id AND c.network_id IN (SELECT network_id FROM churches WHERE id=tenant_id()) AND EXISTS(SELECT 1 FROM network_members n WHERE n.network_id=c.network_id AND n.user_id=actor_id()))
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
);
CREATE POLICY billing_account_write ON billing_accounts FOR ALL USING(
  EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  OR EXISTS(SELECT 1 FROM churches c WHERE c.id=billing_accounts.owner_church_id AND c.id=tenant_id() AND local_role()='admin')
) WITH CHECK(
  EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  OR EXISTS(SELECT 1 FROM churches c WHERE c.id=billing_accounts.owner_church_id AND c.id=tenant_id() AND local_role()='admin')
);
GRANT SELECT,INSERT,UPDATE ON billing_accounts TO ecclesia_app;
GRANT ALL ON billing_accounts TO ecclesia_service;

ALTER TABLE churches ADD COLUMN IF NOT EXISTS billing_account_id uuid;
INSERT INTO billing_accounts(name,owner_church_id)
SELECT c.name,c.id FROM churches c
WHERE NOT EXISTS (SELECT 1 FROM billing_accounts b WHERE b.owner_church_id=c.id);
UPDATE churches c SET billing_account_id=b.id FROM billing_accounts b WHERE b.owner_church_id=c.id AND c.billing_account_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='churches_billing_account_fk') THEN
    ALTER TABLE churches ADD CONSTRAINT churches_billing_account_fk FOREIGN KEY (billing_account_id) REFERENCES billing_accounts(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS churches_billing_account ON churches(billing_account_id);

ALTER TABLE saas_contracts ADD COLUMN IF NOT EXISTS billing_account_id uuid;
ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS billing_account_id uuid;
UPDATE saas_contracts s SET billing_account_id=c.billing_account_id FROM churches c WHERE s.church_id=c.id AND s.billing_account_id IS NULL;
UPDATE saas_invoices i SET billing_account_id=c.billing_account_id FROM churches c WHERE i.church_id=c.id AND i.billing_account_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='saas_contracts_billing_account_fk') THEN
    ALTER TABLE saas_contracts ADD CONSTRAINT saas_contracts_billing_account_fk FOREIGN KEY (billing_account_id) REFERENCES billing_accounts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='saas_invoices_billing_account_fk') THEN
    ALTER TABLE saas_invoices ADD CONSTRAINT saas_invoices_billing_account_fk FOREIGN KEY (billing_account_id) REFERENCES billing_accounts(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS saas_contracts_billing_account ON saas_contracts(billing_account_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS saas_invoices_billing_account ON saas_invoices(billing_account_id,due_on DESC);

CREATE TABLE IF NOT EXISTS saas_payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  invoice_id uuid REFERENCES saas_invoices(id),
  provider text NOT NULL DEFAULT 'manual',
  external_id text,
  gross_cents bigint NOT NULL CHECK(gross_cents>=0),
  discount_cents bigint NOT NULL DEFAULT 0 CHECK(discount_cents>=0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK(fee_cents>=0),
  net_cents bigint NOT NULL CHECK(net_cents>=0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','refunded','failed')),
  confirmed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,external_id)
);
CREATE TABLE IF NOT EXISTS saas_payment_events(
  provider text NOT NULL,
  external_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,external_id,event_type)
);
ALTER TABLE saas_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE saas_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_payment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY saas_payment_read ON saas_payments FOR SELECT USING(
  EXISTS(SELECT 1 FROM billing_accounts b JOIN churches c ON c.billing_account_id=b.id WHERE b.id=saas_payments.billing_account_id AND c.id=tenant_id() AND local_role()='admin')
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
);
CREATE POLICY saas_payment_write ON saas_payments FOR ALL USING(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())) WITH CHECK(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id()));
CREATE POLICY saas_payment_events_platform ON saas_payment_events FOR ALL USING(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())) WITH CHECK(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id()));
GRANT SELECT,INSERT,UPDATE ON saas_payments,saas_payment_events TO ecclesia_app;
GRANT ALL ON saas_payments,saas_payment_events TO ecclesia_service;

CREATE TABLE IF NOT EXISTS saas_plan_limits(
  plan text PRIMARY KEY,
  max_churches int NOT NULL,
  max_users int NOT NULL,
  max_members int NOT NULL,
  modules text[] NOT NULL
);
INSERT INTO saas_plan_limits(plan,max_churches,max_users,max_members,modules) VALUES
('piloto',2,20,500,ARRAY['people','cells','finance']),
('essencial',1,5,200,ARRAY['people','cells','finance']),
('rede',10,50,5000,ARRAY['people','cells','finance','education','media']),
('enterprise',100000,100000,100000000,ARRAY['people','cells','finance','education','media','kids'])
ON CONFLICT(plan) DO NOTHING;
GRANT SELECT ON saas_plan_limits TO ecclesia_app,ecclesia_service;

CREATE TABLE IF NOT EXISTS saas_usage_snapshots(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  captured_on date NOT NULL DEFAULT CURRENT_DATE,
  churches_count int NOT NULL DEFAULT 0,
  users_count int NOT NULL DEFAULT 0,
  members_count int NOT NULL DEFAULT 0,
  modules text[] NOT NULL DEFAULT '{}',
  UNIQUE(billing_account_id,captured_on)
);
ALTER TABLE saas_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_usage_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY saas_usage_read ON saas_usage_snapshots FOR SELECT USING(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id()) OR EXISTS(SELECT 1 FROM churches c WHERE c.billing_account_id=saas_usage_snapshots.billing_account_id AND c.id=tenant_id() AND local_role()='admin'));
CREATE POLICY saas_usage_write ON saas_usage_snapshots FOR ALL USING(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())) WITH CHECK(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id()));
GRANT SELECT,INSERT,UPDATE ON saas_usage_snapshots TO ecclesia_app;
GRANT ALL ON saas_usage_snapshots TO ecclesia_service;
