# Database & query optimization audit

Audit of where the app wastes queries, over-fetches data, and where we can optimize. Applied fixes are noted.

---

## 1. Applied fixes (this pass)

### 1.1 Reminders: N+1 → single batch (customers)

**Issue:** After loading reminders, customer labels were loaded with one `getById` per customer ID (N+1).

**Locations:** `SettingsRemindersDialog`, `RemindersList`, `TodayRemindersPopup` (2 call sites), `SettingsRemindersPage`.

**Fix:** Added `db.customers.getByIds(ids)` (single query: `select id, full_name, customer_id` with `.in('id', ids)`). All four places now use it. **Before:** 1 + N queries. **After:** 2 queries (reminders + one batch customer fetch).

### 1.2 useBrandsAndModels: unbounded queries

**Issue:** Four queries (customers/jobs × brand/model) had no `.limit()`, so full tables could be scanned.

**Fix:** Added `.limit(1000)` to all four in `src/hooks/useBrandsAndModels.ts`. Aligns with AdminDashboard’s `loadBrandsAndModels` which already used limits.

---

## 2. Already in good shape

- **AdminDashboard:** Jobs loaded via `getByStatusPaginated` with pagination; no “load all jobs”. Customers not loaded in bulk for main list (relies on jobs).
- **Duplicate customer check:** Now runs once on “Next” (add customer), not on every blur.
- **Edit job:** State merge fix prevents job “vanishing” and avoids extra refetches.
- **Realtime:** Already optimized (filtered subscription, admin on polling).
- **CallingPage:** Slim customer select (no address/location); uses RPCs for last job/contact where available.
- **db.jobs.update:** Minimal select after update (only a few columns) to avoid heavy joins.
- **QR codes:** Cache in `qrCodeManager` to avoid repeated fetches.
- **Technician job list:** Single `getByTechnicianId` with limit 100; realtime uses filter.

---

## 3. Recommendations (not changed)

### 3.1 Settings “Download all data”

- **Current:** `db.customers.getAll(10000)`, `db.jobs.getAll(undefined, false)`, `db.technicians.getAll(500)`, tax invoices with high limit.
- **Note:** `jobs.getAll(undefined, false)` does not pass a limit, so Supabase default (e.g. 1000) applies. If you need more than 1000 jobs in export, pass an explicit limit (e.g. `getAll(10000, false)`).
- **Suggestion:** For very large datasets, consider server-side export (e.g. cron + storage) instead of pulling everything in the browser.

### 3.2 useDashboardData (hook)

- **Current:** Loads `db.customers.getAll(1000)`, technicians, AMC contracts, job counts. Used by some consumers.
- **Suggestion:** If this hook is used on the same screen as AdminDashboard, it may duplicate work (customers/technicians loaded twice). Prefer a single source of truth (e.g. context or pass data from dashboard) where possible.

### 3.3 Customer jobs (customer detail / report)

- **Current:** When opening a customer, we often do `getByCustomerId(customer.id)` then use the list. No N+1; one query per open.
- **Suggestion:** If the same customer is opened repeatedly, a short-lived cache (e.g. by customer id, invalidate on job update) could avoid repeat fetches. Optional.

### 3.4 Analytics / BillingStats

- **Current:** May load larger job/customer sets for aggregates.
- **Suggestion:** Prefer aggregate RPCs or `select` with `count`/sums instead of loading full rows when only totals are needed. Check `Analytics.tsx` and `BillingStats.tsx` for “load all then sum” patterns.

### 3.5 db.jobs.getAll(undefined)

- **Current:** When `limit` is omitted, no `.limit()` is applied; Supabase returns up to its default (often 1000).
- **Suggestion:** For any caller that needs “all” jobs, pass an explicit limit or paginate. Avoid relying on implicit default for correctness.

---

## 4. Query usage summary

| Area              | Before (waste)              | After / note                          |
|-------------------|-----------------------------|----------------------------------------|
| Reminders labels  | 1 + N customer getById      | 1 + 1 getByIds batch                   |
| Brands/models hook| 4 unbounded queries         | 4 queries with limit 1000              |
| Add customer      | Duplicate check on every blur | Single check on Next                 |
| Edit job          | Replace job → row vanished  | Merge into existing row               |
| Realtime          | Full-table subs             | Filtered + polling (separate change)   |

---

## 5. Quick checklist for new features

- Prefer one batch query (e.g. `.in('id', ids)`) over a loop of `getById`.
- Always use a limit (or pagination) for list/analytics queries.
- Use slim selects (only needed columns) for large tables; avoid `select('*')` when you don’t need all columns.
- Cache or dedupe when the same data is needed in multiple components (e.g. QR codes, customer labels).
- Avoid running heavy queries in `useEffect` with broad deps (e.g. `[statusFilter, currentPage]` only when needed).
