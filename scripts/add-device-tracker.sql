-- Device tracker v2: per-phone names, auto device model, granular push_prefs.
-- Removes SIM slot (not needed). Run once in Supabase SQL Editor. Safe to re-run.

-- ── Admin devices ────────────────────────────────────────────────────────────

ALTER TABLE public.admin_push_tokens
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.admin_push_tokens DROP COLUMN IF EXISTS call_sim_slot;

-- ── Technician devices ───────────────────────────────────────────────────────

ALTER TABLE public.technician_push_tokens
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.technician_push_tokens DROP COLUMN IF EXISTS call_sim_slot;

COMMENT ON COLUMN public.admin_push_tokens.push_prefs IS
  'Per-category push toggles. Empty {} = all categories enabled. Keys: job_assigned, job_status, customer_calls, tech_search, tech_messages, reminders, cash_check, day_summary, new_booking, parts_reminder.';

COMMENT ON COLUMN public.technician_push_tokens.push_prefs IS
  'Per-category push toggles. Empty {} = all enabled. Keys: job_assigned, job_nudges, office_messages, otp_request, location_ping, parts_reminder, bill_reminders.';

-- Registration RPC: reassign owner on login but preserve admin-edited prefs.
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
