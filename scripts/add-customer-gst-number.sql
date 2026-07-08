-- Customer GSTIN for B2B docs (tax invoice, quotation, AMC).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS gst_number character varying(15);

COMMENT ON COLUMN public.customers.gst_number IS
  'Customer GSTIN when registered under GST. NULL/empty means customer does not have GST.';
