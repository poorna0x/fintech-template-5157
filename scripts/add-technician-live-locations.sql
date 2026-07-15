-- Live technician location for the Android wrapper app.
-- One row per technician (upsert, not append) so storage/egress stays tiny.
-- Run in Supabase SQL editor. Requires helpers from secure-all-rls.sql
-- (public.is_admin_user()).

CREATE TABLE IF NOT EXISTS public.technician_live_locations (
  technician_id uuid PRIMARY KEY REFERENCES public.technicians(id) ON DELETE CASCADE,
  -- Nullable: the row is created when sharing is enabled, before the first GPS fix.
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  speed double precision,
  heading double precision,
  is_tracking boolean NOT NULL DEFAULT true,
  -- Admin sets this while viewing; the app only uploads while it is fresh.
  ping_requested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS ping_requested_at timestamptz;

-- In case the table was created by an earlier version with NOT NULL coords.
ALTER TABLE public.technician_live_locations ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.technician_live_locations ALTER COLUMN longitude DROP NOT NULL;

-- FCM device token of the technician's Android app (used to wake it for a location request).
ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS fcm_token text;

-- One-time nonce included in the location-request push; the app's native code
-- echoes it back to upload-tech-location as proof it received the push.
ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS ping_nonce text;

COMMENT ON TABLE public.technician_live_locations IS
  'Latest known location per technician (single row). App uploads only while an admin is viewing (ping_requested_at fresh).';

-- Realtime: tech app listens for admin pings; admin view listens for location updates.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_live_locations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.technician_live_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tech_live_loc_select ON public.technician_live_locations;
DROP POLICY IF EXISTS tech_live_loc_insert ON public.technician_live_locations;
DROP POLICY IF EXISTS tech_live_loc_update ON public.technician_live_locations;
DROP POLICY IF EXISTS tech_live_loc_delete ON public.technician_live_locations;

-- Admins see everyone; a technician sees only their own row.
CREATE POLICY tech_live_loc_select
  ON public.technician_live_locations FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

-- Technicians write only their own row.
CREATE POLICY tech_live_loc_insert
  ON public.technician_live_locations FOR INSERT TO authenticated
  WITH CHECK (technician_id = auth.uid() OR public.is_admin_user());

CREATE POLICY tech_live_loc_update
  ON public.technician_live_locations FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() OR public.is_admin_user())
  WITH CHECK (technician_id = auth.uid() OR public.is_admin_user());

CREATE POLICY tech_live_loc_delete
  ON public.technician_live_locations FOR DELETE TO authenticated
  USING (technician_id = auth.uid() OR public.is_admin_user());
