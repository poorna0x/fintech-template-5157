-- Common payment QR: optional UPI ID + toggle for dynamic amount QR.
-- Run once in the Supabase SQL Editor (shared HydrogenRO + ElevenRO).

ALTER TABLE public.common_qr_codes
  ADD COLUMN IF NOT EXISTS upi_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payee_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dynamic_upi_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.common_qr_codes.upi_id IS
  'VPA for dynamic UPI QR (upi://pay) when dynamic_upi_enabled is true';
COMMENT ON COLUMN public.common_qr_codes.payee_name IS
  'Payee name (pn) for dynamic UPI intents; falls back to QR name';
COMMENT ON COLUMN public.common_qr_codes.phone IS
  'Payment phone for dynamic UPI / share pay links (optional)';
COMMENT ON COLUMN public.common_qr_codes.dynamic_upi_enabled IS
  'When true, technician/admin job-complete shows a live UPI QR with bill amount';
