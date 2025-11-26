-- Test Data for AMC Service Job Creation
-- This script creates 3 test customers with AMC contracts to test automatic job creation
-- Run this in your Supabase SQL editor

-- ============================================
-- TEST CASE 1: Customer with service 5 months ago (SHOULD CREATE JOB)
-- ============================================
-- This customer had service 5 months ago, so an AMC service job should be created

-- Insert customer
INSERT INTO customers (
  customer_id,
  full_name,
  phone,
  email,
  address,
  location,
  service_type,
  brand,
  model,
  status,
  last_service_date,
  created_at,
  updated_at
) VALUES (
  'TAMC001',
  'Test Customer AMC 1',
  '9876543210',
  'testamc1@example.com',
  '{"street": "123 Test Street", "area": "Test Area", "city": "Test City", "state": "Test State", "pincode": "123456"}'::jsonb,
  '{"latitude": 12.9716, "longitude": 77.5946, "formatted_address": "123 Test Street, Test Area, Test City"}'::jsonb,
  'RO',
  'Kent',
  'Grand Plus',
  'ACTIVE',
  (CURRENT_DATE - INTERVAL '5 months')::date, -- Service 5 months ago
  NOW(),
  NOW()
) ON CONFLICT (customer_id) DO UPDATE SET
  last_service_date = (CURRENT_DATE - INTERVAL '5 months')::date,
  updated_at = NOW()
RETURNING id;

-- Get customer ID (you'll need to replace this with actual UUID from above)
-- For testing, let's create AMC contract directly
INSERT INTO amc_contracts (
  customer_id,
  start_date,
  end_date,
  years,
  includes_prefilter,
  status,
  created_at,
  updated_at
)
SELECT 
  id,
  (CURRENT_DATE - INTERVAL '1 year')::date, -- AMC started 1 year ago
  (CURRENT_DATE + INTERVAL '1 year')::date, -- AMC ends 1 year from now
  2,
  true,
  'ACTIVE',
  NOW(),
  NOW()
FROM customers
WHERE customer_id = 'TAMC001'
ON CONFLICT DO NOTHING;

-- Create a completed job from 5 months ago
INSERT INTO jobs (
  job_number,
  customer_id,
  service_type,
  service_sub_type,
  brand,
  model,
  scheduled_date,
  scheduled_time_slot,
  estimated_duration,
  service_address,
  service_location,
  status,
  priority,
  description,
  requirements,
  estimated_cost,
  payment_status,
  completed_at
)
SELECT 
  'RO-' || EXTRACT(YEAR FROM NOW()) || '-T001',
  id,
  'RO',
  'Service',
  'Kent',
  'Grand Plus',
  (CURRENT_DATE - INTERVAL '5 months')::date,
  'MORNING',
  120,
  '{"street": "123 Test Street", "area": "Test Area", "city": "Test City", "state": "Test State", "pincode": "123456"}'::jsonb,
  '{"latitude": 12.9716, "longitude": 77.5946, "formatted_address": "123 Test Street, Test Area, Test City"}'::jsonb,
  'COMPLETED',
  'MEDIUM',
  'Previous service job',
  '[]'::jsonb,
  500,
  'PAID',
  (CURRENT_DATE - INTERVAL '5 months')::timestamp
FROM customers
WHERE customer_id = 'TAMC001'
ON CONFLICT (job_number) DO NOTHING;

-- ============================================
-- TEST CASE 2: Customer with service 3 months ago (SHOULD NOT CREATE JOB)
-- ============================================
-- This customer had service only 3 months ago, so NO job should be created

INSERT INTO customers (
  customer_id,
  full_name,
  phone,
  email,
  address,
  location,
  service_type,
  brand,
  model,
  status,
  last_service_date,
  created_at,
  updated_at
) VALUES (
  'TAMC002',
  'Test Customer AMC 2',
  '9876543211',
  'testamc2@example.com',
  '{"street": "456 Test Avenue", "area": "Test Area 2", "city": "Test City", "state": "Test State", "pincode": "123457"}'::jsonb,
  '{"latitude": 12.9717, "longitude": 77.5947, "formatted_address": "456 Test Avenue, Test Area 2, Test City"}'::jsonb,
  'RO',
  'Aquaguard',
  'Aquasure',
  'ACTIVE',
  (CURRENT_DATE - INTERVAL '3 months')::date, -- Service only 3 months ago
  NOW(),
  NOW()
) ON CONFLICT (customer_id) DO UPDATE SET
  last_service_date = (CURRENT_DATE - INTERVAL '3 months')::date,
  updated_at = NOW()
RETURNING id;

INSERT INTO amc_contracts (
  customer_id,
  start_date,
  end_date,
  years,
  includes_prefilter,
  status,
  created_at,
  updated_at
)
SELECT 
  id,
  (CURRENT_DATE - INTERVAL '6 months')::date,
  (CURRENT_DATE + INTERVAL '6 months')::date,
  1,
  false,
  'ACTIVE',
  NOW(),
  NOW()
FROM customers
WHERE customer_id = 'TAMC002'
ON CONFLICT DO NOTHING;

INSERT INTO jobs (
  job_number,
  customer_id,
  service_type,
  service_sub_type,
  brand,
  model,
  scheduled_date,
  scheduled_time_slot,
  estimated_duration,
  service_address,
  service_location,
  status,
  priority,
  description,
  requirements,
  estimated_cost,
  payment_status,
  completed_at
)
SELECT 
  'RO-' || EXTRACT(YEAR FROM NOW()) || '-T002',
  id,
  'RO',
  'Service',
  'Aquaguard',
  'Aquasure',
  (CURRENT_DATE - INTERVAL '3 months')::date,
  'AFTERNOON',
  120,
  '{"street": "456 Test Avenue", "area": "Test Area 2", "city": "Test City", "state": "Test State", "pincode": "123457"}'::jsonb,
  '{"latitude": 12.9717, "longitude": 77.5947, "formatted_address": "456 Test Avenue, Test Area 2, Test City"}'::jsonb,
  'COMPLETED',
  'MEDIUM',
  'Recent service job',
  '[]'::jsonb,
  600,
  'PAID',
  (CURRENT_DATE - INTERVAL '3 months')::timestamp
FROM customers
WHERE customer_id = 'TAMC002'
ON CONFLICT (job_number) DO NOTHING;

-- ============================================
-- TEST CASE 3: Customer with no previous service, AMC started 5 months ago (SHOULD CREATE JOB)
-- ============================================
-- This customer has no completed jobs, but AMC started 5 months ago, so job should be created

INSERT INTO customers (
  customer_id,
  full_name,
  phone,
  email,
  address,
  location,
  service_type,
  brand,
  model,
  status,
  last_service_date, -- NULL or old date
  created_at,
  updated_at
) VALUES (
  'TAMC003',
  'Test Customer AMC 3',
  '9876543212',
  'testamc3@example.com',
  '{"street": "789 Test Road", "area": "Test Area 3", "city": "Test City", "state": "Test State", "pincode": "123458"}'::jsonb,
  '{"latitude": 12.9718, "longitude": 77.5948, "formatted_address": "789 Test Road, Test Area 3, Test City"}'::jsonb,
  'RO',
  'Pureit',
  'Classic',
  'ACTIVE',
  NULL, -- No previous service date
  NOW(),
  NOW()
) ON CONFLICT (customer_id) DO UPDATE SET
  last_service_date = NULL,
  updated_at = NOW()
RETURNING id;

INSERT INTO amc_contracts (
  customer_id,
  start_date,
  end_date,
  years,
  includes_prefilter,
  status,
  created_at,
  updated_at
)
SELECT 
  id,
  (CURRENT_DATE - INTERVAL '5 months')::date, -- AMC started 5 months ago
  (CURRENT_DATE + INTERVAL '7 months')::date,
  1,
  true,
  'ACTIVE',
  NOW(),
  NOW()
FROM customers
WHERE customer_id = 'TAMC003'
ON CONFLICT DO NOTHING;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check test customers
SELECT 
  customer_id,
  full_name,
  last_service_date,
  EXTRACT(DAY FROM (CURRENT_DATE - last_service_date))::integer as days_since_service,
  CASE 
    WHEN last_service_date IS NULL THEN 'No service date'
    WHEN EXTRACT(DAY FROM (CURRENT_DATE - last_service_date)) >= 120 THEN 'More than 4 months - SHOULD CREATE JOB'
    ELSE 'Less than 4 months - SHOULD NOT CREATE JOB'
  END as expected_result
FROM customers
WHERE customer_id LIKE 'TAMC%'
ORDER BY customer_id;

-- Check AMC contracts
SELECT 
  ac.id,
  c.customer_id,
  c.full_name,
  ac.start_date,
  ac.end_date,
  ac.status as amc_status,
  CASE 
    WHEN ac.status = 'ACTIVE' THEN 'Active AMC'
    ELSE 'Inactive AMC'
  END as amc_info
FROM amc_contracts ac
JOIN customers c ON ac.customer_id = c.id
WHERE c.customer_id LIKE 'TAMC%'
ORDER BY c.customer_id;

-- Check existing AMC service jobs (should be empty before running the function)
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

-- ============================================
-- CLEANUP (Run this after testing)
-- ============================================
-- Uncomment to clean up test data:
/*
DELETE FROM jobs WHERE customer_id IN (SELECT id FROM customers WHERE customer_id LIKE 'TAMC%');
DELETE FROM amc_contracts WHERE customer_id IN (SELECT id FROM customers WHERE customer_id LIKE 'TAMC%');
DELETE FROM customers WHERE customer_id LIKE 'TAMC%';
*/

