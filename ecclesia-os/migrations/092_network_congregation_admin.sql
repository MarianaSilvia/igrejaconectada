-- Network supervisors can manage child units without a local membership.
CREATE OR REPLACE FUNCTION public.list_network_congregations()
RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid,people_count integer,user_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT c.id,c.name,c.unit_type,c.parent_church_id,c.active,c.billing_account_id,
    (SELECT count(*)::int FROM people p WHERE p.church_id=c.id AND p.status<>'inactive'),
    (SELECT count(*)::int FROM memberships m WHERE m.church_id=c.id)
  FROM churches c JOIN churches parent ON parent.id=c.parent_church_id
  WHERE EXISTS (SELECT 1 FROM network_members nm WHERE nm.network_id=parent.network_id AND nm.user_id=actor_id() AND nm.role='network_admin')
    AND parent.unit_type='sede'
  ORDER BY c.name
$$;
CREATE OR REPLACE FUNCTION public.create_network_congregation(p_parent uuid,p_name text,p_region uuid DEFAULT NULL)
RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent churches%ROWTYPE; child churches%ROWTYPE;
BEGIN
  SELECT * INTO parent FROM churches WHERE churches.id=p_parent;
  IF parent.id IS NULL OR parent.unit_type<>'sede' OR NOT EXISTS (SELECT 1 FROM network_members nm WHERE nm.network_id=parent.network_id AND nm.user_id=actor_id() AND nm.role='network_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO churches(network_id,region_id,name,unit_type,parent_church_id,billing_account_id) VALUES(parent.network_id,COALESCE(p_region,parent.region_id),p_name,'congregacao',parent.id,parent.billing_account_id) RETURNING * INTO child;
  INSERT INTO campuses(church_id,name) VALUES(child.id,'Sede da congregação');
  RETURN QUERY SELECT child.id,child.name,child.unit_type,child.parent_church_id,child.active,child.billing_account_id;
END $$;
CREATE OR REPLACE FUNCTION public.update_network_congregation(p_id uuid,p_name text,p_active boolean DEFAULT NULL)
RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE child churches%ROWTYPE;
BEGIN
  SELECT c.* INTO child FROM churches c JOIN churches parent ON parent.id=c.parent_church_id WHERE c.id=p_id AND parent.unit_type='sede' AND EXISTS (SELECT 1 FROM network_members nm WHERE nm.network_id=parent.network_id AND nm.user_id=actor_id() AND nm.role='network_admin');
  IF child.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  UPDATE churches SET name=COALESCE(p_name,name),active=COALESCE(p_active,active) WHERE churches.id=p_id RETURNING * INTO child;
  RETURN QUERY SELECT child.id,child.name,child.unit_type,child.parent_church_id,child.active,child.billing_account_id;
END $$;
GRANT EXECUTE ON FUNCTION public.list_network_congregations(),public.create_network_congregation(uuid,text,uuid),public.update_network_congregation(uuid,text,boolean) TO ecclesia_app;
