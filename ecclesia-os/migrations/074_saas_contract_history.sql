CREATE TABLE IF NOT EXISTS saas_contract_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 billing_account_id uuid REFERENCES billing_accounts(id),
 contract_id uuid NOT NULL REFERENCES saas_contracts(id),
 previous_plan text, new_plan text,
 previous_status text, new_status text,
 reason text NOT NULL DEFAULT '',
 changed_by uuid REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE saas_contract_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_contract_events FORCE ROW LEVEL SECURITY;
CREATE POLICY saas_contract_events_read ON saas_contract_events FOR SELECT USING(EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id()) OR EXISTS(SELECT 1 FROM churches c JOIN saas_contracts co ON co.church_id=c.id WHERE co.id=saas_contract_events.contract_id AND c.id=tenant_id() AND local_role()='admin'));
GRANT SELECT,INSERT ON saas_contract_events TO ecclesia_app;
CREATE OR REPLACE FUNCTION record_saas_contract_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.plan IS DISTINCT FROM NEW.plan OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO saas_contract_events(billing_account_id,contract_id,previous_plan,new_plan,previous_status,new_status,changed_by)
    VALUES(NEW.billing_account_id,NEW.id,OLD.plan,NEW.plan,OLD.status,NEW.status,actor_id());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_contract_change_audit ON saas_contracts;
CREATE TRIGGER saas_contract_change_audit AFTER UPDATE ON saas_contracts FOR EACH ROW EXECUTE FUNCTION record_saas_contract_change();
