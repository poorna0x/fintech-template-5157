-- HIGH: Lock down financial tables (business_expenses, commissions, cash flow).
-- Run in Supabase SQL Editor after secure-customers-rls.sql. Safe to re-run.
--
-- business_expenses + other_expenses: admin only (Analytics, Technician Payments admin UI).
-- technician_* financial tables: admin all rows OR technician own rows (technician_id = auth.uid()).
--
-- Requires: is_admin_user() from secure-customers-rls.sql

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- ---------------------------------------------------------------------------
-- Drop open "Allow public *" policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow public read access" ON public.business_expenses;
DROP POLICY IF EXISTS "Allow public insert access" ON public.business_expenses;
DROP POLICY IF EXISTS "Allow public update access" ON public.business_expenses;
DROP POLICY IF EXISTS "Allow public delete access" ON public.business_expenses;

DROP POLICY IF EXISTS "Allow public read access" ON public.other_expenses;
DROP POLICY IF EXISTS "Allow public insert access" ON public.other_expenses;
DROP POLICY IF EXISTS "Allow public update access" ON public.other_expenses;
DROP POLICY IF EXISTS "Allow public delete access" ON public.other_expenses;

DROP POLICY IF EXISTS "Allow all operations on technician_advances" ON public.technician_advances;
DROP POLICY IF EXISTS "Allow all operations on technician_expenses" ON public.technician_expenses;

-- ---------------------------------------------------------------------------
-- business_expenses + other_expenses: admin only
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_expenses_admin_select ON public.business_expenses;
DROP POLICY IF EXISTS business_expenses_admin_insert ON public.business_expenses;
DROP POLICY IF EXISTS business_expenses_admin_update ON public.business_expenses;
DROP POLICY IF EXISTS business_expenses_admin_delete ON public.business_expenses;

CREATE POLICY business_expenses_admin_select
  ON public.business_expenses FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY business_expenses_admin_insert
  ON public.business_expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY business_expenses_admin_update
  ON public.business_expenses FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY business_expenses_admin_delete
  ON public.business_expenses FOR DELETE TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS other_expenses_admin_select ON public.other_expenses;
DROP POLICY IF EXISTS other_expenses_admin_insert ON public.other_expenses;
DROP POLICY IF EXISTS other_expenses_admin_update ON public.other_expenses;
DROP POLICY IF EXISTS other_expenses_admin_delete ON public.other_expenses;

CREATE POLICY other_expenses_admin_select
  ON public.other_expenses FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY other_expenses_admin_insert
  ON public.other_expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY other_expenses_admin_update
  ON public.other_expenses FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY other_expenses_admin_delete
  ON public.other_expenses FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- Technician financial rows: own data + admin full access
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'technician_payments',
    'technician_advances',
    'technician_expenses',
    'technician_extra_commissions',
    'technician_holidays'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.is_admin_user() OR technician_id = auth.uid())',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.is_admin_user() OR technician_id = auth.uid())',
      t || '_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.is_admin_user() OR technician_id = auth.uid())
       WITH CHECK (public.is_admin_user() OR technician_id = auth.uid())',
      t || '_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (public.is_admin_user())',
      t || '_delete', t
    );
  END LOOP;
END $$;

-- Admin payment RPCs: not callable by anon
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.get_technician_payment_summary() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.backfill_technician_payments() FROM anon;
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END $$;
