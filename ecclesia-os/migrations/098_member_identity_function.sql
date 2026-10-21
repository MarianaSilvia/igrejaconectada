-- Create member identities through a narrow SECURITY DEFINER function.
-- The application never receives general INSERT permission on users.
CREATE OR REPLACE FUNCTION public.create_member_identity(
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
BEGIN
  INSERT INTO public.users(
    email,name,password_hash,member_access_code,member_pin_hash,member_pin_must_change
  )
  VALUES (p_email,p_name,p_password_hash,p_access_code,p_pin_hash,true)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.create_member_identity(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_member_identity(text,text,text,text,text)
  TO ecclesia_app, ecclesia_service;