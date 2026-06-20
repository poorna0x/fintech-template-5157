# Analytics Page — Supabase Egress Optimization

Reference for reducing Supabase egress on the CRM **Analytics** page and **Website analytics** tab.

Last updated: 2026-06-19

---

## Architecture overview

| Area | Entry | Data layer |
|------|--------|------------|
| CRM analytics | `src/components/Analytics.tsx` → `loadAnalytics()` | `db.jobs.*`, `db.technicians.*`, expense helpers, `db.stats.getAnalytics()` |
| Website analytics | `src/components/admin/WebsiteAnalyticsGate.tsx` (lazy) → `WebsiteAnalyticsCard.tsx` | `db.websiteAnalytics.*`, `db.analyticsPaginated.*` |
| SQL RPCs | — | `scripts/add-analytics-paginated-rpcs.sql`, `scripts/add-website-analytics.sql` |

---

## Already optimized

- **Top locations / brands / spare parts** — server-side RPCs with pagination; loaded on demand only.
- **Website analytics gate** — zero egress until user clicks “Load website analytics”.
- **Website summary** — `get_website_analytics_summary` filters by IST `p_from_date` / `p_to_date` (matches card range). Run `scripts/add-analytics-step4-rpcs.sql`.
- **Website recent activity** — `get_website_analytics_recent_events` with `limit` + `offset`; slim metadata via `website_analytics_slim_metadata` (Step 5 SQL).
- **Dated CRM periods** — `jobs.getForAnalyticsInRange()` filters in DB (not full table + JS filter).
- **On-demand sections** — return complaints, direct/website conversions, and repeat vs new use secured RPCs first; legacy job fetch fallback if RPC unavailable.
- **Slim conversion queries** — `getForConversionAnalyticsInRange`, `getCustomerActivityInRange`, etc.
- **`lead_source` column on `jobs`** — analytics selects use `lead_source` instead of `requirements` JSON (2026-06-19). Run `scripts/add-job-lead-source-column.sql` in Supabase.
- **`get_analytics_dashboard` RPC** — pre-aggregated KPIs in DB; Analytics page uses RPC first, falls back to job fetch if RPC unavailable (2026-06-19). Run `scripts/add-analytics-dashboard-rpc.sql`.
- **Session cache (5 min)** — same-period revisits in one tab skip network (`analyticsSessionCache.ts` + `loadAnalytics`).
- **Website analytics session cache (5 min)** — same range/site/page revisits skip summary + recent fetches (`websiteAnalyticsSessionCache.ts`).
- **`get_analytics_expense_totals` RPC** — 7 expense sums in one call instead of 4 paginated row fetches. Run `scripts/add-analytics-step7-expense-totals-rpc.sql`.
- **`get_analytics_commission_totals` RPC** — per-technician payment/extra sums for salary; payments fetch deferred off dashboard hot path. Run `scripts/add-analytics-step8-commission-totals-rpc.sql`.
- **`get_analytics_calendar_salary_totals` RPC** — calendar-month salary totals (Payments parity) without jobs/payments/holidays row fetches. Run `scripts/add-analytics-step9-calendar-salary-rpc.sql`.
- **`parts_cost_total`** on jobs — no `job_parts_used` join on main analytics load.

---

## Largest egress sources (estimated)

### CRM — initial load (`loadAnalytics` on period change)

| Source | Typical rows | Payload | Notes |
|--------|--------------|---------|-------|
| **`get_analytics_dashboard` RPC** (primary) | 1 call | **~5–50 KB** | Aggregates in DB; no job rows over the wire |
| Legacy fallback `jobs.getForAnalyticsInRange` | 300–800/mo | **150 KB – 1 MB** | Only if RPC not deployed |
| `technicians.getAllForAnalytics` | ~20 | **~2–10 KB** | Slim RPC; falls back to `getAllForDashboard` |
| Expense tables (4 queries) | tens–hundreds | **~0.5 KB** | **`get_analytics_expense_totals` RPC** when deployed |
| Legacy expense row fetches | tens–hundreds | **50–500 KB** | Fallback if RPC not deployed |
| `getTotalSalaryForCalendarMonth` | overlap | **~0.1 KB** | **`get_analytics_calendar_salary_totals` RPC** when deployed |
| Legacy calendar-month salary | overlap | **100–400 KB** | Client fallback if step 9 RPC not deployed |
| `technician_payments` (legacy / salary) | hundreds | **~0.5–2 KB** | **Skipped on dashboard RPC path**; commission totals RPC for pro-rated periods |
| Long periods (6m / 1y) | unbounded jobs | **5–15+ MB** | Same pattern, more jobs |

### CRM — “All time” period

| Source | Risk |
|--------|------|
| **`get_analytics_dashboard` (null dates)** | **~5–50 KB** when RPC deployed |
| Legacy `jobs.getForAnalytics()` | Unbounded paginated fetch — fallback only |

### CRM — on-demand (when clicked)

| Section | Risk |
|---------|------|
| Direct/website conversions | **~2 KB** RPC when deployed (was: large prior-job history per customer) |
| Return complaints (all-time) | **~1 KB** RPC when deployed (was: up to 5k full jobs) |
| Repeat vs new (all-time) | **~2 KB** RPC when deployed (was: up to 8k slim rows) |
| Top locations/brands/spare parts | **Low** (~2–10 KB/page) |

### Website analytics (after gate open)

| Source | Notes |
|--------|-------|
| `getSummary(90)` always | Was fetching 90 days even for “Today” preset — **fixed** via date-range RPC |
| Recent events | ~5–30 KB/page; `metadata` JSON is main cost |

---

## Quick wins (no SQL) — implemented 2026-06-19

| # | Change | Files | Status |
|---|--------|-------|--------|
| 1 | **Deduplicate technician fetches** in `loadAnalytics()` — one fetch, reuse for KPIs, salary, per-tech breakdown | `Analytics.tsx` | Done |
| 2 | **`getAllForDashboard` instead of `getAll`** — strips `current_location` GPS blob | `Analytics.tsx` | Done |
| 3 | **Slim expense selects for analytics** — `amount` (+ `category` for business); drop `receipt_url`, notes | `supabase.ts`, `Analytics.tsx` | Done |
| 4 | **Website summary: match active range** — `getSummary(Math.min(90, daysInRange))`, refetch when range grows | `WebsiteAnalyticsCard.tsx` | Done |
| 5 | **Reuse in-range payments** for salary block — avoid second `technician_payments` query | `Analytics.tsx` | Done |

**Expected savings:** ~20–40% on a typical monthly CRM load; more on long ranges.

### Period filter fixes (2026-06-19)

| Issue | Fix |
|-------|-----|
| **Previous Year** used rolling 12 months from today | Now **Jan 1 – Dec 31** of the previous calendar year (label: “Previous Year”) |
| **All Time** capped at 5k jobs, **no expenses** loaded | Loads up to 15k jobs + all expense tables; KPIs computed from same job set |
| **Ranged periods** hit Supabase **1,000-row default** | `getForAnalyticsInRange` now requests up to **15,000** rows per query |
| Expense dates used **UTC** date strings | Uses **local** `YYYY-MM-DD` for expense_date filters |
| Completed revenue could include wrong jobs | Client-side check: completion date must fall in selected range |

---

## Medium effort (needs SQL or schema)

| # | Opportunity | Impact | SQL? |
|---|-------------|--------|------|
| 6 | **`get_analytics_dashboard` RPC** — pre-aggregated KPIs (lead source, service type, daily stats) | Very high | Yes — **Done** (`scripts/add-analytics-dashboard-rpc.sql`) |
| 7 | **`get_technicians_for_analytics` RPC** — id, name, salary only (no GPS) | Medium–high | Yes — **Done** (`scripts/add-analytics-step6-rpcs.sql`) |
| 8 | **Stored / generated `lead_source` on `jobs`** — drop `requirements` from analytics selects | Very high | Yes — **Done** (`scripts/add-job-lead-source-column.sql`) |
| 9 | **Cap or rework “All time”** — `stats.getAnalytics()` has no row limit | Very high | Yes — **Addressed** via dashboard + expense totals RPCs (null dates) |
| 10 | **Conversion / return-complaint RPCs** — server-side prior-job lookup | High (on-demand) | Yes — **Done** (`scripts/add-analytics-on-demand-rpcs.sql`) |
| 11 | **Website summary by date range** (`p_from` / `p_to`) instead of fixed `p_days` | Low–medium | Yes — **Done** (`scripts/add-analytics-step4-rpcs.sql`) |
| 12 | **Trim recent-events metadata** in list RPC (flat strings vs full JSON) | Low–medium | Yes — **Done** (`scripts/add-analytics-step5-polish.sql`) |

---

## Lower priority / polish

| # | Opportunity |
|---|-------------|
| 13 | Session/memory cache for same-period revisits | **Done** (`src/lib/analyticsSessionCache.ts`) |
| 14 | Warn or restrict “All time” until dashboard RPC exists | **Addressed** — dashboard RPC handles null date range |
| 15 | Remove debug `console.log` in softener analytics block | Done |
| 16 | Session cache for website analytics (summary + recent activity) | **Done** (`src/lib/websiteAnalyticsSessionCache.ts`) |

---

## File reference

| File | Key symbols |
|------|-------------|
| `src/components/Analytics.tsx` | `loadAnalytics`, `loadReturnComplaints`, `loadTopLocations`, `loadDirectWebsiteConversions` |
| `src/lib/analyticsSessionCache.ts` | 5-minute in-memory cache for `loadAnalytics` |
| `src/lib/websiteAnalyticsSessionCache.ts` | 5-minute cache for website summary + recent events |
| `src/components/admin/WebsiteAnalyticsCard.tsx` | `load`, `fetchRecentActivity`, `activeRange` |
| `src/components/admin/WebsiteAnalyticsGate.tsx` | Lazy mount |
| `src/lib/supabase.ts` | `jobs.getForAnalyticsInRange`, `technicians.getAllForAnalytics`, `analyticsPaginated.*`, `websiteAnalytics.*` |
| `scripts/add-analytics-paginated-rpcs.sql` | Top locations/brands, spare parts, recent events |
| `scripts/add-website-analytics.sql` | `get_website_analytics_summary` |

---

## Recommended next steps

1. Run all analytics SQL scripts in Supabase (see list below) if not done yet.
2. Compare egress in Supabase dashboard after deploying RPCs.
3. Verify calendar-month salary totals match Technician Payments for this/previous month after step 9 SQL.

The CRM + website analytics egress plan (steps 1–10) is complete in app code; remaining work is running SQL in Supabase and validating totals.

**SQL run order:**
1. `scripts/add-job-lead-source-column.sql`
2. `scripts/add-analytics-dashboard-rpc.sql`
3. `scripts/add-analytics-on-demand-rpcs.sql`
4. `scripts/add-analytics-step4-rpcs.sql`
5. `scripts/add-analytics-step5-polish.sql` (slim recent-events metadata; safe to run anytime after paginated RPCs)
6. `scripts/add-analytics-step6-rpcs.sql` (slim technicians for Analytics + delete preview metadata)
7. `scripts/add-analytics-step7-expense-totals-rpc.sql` (single RPC for expense/advance/business totals)
8. `scripts/add-analytics-step8-commission-totals-rpc.sql` (per-technician commission sums; defer payments on dashboard path)
9. `scripts/add-analytics-step9-calendar-salary-rpc.sql` (calendar-month salary totals; Payments parity)
