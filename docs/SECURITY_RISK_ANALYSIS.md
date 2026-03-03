# Security Risk Analysis — Fintech Template

**Role:** Senior cybersecurity engineer / offensive perspective  
**Scope:** Full codebase (frontend, Netlify functions, Supabase, payment, auth)  
**Date:** 2025-03-03

---

## Executive summary

The application has solid foundations (Supabase RLS, bcrypt, CORS, rate limiting, DOMPurify) but several **critical** and **high** risks need immediate attention: **client-exposed secrets** (Cloudinary), **technician auth vs RLS**, and **plaintext password fallback**. Medium/low items include dev-only CORS, session storage, and missing webhook signature verification.

---

## CRITICAL

### 1. ~~Payment webhook signature not verified~~ (resolved by removal)

**Where:** `api/payment.js` was removed.

**Status:** Resolved. Payment API and all Cashfree/payment-gateway code have been removed from the project.



---

### 2. ~~Cashfree secret key in frontend~~ (resolved by removal)

**Status:** All Cashfree and payment-gateway code has been removed from the project. No payment gateway is in use.

---

### 3. Cloudinary API secret in frontend (VITE_)

**Where:** `src/lib/cloudinary.ts` (lines 26–29, 35–36)

**Issue:** Code uses `VITE_CLOUDINARY_API_SECRET` (and secondary). API secrets in `VITE_*` are shipped to the browser.

**Risk:** Anyone can use the exposed secret to call Cloudinary Admin API (e.g. delete resources, list all assets, abuse usage) → **data loss and cost/abuse**.

**Remediation:**

- Do **not** expose Cloudinary API secret to the client.
- For uploads: use **unsigned upload presets** (no secret in frontend) or a small backend/Netlify function that signs upload parameters server-side.
- For delete/other admin actions: perform them only in server-side code (Netlify function or API) using `process.env.CLOUDINARY_API_SECRET`.

---

## HIGH

### 4. Technician login vs RLS: password hash (or plaintext) exposure

**Where:** `src/lib/auth.ts` (technician auth), Supabase RLS on `technicians`

**Issue:**

- Technician login uses **Supabase client** (anon or authenticated) to run:  
  `supabase.from('technicians').select('id, full_name, email, password, account_status').eq('email', email).single()`.
- If RLS allows **anon** to SELECT on `technicians`, then anyone with the anon key can read **all** technician rows, including **password** (hash or, in legacy cases, plaintext).
- Migration `20250303100000_lock_writes_to_authenticated_only.sql` sets `technicians` to `FOR ALL TO authenticated` only. If there is still any policy granting anon SELECT on `technicians` (e.g. “Allow public to read technician ID card data” or similar), that is a **credential exposure**.
- In `auth.ts`, if `password` is not hashed, the code compares **plaintext on the client** (lines 199–214). In that scenario the plaintext password was already fetched from the DB; if anon can read `technicians`, attackers get plaintext passwords.

**Risk:** Mass credential theft (hashes for cracking, or plaintext), account takeover, lateral movement.

**Remediation:**

- Ensure **no** anon SELECT on `technicians` (no policy that allows `TO anon` for SELECT). If ID-card public read is required, use a **separate view** with only non-sensitive fields (no `password`, no PII beyond what’s needed).
- Remove **plaintext password fallback** in `auth.ts`. Store and accept only bcrypt (or equivalent) hashes; verify only server-side (e.g. existing `verify-technician-password` Netlify function).
- Prefer migrating technicians to **Supabase Auth** (as in `docs/TECHNICIAN_SUPABASE_AUTH_MIGRATION.md`) so technician identity is tied to `auth.uid()` and RLS can use `authenticated` only.

---

### 5. Technician session is client-only (localStorage)

**Where:** `src/lib/auth.ts` (`setAuthSession` / `getAuthSession`), `src/contexts/AuthContext.tsx`

**Issue:** Technician “session” is a JSON object in localStorage (via `chromeStorage`). There is no server-issued token or signed cookie; the client trusts whatever is in localStorage as the current user.

**Risk:** If an attacker gains XSS (or physical access to the device), they can replace `auth_user` in localStorage and **impersonate any technician** (e.g. set `id`, `email`, `role: 'technician'`, `technicianId`). RLS that relies on this identity without a server-validated token does not prevent impersonation.

**Remediation:**

- Prefer **Supabase Auth** for technicians (same as admins) so the session is a signed JWT and RLS uses `auth.uid()`.
- If custom auth remains: introduce a short-lived server-issued token (e.g. JWT) after password verification, store only a reference or use httpOnly cookie, and validate that token on sensitive server/Edge paths. Do not rely solely on localStorage content for identity.

---

### 6. PaymentWebhook page is UI-only; real webhook is unverified

**Where:** `src/pages/PaymentWebhook.tsx`

**Issue:** Obsolete. Payment webhook page and all payment-gateway code have been removed.

**Risk:** Confusion between “webhook received in UI” vs “webhook received by backend”; actual payment updates may be driven by unverified webhook requests.

**Remediation:**

- Implement **real** webhook handling in a **server-side** endpoint (Netlify function or existing API server).
- (N/A – payment gateway removed.)
- Optionally keep `PaymentWebhook` as a **return/success page** for user redirects only, and clearly separate it from the server webhook URL in docs and config.

---

## MEDIUM

### 7. Development CORS allows all origins

**Where:** `netlify/functions/cors-helper.js` (e.g. lines 60–63, 97–105)

**Issue:** In non-production, the code returns `Access-Control-Allow-Origin: '*'` and allows any origin.

**Risk:** If a production deploy mistakenly runs with `CONTEXT` / `NODE_ENV` not set to production, CORS would allow any site to call your Netlify functions (e.g. password verification, ALTCHA). That could facilitate CSRF or abuse of those APIs.

**Remediation:**

- Keep strict CORS in production (already the case when `isProduction()` is true).
- Add a deployment check or smoke test that production responses do **not** send `Access-Control-Allow-Origin: *` for sensitive endpoints.
- Consider an explicit allowlist even in staging.

---

### 8. ALTCHA HMAC key default/placeholder

**Where:** `netlify/functions/altcha-verify.js` (lines 39–44)

**Issue:** `HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'PLACEHOLDER-DO-NOT-USE-IN-PRODUCTION-GENERATE-REAL-KEY'`. There is a runtime warning if in production and placeholder is used.

**Risk:** If `ALTCHA_HMAC_KEY` is not set in production, challenge/solution verification could be weak or predictable, weakening bot protection.

**Remediation:**

- In production, **refuse** to run the function if `ALTCHA_HMAC_KEY` is missing or equals the placeholder (e.g. return 503 and log an error).
- Generate and set a strong secret (e.g. `openssl rand -hex 32`) in Netlify env.

---

### 9. Sensitive data in sessionStorage

**Where:** `src/components/AdminDashboard.tsx` (e.g. sessionStorage for customer data)

**Issue:** Customer data is stored in sessionStorage for form pre-filling (noted in existing audit).

**Risk:** XSS could read sessionStorage and exfiltrate customer PII.

**Remediation:**

- Clear sessionStorage on logout; avoid storing full PII if not necessary.
- Rely on existing XSS mitigations (DOMPurify, sanitization) and consider a strict CSP to reduce XSS likelihood.

---

### 10. innerHTML / dangerouslySetInnerHTML usage

**Where:** Multiple (e.g. `BookingSection.tsx`, `AdminDashboard.tsx`, `AMCGenerator.tsx`, PDF generators, `TechnicianDashboard.tsx`, `TechnicianIdCard.tsx`)

**Issue:** Use of `innerHTML`, `dangerouslySetInnerHTML`, or `document.write` with dynamic content. Some places use static strings or sanitized input; any mistake or new code path that feeds user input into these sinks can lead to XSS.

**Risk:** XSS → session theft (including technician localStorage session), customer data theft, or abuse of user privileges.

**Remediation:**

- Ensure **every** dynamic value used in HTML/PDF generation is sanitized (e.g. `sanitizeForTemplate` / DOMPurify) and that no raw user input reaches `innerHTML` or `document.write`.
- Prefer React text content or safe components instead of `dangerouslySetInnerHTML` where possible; restrict to small, sanitized fragments if needed.
- Keep the existing `src/lib/sanitize.ts` and use it consistently for any new user-driven HTML.

---

## LOWER / HARDENING

### 11. Rate limiter is in-memory

**Where:** `netlify/functions/rate-limiter.js`

**Issue:** Rate limit state is in a process-local Map. It resets on cold starts and is not shared across instances.

**Risk:** Distributed or rapid cold-start traffic can exceed intended limits; brute-force protection may be weaker under load.

**Remediation:** For production, consider a shared store (e.g. Redis/Upstash) for rate limit counters, especially for login and password-verification endpoints.

---

### 12. Hash-technician-passwords script and service role key

**Where:** `hash-technician-passwords.js`

**Issue:** Uses `SUPABASE_SERVICE_ROLE_KEY` (or placeholder). If run without env, error message is clear; no key is committed.

**Risk:** Operational risk (accidental use of placeholder); low risk if env is always set in CI/admin use.

**Remediation:** Keep using env-only; add a one-line check that exits with a clear error if key is missing or equals a placeholder.

---

### 13. Express payment API and deployment

**Where:** N/A (payment API removed)

**Status:** Payment API and all payment-gateway code have been removed.

---

## Positive findings (already in place)

- **Supabase RLS** used; migration to restrict writes to `authenticated` only.
- **Bcrypt** for technician passwords and server-side verification in `verify-technician-password` Netlify function.
- **CORS** and **rate limiting** on sensitive Netlify functions; **security headers** (X-Content-Type-Options, X-Frame-Options, etc.).
- **No raw SQL with user input**; Supabase client used for queries.
- **DOMPurify / sanitizeForTemplate** used in many places (AMC, PDFs, etc.).
- **check-photos.js** uses env vars for Supabase (no hardcoded credentials in current version).
- **Honeypot** and **ALTCHA** used on booking; ALTCHA verification is server-side with complexity limits.

---

## Prioritized action list

| Priority | Action |
|----------|--------|
| — | ~~Payment webhook / Cashfree~~ (removed from project). |
| P0 | Remove Cloudinary **API secret** from frontend; use unsigned upload preset or server-signed uploads; do admin/delete only server-side. |
| P1 | Ensure **no** anon SELECT on `technicians`; remove plaintext password comparison from `auth.ts`; move technicians to Supabase Auth or add server-issued tokens. |
| P1 | Harden technician “session” (Supabase Auth or server-issued token + validation). |
| P2 | Fail ALTCHA function in production if HMAC key is placeholder; add production CORS check. |
| P2 | Review every `innerHTML` / `dangerouslySetInnerHTML` / `document.write` and ensure no unsanitized user input. |
| P3 | Consider shared rate-limit store for production. |

---

**End of security risk analysis.**  
For implementation details, refer to the specific files and line numbers above; for technician migration, see `docs/TECHNICIAN_SUPABASE_AUTH_MIGRATION.md`.
