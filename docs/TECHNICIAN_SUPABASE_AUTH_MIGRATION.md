# Technician → Supabase Auth: What to Change

This document lists what needs to change so technicians use **Supabase Authentication** instead of database password + custom session. After this, technician requests will have a real JWT and `auth.uid()`, so the "lock writes to authenticated only" migration will work for them too.

---

## 1. Database

### 1.1 Link technicians to Supabase Auth users

- **Add column** on `public.technicians`:
  - `auth_user_id uuid UNIQUE REFERENCES auth.users(id)`
- **Purpose:** Each technician row is tied to one Supabase Auth user. RLS and app code use this to go from `auth.uid()` → technician `id`.

### 1.2 RLS policies that use “current technician”

Today some policies use `auth.uid()` as if it were the technician id (e.g. `jobs.assigned_technician_id = auth.uid()`). For technicians, `auth.uid()` will be the **Supabase user id**, not the technician table id.

- **Change:** Any policy that treats “current user is this technician” must use the link:
  - Instead of: `assigned_technician_id = (select auth.uid())`
  - Use: `assigned_technician_id = (select id from public.technicians where auth_user_id = (select auth.uid()))`
- **Where:** e.g. `follow_ups` “own” policies (scheduled_by, assigned_technician_id, assigned_by). Search for `auth.uid()` in RLS and update any that compare to technician/job assignment columns.

### 1.3 Password column

- **Optional:** Keep `technicians.password` for a transition period, then drop it once all technicians use Supabase Auth.
- **Optional:** Add a DB trigger or app logic so that when a technician’s password is updated in Settings, you also call Supabase Auth `updateUser` to keep Auth in sync until you remove DB passwords.

---

## 2. Creating / updating technicians (Admin – Settings)

When an admin **creates** a technician:

1. **Create Supabase Auth user** (Dashboard, Backend, or Edge Function with service role):
   - `auth.admin.createUser({ email, password, email_confirm: true })` (or equivalent).
2. **Insert** into `public.technicians` with:
   - Same `email`, and
   - `auth_user_id = <id returned from createUser>`.
   - Do **not** store the same password in `technicians.password` if you are moving to Auth-only (or store temporarily and stop using it for login).

When an admin **updates** a technician (e.g. password change):

1. If using Supabase Auth for technicians: update password via **Supabase Auth** (`auth.admin.updateUserById(technician.auth_user_id, { password })`), not only in `technicians.password`.
2. If you still have `technicians.password`, you can update it for backward compatibility during transition, but login should use Auth.

**Where in code:** `src/pages/Settings.tsx` – `handleSaveTechnician` (create/update technician). You’ll need:

- A backend or Edge Function that has **service role** (or Admin API) to call `createUser` / `updateUserById`.
- The frontend cannot create Auth users with the anon key; it must call your backend/Edge Function, which then calls Supabase Auth and inserts/updates `technicians` with `auth_user_id`.

---

## 3. Technician login flow

### 3.1 Replace custom auth with Supabase sign-in

**Current flow:**

- Technician enters email/password on `/technician/login`.
- `AuthContext.login` → `authenticateUser()` in `src/lib/auth.ts`.
- `authenticateUser()` reads `technicians` (with anon/service key), checks password (DB hash or Netlify `verify-technician-password`), returns a custom user `{ id: technician.id, role: 'technician', ... }`.
- Session is stored only in local storage via `setAuthSession(customUser)`; **no Supabase session**.
- Supabase client keeps using **anon** key for all subsequent requests → after “lock writes to authenticated only”, those writes fail.

**Target flow:**

- Technician enters email/password.
- Call **Supabase Auth**: `supabase.auth.signInWithPassword({ email, password })`.
- On success, you have a Supabase session and `auth.uid()` = that user’s id.
- **Resolve technician row:**  
  `select id, full_name, email from technicians where auth_user_id = auth.uid()` (or from `session.user.id`).  
  If no row exists, treat as “not a technician” (wrong login type or missing link).
- Set app user state to something like:  
  `{ id: session.user.id, email, role: 'technician', technicianId: technician.id, fullName: technician.full_name }`.
- **Do not** use `setAuthSession` for a custom object as the only source of truth; rely on Supabase session and derive technician from `auth_user_id` (e.g. on app load and after login).

**Files to change:**

- **`src/lib/auth.ts`**
  - Remove or bypass the current “query technicians by email + verify password” logic for technician login.
  - Add (or use from AuthContext) a small helper that, given a Supabase session, loads the technician row by `auth_user_id = session.user.id` and returns `{ technicianId, fullName, ... }`.
- **`src/contexts/AuthContext.tsx`**
  - In `login()`: for technician login path, call `supabase.auth.signInWithPassword(...)` instead of `authenticateUser()`.
  - After successful sign-in, fetch technician by `auth_user_id` (e.g. one query or RPC), then set `user` with `role: 'technician'` and `technicianId: technician.id`.
  - On initial load / session restore: when you have a Supabase session, if `user_metadata.role === 'technician'` or you detect technician by loading from `technicians` by `auth_user_id`, set `user.technicianId` and `user.role = 'technician'` so the rest of the app keeps working.
- **`src/pages/TechnicianLogin.tsx`**
  - No change to UI; it already calls `login(email, password)` from context. Behavior change is inside AuthContext + auth.ts.

### 3.2 Stop using Netlify password verification for login

- **`src/lib/auth.ts`** currently calls `/.netlify/functions/verify-technician-password` for hashed DB passwords. Once technicians use Supabase Auth, password verification is done by Supabase; you can remove this call for the main login path.
- **`netlify/functions/verify-technician-password.js`** can be deprecated or kept only for a one-off migration script (e.g. verifying old hashes when creating Auth users).

### 3.3 Session persistence

- **Current:** Custom session in localStorage via `setAuthSession` / `getAuthSession` / `clearAuthSession` (`src/lib/auth.ts`).
- **Target:** Use Supabase session as source of truth. On load, `supabase.auth.getSession()`; if session exists, load technician by `auth_user_id` and set `user` (including `technicianId`). Remove or reduce reliance on `getAuthSession()` for technicians so you don’t have two parallel “sessions.”

---

## 4. App code that uses `user.id` / `user.technicianId`

Most of the app uses `user.technicianId` or `user.id` for “current technician” (e.g. jobs, follow-ups, inventory). After migration:

- **Keep** `user.id` = Supabase user id (so it’s consistent with `auth.uid()`).
- **Keep** `user.technicianId` = `technicians.id` (so all existing logic that filters by technician id keeps working).

So: no need to change every component; just ensure that after Supabase login and on session restore you **always set** `user.technicianId` from the row where `technicians.auth_user_id = auth.uid()`.

**Places that assume “technician id”:** Already use `user.technicianId` or `user.id` (e.g. `TechnicianDashboard`, `TechnicianLocation`, job completion, follow-ups). As long as `user.technicianId` is set from the DB row linked to `auth_user_id`, no change needed there.

**Edge case:** Any code that sends `user.id` to the backend or RLS and expects it to be the technician id (e.g. `completed_by: user.id`) may need to send `user.technicianId` instead so it matches `technicians.id` and foreign keys. Quick audit: search for `user?.id` and `user?.technicianId` in technician flows and ensure “technician identity” in DB is always `technicianId`.

---

## 5. Backend / Edge Function for creating Auth users

Because creating Supabase Auth users requires the **service role** (or Admin API), you cannot do it from the frontend with the anon key.

- **Option A – Supabase Edge Function:**  
  e.g. `create-technician-user` that receives `{ email, password, full_name, ... }`, calls `auth.admin.createUser`, inserts into `technicians` with `auth_user_id`, returns technician id or success.

- **Option B – Netlify (or other) backend:**  
  Same idea: a serverless function that uses the Supabase service role to create the Auth user and insert/update `technicians.auth_user_id`.

- **Option C – Supabase Dashboard:**  
  Manually create Auth users and then set `technicians.auth_user_id` (only viable for small teams or migration).

**Settings flow:** When admin clicks “Save” for a new technician, frontend calls this backend/Edge Function with email + password (over HTTPS); backend creates Auth user and technician row (or updates `auth_user_id` for existing row).

---

## 6. Migrating existing technicians

For technicians that already exist in `technicians` with a password but **no** Supabase Auth user yet:

1. **One-time script or Edge Function** (with service role):
   - For each technician (or on first login, “lazy”):
     - Create Supabase user: `auth.admin.createUser({ email: technician.email, password: <temporary or current hash not usable directly> })`.  
       Note: Supabase expects a plain password; you cannot pass a bcrypt hash. So either:
       - Set a temporary password and send “set your password” link, or
       - If you still have plaintext (not recommended), use it once to create the Auth user then force password change.
     - Update `technicians.auth_user_id = created_user.id`.
2. **First login after migration:** Technician uses the same email and the password you set (or the one they set via magic link). They sign in with `signInWithPassword`; you load technician by `auth_user_id` and set `user.technicianId` as above.

---

## 7. Summary checklist

| Area | Change |
|------|--------|
| **DB** | Add `technicians.auth_user_id` (uuid, unique, FK to auth.users). |
| **RLS** | Replace “technician = auth.uid()” with “technician id = (select id from technicians where auth_user_id = auth.uid())” where needed. |
| **Settings (create technician)** | Backend/Edge Function: create Auth user, insert technician with `auth_user_id`. Frontend calls that backend instead of only inserting into `technicians`. |
| **Settings (update technician password)** | Backend: update password via Supabase Auth (`updateUserById`), not only DB. |
| **Technician login** | Use `supabase.auth.signInWithPassword`; then load technician by `auth_user_id`; set `user` with `technicianId` and `role: 'technician'`. |
| **Session / auth.ts** | Remove custom technician auth path from `authenticateUser`; rely on Supabase session and load technician from `technicians` by `auth_user_id`. |
| **Session restore** | On load, if Supabase session exists, resolve technician by `auth_user_id` and set `user.technicianId` and `user.role`. |
| **Netlify** | `verify-technician-password` and `hash-technician-password` can be deprecated for login; hashing might still be used in backend when creating Auth users. |
| **Existing technicians** | One-time (or lazy) migration: create Auth user per technician, set `technicians.auth_user_id`. |

After these changes, technicians will have a real Supabase session and `auth.uid()`, so “lock writes to authenticated only” will apply to them without opening writes to anon.
