-- Customer-facing hub messages.
-- Run in Supabase SQL Editor. Safe to re-run.
-- Requires scripts/add-booking-service-hubs.sql first.

ALTER TABLE public.booking_service_hubs
  ADD COLUMN IF NOT EXISTS customer_note text NOT NULL DEFAULT '';

ALTER TABLE public.booking_service_hubs
  DROP CONSTRAINT IF EXISTS booking_service_hubs_customer_note_len;
ALTER TABLE public.booking_service_hubs
  ADD CONSTRAINT booking_service_hubs_customer_note_len
  CHECK (char_length(customer_note) <= 240);

CREATE TABLE IF NOT EXISTS public.booking_service_hub_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  out_of_area_message text NOT NULL DEFAULT
    'We will not be able to come here. Please move the pin into a coverage area, or call us.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.booking_service_hub_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.booking_service_hub_settings
  DROP CONSTRAINT IF EXISTS booking_service_hub_settings_message_len;
ALTER TABLE public.booking_service_hub_settings
  ADD CONSTRAINT booking_service_hub_settings_message_len
  CHECK (char_length(btrim(out_of_area_message)) BETWEEN 1 AND 320);

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
