-- Pilot access hardening: temporary passwords, MFA enrollment and network roles.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_must_change boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_enrollment_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.network_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'network_admin',
  ADD COLUMN IF NOT EXISTS granted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.mfa_enrollment_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mfa_enrollment_challenges_user_idx
  ON public.mfa_enrollment_challenges(user_id, expires_at);

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx
  ON public.mfa_recovery_codes(user_id, used_at);

CREATE TABLE IF NOT EXISTS public.auth_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email text,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_security_events_user_idx
  ON public.auth_security_events(user_id, created_at DESC);

ALTER TABLE public.mfa_enrollment_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mfa_enrollment_challenges_service_only ON public.mfa_enrollment_challenges;
CREATE POLICY mfa_enrollment_challenges_service_only ON public.mfa_enrollment_challenges
  FOR ALL TO ecclesia_app USING (false) WITH CHECK (false);

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfa_recovery_codes_service_only ON public.mfa_recovery_codes;
CREATE POLICY mfa_recovery_codes_service_only ON public.mfa_recovery_codes
  FOR ALL TO ecclesia_app USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS auth_security_events_service_only ON public.auth_security_events;
CREATE POLICY auth_security_events_service_only ON public.auth_security_events
  FOR ALL TO ecclesia_app USING (false) WITH CHECK (false);

UPDATE public.network_members
SET role='network_admin'
WHERE role IS NULL OR role='';

UPDATE public.users
SET password_must_change=true
WHERE password_must_change=false
  AND email IN ('admin@esperanca.demo','central@rede.demo','membro@esperanca.demo','admin@caminho.demo');
