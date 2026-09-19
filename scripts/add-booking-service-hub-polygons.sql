-- Optional coverage polygon for booking hubs.
-- Empty [] = use the circle (lat/lng + radius_km).
-- 3–16 points = bookings allowed only inside that shape.
-- Safe to re-run.

ALTER TABLE public.booking_service_hubs
  ADD COLUMN IF NOT EXISTS polygon jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.booking_service_hubs
  DROP CONSTRAINT IF EXISTS booking_service_hubs_polygon_shape;

ALTER TABLE public.booking_service_hubs
  ADD CONSTRAINT booking_service_hubs_polygon_shape CHECK (
    jsonb_typeof(polygon) = 'array'
    AND (
      jsonb_array_length(polygon) = 0
      OR (
        jsonb_array_length(polygon) BETWEEN 3 AND 16
      )
    )
  );
