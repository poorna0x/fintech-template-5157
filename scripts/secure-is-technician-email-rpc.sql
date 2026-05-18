-- MEDIUM: Block anon enumeration of technician emails via is_technician_email.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Login routing uses /technician/login vs /admin only; secure-auth-login enforces
-- portal after password auth (no pre-login email probe).

CREATE OR REPLACE FUNCTION public.is_technician_email(p_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.technicians t
    WHERE lower(trim(t.email)) = lower(trim(p_email))
      AND t.account_status = 'ACTIVE'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_technician_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_technician_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_technician_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_technician_email(text) TO service_role;
