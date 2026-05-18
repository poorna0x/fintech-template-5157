-- CRITICAL: Block anon from modifying customers / creating jobs via booking RPCs.
-- Run in Supabase SQL Editor after deploy of booking-customer-mutate + booking-job-create Netlify functions.
-- Prefer scripts/secure-booking-rpc-definer-guards.sql (revokes + in-function service_role guard).
-- Safe to re-run.
--
-- Public /book uses:
--   /.netlify/functions/booking-customer-lookup
--   /.netlify/functions/booking-customer-mutate  (create | update)
--   /.netlify/functions/booking-job-create

-- update_customer_for_booking
REVOKE ALL ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) TO service_role;

-- create_customer_for_booking
REVOKE ALL ON FUNCTION public.create_customer_for_booking(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_customer_for_booking(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_customer_for_booking(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_for_booking(jsonb) TO service_role;

-- create_job_for_booking
REVOKE ALL ON FUNCTION public.create_job_for_booking(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) TO service_role;
