DROP FUNCTION IF EXISTS platform_billing_accounts_view();
CREATE FUNCTION platform_billing_accounts_view() RETURNS TABLE(id uuid,name text,status text,currency text,billing_cycle text,provider text,created_at timestamptz,owner_church_id uuid,owner_church text,network_id uuid,network_name text,plan text,children_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT b.id,b.name,b.status,b.currency,b.billing_cycle,b.provider,b.created_at,c.id,c.name,n.id,n.name,COALESCE(co.plan,'piloto'),COUNT(DISTINCT child.id)::int
  FROM billing_accounts b JOIN churches c ON c.id=b.owner_church_id JOIN networks n ON n.id=c.network_id
  LEFT JOIN churches child ON child.billing_account_id=b.id AND child.id<>b.owner_church_id
  LEFT JOIN LATERAL (SELECT plan FROM saas_contracts WHERE billing_account_id=b.id OR church_id=c.id ORDER BY updated_at DESC LIMIT 1) co ON true
  WHERE EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id())
  GROUP BY b.id,c.id,n.id,co.plan ORDER BY b.name
$$;
