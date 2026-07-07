-- Per-site equipment on customers + which site a job is for.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS alternate_brand character varying,
  ADD COLUMN IF NOT EXISTS alternate_model character varying,
  ADD COLUMN IF NOT EXISTS alternate_service_type character varying;

COMMENT ON COLUMN public.customers.alternate_brand IS 'Brand at secondary site (e.g. Aquaguard at Office).';
COMMENT ON COLUMN public.customers.alternate_model IS 'Model at secondary site.';
COMMENT ON COLUMN public.customers.alternate_service_type IS 'Service type at secondary site: RO or SOFTENER.';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS service_site character varying DEFAULT 'primary';

COMMENT ON COLUMN public.jobs.service_site IS 'primary or secondary — which customer site this job is for.';

-- Optional: enforce valid values (skip if you prefer loose text)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_service_site_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_service_site_check
      CHECK (service_site IS NULL OR service_site IN ('primary', 'secondary'));
  END IF;
END $$;
