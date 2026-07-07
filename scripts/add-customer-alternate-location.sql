-- Secondary customer location (mirrors alternate_phone pattern).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS alternate_address jsonb,
  ADD COLUMN IF NOT EXISTS alternate_location jsonb,
  ADD COLUMN IF NOT EXISTS alternate_visible_address character varying(100);

COMMENT ON COLUMN public.customers.alternate_address IS 'Secondary service address (same shape as address jsonb).';
COMMENT ON COLUMN public.customers.alternate_location IS 'Secondary map coordinates (same shape as location jsonb).';
COMMENT ON COLUMN public.customers.alternate_visible_address IS 'Short label for secondary location (e.g. Office, Shop).';
