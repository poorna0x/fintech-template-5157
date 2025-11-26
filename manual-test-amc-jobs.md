# Manual Test for AMC Service Job Creation

## Issue: Jobs not being created automatically

Let's debug step by step:

## Step 1: Check Current Dates

Run this query to see what dates we're working with:

```sql
SELECT 
  CURRENT_DATE as today,
  (CURRENT_DATE - INTERVAL '4 months')::date as four_months_ago;
```

## Step 2: Check Your Test Data

Run the debug script: `debug-amc-jobs.sql`

This will show:
- Last service dates for each customer
- AMC start dates
- Whether dates are old enough (4+ months)
- Any existing AMC service jobs that might block creation

## Step 3: Fix Dates if Needed

If dates are too recent, run: `fix-test-dates.sql`

This will update:
- TAMC001: last_service_date to 5 months ago ✅
- TAMC002: last_service_date to 3 months ago ❌ (should NOT create)
- TAMC003: AMC start_date to 5 months ago ✅

## Step 4: Manually Trigger Job Creation

### Option A: Browser Console
1. Open Admin Dashboard
2. Open browser console (F12)
3. Run:
```javascript
db.amcContracts.createAMCServiceJobs().then(result => {
  console.log('Result:', result);
  if (result.error) {
    console.error('Error:', result.error);
  } else {
    console.log(`Created: ${result.created} jobs`);
    console.log('Jobs:', result.data);
  }
});
```

### Option B: Check Console Logs
When Admin Dashboard loads, check the browser console for:
- `✅ Created X AMC service jobs automatically` (success)
- `Error creating AMC service jobs:` (error)

## Step 5: Verify Jobs Were Created

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
WHERE c.customer_id LIKE 'TAMC%'
  AND j.service_sub_type = 'AMC Service'
ORDER BY j.created_at DESC;
```

## Common Issues:

1. **Dates too recent**: AMC start_date or last_service_date must be 4+ months ago
2. **Existing jobs**: If there's already a PENDING/ASSIGNED/IN_PROGRESS AMC Service job, no new one will be created
3. **Function not called**: Check browser console for errors
4. **Date format**: The function compares dates as strings (YYYY-MM-DD format)

## Expected Results:

After fixing dates and running the function:
- **TAMC001**: ✅ Should have 1 job (last_service_date = 5 months ago)
- **TAMC002**: ❌ Should NOT have a job (last_service_date = 3 months ago)
- **TAMC003**: ✅ Should have 1 job (AMC start_date = 5 months ago, no last_service_date)

