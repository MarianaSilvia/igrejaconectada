-- Retired congregations stay in the database for audit/history but are not
-- offered as active units in context or governance lists.
CREATE OR REPLACE FUNCTION public.list_network_congregations()
RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid,people_count integer,user_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT c.id,c.name,c.unit_type,c.parent_church_id,c.active,c.billing_account_id,
    (SELECT count(*)::int FROM people p WHERE p.church_id=c.id AND p.status<>'inactive'),
    (SELECT count(*)::int FROM memberships m WHERE m.church_id=c.id)
  FROM churches c JOIN churches parent ON parent.id=c.parent_church_id
  WHERE c.active=true
    AND EXISTS (SELECT 1 FROM network_members nm WHERE nm.network_id=parent.network_id AND nm.user_id=actor_id() AND nm.role='network_admin')
    AND parent.unit_type='sede'
  ORDER BY c.name
$$;

CREATE OR REPLACE FUNCTION public.list_congregations()
RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid,people_count integer,user_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT c.id,c.name,c.unit_type,c.parent_church_id,c.active,c.billing_account_id,
    (SELECT count(*)::int FROM people p WHERE p.church_id=c.id AND p.status<>'inactive'),
    (SELECT count(*)::int FROM memberships m WHERE m.church_id=c.id)
  FROM churches c JOIN churches parent ON parent.id=c.parent_church_id
  WHERE c.active=true AND c.parent_church_id=tenant_id() AND parent.unit_type='sede' AND local_role()='admin'
  ORDER BY c.name
$$;

GRANT EXECUTE ON FUNCTION public.list_network_congregations(),public.list_congregations() TO ecclesia_app, ecclesia_service;

