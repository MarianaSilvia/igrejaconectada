-- Soft deactivation for congregations. This preserves members, users and audit history.
CREATE OR REPLACE FUNCTION public.deactivate_congregation(p_id uuid)
RETURNS SETOF public.churches
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  child public.churches%ROWTYPE;
BEGIN
  SELECT c.* INTO child
  FROM public.churches AS c
  JOIN public.churches AS parent ON parent.id=c.parent_church_id
  WHERE c.id=p_id
    AND c.unit_type='congregacao'
    AND parent.unit_type='sede'
    AND EXISTS (
      SELECT 1 FROM public.network_members AS nm
      WHERE nm.network_id=parent.network_id
        AND nm.user_id=public.actor_id()
        AND nm.role='network_admin'
    );
  IF child.id IS NULL THEN
    RAISE EXCEPTION 'Congregação não encontrada ou sem autorização';
  END IF;
  UPDATE public.churches AS c
  SET active=false
  WHERE c.id=p_id
  RETURNING c.* INTO child;
  RETURN NEXT child;
END $$;

GRANT EXECUTE ON FUNCTION public.deactivate_congregation(uuid) TO ecclesia_app, ecclesia_service;
