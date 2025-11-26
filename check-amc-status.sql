-- Check AMC contract statuses
-- Run this to verify the actual status values in your database

SELECT 
  id,
  customer_id,
  status,
  start_date,
  end_date,
  created_at
FROM amc_contracts
LIMIT 10;

-- Check specific test customers
SELECT 
  ac.id,
  ac.status,
  ac.start_date,
  ac.end_date,
  c.customer_id,
  c.full_name
FROM amc_contracts ac
JOIN customers c ON ac.customer_id = c.id
WHERE c.customer_id LIKE 'TAMC%';

-- Check all possible status values
SELECT DISTINCT status 
FROM amc_contracts;

