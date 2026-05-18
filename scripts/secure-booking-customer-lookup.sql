-- CRITICAL: Stop anon enumeration of customer PII via get_customer_by_phone_for_booking.
-- Run in Supabase SQL Editor after deploy of booking-customer-lookup Netlify function.
-- Safe to re-run.
--
-- Public /book must call /.netlify/functions/booking-customer-lookup (ALTCHA + rate limit).
-- App uses service_role server-side only; anon can no longer invoke this RPC.

REVOKE ALL ON FUNCTION public.get_customer_by_phone_for_booking(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_by_phone_for_booking(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_by_phone_for_booking(text) FROM authenticated;

-- Internal / Netlify service_role only
GRANT EXECUTE ON FUNCTION public.get_customer_by_phone_for_booking(text) TO service_role;


