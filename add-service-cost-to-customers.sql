-- Add service_cost column to customers table (for Calling page price filters: Below 1k, ≥2k, ≥3k, ≥5k)

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS service_cost DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.customers.service_cost IS 'Agreed/service cost in INR. Used in Calling page price filters.';

-- Optional: backfill from jobs or leave as 0
-- UPDATE public.customers c SET service_cost = COALESCE((SELECT agreed_amount FROM jobs j WHERE j.customer_id = c.id AND j.status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1), 0) WHERE c.service_cost IS NULL OR c.service_cost = 0;
