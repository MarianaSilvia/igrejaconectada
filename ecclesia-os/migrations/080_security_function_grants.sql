DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION assigned_cell(uuid),assigned_person(uuid),campus_allowed(uuid),can_access(text,boolean),create_congregation(text,uuid,uuid),current_church_unit(),finance_scope_allowed(),is_network_member(uuid),list_congregations(),local_role(),membership_in_current_church(uuid),platform_billing_accounts_view(),platform_billing_sales_view(),platform_contract_history_view(),platform_invoice_export_view(text),platform_usage_view(),update_congregation(uuid,text,boolean) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION assigned_cell(uuid),assigned_person(uuid),campus_allowed(uuid),can_access(text,boolean),create_congregation(text,uuid,uuid),current_church_unit(),finance_scope_allowed(),is_network_member(uuid),list_congregations(),local_role(),membership_in_current_church(uuid),platform_billing_accounts_view(),platform_billing_sales_view(),platform_contract_history_view(),platform_invoice_export_view(text),platform_usage_view(),update_congregation(uuid,text,boolean) FROM authenticated;
  END IF;
  REVOKE ALL ON FUNCTION assigned_cell(uuid),assigned_person(uuid),campus_allowed(uuid),can_access(text,boolean),create_congregation(text,uuid,uuid),current_church_unit(),finance_scope_allowed(),is_network_member(uuid),list_congregations(),local_role(),membership_in_current_church(uuid),platform_billing_accounts_view(),platform_billing_sales_view(),platform_contract_history_view(),platform_invoice_export_view(text),platform_usage_view(),update_congregation(uuid,text,boolean) FROM PUBLIC;
END $$;
GRANT EXECUTE ON FUNCTION assigned_cell(uuid),assigned_person(uuid),campus_allowed(uuid),can_access(text,boolean),create_congregation(text,uuid,uuid),current_church_unit(),finance_scope_allowed(),is_network_member(uuid),list_congregations(),local_role(),membership_in_current_church(uuid),platform_billing_accounts_view(),platform_billing_sales_view(),platform_contract_history_view(),platform_invoice_export_view(text),platform_usage_view(),update_congregation(uuid,text,boolean) TO ecclesia_app;
