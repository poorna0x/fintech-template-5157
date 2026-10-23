-- Latest location-risk signal on the existing one-row live location table.
-- Does not store a location history. Safe to re-run.
-- Run in the Supabase SQL editor before the admin map can show the warning.
-- Until these columns exist, upload-tech-location still refuses a mock or
-- impossible fix, but the office map cannot explain why.

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_mock boolean NOT NULL DEFAULT false;

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_risk_score smallint NOT NULL DEFAULT 0;

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_risk_level text NOT NULL DEFAULT 'none';

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_risk_reasons text NOT NULL DEFAULT '';

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS location_risk_checked_at timestamptz;

COMMENT ON COLUMN public.technician_live_locations.location_mock IS
  'Last reading was marked mock by Android. The map keeps the last accepted coordinates.';
COMMENT ON COLUMN public.technician_live_locations.location_risk_reasons IS
  'Comma-separated reason codes from the server check. Not a location history.';
