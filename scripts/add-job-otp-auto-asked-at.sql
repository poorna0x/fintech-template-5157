-- One-shot marker: auto Ask OTP after tech is on-site for 5 minutes.
-- NULL = not yet auto-asked. Set atomically by auto-ask-otp-on-site.js.
-- Run once in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS otp_auto_asked_at timestamptz;

COMMENT ON COLUMN public.jobs.otp_auto_asked_at IS
  'When the app auto-sent Ask OTP after ~5 min on-site; NULL means never auto-asked.';

CREATE INDEX IF NOT EXISTS jobs_otp_auto_asked_at_idx
  ON public.jobs (otp_auto_asked_at)
  WHERE otp_auto_asked_at IS NOT NULL;
