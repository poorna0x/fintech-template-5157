-- Add CUSTOM option to preferred_time_slot constraint
-- Also add custom_time field to store the exact time when CUSTOM is selected

-- Step 1: First, update any invalid or NULL values to a valid default
UPDATE customers 
SET preferred_time_slot = 'MORNING' 
WHERE preferred_time_slot IS NULL 
   OR preferred_time_slot NOT IN ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM');

-- Step 2: Drop the existing constraint
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_preferred_time_slot_check;

-- Step 3: Add custom_time column first (if it doesn't exist)
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS custom_time VARCHAR(10);

-- Step 4: Add the new constraint with CUSTOM option
ALTER TABLE customers 
ADD CONSTRAINT customers_preferred_time_slot_check 
CHECK (preferred_time_slot IN ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM'));

-- Step 5: Add comment for documentation
COMMENT ON COLUMN customers.custom_time IS 'Exact time in HH:MM format when preferred_time_slot is CUSTOM';

