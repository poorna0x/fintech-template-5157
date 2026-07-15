-- When the GPS coordinates were actually measured (vs updated_at = upload time).
-- Lets the admin view distinguish a genuinely fresh fix from a cached
-- last-known position and label old positions honestly.
-- Includes ping_nonce in case the earlier patch wasn't run. Run in Supabase SQL editor.

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS ping_nonce text;

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS fix_time timestamptz;
