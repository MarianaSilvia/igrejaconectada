-- Extend the restricted member identity function to create the local member link
-- atomically, without granting INSERT on memberships to the application role.
DROP FUNCTION IF EXISTS public.create_member_identity(text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.create_member_identity(
  p_church_id uuid,
  p_email text,
  p_name text,
  p_password_hash text,
  p_access_code text,
  p_pin_hash text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_id uuid;
  v_context uuid;
BEGIN
  v_context := nullif(current_setting('app.church', true), '')::uuid;
  IF v_context IS NULL OR v_context <> p_church_id THEN
    RAISE EXCEPTION 'Invalid church context';
  END IF;

  INSERT INTO public.users(
    email,name,password_hash,member_access_code,member_pin_hash,member_pin_must_change
  )
  VALUES (p_email,p_name,p_password_hash,p_access_code,p_pin_hash,true)
  RETURNING id INTO v_id;

  INSERT INTO public.memberships(user_id,church_id,role)
  VALUES (v_id,p_church_id,'member');

  RETURN v_id;
END
$$;

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['public','anon','authenticated'] LOOP
    IF target='public' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=target) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.create_member_identity(uuid,text,text,text,text,text) FROM %I',
        target
      );
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.create_member_identity(uuid,text,text,text,text,text)
  TO ecclesia_app, ecclesia_service;