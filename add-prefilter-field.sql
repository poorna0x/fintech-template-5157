-- Add has_prefilter field to customers table
-- This field indicates whether the customer has a prefilter installed

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS has_prefilter BOOLEAN DEFAULT NULL;

-- Add comment to the column
COMMENT ON COLUMN customers.has_prefilter IS 'Indicates whether the customer has a prefilter installed (true = yes, false = no, null = not set)';

