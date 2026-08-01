-- Auto Ask OTP after tech is on-site for 5 minutes.
-- otp_onsite_detected_at = first time GPS reported near (server clock — survives app kill).
-- otp_auto_asked_at = when Ask OTP was auto-sent (once).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS otp_auto_asked_at timestamptz;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS otp_onsite_detected_at timestamptz;

COMMENT ON COLUMN public.jobs.otp_auto_asked_at IS
  'When the app auto-sent Ask OTP after on-site dwell; NULL means never auto-asked.';

COMMENT ON COLUMN public.jobs.otp_onsite_detected_at IS
  'First time the technician app reported GPS near this OTP job (server dwell start).';

CREATE INDEX IF NOT EXISTS jobs_otp_auto_asked_at_idx
  ON public.jobs (otp_auto_asked_at)
  WHERE otp_auto_asked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_otp_onsite_detected_at_idx
  ON public.jobs (otp_onsite_detected_at)
  WHERE otp_onsite_detected_at IS NOT NULL;
