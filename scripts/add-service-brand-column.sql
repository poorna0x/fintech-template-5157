-- Add service_brand column to jobs table
-- Stores which brand was used when completing a job: 'elevenro' or 'hydrogenro'

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS service_brand TEXT;

-- Index for quick lookups by brand
CREATE INDEX IF NOT EXISTS idx_jobs_service_brand ON public.jobs (service_brand);
