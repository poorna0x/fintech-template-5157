-- Booking service hubs: named map pins with a coverage radius.
-- Public website / WhatsApp booking is allowed only when the pin falls inside
-- at least one *active* hub. If this table is empty (or all hubs are off),
-- booking stays unrestricted so we do not lock the city by accident.
--
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.booking_service_hubs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius_km numeric(6, 2) NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_service_hubs_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT booking_service_hubs_coords CHECK (
    lat BETWEEN -90 AND 90
    AND lng BETWEEN -180 AND 180
    AND NOT (lat = 0 AND lng = 0)
  ),
  CONSTRAINT booking_service_hubs_radius CHECK (radius_km >= 0.3 AND radius_km <= 30)
);

CREATE INDEX IF NOT EXISTS idx_booking_service_hubs_active
  ON public.booking_service_hubs (is_active, sort_order, name);

ALTER TABLE public.booking_service_hubs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_service_hubs FROM PUBLIC;
GRANT SELECT ON public.booking_service_hubs TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.booking_service_hubs TO authenticated, service_role;

DROP POLICY IF EXISTS booking_service_hubs_public_select ON public.booking_service_hubs;
CREATE POLICY booking_service_hubs_public_select
  ON public.booking_service_hubs
  FOR SELECT
  USING (
    is_active = true
    OR (SELECT public.is_admin_user())
  );

DROP POLICY IF EXISTS booking_service_hubs_admin_insert ON public.booking_service_hubs;
CREATE POLICY booking_service_hubs_admin_insert
  ON public.booking_service_hubs
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS booking_service_hubs_admin_update ON public.booking_service_hubs;
CREATE POLICY booking_service_hubs_admin_update
  ON public.booking_service_hubs
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS booking_service_hubs_admin_delete ON public.booking_service_hubs;
CREATE POLICY booking_service_hubs_admin_delete
  ON public.booking_service_hubs
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.booking_service_hubs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_service_hubs_set_updated_at ON public.booking_service_hubs;
CREATE TRIGGER booking_service_hubs_set_updated_at
  BEFORE UPDATE ON public.booking_service_hubs
  FOR EACH ROW
  EXECUTE FUNCTION public.booking_service_hubs_touch_updated_at();

-- Customer-facing copy (also in scripts/add-booking-service-hub-messages.sql).
ALTER TABLE public.booking_service_hubs
  ADD COLUMN IF NOT EXISTS customer_note text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.booking_service_hub_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  out_of_area_message text NOT NULL DEFAULT
    'We may not cover this area. Please call us if you need any help.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.booking_service_hub_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.booking_service_hub_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_service_hub_settings FROM PUBLIC;
GRANT SELECT ON public.booking_service_hub_settings TO anon, authenticated, service_role;
GRANT UPDATE ON public.booking_service_hub_settings TO authenticated, service_role;

DROP POLICY IF EXISTS booking_service_hub_settings_public_select ON public.booking_service_hub_settings;
CREATE POLICY booking_service_hub_settings_public_select
  ON public.booking_service_hub_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS booking_service_hub_settings_admin_update ON public.booking_service_hub_settings;
CREATE POLICY booking_service_hub_settings_admin_update
  ON public.booking_service_hub_settings
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
