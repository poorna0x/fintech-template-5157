-- Latest completed service brand for customers this user may see.
-- Technician job SELECT only returns jobs that technician worked, so a returning
-- customer served earlier by someone else had no "Last served" tag until Reports
-- (that path uses a security-definer RPC). This returns the brand only.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.get_last_service_brands_for_customers(p_customer_ids uuid[])
RETURNS TABLE (customer_id uuid, service_brand text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (j.customer_id)
    j.customer_id,
    j.service_brand
  FROM public.jobs j
  WHERE cardinality(p_customer_ids) BETWEEN 1 AND 100
    AND j.customer_id = ANY (p_customer_ids)
    AND j.status = 'COMPLETED'
    AND j.service_brand IS NOT NULL
    AND (
      public.is_admin_user()
      OR public.is_technician_assigned_to_customer(j.customer_id)
    )
  ORDER BY j.customer_id, j.completed_at DESC NULLS LAST, j.end_time DESC NULLS LAST, j.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_last_service_brands_for_customers(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_last_service_brands_for_customers(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_last_service_brands_for_customers(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_service_brands_for_customers(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
