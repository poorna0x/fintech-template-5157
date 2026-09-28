-- Salary commission belongs to the job completion month (jobs.end_time),
-- not technician_payments.created_at.
-- Saving / backfilling an old completed job this month was pulling last year's
-- commission into this month's salary.
--
-- Safe to re-run. Admin-only RPCs (is_admin_user).

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
    INNER JOIN public.jobs j ON j.id = p.job_id
    WHERE j.status = 'COMPLETED'
      AND j.end_time IS NOT NULL
      AND (p_start IS NULL OR j.end_time >= p_start)
      AND (p_end IS NULL OR j.end_time <= p_end)
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

CREATE OR REPLACE FUNCTION public.get_analytics_calendar_salary_totals(
  p_start timestamptz,
  p_end timestamptz,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  month_key text;
  today_date date;
  total_before numeric := 0;
  total_before_all numeric := 0;
  tech record;
  monthly_base numeric;
  daily_base numeric;
  period_base numeric;
  payment_sum numeric;
  default_comm numeric;
  billing_slab numeric;
  extra_comm numeric;
  holiday_count integer;
  extra_holidays integer;
  unused_leaves integer;
  adjusted_base numeric;
  salary_before numeric;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  month_key := to_char(p_start_date, 'YYYY-MM');
  today_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  FOR tech IN
    SELECT t.id, t.employee_id, t.salary
    FROM public.technicians t
    WHERE coalesce(t.account_status, 'ACTIVE') = 'ACTIVE'
    ORDER BY t.created_at DESC
  LOOP
    monthly_base := public.analytics_technician_monthly_base_salary(tech.salary, month_key, 8000);
    daily_base := monthly_base / 30.0;
    period_base := monthly_base;

    SELECT
      coalesce(sum(coalesce(p.commission_amount, 0)), 0)
    INTO payment_sum
    FROM public.technician_payments p
    INNER JOIN public.jobs j ON j.id = p.job_id
    WHERE p.technician_id = tech.id
      AND j.status = 'COMPLETED'
      AND j.end_time IS NOT NULL
      AND j.end_time >= p_start
      AND j.end_time <= p_end;

    SELECT coalesce(sum(
      CASE
        WHEN coalesce(j.payment_amount, 0) > 0 THEN j.payment_amount
        WHEN coalesce(j.actual_cost, 0) > 0 THEN j.actual_cost
        ELSE 0
      END * 0.1
    ), 0)
    INTO default_comm
    FROM public.jobs j
    WHERE j.assigned_technician_id = tech.id
      AND j.status = 'COMPLETED'
      AND j.end_time IS NOT NULL
      AND j.end_time >= p_start
      AND j.end_time <= p_end
      AND NOT EXISTS (
        SELECT 1 FROM public.technician_payments p2 WHERE p2.job_id = j.id
      );

    SELECT coalesce(sum(coalesce(e.amount, 0)), 0)
    INTO extra_comm
    FROM public.technician_extra_commissions e
    WHERE e.technician_id = tech.id
      AND e.commission_date >= p_start_date
      AND e.commission_date <= p_end_date;

    billing_slab := public.analytics_technician_billing_slab_total(tech.id, p_start, p_end);

    holiday_count := public.analytics_technician_holiday_day_count(
      tech.id,
      p_start_date,
      p_end_date,
      today_date
    );

    extra_holidays := GREATEST(0, holiday_count - 4);
    unused_leaves := GREATEST(0, 4 - holiday_count);
    adjusted_base := period_base - (extra_holidays * daily_base) + (unused_leaves * daily_base);

    salary_before := adjusted_base + payment_sum + default_comm + extra_comm + billing_slab;
    total_before_all := total_before_all + salary_before;

    IF coalesce(tech.employee_id, '') <> 'TECH851703400' THEN
      total_before := total_before + salary_before;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_salary_before_advance', round(total_before, 2),
    'total_salary_before_advance_including_all', round(total_before_all, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_calendar_salary_totals(timestamptz, timestamptz, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_calendar_salary_totals(timestamptz, timestamptz, date, date) TO authenticated;
