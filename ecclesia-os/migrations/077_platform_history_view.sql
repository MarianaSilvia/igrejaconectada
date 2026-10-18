CREATE OR REPLACE FUNCTION platform_contract_history_view() RETURNS TABLE(id uuid,billing_account_id uuid,billing_account text,contract_id uuid,previous_plan text,new_plan text,previous_status text,new_status text,reason text,changed_by uuid,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT e.id,e.billing_account_id,b.name,e.contract_id,e.previous_plan,e.new_plan,e.previous_status,e.new_status,e.reason,e.changed_by,e.created_at
  FROM saas_contract_events e JOIN billing_accounts b ON b.id=e.billing_account_id
  WHERE EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  ORDER BY e.created_at DESC LIMIT 500
$$;
GRANT EXECUTE ON FUNCTION platform_contract_history_view() TO ecclesia_app;
