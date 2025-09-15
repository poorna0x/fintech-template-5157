-- Fix time slot constraints to support FIRST_HALF and SECOND_HALF
-- This script updates the database constraints for the new time slot values

-- Drop the existing check constraints
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_preferred_time_slot_check;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_scheduled_time_slot_check;

-- Add new check constraints with the updated values
ALTER TABLE customers ADD CONSTRAINT customers_preferred_time_slot_check 
    CHECK (preferred_time_slot IN ('MORNING', 'AFTERNOON', 'EVENING', 'FIRST_HALF', 'SECOND_HALF'));

ALTER TABLE jobs ADD CONSTRAINT jobs_scheduled_time_slot_check 
    CHECK (scheduled_time_slot IN ('MORNING', 'AFTERNOON', 'EVENING', 'FIRST_HALF', 'SECOND_HALF'));

-- Update any existing records to use the new format (optional)
-- UPDATE customers SET preferred_time_slot = 'FIRST_HALF' WHERE preferred_time_slot = 'MORNING';
-- UPDATE customers SET preferred_time_slot = 'SECOND_HALF' WHERE preferred_time_slot IN ('AFTERNOON', 'EVENING');

-- UPDATE jobs SET scheduled_time_slot = 'FIRST_HALF' WHERE scheduled_time_slot = 'MORNING';
-- UPDATE jobs SET scheduled_time_slot = 'SECOND_HALF' WHERE scheduled_time_slot IN ('AFTERNOON', 'EVENING');
