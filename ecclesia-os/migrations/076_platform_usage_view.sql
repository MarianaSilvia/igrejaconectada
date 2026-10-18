CREATE OR REPLACE FUNCTION platform_usage_view() RETURNS TABLE(id uuid,billing_account_id uuid,billing_account text,captured_on date,churches_count integer,users_count integer,members_count integer,modules text[],plan text,max_churches integer,max_users integer,max_members integer,churches_over integer,users_over integer,members_over integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT u.id,u.billing_account_id,b.name,u.captured_on,u.churches_count,u.users_count,u.members_count,u.modules,COALESCE(co.plan,'piloto'),l.max_churches,l.max_users,l.max_members,u.churches_count-l.max_churches,u.users_count-l.max_users,u.members_count-l.max_members
  FROM saas_usage_snapshots u JOIN billing_accounts b ON b.id=u.billing_account_id
  LEFT JOIN LATERAL (SELECT plan FROM saas_contracts WHERE billing_account_id=b.id ORDER BY updated_at DESC LIMIT 1) co ON true
  LEFT JOIN saas_plan_limits l ON l.plan=COALESCE(co.plan,'piloto')
  WHERE EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  ORDER BY u.captured_on DESC,b.name
$$;
GRANT EXECUTE ON FUNCTION platform_usage_view() TO ecclesia_app;
