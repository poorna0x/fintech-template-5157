-- One-time nonce for native location uploads.
-- send-location-ping stores a fresh nonce here and includes it in the FCM data
-- push; the app's native code proves it received that push by echoing the
-- nonce to upload-tech-location, which verifies it before writing coordinates.
-- Run in Supabase SQL editor.

ALTER TABLE public.technician_live_locations
  ADD COLUMN IF NOT EXISTS ping_nonce text;
