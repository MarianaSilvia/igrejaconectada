CREATE OR REPLACE FUNCTION platform_billing_accounts_view() RETURNS TABLE(id uuid,name text,status text,currency text,billing_cycle text,provider text,created_at timestamptz,owner_church_id uuid,owner_church text,children_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT b.id,b.name,b.status,b.currency,b.billing_cycle,b.provider,b.created_at,c.id,c.name,COUNT(DISTINCT child.id)::int
  FROM billing_accounts b JOIN churches c ON c.id=b.owner_church_id
  LEFT JOIN churches child ON child.billing_account_id=b.id AND child.id<>b.owner_church_id
  WHERE EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  GROUP BY b.id,c.id ORDER BY b.name
$$;
CREATE OR REPLACE FUNCTION platform_billing_sales_view() RETURNS TABLE(billing_account_id uuid,name text,churches_count integer,contracts_count integer,monthly_cents bigint,overdue_invoices integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT b.id,b.name,COUNT(DISTINCT c.id)::int,COUNT(DISTINCT co.id)::int,COALESCE(SUM(DISTINCT co.monthly_cents),0)::bigint,COUNT(DISTINCT i.id) FILTER(WHERE i.status='overdue')::int
  FROM billing_accounts b LEFT JOIN churches c ON c.billing_account_id=b.id LEFT JOIN saas_contracts co ON co.billing_account_id=b.id OR co.church_id=c.id LEFT JOIN saas_invoices i ON i.billing_account_id=b.id OR i.church_id=c.id
  WHERE EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  GROUP BY b.id ORDER BY b.name
$$;
GRANT EXECUTE ON FUNCTION platform_billing_accounts_view(),platform_billing_sales_view() TO ecclesia_app;
