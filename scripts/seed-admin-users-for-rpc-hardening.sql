-- Seed public.admin_users so is_admin_account() / delete_job_admin hardening can run.
-- Run in Supabase SQL Editor BEFORE scripts/secure-delete-job-admin-rpc-2026-05-24.sql
--
-- Edit the email list below: only accounts that should use the ADMIN dashboard
-- (delete jobs, invoices, etc.). Do NOT add technician emails.
--
-- Safe to re-run (ON CONFLICT updates is_active + role).

-- ---------------------------------------------------------------------------
-- 0. Current state (read-only)
-- ---------------------------------------------------------------------------
SELECT count(*) AS active_admin_users_rows
FROM public.admin_users
WHERE coalesce(is_active, true) = true;

-- ---------------------------------------------------------------------------
-- 1. Seed — adjust emails / names / roles before running
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_users (email, full_name, role, is_active)
VALUES
  ('admin@hydrogenro.com', 'Admin', 'SUPER_ADMIN', true),
  ('poorna@hydrogenro.com', 'Poorna', 'SUPER_ADMIN', true)
  -- Optional: uncomment only if this account should use the admin dashboard
  , ('poorna@gmail.com', 'Poorna (Gmail)', 'ADMIN', true)
   , ('srujanshetty@hydrogenro.com', 'Srujan Shetty', 'ADMIN', true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Verify auth ↔ admin_users join (need >= 1 row with admin_users_email set,
--    is_technician = false, admin_active = true)
-- ---------------------------------------------------------------------------
SELECT
  u.id           AS auth_user_id,
  u.email        AS auth_email,
  a.email        AS admin_users_email,
  a.role         AS admin_role,
  coalesce(a.is_active, true) AS admin_active,
  EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = u.id) AS is_technician
FROM auth.users u
LEFT JOIN public.admin_users a
  ON lower(a.email) = lower(u.email)
ORDER BY u.created_at;
