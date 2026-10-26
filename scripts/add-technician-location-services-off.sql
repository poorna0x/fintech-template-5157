-- Phone location master switch, reported when an admin live-location check
-- finds it off. Safe to re-run.

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_services_off boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
