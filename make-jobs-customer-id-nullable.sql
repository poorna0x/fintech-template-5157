-- Make customer_id nullable in jobs table for dummy/manual bill entry jobs
-- This allows creating jobs without associating them with a customer

ALTER TABLE jobs 
ALTER COLUMN customer_id DROP NOT NULL;

-- Update the foreign key constraint to allow NULL values
-- (The existing constraint should already allow NULL, but we'll verify)
-- Note: Foreign key constraints with ON DELETE CASCADE still allow NULL values

-- Add a comment to document this change
COMMENT ON COLUMN jobs.customer_id IS 'Customer ID - NULL for dummy/manual bill entry jobs that are not associated with any customer';

