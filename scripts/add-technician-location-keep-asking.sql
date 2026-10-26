-- Office "keep asking until location is on" for a technician phone.
-- Safe to re-run.

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_keep_asking boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
