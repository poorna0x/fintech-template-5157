-- Step 8: per-technician commission totals for Analytics salary (replaces row-level payment/extra fetches).
-- Requires: public.is_admin_user()

CREATE OR REPLACE FUNCTION public.get_analytics_commission_totals(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_rows jsonb;
  extra_rows jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO payment_rows
  FROM (
    SELECT
      p.technician_id,
      coalesce(sum(coalesce(p.commission_amount, 0)), 0)::numeric AS total
    FROM public.technician_payments p
    WHERE (p_start IS NULL OR p.created_at >= p_start)
      AND (p_end IS NULL OR p.created_at <= p_end)
    GROUP BY p.technician_id
  ) r;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO extra_rows
  FROM (
    SELECT
      e.technician_id,
      coalesce(sum(coalesce(e.amount, 0)), 0)::numeric AS total
    FROM public.technician_extra_commissions e
    WHERE (p_start_date IS NULL OR e.commission_date >= p_start_date)
      AND (p_end_date IS NULL OR e.commission_date <= p_end_date)
    GROUP BY e.technician_id
  ) r;

  RETURN jsonb_build_object(
    'payment_commissions', payment_rows,
    'extra_commissions', extra_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_commission_totals(timestamptz, timestamptz, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_commission_totals(timestamptz, timestamptz, date, date) TO authenticated;
