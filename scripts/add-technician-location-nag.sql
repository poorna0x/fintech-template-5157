-- Per technician: phone asks to turn location back on from 8 AM to 8 PM IST.
-- Safe to re-run.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS location_nag_enabled boolean NOT NULL DEFAULT false;

GRANT SELECT (location_nag_enabled) ON TABLE public.technicians TO authenticated;

NOTIFY pgrst, 'reload schema';
