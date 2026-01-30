-- Add price_at_time_of_use column to job_parts_used table
-- This stores the price of the inventory item at the time it was used
-- Critical for historical accuracy in analytics and financial calculations

-- Step 1: Add the column
ALTER TABLE public.job_parts_used 
ADD COLUMN IF NOT EXISTS price_at_time_of_use DECIMAL(10, 2);

-- Step 2: Add comment
COMMENT ON COLUMN public.job_parts_used.price_at_time_of_use IS 'Price of the inventory item at the time it was used (for historical accuracy in analytics). Stored when part is added to job.';

-- Step 3: Backfill existing data with current inventory prices
-- This ensures existing records have a price (uses current price as fallback)
UPDATE public.job_parts_used jpu
SET price_at_time_of_use = inv.price
FROM public.inventory inv
WHERE jpu.inventory_id = inv.id
  AND jpu.price_at_time_of_use IS NULL;

-- Step 4: Verify the update
-- SELECT 
--   COUNT(*) as total_records,
--   COUNT(price_at_time_of_use) as records_with_price,
--   COUNT(*) - COUNT(price_at_time_of_use) as records_without_price
-- FROM public.job_parts_used;
