-- Latest completed job per customer, and latest call / WhatsApp per customer.
-- The Calling page and dashboard call these RPCs. Safe to re-run.

CREATE OR REPLACE FUNCTION public.get_last_completed_job_per_customer()
RETURNS TABLE (
  customer_id uuid,
  completed_at timestamptz,
  service_type text,
  service_sub_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (j.customer_id)
    j.customer_id,
    j.completed_at,
    j.service_type::text,
    j.service_sub_type::text
  FROM public.jobs j
  WHERE j.status = 'COMPLETED'
    AND j.customer_id IS NOT NULL
    AND j.completed_at IS NOT NULL
  ORDER BY j.customer_id, j.completed_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_last_contact_per_customer()
RETURNS TABLE (
  customer_id uuid,
  contacted_at timestamptz,
  status text,
  contact_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ch.customer_id, ch.contact_type)
    ch.customer_id,
    ch.contacted_at,
    ch.status::text,
    ch.contact_type::text
  FROM public.call_history ch
  WHERE ch.customer_id IS NOT NULL
    AND ch.contact_type IN ('CALL', 'WHATSAPP')
  ORDER BY ch.customer_id, ch.contact_type, ch.contacted_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_last_completed_job_per_customer() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_last_completed_job_per_customer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_last_completed_job_per_customer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_completed_job_per_customer() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_last_contact_per_customer() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_last_contact_per_customer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_last_contact_per_customer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_contact_per_customer() TO service_role;

NOTIFY pgrst, 'reload schema';
