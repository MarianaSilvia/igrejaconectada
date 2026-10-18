CREATE OR REPLACE FUNCTION list_congregations() RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid,people_count integer,user_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT c.id,c.name,c.unit_type,c.parent_church_id,c.active,c.billing_account_id,
    (SELECT count(*)::int FROM people p WHERE p.church_id=c.id AND p.status<>'inactive'),
    (SELECT count(*)::int FROM memberships m WHERE m.church_id=c.id)
  FROM churches c JOIN churches parent ON parent.id=c.parent_church_id
  WHERE c.parent_church_id=tenant_id() AND parent.unit_type='sede' AND local_role()='admin'
  ORDER BY c.name
$$;
GRANT EXECUTE ON FUNCTION list_congregations() TO ecclesia_app;
