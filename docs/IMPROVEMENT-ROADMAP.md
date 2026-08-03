# HydrogenRO — Improvement Roadmap

Last reviewed: **2 Aug 2026**

Living checklist of how to improve this CRM (Vite/React + Supabase + Netlify + Capacitor).  
Related canvases (Cursor IDE, open beside chat):

- `~/.cursor/projects/Users-poorna-Documents-HydrogenRO-CRM-fintech-template-5157/canvases/improvement-roadmap.canvas.tsx`
- `~/.cursor/projects/Users-poorna-Documents-HydrogenRO-CRM-fintech-template-5157/canvases/security-performance-audit.canvas.tsx`

Also see in this folder: [SECURITY-AUDIT-2026-05-23.md](./SECURITY-AUDIT-2026-05-23.md), [analytics-egress-optimization.md](./analytics-egress-optimization.md), [REVERTED-WORK-REFERENCE.md](./REVERTED-WORK-REFERENCE.md).

---

## Snapshot

| Signal | Value |
|--------|------:|
| Largest file | `TechnicianDashboard.tsx` ~11,345 lines |
| Data layer | `supabase.ts` ~8,390 lines |
| Admin shell | `AdminDashboard.tsx` ~7,469 lines (+ dead variants) |
| Netlify functions | ~73 |
| SQL scripts | ~119 (no `supabase/migrations/`) |
| Real unit tests | ~1 (`photoQueueRetry.test.ts`) |

**Already strong:** analytics RPCs + session caches, security check scripts (`check:public-bundle`, portal routes, ALTCHA), recent cron/HMAC hardening (`c79a369`), Settings egress cuts, route code-splitting.

---

## P0 — fix this week

| # | Action | Why | Where |
|---|--------|-----|-------|
| 1 | Fix `verifyStaffBearerToken` default-to-admin | Any authenticated non-technician JWT becomes admin after tech lookup misses | `netlify/functions/admin-auth-guard.js` (~line 166) |
| 2 | Confirm live `is_admin_user()` | Older SQL can recreate a weak admin check if re-run | `scripts/secure-auth-helpers-repatch-*.sql` — do **not** trust `schema.sql` |
| 3 | Stop GST full-table `getAll(*)` | Loads every tax invoice in 50k batches — large egress | `src/components/GSTInvoicesPage.tsx` (~198, 383–389) |

---

## P1 — this month

| Action | Effort | Notes |
|--------|--------|-------|
| Poll tech jobs only when Realtime is down | M | Visible-tab ~12s poll in `TechnicianDashboard.tsx` |
| Delete AdminDashboard dead variants | S | `.backup`, `.broken`, `.minimal`, `.minimal.working`, `.tsx.test` (~16k lines noise) |
| Split `TechnicianDashboard.tsx` | L | Highest change-risk file; many `as any` |
| Split `supabase.ts` by domain | L | jobs / customers / payments / inventory modules |
| Finish `AdminDashboard` extraction | M | Helpers already in `src/lib/adminDashboard*.ts` |
| Re-verify May 2026 security backlog | M | Unsigned Cloudinary upload, OTP fail-open, spoofable `x-netlify-event` cron header |

---

## P2 — next

| Action | Effort | Notes |
|--------|--------|-------|
| Ordered Supabase migrations | M | Replace ad-hoc `scripts/*.sql` + stale `schema.sql` as source of truth; keep `verify-all-rls.sql` as gate |
| Wire real tests into `npm test` | M | `tests/staff-access.test.cjs` + auth/booking guards + staff-token role cases |
| Prune unused root deps | S | `firebase-admin`, `nodemailer` belong in functions only; unused `cloudinary-react`, `@supabase/auth-helpers-react` |
| Replace one-off MUI date picker | S | Only `date-picker-calendar.tsx` pulls MUI + Emotion + dayjs (~200KB chunk) |
| Shared Android Java module | M | Overlap: channels, FCM, DevicePrefs, PdfSave between `android/` and `android-admin/` |

---

## P3 — later

| Action | Notes |
|--------|-------|
| Storage provider decision | Cloudinary vs Supabase Storage — see reverted work doc |
| Share packages with ElevenRO | Two frontends, one backend — reduce client helper drift |

---

## Hotspots (maintainability)

```
src/pages/TechnicianDashboard.tsx     ~11.3k
src/lib/supabase.ts                  ~8.4k
src/components/AdminDashboard.tsx     ~7.5k
src/pages/Settings.tsx                ~4.4k
src/components/TechnicianPayments.tsx ~4.3k
src/pages/Booking.tsx                 ~3.6k
src/components/Analytics.tsx          ~3.6k
```

Delete before refactoring admin:

- `src/components/AdminDashboard.backup.tsx`
- `src/components/AdminDashboard.tsx.broken`
- `src/components/AdminDashboard.minimal.tsx`
- `src/components/AdminDashboard.minimal.working.tsx`
- `src/components/AdminDashboard.tsx.test` (not a Vitest file — leftover source)

---

## Pending payment UPI collect (shipped Aug 2026)

- Settings → **UPI payment accounts**: label, UPI ID, **payment phone**.
- Pending payments → WhatsApp: checkbox to include/exclude UPI block; pick account.
- Message includes UPI ID + payment phone (iPhone) and Android `upi://pay` link.
- Storage: Supabase table `upi_payment_accounts` (run `scripts/add-upi-payment-accounts.sql`). Local cache until then; migrates automatically once SQL is applied.

Say one of these in chat to pick up work:

1. **“Fix staff auth”** — P0 #1 (`verifyStaffBearerToken`)
2. **“GST pagination”** — P0 #3
3. **“Delete AdminDashboard backups”** — quick cleanup
4. **“Split TechnicianDashboard”** — long maintainability pass
5. **“Wire staff-access into npm test”** — test foundation

---

## Architecture cheat sheet

| Surface | Path / entry |
|---------|----------------|
| Public site + booking | `/`, `/book`, marketing pages |
| Admin CRM | `/admin`, `/settings`, `/calling` → `AdminPortal` |
| Technician | `/technician` → `TechnicianDashboard` |
| Functions | `netlify/functions/` (+ edge guards) |
| Tech APK | `android/` → `HRO-Technician-debug.apk` |
| Admin APK | `android-admin/` → `HRO-Admin-debug.apk` |
| Sibling brand | ElevenRO at `/Users/poorna/Documents/elevenro-crm` (shared backend) |

**Rules of thumb (always):** minimize Supabase egress (column selects, no needless polling, RPCs); every new table gets RLS; service-role keys stay server-side only.
