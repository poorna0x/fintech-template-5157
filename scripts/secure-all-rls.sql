-- CRITICAL: Lock down all remaining public tables (anon read/write on 22+ tables).
-- Run in Supabase SQL Editor AFTER:
--   1. scripts/secure-customers-rls.sql
--   2. scripts/secure-technicians-rls.sql
--   3. Deploy latest app (booking job RPC + admin Supabase Auth login)
--
-- Public website booking: customers + jobs via SECURITY DEFINER RPCs only.
-- Anon has NO direct table access except technicians ID-card SELECT (see secure-technicians-rls.sql).
-- website_booking_intent: anon uses upsert_website_booking_intent RPC only.

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

CREATE OR REPLACE FUNCTION public.technician_can_access_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
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
    SELECT 1
    FROM public.job_assignment_requests jar
    WHERE jar.job_id = p_job_id
      AND jar.technician_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Drop legacy permissive policies (keeps customers_* and technicians_*)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND NOT (tablename = 'customers' AND policyname LIKE 'customers_%')
      AND NOT (tablename = 'technicians' AND policyname LIKE 'technicians_%')
      AND (
        policyname LIKE 'Allow %'
        OR policyname LIKE 'allow_all_%'
        OR policyname LIKE 'follow_ups_%'
        OR policyname LIKE 'Allow public%'
        OR policyname LIKE 'Allow anon%'
        OR policyname LIKE 'Allow authenticated%'
        OR policyname LIKE 'Authenticated users can % job assignment%'
        OR policyname = 'website_booking_intent select admin'
        OR policyname = 'website_booking_intent update admin'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS allow_all_jobs ON public.jobs;
DROP POLICY IF EXISTS allow_all_technicians ON public.technicians;

-- ---------------------------------------------------------------------------
-- Public booking: create job (phone must match customer_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_job_for_booking(
  p_phone text,
  p_row jsonb
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
  cust_id uuid;
  inserted public.jobs;
BEGIN
  norm := public.normalize_indian_phone(p_phone);
  cust_id := (p_row ->> 'customer_id')::uuid;

  IF cust_id IS NULL THEN
    RAISE EXCEPTION 'customer_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = cust_id
      AND (
        right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
        OR right(regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g'), 10) = norm
      )
  ) THEN
    RAISE EXCEPTION 'customer not found or phone mismatch';
  END IF;

  IF coalesce(p_row ->> 'job_number', '') = '' THEN
    RAISE EXCEPTION 'job_number required';
  END IF;

  INSERT INTO public.jobs (
    job_number,
    customer_id,
    service_type,
    service_sub_type,
    brand,
    model,
    scheduled_date,
    scheduled_time_slot,
    estimated_duration,
    service_address,
    service_location,
    status,
    priority,
    description,
    requirements,
    estimated_cost,
    payment_status,
    before_photos,
    images
  )
  VALUES (
    p_row ->> 'job_number',
    cust_id,
    p_row ->> 'service_type',
    p_row ->> 'service_sub_type',
    coalesce(p_row ->> 'brand', 'Not specified'),
    coalesce(p_row ->> 'model', 'Not specified'),
    (p_row ->> 'scheduled_date')::date,
    p_row ->> 'scheduled_time_slot',
    coalesce((p_row ->> 'estimated_duration')::integer, 120),
    coalesce(p_row -> 'service_address', '{}'::jsonb),
    coalesce(p_row -> 'service_location', '{}'::jsonb),
    'PENDING',
    coalesce(p_row ->> 'priority', 'MEDIUM'),
    coalesce(p_row ->> 'description', ''),
    coalesce(p_row -> 'requirements', '[]'::jsonb),
    coalesce((p_row ->> 'estimated_cost')::numeric, 0),
    coalesce(p_row ->> 'payment_status', 'PENDING'),
    coalesce(p_row -> 'before_photos', '[]'::jsonb),
    coalesce(p_row -> 'images', coalesce(p_row -> 'before_photos', '[]'::jsonb))
  )
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_job_for_booking(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_select ON public.jobs;
DROP POLICY IF EXISTS jobs_insert ON public.jobs;
DROP POLICY IF EXISTS jobs_update ON public.jobs;
DROP POLICY IF EXISTS jobs_delete ON public.jobs;

CREATE POLICY jobs_select
  ON public.jobs FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(id));

CREATE POLICY jobs_insert
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY jobs_update
  ON public.jobs FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(id))
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(id));

CREATE POLICY jobs_delete
  ON public.jobs FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------------

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follow_ups_select ON public.follow_ups;
DROP POLICY IF EXISTS follow_ups_insert ON public.follow_ups;
DROP POLICY IF EXISTS follow_ups_update ON public.follow_ups;
DROP POLICY IF EXISTS follow_ups_delete ON public.follow_ups;

CREATE POLICY follow_ups_select
  ON public.follow_ups FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id));

CREATE POLICY follow_ups_insert
  ON public.follow_ups FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(job_id));

CREATE POLICY follow_ups_update
  ON public.follow_ups FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id))
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(job_id));

CREATE POLICY follow_ups_delete
  ON public.follow_ups FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id));

-- ---------------------------------------------------------------------------
-- job_assignment_requests
-- ---------------------------------------------------------------------------

ALTER TABLE public.job_assignment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jar_select ON public.job_assignment_requests;
DROP POLICY IF EXISTS jar_insert ON public.job_assignment_requests;
DROP POLICY IF EXISTS jar_update ON public.job_assignment_requests;
DROP POLICY IF EXISTS jar_delete ON public.job_assignment_requests;

CREATE POLICY jar_select
  ON public.job_assignment_requests FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY jar_insert
  ON public.job_assignment_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY jar_update
  ON public.job_assignment_requests FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid())
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY jar_delete
  ON public.job_assignment_requests FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- job_parts_used
-- ---------------------------------------------------------------------------

ALTER TABLE public.job_parts_used ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_parts_used_select ON public.job_parts_used;
DROP POLICY IF EXISTS job_parts_used_insert ON public.job_parts_used;
DROP POLICY IF EXISTS job_parts_used_update ON public.job_parts_used;
DROP POLICY IF EXISTS job_parts_used_delete ON public.job_parts_used;

CREATE POLICY job_parts_used_select
  ON public.job_parts_used FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id));

CREATE POLICY job_parts_used_insert
  ON public.job_parts_used FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(job_id));

CREATE POLICY job_parts_used_update
  ON public.job_parts_used FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(job_id))
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(job_id));

CREATE POLICY job_parts_used_delete
  ON public.job_parts_used FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- amc_contracts (technician: read for customers on their jobs)
-- ---------------------------------------------------------------------------

ALTER TABLE public.amc_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS amc_contracts_select ON public.amc_contracts;
DROP POLICY IF EXISTS amc_contracts_insert ON public.amc_contracts;
DROP POLICY IF EXISTS amc_contracts_update ON public.amc_contracts;
DROP POLICY IF EXISTS amc_contracts_delete ON public.amc_contracts;

CREATE POLICY amc_contracts_select
  ON public.amc_contracts FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.customer_id = amc_contracts.customer_id
        AND public.technician_can_access_job(j.id)
    )
  );

CREATE POLICY amc_contracts_insert
  ON public.amc_contracts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY amc_contracts_update
  ON public.amc_contracts FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY amc_contracts_delete
  ON public.amc_contracts FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- Admin-only tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business_expenses',
    'other_expenses',
    'call_history',
    'reminders',
    'tax_invoices',
    'admin_todos',
    'admin_users',
    'notifications',
    'service_areas'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_user())',
      t || '_admin_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_user())',
      t || '_admin_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())',
      t || '_admin_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_user())',
      t || '_admin_delete', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Catalog / inventory: authenticated read, admin write
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory',
    'inventory_bundles',
    'inventory_bundle_items',
    'common_qr_codes',
    'product_qr_codes',
    'parts_inventory'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_user())',
      t || '_admin_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())',
      t || '_admin_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_user())',
      t || '_admin_delete', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Technician-owned rows (technician_id column)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'technician_advances',
    'technician_expenses',
    'technician_extra_commissions',
    'technician_holidays',
    'technician_payments'
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

-- technician_inventory + technician_common_qr
ALTER TABLE public.technician_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_common_qr ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_inventory_select ON public.technician_inventory;
DROP POLICY IF EXISTS technician_inventory_insert ON public.technician_inventory;
DROP POLICY IF EXISTS technician_inventory_update ON public.technician_inventory;
DROP POLICY IF EXISTS technician_inventory_delete ON public.technician_inventory;

CREATE POLICY technician_inventory_select
  ON public.technician_inventory FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_inventory_insert
  ON public.technician_inventory FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_inventory_update
  ON public.technician_inventory FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid())
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_inventory_delete
  ON public.technician_inventory FOR DELETE TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS technician_common_qr_select ON public.technician_common_qr;
DROP POLICY IF EXISTS technician_common_qr_insert ON public.technician_common_qr;
DROP POLICY IF EXISTS technician_common_qr_update ON public.technician_common_qr;
DROP POLICY IF EXISTS technician_common_qr_delete ON public.technician_common_qr;

CREATE POLICY technician_common_qr_select
  ON public.technician_common_qr FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_common_qr_insert
  ON public.technician_common_qr FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_common_qr_update
  ON public.technician_common_qr FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid())
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_common_qr_delete
  ON public.technician_common_qr FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- website_booking_intent (admin dashboard only; anon uses RPC)
-- ---------------------------------------------------------------------------

ALTER TABLE public.website_booking_intent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_booking_intent_select_admin ON public.website_booking_intent;
DROP POLICY IF EXISTS website_booking_intent_update_admin ON public.website_booking_intent;

CREATE POLICY website_booking_intent_select_admin
  ON public.website_booking_intent FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY website_booking_intent_update_admin
  ON public.website_booking_intent FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- messages (if table exists in project)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS messages_admin_select ON public.messages';
    EXECUTE 'DROP POLICY IF EXISTS messages_admin_insert ON public.messages';
    EXECUTE 'DROP POLICY IF EXISTS messages_admin_update ON public.messages';
    EXECUTE 'DROP POLICY IF EXISTS messages_admin_delete ON public.messages';
    EXECUTE 'DROP POLICY IF EXISTS messages_tech_select ON public.messages';

    EXECUTE $p$
      CREATE POLICY messages_admin_select ON public.messages
        FOR SELECT TO authenticated
        USING (public.is_admin_user())
    $p$;
    EXECUTE $p$
      CREATE POLICY messages_tech_select ON public.messages
        FOR SELECT TO authenticated
        USING (
          NOT public.is_admin_user()
          AND (
            recipient_technician_id = auth.uid()
            OR recipient_technician_ids @> ARRAY[auth.uid()]
          )
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY messages_admin_insert ON public.messages
        FOR INSERT TO authenticated WITH CHECK (public.is_admin_user())
    $p$;
    EXECUTE $p$
      CREATE POLICY messages_admin_update ON public.messages
        FOR UPDATE TO authenticated
        USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())
    $p$;
    EXECUTE $p$
      CREATE POLICY messages_admin_delete ON public.messages
        FOR DELETE TO authenticated USING (public.is_admin_user())
    $p$;
  END IF;
END $$;
