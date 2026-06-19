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
- **Website summary** — `get_website_analytics_summary` aggregates in DB (not raw events).
- **Website recent activity** — `get_website_analytics_recent_events` with `limit` + `offset`.
- **Dated CRM periods** — `jobs.getForAnalyticsInRange()` filters in DB (not full table + JS filter).
- **On-demand sections** — return complaints, conversions, repeat vs new load only when clicked.
- **Slim conversion queries** — `getForConversionAnalyticsInRange`, `getCustomerActivityInRange`, etc.
- **`parts_cost_total`** on jobs — no `job_parts_used` join on main analytics load.

---

## Largest egress sources (estimated)

### CRM — initial load (`loadAnalytics` on period change)

| Source | Typical rows | Payload | Notes |
|--------|--------------|---------|-------|
| `jobs.getForAnalyticsInRange` | 300–800/mo | **300 KB – 2 MB** | Includes `requirements` JSON per job (lead source) |
| `technicians.getAll` / RPC | ~20 × 2–3 calls | **60–300 KB** | Full admin RPC incl. salary + GPS `current_location` |
| Expense tables (4 queries) | tens–hundreds | **50–500 KB** | Historically included `receipt_url`, notes |
| `getTotalSalaryForCalendarMonth` | overlap | **100–400 KB** | Extra queries for calendar-month profit |
| Long periods (6m / 1y) | unbounded jobs | **5–15+ MB** | Same pattern, more jobs |

### CRM — “All time” period

| Source | Risk |
|--------|------|
| `stats.getAnalytics()` | **Unbounded** `jobs` select |
| `jobs.getForAnalytics(5000)` | Up to 5k rows with `requirements` |

### CRM — on-demand (when clicked)

| Section | Risk |
|---------|------|
| Direct/website conversions | Can pull large prior-job history per customer |
| Return complaints (all-time) | Up to 5k full analytics jobs |
| Repeat vs new (all-time) | Up to 8k slim job rows |
| Top locations/brands/spare parts | **Low** (~2–10 KB/page) |

### Website analytics (after gate open)

| Source | Notes |
|--------|-------|
| `getSummary(90)` always | Was fetching 90 days even for “Today” preset |
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
| 6 | **`get_analytics_dashboard` RPC** — pre-aggregated KPIs (lead source, service type, daily stats) | Very high | Yes |
| 7 | **`get_technicians_for_analytics` RPC** — id, name, salary only (no GPS) | Medium–high | Yes |
| 8 | **Stored / generated `lead_source` on `jobs`** — drop `requirements` from analytics selects | Very high | Yes |
| 9 | **Cap or rework “All time”** — `stats.getAnalytics()` has no row limit | Very high | Yes |
| 10 | **Conversion / return-complaint RPCs** — server-side prior-job lookup | High (on-demand) | Yes |
| 11 | **Website summary by date range** (`p_from` / `p_to`) instead of fixed `p_days` | Low–medium | Yes |
| 12 | **Trim recent-events metadata** in list RPC (flat strings vs full JSON) | Low–medium | Yes |

---

## Lower priority / polish

| # | Opportunity |
|---|-------------|
| 13 | Session/memory cache for same-period revisits |
| 14 | Warn or restrict “All time” until dashboard RPC exists |
| 15 | Remove debug `console.log` in softener analytics block |

---

## File reference

| File | Key symbols |
|------|-------------|
| `src/components/Analytics.tsx` | `loadAnalytics`, `loadReturnComplaints`, `loadTopLocations`, `loadDirectWebsiteConversions` |
| `src/components/admin/WebsiteAnalyticsCard.tsx` | `load`, `fetchRecentActivity`, `activeRange` |
| `src/components/admin/WebsiteAnalyticsGate.tsx` | Lazy mount |
| `src/lib/supabase.ts` | `jobs.getForAnalyticsInRange`, `technicians.getAllForDashboard`, `analyticsPaginated.*`, `websiteAnalytics.*` |
| `scripts/add-analytics-paginated-rpcs.sql` | Top locations/brands, spare parts, recent events |
| `scripts/add-website-analytics.sql` | `get_website_analytics_summary` |

---

## Recommended next steps

1. Run analytics in Supabase dashboard after quick wins; compare egress for “This month” vs before.
2. Add **`lead_source` column** or extract in RPC — biggest per-job savings without full dashboard RPC.
3. Build **`get_analytics_dashboard`** for 6m / 1y / all-time periods.
4. Re-run this doc when medium-tier RPCs ship; move items from “Medium effort” to “Already optimized”.
