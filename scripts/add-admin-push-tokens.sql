-- FCM device tokens for the HRO Admin Android app.
-- One row per device; admins can have several devices. Used by the
-- notify-admins function to push "job started / completed" alerts.
-- Run in Supabase SQL editor. Requires public.is_admin_user() from secure-all-rls.sql.

CREATE TABLE IF NOT EXISTS public.admin_push_tokens (
  token text PRIMARY KEY,             -- the FCM device token
  user_id uuid NOT NULL,              -- auth user id of the admin who registered it
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_push_tokens_select ON public.admin_push_tokens;
DROP POLICY IF EXISTS admin_push_tokens_insert ON public.admin_push_tokens;
DROP POLICY IF EXISTS admin_push_tokens_update ON public.admin_push_tokens;
DROP POLICY IF EXISTS admin_push_tokens_delete ON public.admin_push_tokens;

-- Admins only, all operations (the send function uses the service role).
CREATE POLICY admin_push_tokens_select
  ON public.admin_push_tokens FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY admin_push_tokens_insert
  ON public.admin_push_tokens FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() AND user_id = auth.uid());

CREATE POLICY admin_push_tokens_update
  ON public.admin_push_tokens FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY admin_push_tokens_delete
  ON public.admin_push_tokens FOR DELETE TO authenticated
  USING (public.is_admin_user());
