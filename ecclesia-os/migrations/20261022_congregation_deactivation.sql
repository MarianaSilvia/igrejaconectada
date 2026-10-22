-- Soft deactivation for congregations. This preserves members, users and audit history.
CREATE OR REPLACE FUNCTION public.deactivate_congregation(p_id uuid)
RETURNS TABLE(id uuid,name text,unit_type text,parent_church_id uuid,active boolean,billing_account_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  child churches%ROWTYPE;
BEGIN
  SELECT c.* INTO child
  FROM churches c
  JOIN churches parent ON parent.id=c.parent_church_id
  WHERE c.id=p_id
    AND c.unit_type='congregacao'
    AND parent.unit_type='sede'
    AND EXISTS (
      SELECT 1 FROM network_members nm
      WHERE nm.network_id=parent.network_id
        AND nm.user_id=actor_id()
        AND nm.role='network_admin'
    );
  IF child.id IS NULL THEN
    RAISE EXCEPTION 'Congregação não encontrada ou sem autorização';
  END IF;
  UPDATE churches SET active=false WHERE churches.id=p_id RETURNING * INTO child;
  RETURN QUERY SELECT child.id,child.name,child.unit_type,child.parent_church_id,child.active,child.billing_account_id;
END $$;

GRANT EXECUTE ON FUNCTION public.deactivate_congregation(uuid) TO ecclesia_app, ecclesia_service;
