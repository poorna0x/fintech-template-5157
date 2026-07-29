-- Crash reports from the Android apps (technician + admin).
-- The phone saves the stack trace when it crashes and uploads it the next time
-- the app process starts; report-app-crash.js authenticates by FCM device token
-- and writes here with the service role. Admins read it in Settings.
--
-- Repeat crashes of the same kind bump `occurrences` instead of inserting new
-- rows, so a crash loop can never blow up the table (or the egress bill).
-- Run once in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.app_crash_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL CHECK (app IN ('technician', 'admin')),
  -- 'crash' = the app died. 'warning' = a background path failed but the app
  -- survived (location service blocked, permission missing, …) — invisible
  -- to the technician, so it has to surface here.
  kind text NOT NULL DEFAULT 'crash' CHECK (kind IN ('crash', 'warning')),
  technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  device_token_suffix text,
  device_model text,
  app_version text,
  android_version text,
  -- exception + first app stack frame: what makes two crashes "the same".
  signature text NOT NULL,
  exception text NOT NULL,
  message text,
  stack text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety for installs created before `kind` existed.
ALTER TABLE public.app_crash_reports
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'crash';

CREATE INDEX IF NOT EXISTS app_crash_reports_last_seen_idx
  ON public.app_crash_reports (last_seen_at DESC);

-- Lookup path used by the function when folding a repeat crash into its row.
CREATE INDEX IF NOT EXISTS app_crash_reports_signature_idx
  ON public.app_crash_reports (signature, app, app_version);

ALTER TABLE public.app_crash_reports ENABLE ROW LEVEL SECURITY;

-- Admins read and clear; the phone never touches this table directly
-- (uploads go through the Netlify function on the service role).
DROP POLICY IF EXISTS app_crash_reports_admin_read ON public.app_crash_reports;
CREATE POLICY app_crash_reports_admin_read
  ON public.app_crash_reports
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS app_crash_reports_admin_delete ON public.app_crash_reports;
CREATE POLICY app_crash_reports_admin_delete
  ON public.app_crash_reports
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

COMMENT ON TABLE public.app_crash_reports IS
  'Android crash traces uploaded by the apps on next launch. Written by report-app-crash.js (service role); admins read/clear from Settings.';

COMMENT ON COLUMN public.app_crash_reports.signature IS
  'Exception class + first com.hydrogenro stack frame. Same signature + app_version folds into one row via occurrences.';
