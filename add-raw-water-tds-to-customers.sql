-- Add raw_water_tds column to customers table
-- TDS (Total Dissolved Solids) in ppm - captured during job completion when prefilter step is shown (RO jobs, not softener)
-- Editable in Edit Customer; shown in technician completed section and calling reports

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS raw_water_tds INTEGER DEFAULT 0;

COMMENT ON COLUMN public.customers.raw_water_tds IS 'Raw water TDS in ppm (before RO purification). Captured at job completion for RO customers (prefilter step). Default 0 for existing records.';

-- Backfill existing NULL values to 0
UPDATE public.customers SET raw_water_tds = 0 WHERE raw_water_tds IS NULL;
