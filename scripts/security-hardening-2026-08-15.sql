-- NEXT MONTH GO-LIVE (see .cursor/rules/next-month-main-golive.mdc)
-- 1) Deploy wip/next-month-main → main (wait until hydrogenro.com is live)
-- 2) Smoke Book, warranty, /review, admin, tech photos
-- 3) THEN run THIS file in Supabase SQL Editor (safe to re-run)
-- Do NOT run this while production still uses anon get_job_review_invite —
-- customer /review pages will 401/403.
--
-- Restores strict is_admin_user(), closes leftover anon RPC grants, and
-- tightens booking-intent / job-review / QR catalog policies.
--
-- Will NOT apply is_admin_user() if it would lock every admin out
-- (zero active admin_users, or none of those emails exist in auth.users).
--
-- Website Book + warranty already use Netlify + service_role; they stay working.
-- Leftover Auth users not in admin_users lose admin (intended).

DO $$
DECLARE
  active_admins integer;
  matched integer;
BEGIN
  SELECT count(*) INTO active_admins
  FROM public.admin_users
  WHERE coalesce(is_active, true) = true;

  IF active_admins < 1 THEN
    RAISE EXCEPTION
      'Refusing to patch is_admin_user(): public.admin_users has 0 active rows. Insert admin emails (is_active=true) first.';
  END IF;

  SELECT count(*) INTO matched
  FROM public.admin_users a
  JOIN auth.users u ON lower(u.email) = lower(a.email)
  WHERE coalesce(a.is_active, true) = true;

  IF matched < 1 THEN
    RAISE EXCEPTION
      'Refusing to patch is_admin_user(): no auth.users email matches an active admin_users row. Admins would be locked out of the CRM.';
  END IF;

  RAISE NOTICE 'Pre-flight OK: % active admin_users, % matched to auth.users.',
    active_admins, matched;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE lower(a.email) = lower(coalesce(
              nullif(auth.jwt() ->> 'email', ''),
              ''
            ))
        AND coalesce(a.is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- Job review public RPCs: service_role only (Netlify job-review-public).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_job_review_invite'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_job_review_invite(text) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_job_review_invite(text) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_job_review_invite(text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_job_review_invite(text) TO service_role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_job_review'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.submit_job_review(text, integer, text) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.submit_job_review(text, integer, text) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.submit_job_review(text, integer, text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.submit_job_review(text, integer, text) TO service_role';
  END IF;
END $$;

-- Booking RPCs must not be callable with the published anon key.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_job_for_booking',
        'create_customer_for_booking',
        'update_customer_for_booking',
        'get_customer_by_phone_for_booking',
        'upsert_website_booking_intent',
        'mark_website_booking_intent_booked'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Live / archive booking banners: admin only (not every authenticated JWT).
DO $$
BEGIN
  IF to_regclass('public.website_booking_intent') IS NOT NULL THEN
    DROP POLICY IF EXISTS "website_booking_intent select admin" ON public.website_booking_intent;
    DROP POLICY IF EXISTS website_booking_intent_select_admin ON public.website_booking_intent;
    CREATE POLICY website_booking_intent_select_admin
      ON public.website_booking_intent FOR SELECT TO authenticated
      USING (public.is_admin_user());

    DROP POLICY IF EXISTS "website_booking_intent update admin" ON public.website_booking_intent;
    DROP POLICY IF EXISTS website_booking_intent_update_admin ON public.website_booking_intent;
    CREATE POLICY website_booking_intent_update_admin
      ON public.website_booking_intent FOR UPDATE TO authenticated
      USING (public.is_admin_user())
      WITH CHECK (public.is_admin_user());

    DROP POLICY IF EXISTS "website_booking_intent delete admin" ON public.website_booking_intent;
    DROP POLICY IF EXISTS website_booking_intent_delete_admin ON public.website_booking_intent;
    CREATE POLICY website_booking_intent_delete_admin
      ON public.website_booking_intent FOR DELETE TO authenticated
      USING (public.is_admin_user());
  END IF;

  IF to_regclass('public.website_booking_intent_archive') IS NOT NULL THEN
    DROP POLICY IF EXISTS "website_booking_intent_archive select admin" ON public.website_booking_intent_archive;
    CREATE POLICY "website_booking_intent_archive select admin"
      ON public.website_booking_intent_archive FOR SELECT TO authenticated
      USING (public.is_admin_user());

    DROP POLICY IF EXISTS "website_booking_intent_archive insert admin" ON public.website_booking_intent_archive;
    CREATE POLICY "website_booking_intent_archive insert admin"
      ON public.website_booking_intent_archive FOR INSERT TO authenticated
      WITH CHECK (public.is_admin_user());

    DROP POLICY IF EXISTS "website_booking_intent_archive delete admin" ON public.website_booking_intent_archive;
    CREATE POLICY "website_booking_intent_archive delete admin"
      ON public.website_booking_intent_archive FOR DELETE TO authenticated
      USING (public.is_admin_user());
  END IF;

  IF to_regclass('public.booking_abandonments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow authenticated read booking abandonments" ON public.booking_abandonments;
    DROP POLICY IF EXISTS "Allow authenticated update booking abandonments" ON public.booking_abandonments;
    DROP POLICY IF EXISTS booking_abandonments_admin_select ON public.booking_abandonments;
    DROP POLICY IF EXISTS booking_abandonments_admin_update ON public.booking_abandonments;
    CREATE POLICY booking_abandonments_admin_select
      ON public.booking_abandonments FOR SELECT TO authenticated
      USING (public.is_admin_user());
    CREATE POLICY booking_abandonments_admin_update
      ON public.booking_abandonments FOR UPDATE TO authenticated
      USING (public.is_admin_user())
      WITH CHECK (public.is_admin_user());
    DROP POLICY IF EXISTS "booking_abandonments delete admin" ON public.booking_abandonments;
    CREATE POLICY "booking_abandonments delete admin"
      ON public.booking_abandonments FOR DELETE TO authenticated
      USING (public.is_admin_user());
  END IF;

  IF to_regclass('public.technician_common_qr') IS NOT NULL THEN
    DROP POLICY IF EXISTS technician_common_qr_select ON public.technician_common_qr;
    CREATE POLICY technician_common_qr_select
      ON public.technician_common_qr FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;
END $$;

-- Catalog / warehouse: staff only (not every leftover authenticated JWT).
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
    'parts_inventory',
    'storage_places',
    'storage_blocks',
    'storage_block_items'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_user() OR public.is_active_technician())',
      t || '_select_auth', t
    );
  END LOOP;
END $$;

-- Technicians may complete jobs they can access, but must not re-parent the row
-- (customer_id / job_number mass assignment via PostgREST).
CREATE OR REPLACE FUNCTION public.jobs_protect_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;
  NEW.customer_id := OLD.customer_id;
  NEW.job_number := OLD.job_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_protect_ownership_trg ON public.jobs;
CREATE TRIGGER jobs_protect_ownership_trg
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE PROCEDURE public.jobs_protect_ownership();
