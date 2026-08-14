-- Verify / re-apply booking RPC grants: service_role only (no anon execute).
-- Companion to secure-booking-rpc-definer-guards.sql. Safe to re-run.
-- Does NOT recreate function bodies — only REVOKEs / GRANTs.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.assert_booking_rpc_service_role()',
    'public.get_customer_by_phone_for_booking(text)',
    'public.create_customer_for_booking(jsonb)',
    'public.update_customer_for_booking(uuid, text, jsonb)',
    'public.create_job_for_booking(text, jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      RAISE NOTICE 'secured %', fn;
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skip missing %', fn;
    END;
  END LOOP;
END $$;
