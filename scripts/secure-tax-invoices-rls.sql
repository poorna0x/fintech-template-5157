-- CRITICAL: Lock down public.tax_invoices (GST/PAN, company_info, customer billing PII).
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- BEFORE running:
--   1. secure-customers-rls.sql already applied (is_admin_user helper exists).
--   2. Admins use Supabase Auth login (JWT role is not "technician").
--
-- AFTER running:
--   - anon: no SELECT/INSERT/UPDATE/DELETE on tax_invoices
--   - technicians: no access
--   - admins (authenticated + is_admin_user): full CRUD
--
-- Phase 2 (optional, not in this script): encrypt GST/PAN at rest, move company_info
-- to a protected settings table — requires app changes.

-- ---------------------------------------------------------------------------
-- Helpers (idempotent with secure-customers-rls.sql)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- ---------------------------------------------------------------------------
-- Drop all permissive tax_invoices policies (including bad delete fix)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all users to read tax invoices" ON public.tax_invoices;
DROP POLICY IF EXISTS "Allow all users to insert tax invoices" ON public.tax_invoices;
DROP POLICY IF EXISTS "Allow all users to update tax invoices" ON public.tax_invoices;
DROP POLICY IF EXISTS "Allow all users to delete tax invoices" ON public.tax_invoices;
DROP POLICY IF EXISTS "Allow authenticated users to delete tax invoices" ON public.tax_invoices;

DROP POLICY IF EXISTS tax_invoices_admin_select ON public.tax_invoices;
DROP POLICY IF EXISTS tax_invoices_admin_insert ON public.tax_invoices;
DROP POLICY IF EXISTS tax_invoices_admin_update ON public.tax_invoices;
DROP POLICY IF EXISTS tax_invoices_admin_delete ON public.tax_invoices;

ALTER TABLE public.tax_invoices ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Admin-only CRUD (no anon, no technician)
-- ---------------------------------------------------------------------------

CREATE POLICY tax_invoices_admin_select
  ON public.tax_invoices
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY tax_invoices_admin_insert
  ON public.tax_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY tax_invoices_admin_update
  ON public.tax_invoices
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY tax_invoices_admin_delete
  ON public.tax_invoices
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- Invoice number RPC: admin only (reads tax_invoices internally)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_next_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number() TO authenticated;
