# Security Assessment Report — Hydrogen RO CRM

**Project:** `fintech-template-5157` (Hydrogen RO CRM)
**Assessment date:** 2026-05-23
**Last update:** 2026-05-24 — rescan response: address direct `/auth/v1/token` brute force (see §10)
**Assessor mode:** White-box (static source code review) — no active scanning of the live host was performed
**Repository commit base:** working tree at time of assessment
**Stack:** Vite + React 18 + TypeScript, Supabase (Postgres + Auth + RLS), Netlify Functions + Edge Functions, Cloudinary (primary + secondary), Hostinger SMTP via Nodemailer, ALTCHA PoW captcha, Cloudflare Turnstile (Supabase Auth gate), PWA

> All PoCs in this document are **safe and non-destructive**. They are intended for the maintainer to run against their own infrastructure to confirm findings. No live exploitation was performed during the assessment.
>
> **Redaction notice:** an earlier revision of this report quoted real secret values (Supabase service-role JWT, Cloudinary API key/secret, Hostinger SMTP password, third-party verification token) verbatim. All such values have been replaced with `<REDACTED — …>` placeholders. The real values still live in the on-disk `.env` and must be treated as compromised and rotated (see §5 Immediate Fixes Checklist, item 1). If this document was committed to git, distributed, or pasted anywhere with the old values, treat those copies as a secret leak: rotate first, then purge from history.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Methodology](#2-methodology)
3. [Findings — Highest Risk First](#3-findings--highest-risk-first)
4. [Confirmed vs Possible Findings](#4-confirmed-vs-possible-findings)
5. [Immediate Fixes Checklist](#5-immediate-fixes-checklist)
6. [Long-Term Hardening Recommendations](#6-long-term-hardening-recommendations)
7. [Dependency CVE Table](#7-dependency-cve-table)
8. [Out-of-Scope / Unverifiable Items](#8-out-of-scope--unverifiable-items)
9. [Final Security Score](#9-final-security-score)

---

## 1. Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High     | 7 |
| Medium   | 11 |
| Low      | 7 |
| **Total** | **27** |

**Overall risk score: 53 / 100 (D — needs urgent remediation)**
*Projected after Immediate Fixes Checklist: ~80 / 100 (B); after long-term hardening: ~92 / 100 (A).*

The application's **server-side security model is well thought out**:

- ALTCHA-gated public APIs
- Dual rate limiting (per IP + per email/phone)
- Escalating account lockout (15 → 30 → 60 min)
- Signed HttpOnly portal cookies + Netlify Edge route guard
- Supabase RLS locked down (`scripts/lock-down-anon-access.sql`)
- `SECURITY DEFINER` RPCs with a `service_role` re-check
- DOMPurify on the single user-HTML render path
- No `eval` / `document.write` on user input
- All `target="_blank"` carry `rel="noopener noreferrer"`
- Reasonable production CSP

The **critical and high-severity findings are concentrated in three areas**:

1. **`.env` on disk still contains real, live production secrets** — Supabase service-role JWT, Cloudinary master API secrets, an SMTP password. `.env` is gitignored, but the same secrets are also written under `VITE_*` names, meaning if a developer runs `npm run build` with this `.env` present the secrets are baked into the public browser bundle.
2. **`/.netlify/functions/cloudinary-delete` has no authentication** — any visitor of an allowlisted origin can delete arbitrary Cloudinary assets by `publicId`.
3. **Heavy dependency drift** — `react-router`, `dompurify`, `nodemailer`, `xlsx`, `altcha`, `altcha-lib`, `lodash`, etc. have **9 High / 8 Moderate** CVEs (`npm audit`, production deps only).

The remaining issues are configuration, defense-in-depth, error-leak, and supply-chain concerns.

---

## 2. Methodology

The audit covered the full OWASP Top 10 plus the additional categories requested:

- **Injection** (SQL / NoSQL / Command / Path)
- **XSS** (Reflected / Stored / DOM-based)
- **CSRF**
- **Broken Authentication / Broken Access Control / IDOR**
- **Security Misconfiguration**
- **Sensitive Data Exposure / Hardcoded Secrets**
- **SSRF / XXE / Insecure Deserialization**
- **File Upload Vulnerabilities**
- **Clickjacking / Open Redirects / Prototype Pollution**
- **Race Conditions / CORS Misconfiguration**
- **JWT / Session Fixation / Cookie security**
- **Weak Password Policies / Missing Rate Limiting / Account Enumeration**
- **API Security (REST / Webhook), GraphQL N/A**
- **Dependency Vulnerabilities / Supply Chain**
- **Missing Security Headers / CSP Weaknesses / Cache Poisoning**
- **WebSocket Security**

Each finding includes:

1. Vulnerability name
2. Severity (Critical / High / Medium / Low)
3. Affected endpoint / file / component
4. Explanation of the issue
5. Non-destructive exploitation example
6. Impact
7. Exact remediation steps with secure code example
8. OWASP / CWE references

---

## 3. Findings — Highest Risk First

### F-01 — CRITICAL — Live secrets in `.env` exposed as `VITE_*` (would be baked into the browser bundle on next build)

**CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-200 (Information Exposure)
**OWASP:** A02:2021 Cryptographic Failures, A05:2021 Security Misconfiguration

**Affected files:**

- `.env` lines 5, 17–18, 23–24, 30–31, 36–37, 46, 50, 55, 58
- `src/lib/cloudinary.ts` lines 30–48
- `vite.config.ts`

**What I found** (values redacted in this report — the real, live values are present in the on-disk `.env` and must be rotated):

```5:5:.env
SUPABASE_SERVICE_ROLE_KEY=<REDACTED — live JWT present in .env; rotate immediately>
```

```17:18:.env
VITE_CLOUDINARY_API_KEY=<REDACTED — live key in .env>
VITE_CLOUDINARY_API_SECRET=<REDACTED — live secret in .env; rotate immediately>
```

```45:46:.env
HOSTINGER_EMAIL_USER=<REDACTED — SMTP user in .env>
HOSTINGER_EMAIL_PASS=<REDACTED — live SMTP password in .env; rotate immediately>
```

And the client code reads those `VITE_*` secrets:

```30:48:src/lib/cloudinary.ts
this.config = {
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  apiKey: import.meta.env.VITE_CLOUDINARY_API_KEY || '',
  apiSecret: import.meta.env.VITE_CLOUDINARY_API_SECRET || '',
};
...
const secondaryApiSecret = import.meta.env.VITE_CLOUDINARY_SECONDARY_API_SECRET;
```

Vite **inlines every `import.meta.env.VITE_*` reference at build time**. The current `dist/` bundle does not contain those strings (grep verified), suggesting it was built without a populated `.env`, but **the next `npm run build` on a developer machine that has this `.env` will publish the Cloudinary master secrets, the Google Maps key, and the ORS key to anyone with view-source**.

**Impact:**

- `SUPABASE_SERVICE_ROLE_KEY` (currently server-only) — full bypass of RLS, complete database read/write/delete.
- `VITE_CLOUDINARY_API_SECRET` (primary + secondary) — full destructive control of both Cloudinary accounts.
- `HOSTINGER_EMAIL_PASS` — can send mail as `mail@hydrogenro.com`, enabling phishing from the real domain.
- `VITE_GOOGLE_MAPS_API_KEY`, `VITE_ORS_API_KEY` — already in client; ensure HTTP referrer restriction in the API consoles.
- `VITE_SUPABASE_ANON_KEY` is **expected** to be public; safe only because RLS is locked down.

**Non-destructive PoC:**

```bash
grep -nE "VITE_CLOUDINARY_API_SECRET|VITE_CLOUDINARY_SECONDARY_API_SECRET" -r src/
npm run build
grep -lE "$VITE_CLOUDINARY_API_SECRET|$VITE_CLOUDINARY_SECONDARY_API_SECRET" dist/assets/*.js
# (run with the real secret values exported in your shell; do not paste them into committed files)
```

**Remediation:**

1. **Rotate every secret in `.env` immediately.** Treat them as already compromised.
2. **Never expose secrets via `VITE_*`.** Remove the `VITE_CLOUDINARY_API_KEY` and `VITE_CLOUDINARY_API_SECRET` lines from `.env`. Patch `src/lib/cloudinary.ts`:

   ```ts
   constructor() {
     this.config = {
       cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '',
       uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? '',
       // intentionally no apiKey / apiSecret in the browser
     };
     const sn = import.meta.env.VITE_CLOUDINARY_SECONDARY_CLOUD_NAME;
     const sp = import.meta.env.VITE_CLOUDINARY_SECONDARY_UPLOAD_PRESET;
     this.secondaryConfig = sn && sp ? { cloudName: sn, uploadPreset: sp } : null;
   }
   ```

3. Delete the dead `generateSignature()` method (`src/lib/cloudinary.ts` lines 278–308).
4. Extend `scripts/inject-security-headers.mjs` to fail the build if any secret pattern leaks into `dist/`:

   ```js
   if (/cloudinary_api_secret|service_role|HOSTINGER_EMAIL_PASS/i.test(js)) {
     console.error('FAIL: secret leaked into bundle');
     process.exit(1);
   }
   ```

5. Keep all secret-class env vars **server-only** (no `VITE_` prefix). Netlify functions like `cloudinary-delete.js` already read `process.env.CLOUDINARY_API_SECRET` — that is the only place secrets should live.
6. Add `gitleaks` or `.gitguardian` pre-commit secret scanning.

---

### F-02 — CRITICAL — Unauthenticated, abusable `cloudinary-delete` endpoint

**CWE:** CWE-862 (Missing Authorization), CWE-285 (Improper Authorization)
**OWASP:** API1:2023 Broken Object Level Authorization, API5 Broken Function Level Authorization

**Affected file:** `netlify/functions/cloudinary-delete.js`

```28:50:netlify/functions/cloudinary-delete.js
exports.handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);
  ...
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return { statusCode: 403, ... };
  }
  if (event.httpMethod !== 'POST') { ... }
  ...
```

The function only validates the `Origin` header (trivially controllable from non-browser clients like `curl` / Burp) and then deletes anything matching `publicId`. **There is no JWT check, no ALTCHA check, no rate limit, and no resource ownership check.** Compare with `cloudinary-signed-url.js` which does require a valid Supabase JWT (`userClient.auth.getUser(accessToken)`).

**Impact:**

- Anonymous mass deletion of customer job photos, before/after evidence, invoices, AMC documents stored in Cloudinary. Once destroyed, those are irrecoverable unless you have a Cloudinary backup.
- Combined with F-01, also lets an outsider script delete every `public_id` they can enumerate from booking/job records.

**Non-destructive PoC** (uses a known non-existent ID so nothing is actually deleted — the success of the call proves the absence of auth):

```bash
curl -i -X POST https://hydrogenro.com/.netlify/functions/cloudinary-delete \
  -H 'Origin: https://hydrogenro.com' \
  -H 'Content-Type: application/json' \
  -d '{"publicId":"ro-service/__nonexistent_test_id__"}'
# Expect: 200 with {"deleted":false,"error":"Image not found ..."} -> proves no auth gate.
```

**Remediation:**

1. Require a Supabase admin/technician JWT, exactly like `cloudinary-signed-url.js`:

   ```js
   const accessToken = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
   if (!accessToken) return jsonResponse(401, corsHeaders, { error: 'Unauthorized' });
   const { data: userData, error } = await userClient.auth.getUser(accessToken);
   if (error || !userData?.user) return jsonResponse(401, corsHeaders, { error: 'Unauthorized' });
   const role = userData.user.app_metadata?.role || userData.user.user_metadata?.role;
   if (role !== 'admin' && role !== 'technician') {
     return jsonResponse(403, corsHeaders, { error: 'Forbidden' });
   }
   ```

2. Add IP + user rate limiting (e.g. 30/hour/IP, 100/hour/user).
3. Verify the `publicId` belongs to a record the caller is allowed to mutate (look it up in `jobs.photos`, `customers.photos`, `tax_invoices.images`, etc.) before deleting.
4. Reject any `publicId` containing characters outside `[A-Za-z0-9_\-/.]` and cap length.

---

### F-03 — HIGH — `.env` writes the same secrets to both `VITE_*` and unprefixed names (ambiguous trust boundary)

**CWE:** CWE-668 (Exposure of Resource to Wrong Sphere)

**Affected files:** `.env` lines 15–37; `netlify/functions/cloudinary-delete.js` lines 11–18

Server code falls back to `VITE_*` when the unprefixed value is missing:

```16:18:netlify/functions/cloudinary-delete.js
const cloudName = trim(process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME);
const apiKey = trim(process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY);
const apiSecret = trim(process.env.CLOUDINARY_API_SECRET || process.env.VITE_CLOUDINARY_API_SECRET);
```

This blurs the line between "secret in browser bundle" and "secret in server only". A future maintainer copying this convention will store more secrets under `VITE_` names — a guaranteed leak (F-01).

**Remediation:**

- In Netlify dashboard, set only the unprefixed variants.
- Remove the `|| process.env.VITE_*` fallbacks from all functions (`cloudinary-delete.js`, `cloudinary-signed-url.js`, `secure-auth-login.js`, `booking-customer-lookup.js`, `booking-guard.js`, `delete-technician-and-data.js`). Leave only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as the public pair.
- Add a `npm run build` lint that fails if any new `VITE_…(SECRET|PASS|TOKEN|PRIVATE)` is added.

---

### F-04 — HIGH — Dependency CVEs: 9 High / 8 Moderate, several reachable

**Source:** `npm audit --omit=dev`

Key reachable advisories:

| Package | Severity | Why it matters |
|---|---|---|
| `react-router-dom` / `@remix-run/router` ≤1.23.1 | High (CVSS 8.0, XSS via open redirect) | The app uses `react-router-dom@6.26.2` throughout `App.tsx`. |
| `dompurify` ≤3.3.3 | Moderate × 8 (mutation-XSS, ADD_TAGS bypass, prototype pollution) | Used by `src/lib/sanitize.ts` and `src/components/AMCGenerator.tsx`. |
| `nodemailer` ≤8.0.4 | High (SMTP command injection, addressparser DoS) | Used by `netlify/functions/send-email.js`. |
| `altcha` 0.8.0–2.2.4 | Moderate (PoW obfuscation cryptanalytic break) | The CAPTCHA you rely on for booking + login. |
| `altcha-lib` <1.4.1 | Moderate (challenge splicing/replay) | Server-side verifier — directly affects login + booking gating. |
| `xlsx` * | High, **no fix** (ReDoS + prototype pollution) | Used by `src/lib/gst-export.ts` (admin export). |
| `lodash` ≤4.17.23 | High (proto pollution, code injection via `_.template`) | Transitive (Netlify CLI / lovable-tagger). |
| `nanoid` <3.3.8 | Moderate | Predictable IDs. |
| `postcss`, `ws`, `minimatch`, `picomatch`, `brace-expansion`, `glob`, `yaml` | High/Moderate | Build chain. |

**Remediation:**

```bash
npm i react-router@^6.30.3 react-router-dom@^6.30.3 dompurify@^3.3.4 \
       nodemailer@^7 altcha@latest altcha-lib@^1.4.1 nanoid@^3.3.8
npm audit fix
npm rm xlsx && npm i exceljs   # then rewrite src/lib/gst-export.ts
npm audit --omit=dev           # verify
```

---

### F-05 — HIGH — Plaintext-password fallback path still exists for technician login

**CWE:** CWE-256 (Plaintext Storage of Password), CWE-916 (Weak Password Hash)

**Affected file:** `netlify/functions/provision-technician-auth-on-login.js` lines 10–18

```10:18:netlify/functions/provision-technician-auth-on-login.js
async function verifyPassword(plain, stored) {
  if (!stored) return false;
  const isHashed = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
  if (isHashed) {
    return bcrypt.compare(plain, stored);
  }
  return stored === plain;
}
```

Companion legacy code in `src/lib/auth.ts` lines 214–232 has the same plaintext compare. If any row in `technicians.password` was never migrated from plaintext, that path runs.

**Impact:**

- Plaintext passwords in `technicians.password` are auto-honoured.
- Anyone with `SUPABASE_SERVICE_ROLE_KEY` (see F-01) can `SELECT password FROM technicians` cleartext.

**Remediation:**

1. Find any non-bcrypt rows:

   ```sql
   SELECT id, email
   FROM technicians
   WHERE password IS NOT NULL
     AND password NOT LIKE '\$2a\$%' ESCAPE '\'
     AND password NOT LIKE '\$2b\$%' ESCAPE '\'
     AND password NOT LIKE '\$2y\$%' ESCAPE '\';
   ```

2. Reject the plaintext branch in `verifyPassword`:

   ```js
   if (!isHashed) {
     console.warn('[auth] non-bcrypt password row; refuse and force reset', { email });
     return false;
   }
   ```

3. Delete the dead `authenticateUser` plaintext path in `src/lib/auth.ts` lines 48–249.
4. Long-term: drop `technicians.password` column entirely once all technicians are provisioned in Supabase Auth.

---

### F-06 — HIGH — `hash-technician-password.js` references undefined `addSecurityHeaders` (broken endpoint + masked logic bug)

**CWE:** CWE-754 (Improper Check for Unusual or Exceptional Conditions)

**Affected file:** `netlify/functions/hash-technician-password.js`

```7:18:netlify/functions/hash-technician-password.js
exports.handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
        headers: addSecurityHeaders(corsHeaders),   // <-- never imported
      body: '',
    };
  }
```

`addSecurityHeaders` is referenced 6+ times but never `require`d. The function throws `ReferenceError` on every OPTIONS preflight. `src/pages/Settings.tsx` line 372 still calls it.

**Impact:**

- Admins setting a technician password via Settings see a 500.
- An unauthenticated endpoint that does CPU-heavy bcrypt — even though rate-limited — has no authn gate. If you ever fix the missing import, you re-introduce a bcrypt-DoS / oracle endpoint that any visitor can call.

**Remediation:**

1. **Preferred:** delete the function entirely and update `Settings.tsx` to set technician passwords via Supabase Auth `admin.updateUserById({ password })` through a new authenticated function.
2. If you keep it, add `const { addSecurityHeaders } = require('./security-headers');` plus a Supabase admin JWT check (mirror `delete-technician-and-data.js`) and cap `password` length at 128 chars.

---

### F-07 — HIGH — Public `send-email` allows arbitrary HTML to attacker-chosen recipient (phishing relay)

**CWE:** CWE-940 (Improper Verification of Source of Communication Channel), CWE-285

**Affected files:** `netlify/functions/send-email.js`, `netlify/functions/email-guard.js`

Validation in `email-guard.js`:

- Recipient: any well-formed email (`to`)
- Subject: must start with `Service Booking Confirmed`
- `html` / `text`: up to **150 000 bytes** of arbitrary HTML, not sanitized

The mail is sent as `From: Hydrogen RO – Water Purifier Services <mail@hydrogenro.com>` — a legitimately deliverable address with your SPF/DKIM.

**Impact:**

- An ALTCHA-solved attacker (or a botnet that bulk-solves PoW) sends arbitrary HTML phishing (fake password reset, fake invoice with malicious link) from your real domain to any inbox they choose. Rate limit is 5/hr per IP + 3/hr per recipient; with IP rotation this is dozens of phishes/hour.

**Remediation:**

1. Drop the `html`/`text` from the client request entirely. Build the booking-confirmation HTML **server-side** from a fixed template using validated `customerName`, `phone`, `slot`, `jobNumber` fields:

   ```js
   const { customerName, phone, jobNumber, scheduledDate, scheduledTimeSlot } = body;
   const html = renderBookingTemplate({ customerName, phone, jobNumber, scheduledDate, scheduledTimeSlot });
   ```

2. If you must accept HTML, sanitize on the server with `sanitize-html` (allow only `<p><br><strong><em><a href>` with `href` limited to your own origin).
3. Tighten recipient validation to match `customers.email` looked up by phone-normalized; reject anything else.
4. Lower per-IP limit to 2/hr until the template change ships.

---

### F-08 — HIGH — Memory-only rate limits & in-memory account lockout (per Lambda instance)

**CWE:** CWE-799 (Improper Control of Interaction Frequency)

**Affected files:** `netlify/functions/rate-limiter.js` line 5–6; `netlify/functions/auth-lockout.js` lines 5, 49–95; `netlify/functions/altcha-verify.js` line 48

```5:6:netlify/functions/rate-limiter.js
const rateLimitStore = new Map();
```

On Netlify Functions each cold instance has its own `Map`. With ~20 warm containers, login brute-force is effectively 200 attempts/min instead of 10. ALTCHA challenge replay protection has the same issue and explicitly accepts unknown salts (line 231).

**Remediation:**

1. Make `recordLoginFailure` fail closed if the DB RPC errors (currently falls back to memory):

   ```js
   if (error) return jsonResponse(503, ..., { error: 'Service temporarily unavailable' });
   ```

2. Move all rate-limit counters to Upstash Redis (Netlify Blobs / KV) so they are shared across instances.
3. Use the database `auth_login_attempts` table for ALTCHA challenge replay (store `salt` with `used_at`).

---

### F-09 — HIGH — Distance-matrix function trusts a client-supplied `apiKey` (key skimming + quota theft)

**CWE:** CWE-602 (Client-Side Enforcement of Server-Side Security), CWE-200

**Affected file:** `netlify/functions/distance-matrix.js` lines 99, 182

```99:99:netlify/functions/distance-matrix.js
const { origins, destinations, mode = 'driving', apiKey } = bodyData;
```

The function accepts a Google Maps key from the request body and forwards it to Google. Anyone on the internet can hit your function (after passing `isOriginAllowed`, which is `Origin`-spoofable from non-browser clients) and turn it into a free Distance Matrix proxy.

**Remediation:**

1. Move the API key fully server-side: `const apiKey = process.env.GOOGLE_MAPS_API_KEY;`. Remove `apiKey` from the request.
2. Lock the public Google Maps key (the one already used for Places autocomplete on `/book`) via HTTP-referrer restriction in Google Cloud Console.
3. Add `checkRateLimit({ maxRequests: 30, windowMs: 60_000, endpoint: 'distance-matrix' })`.
4. Stop returning `details: error.message`. Stop logging the full request body.

---

### F-10 — MEDIUM — Geocode proxy: no rate limit, error leaks, weak validation

**CWE:** CWE-918 (SSRF — low), CWE-209 (Information Exposure via Error Message)

**Affected file:** `netlify/functions/geocode.js`

- `lat`, `lon`, `query` are interpolated into the Nominatim URL. Host is hard-coded so no SSRF, but `lat`/`lon` lack `isFinite`/range validation — an attacker can append `lat=1&extra=…` to add query params to the upstream call.
- No rate limit → free DoS of geocoding.
- `details: error.message` leaked unconditionally.

**Remediation:**

```js
const latN = Number(lat), lonN = Number(lon);
if (!Number.isFinite(latN) || !Number.isFinite(lonN) ||
    latN < -90 || latN > 90 || lonN < -180 || lonN > 180) {
  return jsonResponse(400, corsHeaders, { error: 'Invalid coordinates' });
}
const safeQuery = String(query ?? '').slice(0, 200);
// add rateLimiters.default(event) at top
// remove `details: error.message` from 500 responses
```

---

### F-11 — MEDIUM — Error / stack-trace leakage across multiple functions

**CWE:** CWE-209

| File | Lines | Leak |
|---|---|---|
| `netlify/functions/altcha-verify.js` | 257–259, 326–329 | `details: error.message` |
| `netlify/functions/distance-matrix.js` | 91–93, 290–293 | `details:`, `stack:` |
| `netlify/functions/geocode.js` | 117–120 | `details:` |
| `netlify/functions/hash-technician-password.js` | 130–132 | `details:` (dev-guarded ✓) |
| `netlify/functions/cloudinary-delete.js` | 191–193 | `details:` (dev-guarded ✓) |

**Remediation:** Standardize all 500 responses with a non-leaking shape; keep details in server logs only:

```js
return jsonResponse(500, corsHeaders, { error: 'Internal error', requestId });
console.error('[function-name]', requestId, error);
```

---

### F-12 — MEDIUM — `PORTAL_SESSION_SECRET` falls back to `ALTCHA_HMAC_KEY` (key reuse)

**CWE:** CWE-323 (Reusing a Nonce / Key Pair in Encryption)

**Affected files:** `netlify/functions/portal-session.js` lines 7–13; `netlify/edge-shared/portal-session-crypto.ts`

```7:13:netlify/functions/portal-session.js
function getSecret() {
  return (
    process.env.PORTAL_SESSION_SECRET ||
    process.env.ALTCHA_HMAC_KEY ||
    'PLACEHOLDER-DO-N-USE-IN-PRODUCTION'
  );
}
```

If `PORTAL_SESSION_SECRET` is unset, the same key signs ALTCHA HMACs and portal session cookies — an attacker who exploits the `altcha-lib` CVE F-04 potentially gains material to forge portal session cookies.

**Remediation:**

- Set a distinct `PORTAL_SESSION_SECRET` (`openssl rand -hex 32`) on Netlify Production scope.
- Add a startup check that refuses to issue cookies if `PORTAL_SESSION_SECRET` is unset or equals `ALTCHA_HMAC_KEY`.
- Rotate `PORTAL_SESSION_SECRET` and bump `COOKIE_VERSION` from `v1` to `v2` to invalidate old cookies on rotate.

---

### F-13 — MEDIUM — Portal cookie `SameSite=Lax + Path=/` allows top-level GET CSRF

**CWE:** CWE-352 (CSRF)

**Affected file:** `netlify/functions/portal-session.js` line 54

```54:54:netlify/functions/portal-session.js
return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
```

`SameSite=Lax` permits the cookie on cross-site top-level GET navigations. Practical impact is low because most data mutations go through Supabase JS with `Authorization: Bearer` headers (not auto-sent cross-site), but still a defense-in-depth weakness.

**Remediation:**

- `SameSite=Strict` for admin/technician portals.
- For all state-changing Netlify Functions, additionally require either a Supabase Bearer token or an `X-Requested-With: XMLHttpRequest` header (cannot be set cross-origin).

---

### F-14 — MEDIUM — `delete-technician-and-data`: insufficient role check

**CWE:** CWE-285 (Improper Authorization)

**Affected file:** `netlify/functions/delete-technician-and-data.js` lines 99–109

```99:109:netlify/functions/delete-technician-and-data.js
const role =
  userData.user.app_metadata?.role ||
  userData.user.user_metadata?.role ||
  'admin';                                  // <-- default to admin!
if (role === 'technician') {
  return { ... 'Admin only' ... };
}
```

The check **only** rejects role === `'technician'`. If a future Supabase user has `role` undefined, it defaults to `'admin'` and they can delete any technician.

**Remediation:**

- Affirmatively require admin:

  ```js
  if (role !== 'admin') return jsonResponse(403, ..., { error: 'Admin only' });
  ```

- Better, query an `admins` table or an `is_admin` claim and require positive proof.
- Add ALTCHA / re-auth (password re-entry) for destructive actions.
- Write an audit-log row on success.

---

### F-15 — MEDIUM — CSP allows `'unsafe-inline'` styles and very broad `img-src https:` / `connect-src https://*.google*.com`

**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers / Frames), CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)

**Affected files:** `netlify.toml` line 81; `scripts/csp-config.mjs`

- `style-src 'unsafe-inline'` is necessary for Tailwind/Radix runtime CSS vars but means a CSS-injection sink (`dangerouslySetInnerHTML` into `<style>` — present in `AdminDashboard.tsx`, `chart.tsx`, `AMCGenerator.tsx`, `PhotoViewerDialog.tsx`) can affect more than presentation.
- `img-src 'self' data: https: blob:` allows tracking pixels from anywhere.
- `connect-src` includes `https://*.google.com` and `https://*.googleapis.com` (huge surface).
- Missing: `'strict-dynamic'`, `report-uri`, `require-trusted-types-for 'script'`.

**Remediation:**

1. Replace blanket `https:` in `img-src` with explicit hosts.
2. Trim `connect-src https://*.google.com` to the specific hosts needed.
3. Add CSP reporting (`report-to csp-endpoint;`).
4. Add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-site` headers — currently absent.
5. Long-term: replace inline `<style dangerouslySetInnerHTML>` with nonce-based CSP.

---

### F-16 — MEDIUM — `breachme-verify` meta + SEO placeholders disclose third-party SaaS use

**CWE:** CWE-200

**Affected file:** `index.html` line 7, lines 81–85

```html
<meta name="breachme-verify" content="breachme-verify=<REDACTED — real token in index.html>" />
<meta name="google-site-verification" content="YOUR_GOOGLE_VERIFICATION_CODE" />
<meta name="yandex-verification" content="YOUR_YANDEX_VERIFICATION_CODE" />
```

`breachme-verify` reveals you are monitored by Breachme — useful intel for an attacker timing leak announcements. The literal `"YOUR_..._CODE"` placeholders signal a non-finished deploy.

**Remediation:** Remove unused verification tags; keep only the ones you use, with real values.

---

### F-17 — MEDIUM — Supabase JWT stored in `localStorage` (XSS → account takeover)

**CWE:** CWE-922 (Insecure Storage of Sensitive Information)

**Affected file:** `src/lib/supabaseClient.ts` lines 37–44

This is the Supabase default; the cost is paid by any JavaScript that runs on the page (XSS sink, compromised CSP-allowed script, future dependency CVE).

**Remediation:**

- Move Supabase auth to cookie-based storage (HttpOnly + Secure + SameSite=Strict) via `@supabase/ssr` (already installed) using Netlify Edge cookies.
- Until then: keep CSP tight (F-15), strip third-party scripts you do not fully control, drop `cdn.jsdelivr.net` from `script-src` if unused.

---

### F-18 — MEDIUM — Detailed login feedback enables account enumeration & brute-force planning

**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts), CWE-204 (Observable Response Discrepancy)

**Affected file:** `netlify/functions/secure-auth-login.js` lines 215–229, 251, 259, 274

Responses include `remainingAttempts`, `lockoutCount`, `lockMinutes`, plus distinct messages "Use the technician/admin login page for this account." and "Account is not active." — these let an attacker:

- Tell whether an email is a technician, an admin, or non-existent.
- Time waves of attempts to stay just under lockout.

**Remediation:**

- Return identical body for any auth failure: `{ error: "Invalid email or password" }`.
- Move attempt-counter display into the UI based on the `Retry-After` header only.
- Use identical 401 for "wrong portal" and "wrong password".

---

### F-19 — MEDIUM — Inventory the function-gate matrix (defense in depth)

**CWE:** CWE-862

`booking-job-create.js`, `booking-intent.js`, `booking-customer-mutate.js` all require ALTCHA + rate limits (good). Add a CI guard that asserts every public function has at least one gate (JWT or ALTCHA). You already have `scripts/check-technician-auth-coverage.mjs`; extend it.

---

### F-20 — MEDIUM — `xlsx` is unmaintained and has unfixable advisories — used in admin export

**CWE:** CWE-1104 (Use of Unmaintained Third Party Components)

**Affected files:** `package.json` line 88; `src/lib/gst-export.ts`

SheetJS CE has two unfixed High advisories (ReDoS, prototype pollution). An admin opening a maliciously crafted `.xlsx` could be hit.

**Remediation:** `npm rm xlsx && npm i exceljs` and rewrite `gst-export.ts`.

---

### F-21 — LOW — Web Crypto polyfill in Netlify functions is partial / dead code

**CWE:** CWE-330 (Use of Insufficiently Random Values — only if polyfill ever runs)

**Affected files:** `netlify/functions/altcha-verify.js` lines 6–20; `netlify/functions/altcha-guard.js` lines 5–19

`subtle.digest` accepts only the algorithms `altcha-lib` happens to call (`SHA-256`). Future code paths calling `subtle.verify` / `subtle.importKey` will throw. Node ≥ 18 natively exposes `globalThis.crypto.subtle`, so this polyfill is dead code on Netlify (Node 20).

**Remediation:** remove the polyfill block; rely on the native implementation.

---

### F-22 — LOW — `provision-technician-auth-on-login` returns `hint:` to client on failure

**CWE:** CWE-209

**Affected file:** `netlify/functions/provision-technician-auth-on-login.js` lines 123–132

Drop the `hint` field or log it server-side only.

---

### F-23 — LOW — Verbose `console.log` of payload previews & ALTCHA salts in production

**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

**Affected files:** `netlify/functions/altcha-verify.js` lines 170–177, 236, 263–286; `netlify/functions/cloudinary-delete.js` line 111; many others

These flood Netlify function logs with IPs, payload previews, salts, key lengths. None contains a secret literal, but log volume amplifies any future log-share leak.

**Remediation:** wrap with `if (process.env.LOG_VERBOSE === '1')` or remove. Use a structured logger with a level threshold.

---

### F-24 — LOW — `nodemailer tls: {}` (empty) means default Node TLS options

**CWE:** CWE-326 (Inadequate Encryption Strength)

**Affected file:** `netlify/functions/send-email.js` lines 72–81

Today's Node defaults to TLS 1.2+ with cert validation — fine. Pin explicitly:

```js
tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
```

---

### F-25 — LOW — Dead client-side technician auth path (`authenticateUser`)

**CWE:** CWE-1109 (Use of Same Variable for Multiple Purposes — broader: dead code)

**Affected file:** `src/lib/auth.ts` lines 48–249

This `SELECT password FROM technicians` via the anon client can no longer succeed in production (RLS revokes the column), but the code tells future maintainers "compare passwords in the browser," which is wrong. Delete it.

---

### F-26 — LOW — Stale dev artefacts in repo

**CWE:** CWE-540 (Inclusion of Sensitive Information in Source Code), CWE-1059 (Insufficient Documentation)

```
scripts/_original_jobcard_snippet.txt
scripts/_original_jobcard_snippet2.txt
src/components/AdminDashboard.backup.tsx
src/components/AdminDashboard.tsx.broken
security-audit.cjs
security-audit.js
hash-technician-passwords.js
migrate-from-cloudinary.js
check-photos.js
```

Not served at runtime but they confuse incident response and may contain stale secret references.

**Remediation:** Move to a `.archive/` folder ignored by lint/CI, or delete.

---

### F-27 — LOW — `/api/* → /.netlify/functions/:splat` rewrite reveals endpoint topology

**CWE:** CWE-200

**Affected file:** `netlify.toml` lines 48–52

A wordlist scan of `/api/*` discovers your Netlify Functions. Drop the legacy rewrite if not needed.

---

## 4. Confirmed vs Possible Findings

**Confirmed (verified directly in code):** F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-09, F-10, F-11, F-12, F-13, F-14, F-15, F-16, F-18, F-20, F-21, F-22, F-23, F-25, F-26, F-27.

**Possible (depends on runtime env / data state):**

- **F-08** — only exposed when DB-backed lockout RPC fails (fall-through to memory).
- **F-17** — only exploitable if an XSS / supply-chain RCE is achieved.
- **F-19** — depends on which functions you keep adding without auth gates.
- **F-24** — only relevant if your SMTP provider weakens TLS.

---

## 5. Immediate Fixes Checklist

Apply in priority order:

- [ ] **1.** Rotate all secrets in `.env` (Supabase service-role JWT, Cloudinary primary + secondary, Hostinger SMTP password, `ALTCHA_HMAC_KEY`, `PORTAL_SESSION_SECRET`, Google Maps key, ORS key).
- [ ] **2.** Delete `VITE_CLOUDINARY_*_API_*` from `.env`; remove `import.meta.env.VITE_*SECRET*` reads from `src/lib/cloudinary.ts`; delete dead `generateSignature()`.
- [ ] **3.** Add a build-time grep guard for any secret pattern leaking into `dist/`.
- [ ] **4.** Patch `netlify/functions/cloudinary-delete.js` to require a Supabase JWT, add rate limit, validate `publicId` against an owning record.
- [ ] **5.** `npm i react-router@^6.30.3 react-router-dom@^6.30.3 dompurify@^3.3.4 nodemailer@^7 altcha@latest altcha-lib@^1.4.1 nanoid@^3.3.8` → re-run `npm audit --omit=dev`.
- [ ] **6.** Replace `xlsx` with `exceljs`.
- [ ] **7.** Reject non-bcrypt rows in `provision-technician-auth-on-login.js` (`verifyPassword`).
- [ ] **8.** Delete or properly auth-gate `hash-technician-password.js`.
- [ ] **9.** Stop accepting raw `html`/`text` in `send-email.js`; render server-side from a fixed template.
- [ ] **10.** Set `PORTAL_SESSION_SECRET` distinct from `ALTCHA_HMAC_KEY`; bump `COOKIE_VERSION` to `v2`.
- [ ] **11.** Move `apiKey` for distance-matrix server-side; add rate limit; remove from request body.
- [ ] **12.** Switch portal cookie to `SameSite=Strict`; add `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-site`.
- [ ] **13.** Genericize auth error responses (remove `remainingAttempts`, `lockoutCount`, distinct "wrong portal" wording).
- [ ] **14.** Stop returning `details` / `stack` / `hint` from any 5xx response.
- [ ] **15.** Tighten CSP `img-src` and `connect-src` host lists; remove `cdn.jsdelivr.net` from `script-src` if unused.
- [ ] **16.** Delete dead code: `authenticateUser` in `src/lib/auth.ts`, `*.backup.tsx`, `*.broken`, `_original_jobcard_snippet*.txt`, root-level `security-audit.{cjs,js}`, `migrate-from-cloudinary.js`, `check-photos.js`.
- [ ] **17.** Add `gitleaks` pre-commit hook.

---

## 6. Long-Term Hardening Recommendations

1. **Centralize secrets in Netlify Environment Variables (Production scope) and Supabase Vault.** Delete `.env` from developer machines after rotation.
2. **Move Supabase JWT out of `localStorage`** via `@supabase/ssr` server-side session pattern.
3. **Persistent rate-limit store** — Upstash Redis (free tier) or Supabase `rate_limits` table.
4. **WAF in front of Netlify** — Cloudflare (free) with managed ruleset, bot fight, per-route rate limits.
5. **Trusted Types + CSP nonces** — switch to `script-src 'self' 'nonce-…' 'strict-dynamic'`; add `require-trusted-types-for 'script'`.
6. **Replace dompurify-rendered admin-editable text** with a strict block-only renderer (`react-markdown` with an allow-list).
7. **Service-side audit log** for technician deletion, technician auth provisioning, customer record mutation, Cloudinary deletion, email sending — store IP, user_id, action, target_id, before/after diff in a `security_events` table with RLS `service_role` only.
8. **CI security gates:**
   - `npm audit --omit=dev --audit-level=high` must pass.
   - `gitleaks detect` must pass.
   - `eslint-plugin-security`, `eslint-plugin-no-secrets`.
   - A test that `curl`s every Netlify function unauthenticated and asserts only `altcha-verify` (GET) responds 200.
9. **Penetration retest** after Section 5 items 1–17 and at least quarterly.
10. **Password policy & MFA** — ≥12 char mixed-class password on the admin Supabase project; Supabase MFA (TOTP) for the admin pool.
11. **CAPTCHA upgrade path** — consider hCaptcha or Cloudflare Turnstile **in addition** to ALTCHA for login.
12. **Data minimization** — stop `SELECT`ing `technicians.password` from the client entirely; revoke from anon + authenticated.
13. **Customer PII export controls** — log every successful customer lookup with hashed IP for forensics (`BOOKING_IP_HASH_PEPPER` pattern is good; replicate for customer endpoints).

---

## 7. Dependency CVE Table

Source: `npm audit --omit=dev` (production dependencies only).

| Package | Installed | Severity | Advisories | Reachable in this app? |
|---------|-----------|----------|------------|------------------------|
| `@remix-run/router` (via `react-router-dom`) | ≤1.23.1 | High (CVSS 8.0) | [GHSA-2w69-qvjg-hvjx](https://github.com/advisories/GHSA-2w69-qvjg-hvjx) XSS via Open Redirect | Yes (routing) |
| `react-router-dom` | 6.26.2 | High (transitive) | same | Yes |
| `dompurify` | <3.3.3 | Mod ×8 | mutation-XSS, ADD_TAGS bypass, prototype pollution, SAFE_FOR_TEMPLATES bypass, CUSTOM_ELEMENT_HANDLING proto-pollution | Yes (`sanitize.ts`, `AMCGenerator.tsx`) |
| `nodemailer` | <7 (cli pulls older) | High | [GHSA-mm7p-fcc7-pg87](https://github.com/advisories/GHSA-mm7p-fcc7-pg87), [-rcmh-qjqh-p98v](https://github.com/advisories/GHSA-rcmh-qjqh-p98v), [-c7w3-x93f-qmm8](https://github.com/advisories/GHSA-c7w3-x93f-qmm8), [-vvjj-xcjg-gr5g](https://github.com/advisories/GHSA-vvjj-xcjg-gr5g) | Yes (`send-email.js`) |
| `altcha` | 2.2.4 | Mod | [GHSA-mpmc-qchh-r9q8](https://github.com/advisories/GHSA-mpmc-qchh-r9q8) PoW obfuscation break | Yes (booking + login captcha) |
| `altcha-lib` | <1.4.1 | Mod | [GHSA-6gvq-jcmp-8959](https://github.com/advisories/GHSA-6gvq-jcmp-8959) challenge splicing / replay | Yes (`altcha-verify.js`, `altcha-guard.js`) |
| `xlsx` | * | High (no fix) | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | Yes (admin GST export) |
| `lodash` | ≤4.17.23 (transitive) | High | [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg), [-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) | Indirect |
| `nanoid` | <3.3.8 | Mod | [GHSA-mwcw-c2x4-8c55](https://github.com/advisories/GHSA-mwcw-c2x4-8c55) predictable IDs | Transitive |
| `brace-expansion` 2.x | 2.0.0–2.0.2 | Mod | [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw), [-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | Build only |
| `glob` 10.x | 10.2.0–10.4.5 | High | [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | Build only |
| `minimatch` 9.x | | High | 3 ReDoS advisories | Build only |
| `picomatch` <2.3.1 | | High | method injection + ReDoS | Build only |
| `postcss` <8.5.10 | | Mod | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) XSS via CSS stringify | Build only |
| `ws` 8.0.0–8.20.0 | | Mod | DoS | Dev only (Vite HMR) |
| `yaml` 1.x / 2.x | | Mod | stack overflow | Build only |

**Total:** 17 vulnerabilities (8 moderate, 9 high).

---

## 8. Out-of-Scope / Unverifiable Items

These could not be verified from static review alone — please confirm against production:

- Whether `SUPABASE_SERVICE_ROLE_KEY` and other secrets are also configured in the Netlify dashboard with their pre-rotation values (i.e. whether they are already live and exposed in deploys).
- Live behaviour of production endpoints — Origin spoofing, ALTCHA bypass timing, behaviour under load. Run the PoCs in §3 against the production URL to confirm.
- Supabase Project settings: password strength, MFA enforced, JWT expiry, "Disable Sign-ups", "Email Confirmations Required", session timeout.
- Cloudinary upload preset configuration (must be "Unsigned" with strict folder + format restrictions; otherwise file-upload abuses become possible regardless of F-02 fix).
- DNS / DKIM / SPF / DMARC for `hydrogenro.com` — `DMARC=reject` is required to make F-07 phishing concerns real-world hard.
- HTTPS / TLS cipher list on `hydrogenro.com` (verify with `testssl.sh hydrogenro.com`).

---

## 9. Final Security Score

| Domain | Score / 100 |
|---|---|
| Secrets management | **20** (live secrets on disk, `VITE_` mixing) |
| AuthN / AuthZ | 70 (good lockout, ALTCHA, but plaintext-fallback + role-default issues) |
| Public APIs | 55 (booking surface well-gated; `cloudinary-delete`, `distance-matrix`, `geocode` not) |
| Input validation | 75 (server validates booking/email; ALTCHA tokens HMACed) |
| RLS / DB | 90 (well-locked `lock-down-anon-access.sql`, `SECURITY DEFINER` + service-role guard, sanitized error bodies) |
| Frontend XSS | 75 (no user-input `dangerouslySetInnerHTML`; DOMPurify present; CSP decent) |
| Headers / CSP / cookies | 70 (good baseline; `SameSite=Lax` + broad CSP host-lists) |
| Dependencies | 35 (17 advisories, several reachable) |
| Logging / error handling | 55 (verbose dev logs in prod; some `details` leaks) |
| Cryptography | 75 (HMAC for cookies + ALTCHA tokens; PORTAL secret fallback weak; TLS opts unset) |
| **Overall weighted** | **53 / 100 (D)** |

| State | Projected score |
|---|---|
| **Current** | **53 / 100 (D)** |
| After Immediate Fixes Checklist (§5) | ~80 / 100 (B) |
| After Long-Term Hardening (§6) | ~92 / 100 (A) |

---

## 10. 2026-05-24 Rescan Response — Direct `/auth/v1/token` brute force

### Finding (rescan, 2026-05-24)

> RESCAN: The authentication endpoint still has no rate limiting. Eight rapid failed login attempts all returned HTTP 400 without any 429 Too Many Requests or account lockout response. Brute-force attacks against admin accounts remain feasible without throttling. CVSS 6.5 (Medium).

### Root cause

`secure-auth-login` proxy defenses (ALTCHA, 10 failed/IP/hr, 5 failed/email/15 min, escalating
15→30→60 min lockout) are not on the path when an attacker calls
`https://cgpjfmbyxjetmzehkumo.supabase.co/auth/v1/token?grant_type=password`
directly with the public `VITE_SUPABASE_ANON_KEY` (which has to ship in the
browser bundle by Supabase design). Supabase's own per-project rate limit
defaults to **30 / 5 min / IP** for password sign-in — plenty of headroom for
brute force.

### Fix shipped (code, 2026-05-24)

| Change | File(s) | Effect |
|---|---|---|
| Cloudflare Turnstile widget on admin + technician login forms | `src/components/TurnstileWidget.tsx`, `src/components/AdminLogin.tsx`, `src/pages/TechnicianLogin.tsx` | Captures `captcha_token` to forward to Supabase |
| `captchaToken` plumbed through entire auth chain | `src/contexts/AuthContext.tsx`, `src/lib/secureAuthLogin.ts`, `src/lib/auth.ts` | Token reaches the proxy unchanged |
| Proxy forwards token to Supabase via `gotrue_meta_security.captcha_token` | `netlify/functions/secure-auth-login.js` | Supabase verifies Turnstile server-side BEFORE password check |
| Proxy rate limits count **failed** attempts only (10 failed/IP/hr, 5 failed/email/15 min) | `netlify/functions/auth-rate-limits.js` | Correct passwords no longer burn IP budget |
| Lockout RPC now **fails closed** instead of falling back to per-Lambda memory (addresses §3 F-08) | `netlify/functions/auth-lockout.js`, `netlify/functions/secure-auth-login.js` | Removes ~20× multi-instance bypass; returns 503 (not 429) when degraded so UI doesn't claim "locked" |
| CSP allows `https://challenges.cloudflare.com` in `script-src`, `frame-src`, `connect-src` | `scripts/csp-config.mjs`, `netlify.toml` | Turnstile script/iframe/API calls load in production |

The Turnstile path is **soft-deployable**: when `VITE_TURNSTILE_SITE_KEY` is
not set the widget renders nothing and login is unchanged. Once the key is
set and Supabase Dashboard CAPTCHA is enabled, every `/auth/v1/token` call
(proxy OR direct) requires a valid token or Supabase 400s the request before
ever touching the password.

### Dashboard config still required (owner action)

Without these the code change has no effect on the direct `/auth/v1/token`
attack surface — they are **what actually closes the finding**.

1. **Cloudflare Turnstile** → https://dash.cloudflare.com → Turnstile → Add Widget
   - Hostnames: `hydrogenro.com`, `www.hydrogenro.com`, `hydrogenro.netlify.app`, `localhost`
   - Mode: Managed (recommended)
   - Copy **site key** → set `VITE_TURNSTILE_SITE_KEY` in Netlify (Production scope) → redeploy.
   - Copy **secret key** → step 2 below.
2. **Supabase Dashboard → Authentication → Bot and Abuse Protection** → enable CAPTCHA
   - Provider: Cloudflare Turnstile
   - Paste the secret key from step 1 → Save.
3. **Supabase Dashboard → Authentication → Rate Limits** — lower from defaults:
   - Sign in / sign ups: 30 → **10 per 5 min**
   - Token verifications: 30 → **10 per 5 min**
   - (Keep token refresh + recovery email at defaults.)

### Verification PoC (run after dashboard config)

```bash
# 1. With no captcha_token (simulates direct scanner hit) → expect 400 "captcha"
curl -i -X POST \
  "https://cgpjfmbyxjetmzehkumo.supabase.co/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -d '{"email":"poorna@hydrogenro.com","password":"wrong"}'
# Before fix: HTTP 400 {"error_code":"invalid_credentials"} — usable for brute force.
# After fix: HTTP 400 with "captcha_token" mention — brute force unusable.

# 2. Hit our proxy 6 times rapidly from same IP → expect HTTP 429 on attempt 6
for i in 1 2 3 4 5 6; do
  curl -i -X POST https://hydrogenro.com/.netlify/functions/secure-auth-login \
    -H "Origin: https://hydrogenro.com" -H "Content-Type: application/json" \
    -d '{"email":"x@x","password":"x","altchaLoginToken":"x"}'
done
```

### Items still open from §5 (not addressed by this change)

F-01, F-02, F-03, F-05, F-06, F-07, F-09, F-12, F-13, F-14, F-18, F-19, F-20.
F-04 (dependency CVEs) and F-15 (CSP tighten) untouched. F-08 partially addressed
(lockout RPC now fails closed; per-instance rate-limit `Map` still in memory —
move to Upstash/Redis as a follow-up).

---

*End of report.*
