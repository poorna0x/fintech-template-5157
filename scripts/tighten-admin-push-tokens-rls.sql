-- Scope admin_push_tokens UPDATE/DELETE to the owning admin (user_id = auth.uid()).
-- SELECT stays all-admins (needed for shared device lists in UI if any).
-- Service-role Netlify senders are unaffected.
-- Run in Supabase SQL Editor. Safe to re-run.
-- Requires public.is_admin_user().

DROP POLICY IF EXISTS admin_push_tokens_update ON public.admin_push_tokens;
DROP POLICY IF EXISTS admin_push_tokens_delete ON public.admin_push_tokens;

CREATE POLICY admin_push_tokens_update
  ON public.admin_push_tokens FOR UPDATE TO authenticated
  USING (public.is_admin_user() AND user_id = auth.uid())
  WITH CHECK (public.is_admin_user() AND user_id = auth.uid());

CREATE POLICY admin_push_tokens_delete
  ON public.admin_push_tokens FOR DELETE TO authenticated
  USING (public.is_admin_user() AND user_id = auth.uid());

COMMENT ON TABLE public.admin_push_tokens IS
  'Admin FCM tokens; clients may only mutate their own user_id rows; senders use service_role';
