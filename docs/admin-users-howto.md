# Managing Admin Users (Supabase only)

How to add, update, deactivate, or remove an admin **directly in Supabase**.
No app changes required.

> Two places must match for someone to get admin access:
> 1. **`auth.users`** — login credentials (email + password)
> 2. **`public.admin_users`** — permission list (email + role + `is_active`)
>
> Security helper `is_admin_user()` treats someone as admin **only if**:
> their JWT email matches an `admin_users` row with `is_active = true`
> **and** they are **not** in `public.technicians`.

Examples below use the placeholder `new.admin@hydrogenro.com` — replace with the real email.

---

## Step 1 — Create a new admin

### 1a. Create the login

**Supabase Dashboard → Authentication → Users → Add user**

| Field | Value |
|-------|-------|
| Email | `new.admin@hydrogenro.com` |
| Password | strong password (share securely) |
| Auto Confirm User | **ON** |

Do **not** add this user to `public.technicians`.

### 1b. Grant admin permission

**Supabase Dashboard → SQL Editor**

```sql
INSERT INTO public.admin_users (email, full_name, role, is_active)
VALUES (
  'new.admin@hydrogenro.com',   -- must match the auth email
  'New Admin Name',
  'ADMIN',                      -- SUPER_ADMIN | ADMIN | MANAGER
  true
)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role,
  is_active = true,
  updated_at = now();
```

### 1c. Verify

```sql
SELECT
  u.email          AS auth_email,
  a.email          AS admin_users_email,
  a.role,
  a.is_active,
  EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = u.id) AS is_technician
FROM auth.users u
LEFT JOIN public.admin_users a ON lower(a.email) = lower(u.email)
WHERE lower(u.email) = lower('new.admin@hydrogenro.com');
```

Expect: `admin_users_email` filled, `is_active = true`, `is_technician = false`.

They log in at: `https://hydrogenro.com/admin`

---

## Step 2 — Update name or role

```sql
-- Change display name
UPDATE public.admin_users
SET full_name = 'New Display Name', updated_at = now()
WHERE lower(email) = lower('new.admin@hydrogenro.com');

-- Promote to SUPER_ADMIN
UPDATE public.admin_users
SET role = 'SUPER_ADMIN', updated_at = now()
WHERE lower(email) = lower('new.admin@hydrogenro.com');

-- Demote to ADMIN or MANAGER
UPDATE public.admin_users
SET role = 'ADMIN', updated_at = now()
WHERE lower(email) = lower('new.admin@hydrogenro.com');
```

---

## Step 3 — Reset a password

**Dashboard → Authentication → Users → click the user**

- **Send password recovery** — emails a reset link, or
- **...** → **Set password** — set one directly.

No SQL required. `admin_users` does not store passwords.

---

## Step 4 — Deactivate (soft delete — recommended)

Keeps the login row intact but blocks admin access immediately.

```sql
UPDATE public.admin_users
SET is_active = false, updated_at = now()
WHERE lower(email) = lower('new.admin@hydrogenro.com');
```

Optional: also stop them from logging in at all → **Authentication → Users → ... → Ban user** (or **Delete user**).

---

## Step 5 — Reactivate

```sql
UPDATE public.admin_users
SET is_active = true, updated_at = now()
WHERE lower(email) = lower('new.admin@hydrogenro.com');
```

If you also banned them in Auth, unban from **Authentication → Users**.

---

## Step 6 — Hard delete (only when removing forever)

```sql
DELETE FROM public.admin_users
WHERE lower(email) = lower('new.admin@hydrogenro.com');
```

Then delete the login from **Authentication → Users → ... → Delete user**.

> `auth.users` edits must go through the Dashboard — no direct SQL.

---

## Step 7 — List / audit

```sql
-- All admins (active + inactive)
SELECT email, full_name, role, is_active, last_login, created_at
FROM public.admin_users
ORDER BY is_active DESC, role, email;
```

```sql
-- Cross-check: Auth users vs admin_users vs technicians
SELECT
  u.email          AS auth_email,
  a.email          AS admin_users_email,
  a.role,
  coalesce(a.is_active, false) AS admin_active,
  EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = u.id) AS is_technician,
  u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.admin_users a ON lower(a.email) = lower(u.email)
ORDER BY u.created_at;
```

```sql
-- Auth users with NO admin access (and not technicians)
SELECT u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE lower(a.email) = lower(u.email)
      AND coalesce(a.is_active, true) = true
  );
```

```sql
-- admin_users rows with no matching auth.users row (orphans)
SELECT a.email, a.role, a.is_active
FROM public.admin_users a
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email));
```

---

## Worked example — add Priya as a regular admin

1. **Auth → Add user** — `priya@hydrogenro.com`, password `TempPass!23`, Auto Confirm ON.
2. **SQL Editor:**

   ```sql
   INSERT INTO public.admin_users (email, full_name, role, is_active)
   VALUES ('priya@hydrogenro.com', 'Priya', 'ADMIN', true)
   ON CONFLICT (email) DO UPDATE SET
     full_name = EXCLUDED.full_name,
     role = EXCLUDED.role,
     is_active = true,
     updated_at = now();
   ```

3. Tell Priya to log in at `https://hydrogenro.com/admin` with the temp password and change it.

To remove access later:

```sql
UPDATE public.admin_users
SET is_active = false, updated_at = now()
WHERE lower(email) = lower('priya@hydrogenro.com');
```

---

## Common mistakes to avoid

- **Adding the admin to `public.technicians`** — `is_admin_user()` returns `false`.
- **Mismatched email casing or whitespace** — comparisons use `lower(email)`; trim trailing spaces.
- **Forgetting Step 1a (Auth) or Step 1b (row)** — either alone is not enough.
- **Setting `is_active = false` on the last active SUPER_ADMIN** — keep at least one.
- **Editing `admin_users` from the admin app** — once the SUPER_ADMIN-only RLS is applied (`scripts/admin-users-management-2026-05-24.sql`), only SUPER_ADMIN can write to this table via the API.

## Roles

| Role | Allowed | Notes |
|------|---------|-------|
| `SUPER_ADMIN` | yes | Use for owners; future SUPER_ADMIN-only features depend on this |
| `ADMIN` | yes | Day-to-day admins |
| `MANAGER` | yes | Reserved for future limited admin scope |

Schema enforces these three values via a CHECK constraint.

Today `is_admin_user()` treats any active row as admin; the role is recorded
for your records and for future SUPER_ADMIN-only features (audit log, admin
management UI, etc.).
