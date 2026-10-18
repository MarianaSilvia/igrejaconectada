CREATE POLICY account_invites_service ON account_invites FOR ALL TO ecclesia_service USING(true) WITH CHECK(true);
CREATE POLICY account_recoveries_service ON account_recoveries FOR ALL TO ecclesia_service USING(true) WITH CHECK(true);
CREATE POLICY mfa_changes_service ON mfa_changes FOR ALL TO ecclesia_service USING(true) WITH CHECK(true);
CREATE POLICY mfa_backup_codes_service ON mfa_backup_codes FOR ALL TO ecclesia_service USING(true) WITH CHECK(true);
CREATE POLICY security_attempts_service ON security_attempts FOR ALL TO ecclesia_service USING(true) WITH CHECK(true);
CREATE POLICY action_permissions_admin ON action_permissions FOR ALL TO ecclesia_app USING(church_id=tenant_id() AND local_role()='admin') WITH CHECK(church_id=tenant_id() AND local_role()='admin');
CREATE POLICY saas_plan_limits_service ON saas_plan_limits FOR SELECT TO ecclesia_service USING(true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION enqueue_pix_creation() FROM anon;
    REVOKE ALL ON FUNCTION record_saas_contract_change() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION enqueue_pix_creation() FROM authenticated;
    REVOKE ALL ON FUNCTION record_saas_contract_change() FROM authenticated;
  END IF;
  REVOKE ALL ON FUNCTION enqueue_pix_creation() FROM PUBLIC;
  REVOKE ALL ON FUNCTION record_saas_contract_change() FROM PUBLIC;
END $$;
ALTER FUNCTION actor_id() SET search_path=public,pg_temp;
ALTER FUNCTION tenant_id() SET search_path=public,pg_temp;
ALTER FUNCTION check_entry_balance() SET search_path=public,pg_temp;
ALTER FUNCTION check_open_period() SET search_path=public,pg_temp;
ALTER FUNCTION protect_posted_lines() SET search_path=public,pg_temp;
ALTER FUNCTION prevent_resource_overlap() SET search_path=public,pg_temp;
GRANT EXECUTE ON FUNCTION enqueue_pix_creation(),record_saas_contract_change() TO ecclesia_service;
