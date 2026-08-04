-- Add payment phone to common QR dynamic UPI info (shown on pay links / share).
-- Run once in Supabase SQL Editor (shared HydrogenRO + ElevenRO).

ALTER TABLE public.common_qr_codes
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.common_qr_codes.phone IS
  'Payment phone for dynamic UPI / share pay links (optional)';
