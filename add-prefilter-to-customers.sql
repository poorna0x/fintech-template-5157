-- Add has_prefilter column to customers table
-- This column stores whether the customer has a prefilter (true/false/null)

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS has_prefilter BOOLEAN DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN customers.has_prefilter IS 'Indicates whether the customer has a prefilter installed. NULL means not set/unknown, true means yes, false means no.';

