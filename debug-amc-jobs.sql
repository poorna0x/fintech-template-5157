-- Debug script to check why AMC service jobs aren't being created
-- Run this in Supabase SQL editor

-- 1. Check customer last service dates
SELECT 
  c.customer_id,
  c.full_name,
  c.last_service_date,
  CASE 
    WHEN c.last_service_date IS NULL THEN 'NULL'
    ELSE c.last_service_date::text
  END as last_service_date_text,
  CASE 
    WHEN c.last_service_date IS NULL THEN 'Will use AMC start_date'
    WHEN c.last_service_date <= (CURRENT_DATE - INTERVAL '4 months') THEN 'More than 4 months - SHOULD CREATE'
    ELSE 'Less than 4 months - WILL NOT CREATE'
  END as service_status,
  EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(c.last_service_date, CURRENT_DATE)))::integer as days_since_service
FROM customers c
WHERE c.customer_id LIKE 'TAMC%'
ORDER BY c.customer_id;

-- 2. Check AMC contracts
SELECT 
  c.customer_id,
  c.full_name,
  ac.start_date as amc_start_date,
  ac.end_date as amc_end_date,
  ac.status as amc_status,
  CASE 
    WHEN ac.start_date <= (CURRENT_DATE - INTERVAL '4 months') THEN 'AMC started more than 4 months ago'
    ELSE 'AMC started less than 4 months ago'
  END as amc_status_check,
  EXTRACT(DAY FROM (CURRENT_DATE - ac.start_date))::integer as days_since_amc_start
FROM amc_contracts ac
JOIN customers c ON ac.customer_id = c.id
WHERE c.customer_id LIKE 'TAMC%'
ORDER BY c.customer_id;

-- 3. Check for existing AMC service jobs (these would block creation)
SELECT 
  j.job_number,
  c.customer_id,
  c.full_name,
  j.service_sub_type,
  j.status,
  j.created_at
FROM jobs j
JOIN customers c ON j.customer_id = c.id
WHERE c.customer_id LIKE 'TAMC%'
  AND j.service_sub_type = 'AMC Service'
ORDER BY j.created_at DESC;

-- 4. Check completed jobs for these customers (to see last service dates)
SELECT 
  j.job_number,
  c.customer_id,
  c.full_name,
  j.service_sub_type,
  j.status,
  j.completed_at,
  j.completed_at::date as completed_date
FROM jobs j
JOIN customers c ON j.customer_id = c.id
WHERE c.customer_id LIKE 'TAMC%'
  AND j.status = 'COMPLETED'
ORDER BY j.completed_at DESC;

-- 5. Calculate what the function should do for each customer
SELECT 
  c.customer_id,
  c.full_name,
  -- Get last completed job date
  (SELECT MAX(j.completed_at::date) 
   FROM jobs j 
   WHERE j.customer_id = c.id 
     AND j.status = 'COMPLETED'
     AND j.completed_at IS NOT NULL) as last_completed_job_date,
  -- Customer's last_service_date
  c.last_service_date,
  -- AMC start date
  ac.start_date as amc_start_date,
  -- Determine which date to use (prefer job, then customer, then AMC)
  COALESCE(
    (SELECT MAX(j.completed_at::date) 
     FROM jobs j 
     WHERE j.customer_id = c.id 
       AND j.status = 'COMPLETED'
       AND j.completed_at IS NOT NULL),
    c.last_service_date,
    ac.start_date
  ) as date_to_check,
  -- Check if 4 months have passed
  CASE 
    WHEN COALESCE(
      (SELECT MAX(j.completed_at::date) 
       FROM jobs j 
       WHERE j.customer_id = c.id 
         AND j.status = 'COMPLETED'
         AND j.completed_at IS NOT NULL),
      c.last_service_date,
      ac.start_date
    ) <= (CURRENT_DATE - INTERVAL '4 months') THEN 'SHOULD CREATE JOB'
    ELSE 'WILL NOT CREATE JOB'
  END as expected_action,
  -- Days since date to check
  EXTRACT(DAY FROM (
    CURRENT_DATE - COALESCE(
      (SELECT MAX(j.completed_at::date) 
       FROM jobs j 
       WHERE j.customer_id = c.id 
         AND j.status = 'COMPLETED'
         AND j.completed_at IS NOT NULL),
      c.last_service_date,
      ac.start_date
    )
  ))::integer as days_since_date_to_check
FROM customers c
JOIN amc_contracts ac ON ac.customer_id = c.id
WHERE c.customer_id LIKE 'TAMC%'
  AND ac.status = 'ACTIVE'
ORDER BY c.customer_id;

