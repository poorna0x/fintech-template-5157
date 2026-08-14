-- Secure public.app_secrets: service_role only (no anon / authenticated client access).
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Netlify functions read secrets via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Client JWTs must never SELECT this table.

DO $$
BEGIN
  IF to_regclass('public.app_secrets') IS NULL THEN
    RAISE NOTICE 'public.app_secrets does not exist — skip';
    RETURN;
  END IF;

  ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

  -- Drop any overly permissive policies if present
  DROP POLICY IF EXISTS "app_secrets_admin_all" ON public.app_secrets;
  DROP POLICY IF EXISTS "app_secrets_select" ON public.app_secrets;
  DROP POLICY IF EXISTS "Allow all for authenticated" ON public.app_secrets;
  DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_secrets;

  -- No policies for authenticated/anon → deny by default when RLS is on.
  -- service_role bypasses RLS.

  REVOKE ALL ON TABLE public.app_secrets FROM PUBLIC;
  REVOKE ALL ON TABLE public.app_secrets FROM anon;
  REVOKE ALL ON TABLE public.app_secrets FROM authenticated;
  GRANT ALL ON TABLE public.app_secrets TO service_role;

  RAISE NOTICE 'app_secrets locked to service_role';
END $$;
