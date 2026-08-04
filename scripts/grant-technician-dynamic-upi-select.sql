-- Fix 403 on Settings → Edit Technician after Dynamic UPI columns were added.
-- Cause: column-level SELECT grants omit the new fields; PostgREST denies the
-- update…returning select that includes upi_id / payee_name / upi_phone /
-- dynamic_upi_enabled.
-- Safe to re-run (columns already exist from add-technician-dynamic-upi.sql).

GRANT SELECT (upi_id, payee_name, upi_phone, dynamic_upi_enabled)
  ON TABLE public.technicians TO authenticated;
