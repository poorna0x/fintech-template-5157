-- Add indexes on unindexed foreign keys (improves JOINs and CASCADE performance).
-- Copy-paste into Supabase Dashboard > SQL Editor.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_amc_contracts_renewed_from_amc_id
  ON public.amc_contracts (renewed_from_amc_id);

CREATE INDEX IF NOT EXISTS idx_tax_invoices_job_id
  ON public.tax_invoices (job_id);

COMMIT;
