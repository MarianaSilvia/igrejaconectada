-- Persist only the service policies explicitly approved for authentication.
-- ecclesia_service remains subject to RLS and has no BYPASSRLS privilege.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_service_auth') THEN
    CREATE POLICY users_service_auth ON public.users FOR ALL TO ecclesia_service USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_service_auth') THEN
    CREATE POLICY sessions_service_auth ON public.sessions FOR ALL TO ecclesia_service USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_challenges' AND policyname='login_challenges_service_auth') THEN
    CREATE POLICY login_challenges_service_auth ON public.login_challenges FOR ALL TO ecclesia_service USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mfa_enrollment_challenges' AND policyname='mfa_enrollment_challenges_service_auth') THEN
    CREATE POLICY mfa_enrollment_challenges_service_auth ON public.mfa_enrollment_challenges FOR ALL TO ecclesia_service USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mfa_recovery_codes' AND policyname='mfa_recovery_codes_service_auth') THEN
    CREATE POLICY mfa_recovery_codes_service_auth ON public.mfa_recovery_codes FOR ALL TO ecclesia_service USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auth_security_events' AND policyname='auth_security_events_service_auth') THEN
    CREATE POLICY auth_security_events_service_auth ON public.auth_security_events FOR ALL TO ecclesia_service USING (true) WITH CHECK (true);
  END IF;
END
$$;