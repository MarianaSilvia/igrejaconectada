-- Allow the internal service role to complete Firebase session synchronization.
-- The policy is intentionally limited to the service role; tenant requests remain
-- governed by ecclesia_app policies and RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='memberships'
      AND policyname='memberships_service_auth'
  ) THEN
    CREATE POLICY memberships_service_auth
      ON public.memberships FOR ALL TO ecclesia_service
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='network_members'
      AND policyname='network_members_service_auth'
  ) THEN
    CREATE POLICY network_members_service_auth
      ON public.network_members FOR ALL TO ecclesia_service
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='platform_memberships'
      AND policyname='platform_memberships_service_auth'
  ) THEN
    CREATE POLICY platform_memberships_service_auth
      ON public.platform_memberships FOR ALL TO ecclesia_service
      USING (true) WITH CHECK (true);
  END IF;
END
$$;
