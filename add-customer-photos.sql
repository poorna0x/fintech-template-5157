-- Add photos column to customers for storing customer-level photos (not tied to a job).
-- Run in Supabase SQL Editor.

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customers.photos IS 'Array of photo URLs attached to the customer (e.g. profile/reference photos), not tied to any job.';
