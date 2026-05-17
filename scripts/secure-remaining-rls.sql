-- Lock down tables still exposed to anon after partial RLS rollout.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Run BEFORE this (if not done): secure-customers-rls.sql, secure-technicians-rls.sql
-- You may already have: jobs, tax_invoices, amc, financial, rpc scripts applied.

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

CREATE OR REPLACE FUNCTION public.technician_can_access_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = p_job_id
      AND (
        j.assigned_technician_id = auth.uid()
        OR j.assigned_by = auth.uid()
        OR j.completed_by = auth.uid()
        OR (
          j.team_members IS NOT NULL
          AND (
            j.team_members @> to_jsonb(auth.uid()::text)
            OR j.team_members @> jsonb_build_array(auth.uid()::text)
            OR j.team_members @> jsonb_build_array(auth.uid())
          )
        )
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.job_assignment_requests jar
    WHERE jar.job_id = p_job_id AND jar.technician_id = auth.uid()
  );
$$;

-- Drop permissive policies on remaining tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'inventory', 'inventory_bundles', 'inventory_bundle_items',
        'common_qr_codes', 'product_qr_codes', 'parts_inventory',
        'reminders', 'follow_ups', 'admin_todos', 'admin_users',
        'notifications', 'technician_payments', 'technician_expenses',
        'technician_extra_commissions', 'technician_holidays',
        'technician_inventory', 'technician_common_qr', 'job_parts_used'
      )
      AND (
        policyname LIKE 'Allow %'
        OR policyname LIKE 'follow_ups_%'
        OR policyname LIKE 'Allow anon%'
        OR policyname LIKE 'Allow authenticated%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Admin-only
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reminders', 'admin_todos', 'admin_users', 'notifications']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_user())', t || '_admin_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_user())', t || '_admin_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())', t || '_admin_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_user())', t || '_admin_delete', t);
  END LOOP;
END $$;

-- Catalog: authenticated read, admin write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory', 'inventory_bundles', 'inventory_bundle_items',
    'common_qr_codes', 'product_qr_codes', 'parts_inventory'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select_auth', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_user())', t || '_admin_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())', t || '_admin_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_user())', t || '_admin_delete', t);
  END LOOP;
END $$;

-- follow_ups
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_ups_select ON public.follow_ups;
DROP POLICY IF EXISTS follow_ups_insert ON public.follow_ups;
DROP POLICY IF EXISTS follow_ups_update ON public.follow_ups;
DROP POLICY IF EXISTS follow_ups_delete ON public.follow_ups;
CREATE POLICY follow_ups_select ON public.follow_ups FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id));
CREATE POLICY follow_ups_insert ON public.follow_ups FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(job_id));
CREATE POLICY follow_ups_update ON public.follow_ups FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id))
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(job_id));
CREATE POLICY follow_ups_delete ON public.follow_ups FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id));

-- technician financial (if not already from secure-financial-rls.sql)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'technician_payments', 'technician_expenses', 'technician_extra_commissions', 'technician_holidays'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_user() OR technician_id = auth.uid())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_user() OR technician_id = auth.uid())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_user() OR technician_id = auth.uid()) WITH CHECK (public.is_admin_user() OR technician_id = auth.uid())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_user())', t || '_delete', t);
  END LOOP;
END $$;
