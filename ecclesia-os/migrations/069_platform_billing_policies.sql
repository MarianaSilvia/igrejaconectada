DROP POLICY IF EXISTS saas_contract_read ON saas_contracts;
DROP POLICY IF EXISTS saas_contract_write ON saas_contracts;
CREATE POLICY saas_contract_read ON saas_contracts FOR SELECT USING(
  church_id=tenant_id() AND local_role()='admin'
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
);
CREATE POLICY saas_contract_write ON saas_contracts FOR ALL USING(
  church_id=tenant_id() AND local_role()='admin'
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
) WITH CHECK(
  church_id=tenant_id() AND local_role()='admin'
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
);
DROP POLICY IF EXISTS saas_invoice_read ON saas_invoices;
DROP POLICY IF EXISTS saas_invoice_write ON saas_invoices;
CREATE POLICY saas_invoice_read ON saas_invoices FOR SELECT USING(
  church_id=tenant_id() AND local_role()='admin'
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
);
CREATE POLICY saas_invoice_write ON saas_invoices FOR ALL USING(
  church_id=tenant_id() AND local_role()='admin'
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
) WITH CHECK(
  church_id=tenant_id() AND local_role()='admin'
  OR EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
);
