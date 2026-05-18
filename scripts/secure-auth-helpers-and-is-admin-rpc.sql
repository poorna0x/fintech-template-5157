-- CRITICAL: is_admin_user() must be false for anon; do not expose as a public RPC.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Fixes scanners reporting is_admin_user → true with anon key (caused by auth_user_role()
-- defaulting to 'admin' when auth.uid() IS NULL).

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      'admin'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- Block anon/PUBLIC RPC calls; authenticated still needs EXECUTE for RLS policy expressions.
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
