-- CRITICAL: Close the OTP / ALTCHA bypass on public booking RPCs.
-- Run in Supabase SQL Editor. Safe to re-run. Affects the shared CRM database
-- (both Hydrogen RO and Eleven RO), so run it once.
--
-- WHY:
--   The public booking flow calls these RPCs ONLY through Netlify functions,
--   which use the service_role key (see src/lib/bookingCustomer.ts,
--   bookingJob.ts, bookingIntent.ts). The functions enforce ALTCHA and, when
--   OTP_ENFORCED=true, a verified Firebase phone token.
--
--   But these RPCs were also GRANTed to `anon`. Because the anon key ships in
--   the public JS bundle, a technical user could call them DIRECTLY via the
--   Supabase REST/RPC API, skipping the Netlify functions entirely — and thus
--   bypassing OTP and ALTCHA.
--
-- AFTER:
--   - anon / authenticated can NO LONGER call these RPCs directly.
--   - Netlify functions still work (service_role).
--   - Public /book is unaffected (it goes through the functions).

DO $$
DECLARE
  r record;
  booking_rpcs text[] := ARRAY[
    'create_job_for_booking',
    'create_customer_for_booking',
    'update_customer_for_booking',
    'get_customer_by_phone_for_booking',
    'upsert_website_booking_intent',
    'mark_website_booking_intent_booked'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (booking_rpcs)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    -- The Netlify booking functions call these with the service_role key.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Verify (optional): should list only service_role (and the owner) per function.
--   SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_exec
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (SELECT unnest(ARRAY['anon','authenticated','service_role']) AS rolname) r
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('create_job_for_booking','create_customer_for_booking',
--                       'get_customer_by_phone_for_booking','update_customer_for_booking')
--   ORDER BY p.proname, r.rolname;
