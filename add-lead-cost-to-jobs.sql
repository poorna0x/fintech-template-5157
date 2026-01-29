-- Add lead_cost column to jobs table
-- Run this in Supabase SQL Editor

-- Step 1: Add lead_cost column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jobs' AND column_name = 'lead_cost'
    ) THEN
        ALTER TABLE public.jobs 
        ADD COLUMN lead_cost DECIMAL(10,2) DEFAULT 0;
    END IF;
END $$;

-- Step 2: Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_jobs_lead_cost ON public.jobs(lead_cost);

-- Step 3: Update existing jobs with default lead costs based on lead_source from requirements JSONB
-- This extracts lead_source from the requirements JSONB column and sets default costs
-- This is optional - you can run this to backfill existing data
WITH lead_source_extracted AS (
    SELECT 
        id,
        LOWER(COALESCE(
            CASE 
                WHEN jsonb_typeof(requirements) = 'array' AND jsonb_array_length(requirements) > 0 
                THEN requirements->0->>'lead_source'
                WHEN jsonb_typeof(requirements) = 'object' 
                THEN requirements->>'lead_source'
                ELSE NULL
            END, ''
        )) AS lead_source_lower
    FROM public.jobs
    WHERE lead_cost IS NULL OR lead_cost = 0
)
UPDATE public.jobs j
SET lead_cost = CASE
    WHEN ls.lead_source_lower LIKE '%home triangle%' OR ls.lead_source_lower LIKE '%hometriangle%' THEN 200
    WHEN ls.lead_source_lower LIKE '%ro care%' OR ls.lead_source_lower LIKE '%rocare%' THEN 400
    WHEN ls.lead_source_lower LIKE '%local ramu%' OR ls.lead_source_lower LIKE '%localramu%' THEN 500
    WHEN ls.lead_source_lower LIKE '%direct call%' OR ls.lead_source_lower LIKE '%directcall%' THEN 0
    WHEN ls.lead_source_lower LIKE '%google%' THEN 0
    ELSE 0
END
FROM lead_source_extracted ls
WHERE j.id = ls.id;

-- Verify the column was added:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'jobs' AND column_name = 'lead_cost';
