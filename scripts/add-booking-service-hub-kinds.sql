-- Hub service kinds: normal | callback | no_service
-- Safe to re-run.

ALTER TABLE public.booking_service_hubs
  ADD COLUMN IF NOT EXISTS service_kind text NOT NULL DEFAULT 'normal';

UPDATE public.booking_service_hubs
SET service_kind = 'normal'
WHERE service_kind IS NULL OR btrim(service_kind) = '';

ALTER TABLE public.booking_service_hubs
  DROP CONSTRAINT IF EXISTS booking_service_hubs_service_kind;

ALTER TABLE public.booking_service_hubs
  ADD CONSTRAINT booking_service_hubs_service_kind
  CHECK (service_kind IN ('normal', 'callback', 'no_service'));
