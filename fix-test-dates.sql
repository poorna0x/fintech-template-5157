-- Fix test data dates to ensure jobs will be created
-- The issue is that AMC start dates or last_service_date need to be 4+ months ago

-- Update TAMC001: Set last_service_date to 5 months ago (already should be, but let's ensure)
UPDATE customers 
SET last_service_date = (CURRENT_DATE - INTERVAL '5 months')::date
WHERE customer_id = 'TAMC001';

-- Update TAMC002: Set last_service_date to 3 months ago (should NOT create job)
UPDATE customers 
SET last_service_date = (CURRENT_DATE - INTERVAL '3 months')::date
WHERE customer_id = 'TAMC002';

-- Update TAMC003: Set last_service_date to NULL and AMC start_date to 5 months ago
UPDATE customers 
SET last_service_date = NULL
WHERE customer_id = 'TAMC003';

UPDATE amc_contracts
SET start_date = (CURRENT_DATE - INTERVAL '5 months')::date
WHERE customer_id IN (SELECT id FROM customers WHERE customer_id = 'TAMC003');

-- Verify the updates
SELECT 
  c.customer_id,
  c.full_name,
  c.last_service_date,
  ac.start_date as amc_start_date,
  CASE 
    WHEN c.last_service_date IS NOT NULL THEN c.last_service_date::text
    WHEN ac.start_date IS NOT NULL THEN ac.start_date::text
    ELSE 'No date'
  END as date_to_check,
  CASE 
    WHEN COALESCE(c.last_service_date, ac.start_date) <= (CURRENT_DATE - INTERVAL '4 months') THEN '✅ SHOULD CREATE JOB'
    ELSE '❌ WILL NOT CREATE JOB'
  END as expected_result,
  EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(c.last_service_date, ac.start_date)))::integer as days_ago
FROM customers c
LEFT JOIN amc_contracts ac ON ac.customer_id = c.id AND ac.status = 'ACTIVE'
WHERE c.customer_id LIKE 'TAMC%'
ORDER BY c.customer_id;

