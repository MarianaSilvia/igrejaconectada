CREATE TABLE financial_parties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),church_id uuid NOT NULL REFERENCES churches,name text NOT NULL,kind text NOT NULL CHECK(kind IN ('supplier','customer','other')),UNIQUE(church_id,id));
CREATE TABLE treasury_bills(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 kind text NOT NULL CHECK(kind IN ('payable','receivable')),description text NOT NULL,
 party_id uuid,fund_id uuid,cost_center_id uuid,amount_cents bigint NOT NULL CHECK(amount_cents>0),
 paid_cents bigint NOT NULL DEFAULT 0 CHECK(paid_cents>=0 AND paid_cents<=amount_cents),due_on date NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected','cancelled')),
 requested_by uuid NOT NULL REFERENCES users,approved_by uuid REFERENCES users,approval_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(church_id,id),
 CHECK(approved_by IS NULL OR approved_by<>requested_by),CHECK(status<>'approved' OR approved_by IS NOT NULL),
 FOREIGN KEY(church_id,party_id) REFERENCES financial_parties(church_id,id),
 FOREIGN KEY(church_id,fund_id) REFERENCES funds(church_id,id),
 FOREIGN KEY(church_id,cost_center_id) REFERENCES cost_centers(church_id,id)
);
CREATE TABLE treasury_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),church_id uuid NOT NULL REFERENCES churches,bill_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),request_key uuid NOT NULL,occurred_on date NOT NULL,
 entry_id uuid NOT NULL,executed_by uuid NOT NULL REFERENCES users,reversal_entry_id uuid,account_id uuid NOT NULL,
 UNIQUE(church_id,request_key),FOREIGN KEY(church_id,bill_id) REFERENCES treasury_bills(church_id,id),
 FOREIGN KEY(church_id,entry_id) REFERENCES journal_entries(church_id,id),
 FOREIGN KEY(church_id,reversal_entry_id) REFERENCES journal_entries(church_id,id),
 FOREIGN KEY(church_id,account_id) REFERENCES accounts(church_id,id)
);
CREATE TABLE treasury_budgets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),church_id uuid NOT NULL REFERENCES churches,cost_center_id uuid NOT NULL,month date NOT NULL CHECK(extract(day FROM month)=1),amount_cents bigint NOT NULL CHECK(amount_cents>0),UNIQUE(church_id,cost_center_id,month),FOREIGN KEY(church_id,cost_center_id) REFERENCES cost_centers(church_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['financial_parties','treasury_bills','treasury_payments','treasury_budgets'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY treasury_read ON %I FOR SELECT USING(church_id=tenant_id() AND can_access(''finance'') AND finance_scope_allowed())',t);
 EXECUTE format('GRANT SELECT ON %I TO ecclesia_app',t);
 EXECUTE format('GRANT ALL ON %I TO ecclesia_service',t);
END LOOP; END $$;
CREATE INDEX bills_due ON treasury_bills(church_id,status,due_on);
CREATE INDEX payment_bill ON treasury_payments(church_id,bill_id);
