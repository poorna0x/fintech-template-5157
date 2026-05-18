-- HOTFIX: Restore authenticated EXECUTE on is_admin_user so RLS policies work again.
-- secure-auth-helpers-and-is-admin-rpc.sql revoked authenticated by mistake — admins saw empty data.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Keep: anon cannot call these via PostgREST. Logged-in users need EXECUTE for RLS expressions.

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM anon;

GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
