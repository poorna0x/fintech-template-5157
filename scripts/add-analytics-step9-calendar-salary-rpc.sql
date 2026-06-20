-- Step 9: calendar-month salary totals for CRM Analytics (Payments-parity, admin-only).
-- Returns two totals only (~0.1 KB) instead of jobs/payments/holidays row fetches.
-- Requires: public.is_admin_user()

CREATE OR REPLACE FUNCTION public.analytics_billing_slab_commission(p_monthly_billing numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  billing numeric := coalesce(p_monthly_billing, 0);
  base numeric;
  offset_within_lakh numeric;
BEGIN
  IF billing > 175000 AND billing < 200000 THEN
    RETURN 2000;
  END IF;
  IF billing < 200000 THEN
    RETURN 0;
  END IF;

  base := (floor((billing - 200000) / 100000) + 1) * 5000;
  offset_within_lakh := mod(billing, 100000);
  RETURN base + CASE WHEN offset_within_lakh >= 75000 THEN 2000 ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_technician_monthly_base_salary(
  p_salary jsonb,
  p_month_key text,
  p_legacy_default numeric DEFAULT 8000
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  fallback numeric;
  raw_base text;
  parsed_base numeric;
  hist_amount numeric;
  current_month_key text;
BEGIN
  fallback := p_legacy_default;
  IF p_salary IS NOT NULL AND jsonb_typeof(p_salary) = 'object' THEN
    raw_base := p_salary->>'baseSalary';
    IF raw_base IS NOT NULL AND btrim(raw_base) <> '' THEN
      parsed_base := raw_base::numeric;
      IF parsed_base >= 0 THEN
        fallback := parsed_base;
      END IF;
    END IF;
  END IF;

  current_month_key := to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM');

  SELECT (elem->>'amount')::numeric
  INTO hist_amount
  FROM jsonb_array_elements(
    CASE
      WHEN p_salary IS NOT NULL AND jsonb_typeof(p_salary->'history') = 'array' THEN p_salary->'history'
      ELSE '[]'::jsonb
    END
  ) AS elem
  WHERE left(btrim(elem->>'effectiveFrom'), 7) ~ '^\d{4}-\d{2}$'
    AND left(btrim(elem->>'effectiveFrom'), 7) <= p_month_key
    AND coalesce((elem->>'amount')::numeric, -1) >= 0
  ORDER BY left(btrim(elem->>'effectiveFrom'), 7) DESC
  LIMIT 1;

  IF hist_amount IS NOT NULL THEN
    RETURN hist_amount;
  END IF;

  IF p_month_key < current_month_key THEN
    RETURN p_legacy_default;
  END IF;

  RETURN fallback;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_technician_billing_slab_total(
  p_technician_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(sum(public.analytics_billing_slab_commission(t.monthly_billing)), 0)
  FROM (
    SELECT
      to_char(j.end_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month_key,
      sum(
        CASE
          WHEN coalesce(j.payment_amount, 0) > 0 THEN j.payment_amount
          WHEN coalesce(j.actual_cost, 0) > 0 THEN j.actual_cost
          ELSE 0
        END
      ) AS monthly_billing
    FROM public.jobs j
    WHERE j.assigned_technician_id = p_technician_id
      AND j.status = 'COMPLETED'
      AND j.end_time IS NOT NULL
      AND j.end_time >= p_start
      AND j.end_time <= p_end
    GROUP BY 1
  ) t
  WHERE t.month_key >= '2026-04';
$$;

CREATE OR REPLACE FUNCTION public.analytics_technician_holiday_day_count(
  p_technician_id uuid,
  p_start_date date,
  p_end_date date,
  p_today_date date
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cutoff date;
  d date;
  holiday_dates date[] := ARRAY[]::date[];
  job_dates date[];
  rec record;
  existing_reason text;
BEGIN
  cutoff := LEAST(p_end_date, p_today_date);

  SELECT coalesce(array_agg(DISTINCT ((j.end_time AT TIME ZONE 'Asia/Kolkata')::date)), ARRAY[]::date[])
  INTO job_dates
  FROM public.jobs j
  WHERE j.assigned_technician_id = p_technician_id
    AND j.status = 'COMPLETED'
    AND j.end_time IS NOT NULL
    AND (j.end_time AT TIME ZONE 'Asia/Kolkata')::date >= p_start_date
    AND (j.end_time AT TIME ZONE 'Asia/Kolkata')::date <= p_end_date;

  FOR rec IN
    SELECT h.holiday_date::date AS holiday_date, h.reason
    FROM public.technician_holidays h
    WHERE h.technician_id = p_technician_id
      AND h.holiday_date::date >= p_start_date
      AND h.holiday_date::date <= p_end_date
      AND h.holiday_date::date <= p_today_date
      AND coalesce(h.reason, '') <> 'MARKED_AS_PRESENT'
  LOOP
    IF NOT (rec.holiday_date = ANY(holiday_dates)) THEN
      holiday_dates := array_append(holiday_dates, rec.holiday_date);
    END IF;
  END LOOP;

  d := p_start_date;
  WHILE d <= cutoff LOOP
    IF d >= p_start_date AND d <= p_today_date THEN
      IF NOT (d = ANY(job_dates)) THEN
        SELECT h.reason
        INTO existing_reason
        FROM public.technician_holidays h
        WHERE h.technician_id = p_technician_id
          AND h.holiday_date::date = d
        LIMIT 1;

        IF existing_reason IS NULL OR existing_reason <> 'MARKED_AS_PRESENT' THEN
          IF NOT (d = ANY(holiday_dates)) THEN
            holiday_dates := array_append(holiday_dates, d);
          END IF;
        END IF;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN coalesce(array_length(holiday_dates, 1), 0);
END;
$$;

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
  paid_job_ids uuid[];
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
    ORDER BY t.created_at DESC
  LOOP
    monthly_base := public.analytics_technician_monthly_base_salary(tech.salary, month_key, 8000);
    daily_base := monthly_base / 30.0;
    period_base := monthly_base;

    SELECT
      coalesce(sum(coalesce(p.commission_amount, 0)), 0),
      coalesce(array_agg(DISTINCT p.job_id) FILTER (WHERE p.job_id IS NOT NULL), ARRAY[]::uuid[])
    INTO payment_sum, paid_job_ids
    FROM public.technician_payments p
    WHERE p.technician_id = tech.id
      AND p.created_at >= p_start
      AND p.created_at <= p_end;

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
      AND NOT (j.id = ANY(coalesce(paid_job_ids, ARRAY[]::uuid[])));

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

REVOKE ALL ON FUNCTION public.analytics_billing_slab_commission(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_technician_monthly_base_salary(jsonb, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_technician_billing_slab_total(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_technician_holiday_day_count(uuid, date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_calendar_salary_totals(timestamptz, timestamptz, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_calendar_salary_totals(timestamptz, timestamptz, date, date) TO authenticated;
