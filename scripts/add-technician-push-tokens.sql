-- FCM device tokens for the technician Android app.
-- One row per DEVICE (token is the key), so a technician logged in on two
-- phones gets pushes on both — previously only the last device to open the
-- app received them (single fcm_token column on technician_live_locations,
-- which is kept as a legacy fallback until every phone re-registers).
-- Run in Supabase SQL editor. Requires public.is_admin_user() from secure-all-rls.sql.

CREATE TABLE IF NOT EXISTS public.technician_push_tokens (
  token text PRIMARY KEY,             -- the FCM device token
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS technician_push_tokens_technician_idx
  ON public.technician_push_tokens (technician_id);

ALTER TABLE public.technician_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tech_push_tokens_select ON public.technician_push_tokens;
DROP POLICY IF EXISTS tech_push_tokens_insert ON public.technician_push_tokens;
DROP POLICY IF EXISTS tech_push_tokens_update ON public.technician_push_tokens;
DROP POLICY IF EXISTS tech_push_tokens_delete ON public.technician_push_tokens;

-- A technician manages only their own device rows; admins see everything.
-- The send functions use the service role and bypass RLS.
CREATE POLICY tech_push_tokens_select
  ON public.technician_push_tokens FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY tech_push_tokens_insert
  ON public.technician_push_tokens FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

-- Update covers the upsert path when the same device re-registers, including
-- after a different technician logs in on this phone (token stays, owner changes).
CREATE POLICY tech_push_tokens_update
  ON public.technician_push_tokens FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid())
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY tech_push_tokens_delete
  ON public.technician_push_tokens FOR DELETE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

-- Registration RPC: reassigns the device row to whoever is logged in now.
-- Needed because plain RLS would block technician B from updating a token
-- row still owned by technician A after a phone changes hands without logout.
-- The FK to technicians guarantees only technician accounts can register.
CREATE OR REPLACE FUNCTION public.register_technician_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR length(trim(p_token)) < 20 THEN
    RAISE EXCEPTION 'invalid token registration';
  END IF;
  INSERT INTO public.technician_push_tokens (token, technician_id, updated_at)
  VALUES (trim(p_token), auth.uid(), now())
  ON CONFLICT (token) DO UPDATE
    SET technician_id = auth.uid(), updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_technician_push_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_technician_push_token(text) TO authenticated;
