# Manual Test for AMC Service Job Creation

## How auto-creation works (n‑month rule)

- **Reference date** (in order): last completed job’s `completed_at` → `customer.last_service_date` → **AMC `start_date`** (if no service yet).
- **Period**: each contract’s `service_period_months`, or the **default** from Settings (AMC service period). `0` or “No auto” = skip.
- **Next due** = reference date + period (months).
- A job is **created** only when **today ≥ next due** and the customer does **not** already have an open AMC Service job (PENDING / ASSIGNED / IN_PROGRESS / etc.).

So for a 4‑month period, a job is created when at least 4 months have passed since the reference date.

---

## Check what would be created (no jobs created)

### Option A: Settings → Preview (recommended)

1. Go to **Settings** → **AMC service period (default)**.
2. Click **“Preview AMC job creation”**.
3. A dialog shows **every active AMC**: customer, reference date, period, next due, and whether a job **would be created** or the **skip reason** (e.g. “Not yet due”, “Already has open AMC service job”).
4. Use this to confirm the n‑month rule and that the right customers would get a job.

### Option B: Browser console (dry run)

1. Open Admin Dashboard (or any page where `db` is available).
2. Open browser console (F12).
3. Run:

```javascript
db.amcContracts.createAMCServiceJobs({ dryRun: true }).then(result => {
  console.log('Preview:', result.preview);
  const wouldCreate = (result.preview || []).filter(p => p.would_create);
  console.log('Would create', wouldCreate.length, 'jobs:', wouldCreate);
});
```

No jobs are created; you only see the preview.

---

## Step 1: Check current date and period

```sql
SELECT 
  CURRENT_DATE AS today,
  (CURRENT_DATE - INTERVAL '4 months')::date AS four_months_ago,
  (CURRENT_DATE - INTERVAL '6 months')::date AS six_months_ago;
```

Ensure test reference dates are **older** than (today − period) so a job would be due.

---

## Step 2: Check test data

Run the debug script: `debug-amc-jobs.sql`

It shows:
- Last service dates per customer
- AMC start dates
- Whether reference + period is due
- Existing AMC service jobs that would block creation

---

## Step 3: Fix dates if needed

If dates are too recent, run: `fix-test-dates.sql`

Example expectations (for a **4‑month** period):
- **TAMC001**: last_service_date 5 months ago → ✅ would create
- **TAMC002**: last_service_date 3 months ago → ❌ would NOT create
- **TAMC003**: no last service, AMC start_date 5 months ago → ✅ would create (reference = AMC start)

Set **default period** in Settings (e.g. 4 or 6 months) and/or set `service_period_months` on the contract so the period matches your test.

---

## Step 4: Trigger job creation (real run)

### Option A: Browser console

1. Open Admin Dashboard.
2. Open browser console (F12).
3. Run:

```javascript
db.amcContracts.createAMCServiceJobs().then(result => {
  console.log('Result:', result);
  if (result.error) {
    console.error('Error:', result.error);
  } else {
    console.log('Created:', result.created, 'jobs');
    console.log('Jobs:', result.data);
  }
});
```

### Option B: Dashboard load

When Admin Dashboard loads, it runs `createAMCServiceJobs()` in the background. Check the console for:
- `✅ Created X AMC service jobs automatically`
- Or: `Error creating AMC service jobs:`

---

## Step 5: Verify jobs were created

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

---

## Common issues

1. **Reference date**: Must be last service **or** AMC start; if both are recent, no job is due.
2. **Period**: Check contract’s `service_period_months` and Settings default; `0` = no auto.
3. **Existing jobs**: If the customer already has a PENDING/ASSIGNED/IN_PROGRESS AMC Service job, no new one is created.
4. **Preview first**: Use **Settings → Preview AMC job creation** (or `dryRun: true` in console) to confirm behaviour before running for real.

---

## Expected results (4‑month period, test data as above)

- **TAMC001**: ✅ One job (last_service_date 5 months ago).
- **TAMC002**: ❌ No job (last_service_date 3 months ago).
- **TAMC003**: ✅ One job (no last service; AMC start_date 5 months ago).

For a **6‑month** period, use reference dates at least 6 months ago for “would create” cases.
