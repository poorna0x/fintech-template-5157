-- Backup payment QRs for a technician. Shown only after the primary QR
-- has been on screen 30 seconds and the technician says the payment failed.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS backup_qr_code_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.technicians.backup_qr_code_ids IS
  'Payment QR ids (common_<uuid> or technician_<uuid>) used when the primary QR fails on the job. Empty = no backup.';

GRANT SELECT (backup_qr_code_ids) ON TABLE public.technicians TO authenticated;
GRANT INSERT (backup_qr_code_ids) ON TABLE public.technicians TO authenticated;
GRANT UPDATE (backup_qr_code_ids) ON TABLE public.technicians TO authenticated;

NOTIFY pgrst, 'reload schema';
