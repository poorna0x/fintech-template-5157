# Testing AMC Service Job Creation

## Test Data Overview

This document explains the 3 test cases created for testing automatic AMC service job creation.

## Prerequisites

1. Make sure you have access to your Supabase SQL editor
2. The `amc_contracts` table exists
3. The `customers` and `jobs` tables exist

## Test Cases

### Test Case 1: Customer with service 5 months ago ✅ SHOULD CREATE JOB
- **Customer ID**: `TAMC001`
- **Name**: Test Customer AMC 1
- **Phone**: 9876543210
- **Last Service**: 5 months ago
- **AMC Status**: Active (started 1 year ago, ends 1 year from now)
- **Expected Result**: An AMC Service job should be created automatically

### Test Case 2: Customer with service 3 months ago ❌ SHOULD NOT CREATE JOB
- **Customer ID**: `TAMC002`
- **Name**: Test Customer AMC 2
- **Phone**: 9876543211
- **Last Service**: 3 months ago (less than 4 months)
- **AMC Status**: Active
- **Expected Result**: NO job should be created (service was too recent)

### Test Case 3: Customer with no previous service, AMC started 5 months ago ✅ SHOULD CREATE JOB
- **Customer ID**: `TAMC003`
- **Name**: Test Customer AMC 3
- **Phone**: 9876543212
- **Last Service**: NULL (no previous service)
- **AMC Start Date**: 5 months ago
- **Expected Result**: An AMC Service job should be created (uses AMC start date)

## How to Test

### Step 1: Insert Test Data
1. Open your Supabase SQL editor
2. Copy and paste the contents of `test-amc-service-jobs.sql`
3. Run the SQL script

### Step 2: Verify Test Data
Run these queries to verify the test data was created:

```sql
-- Check customers
SELECT customer_id, full_name, last_service_date 
FROM customers 
WHERE customer_id LIKE 'TAMC%';

-- Check AMC contracts
SELECT c.customer_id, c.full_name, ac.start_date, ac.status
FROM amc_contracts ac
JOIN customers c ON ac.customer_id = c.id
WHERE c.customer_id LIKE 'TEST-AMC-%';
```

### Step 3: Trigger Job Creation
The jobs are created automatically when the Admin Dashboard loads. To trigger manually:

**Option A: Via Admin Dashboard**
1. Open the Admin Dashboard
2. The function `db.amcContracts.createAMCServiceJobs()` runs automatically on page load
3. Check the console for logs or toast notifications

**Option B: Via Browser Console**
1. Open Admin Dashboard
2. Open browser console (F12)
3. Run:
```javascript
db.amcContracts.createAMCServiceJobs().then(result => {
  console.log('Result:', result);
  if (result.created > 0) {
    console.log(`✅ Created ${result.created} AMC service jobs`);
  } else {
    console.log('No jobs created');
  }
});
```

### Step 4: Verify Results
Run this query to check if jobs were created:

```sql
SELECT 
  j.job_number,
  c.customer_id,
  c.full_name,
  j.service_sub_type,
  j.status,
  j.description,
  j.created_at
FROM jobs j
JOIN customers c ON j.customer_id = c.id
WHERE c.customer_id LIKE 'TEST-AMC-%'
  AND j.service_sub_type = 'AMC Service'
ORDER BY j.created_at DESC;
```

## Expected Results

After running the function, you should see:

1. **TEST-AMC-001**: ✅ Should have 1 new job with status `PENDING` and `service_sub_type = 'AMC Service'`
2. **TEST-AMC-002**: ❌ Should NOT have any new AMC Service job (service was only 3 months ago)
3. **TEST-AMC-003**: ✅ Should have 1 new job with status `PENDING` and `service_sub_type = 'AMC Service'`

## Verification Checklist

- [ ] Test Case 1 (TAMC001): Job created for customer with 5-month-old service
- [ ] Test Case 2 (TAMC002): No job created for customer with 3-month-old service
- [ ] Test Case 3 (TAMC003): Job created for customer with no service but 5-month-old AMC
- [ ] All created jobs have `status = 'PENDING'`
- [ ] All created jobs have `service_sub_type = 'AMC Service'`
- [ ] Job descriptions start with "AMC Service"
- [ ] Jobs appear in the "Ongoing" view in Admin Dashboard

## Cleanup

After testing, run this to clean up test data:

```sql
DELETE FROM jobs WHERE customer_id IN (SELECT id FROM customers WHERE customer_id LIKE 'TEST-AMC-%');
DELETE FROM amc_contracts WHERE customer_id IN (SELECT id FROM customers WHERE customer_id LIKE 'TEST-AMC-%');
DELETE FROM customers WHERE customer_id LIKE 'TAMC%';
```

Or uncomment the cleanup section at the bottom of `test-amc-service-jobs.sql`.

