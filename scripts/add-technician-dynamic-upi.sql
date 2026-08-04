-- Dynamic UPI fields on technician personal payment QR (Settings → Edit Technician).
-- Run once in Supabase SQL Editor (shared HydrogenRO + ElevenRO).
-- Note: payment phone is upi_phone so it does not collide with technicians.phone.
--
-- technicians uses column-level SELECT grants (see
-- secure-technicians-drop-password-and-restrict-salary.sql). New columns must be
-- GRANTed or PostgREST returns 403 on select/update…returning.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS upi_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payee_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS upi_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dynamic_upi_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.technicians.upi_id IS
  'VPA for dynamic UPI QR when dynamic_upi_enabled is true';
COMMENT ON COLUMN public.technicians.payee_name IS
  'Payee name (pn) for technician dynamic UPI; falls back to full_name';
COMMENT ON COLUMN public.technicians.upi_phone IS
  'Payment phone shown on pay links / share (optional; separate from contact phone)';
COMMENT ON COLUMN public.technicians.dynamic_upi_enabled IS
  'When true, job-complete can show a live UPI QR with bill amount for this technician QR';

GRANT SELECT (upi_id, payee_name, upi_phone, dynamic_upi_enabled)
  ON TABLE public.technicians TO authenticated;
