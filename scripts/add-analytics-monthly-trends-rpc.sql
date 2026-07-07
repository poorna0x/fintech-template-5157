-- Monthly / weekly business performance trends for Analytics (admin-only).
-- Requires: analytics_job_billing, analytics_job_completed_at, analytics_job_in_period,
--           analytics_resolve_lead_source, analytics_norm_key
-- Run once in Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.get_analytics_monthly_trends(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_granularity text DEFAULT 'month',
  p_service_type text DEFAULT NULL,
  p_service_sub_type text DEFAULT NULL,
  p_equipment_brand text DEFAULT NULL,
  p_service_brand text DEFAULT NULL,
  p_lead_source_key text DEFAULT NULL,
  p_technician_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_all_time boolean;
  v_granularity text;
  result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_all_time := p_start IS NULL AND p_end IS NULL;
  IF v_all_time THEN
    v_start := NULL;
    v_end := NULL;
  ELSIF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'invalid date range: both p_start and p_end required' USING ERRCODE = '22023';
  ELSE
    v_start := LEAST(p_start, p_end);
    v_end := GREATEST(p_start, p_end);
  END IF;

  v_granularity := lower(coalesce(nullif(btrim(p_granularity), ''), 'month'));
  IF v_granularity NOT IN ('month', 'week', 'day') THEN
    v_granularity := 'month';
  END IF;

  WITH period_jobs AS (
    SELECT
      j.id,
      j.status,
      j.created_at,
      j.end_time,
      j.completed_at,
      j.lead_source,
      j.requirements,
      j.assigned_by,
      j.assigned_technician_id,
      j.payment_amount,
      j.actual_cost,
      j.service_type,
      j.service_sub_type,
      j.payment_method,
      j.brand,
      j.service_brand,
      c.brand AS customer_brand
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE public.analytics_job_in_period(
      j.status, j.created_at, j.end_time, j.completed_at, v_start, v_end
    )
  ),
  filtered_completed AS (
    SELECT j.*
    FROM period_jobs j
    WHERE j.status = 'COMPLETED'
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
      AND (
        p_service_type IS NULL
        OR upper(btrim(j.service_type)) = upper(btrim(p_service_type))
      )
      AND (
        p_service_sub_type IS NULL
        OR coalesce(nullif(btrim(j.service_sub_type), ''), 'Unknown') = p_service_sub_type
      )
      AND (
        p_equipment_brand IS NULL
        OR public.analytics_norm_key(
          coalesce(nullif(btrim(j.brand), ''), nullif(btrim(j.customer_brand), ''), '')
        ) = public.analytics_norm_key(p_equipment_brand)
      )
      AND (
        p_service_brand IS NULL
        OR coalesce(nullif(btrim(j.service_brand), ''), 'hydrogenro') = lower(btrim(p_service_brand))
      )
      AND (
        p_lead_source_key IS NULL
        OR public.analytics_norm_key(
          public.analytics_resolve_lead_source(j.lead_source, j.assigned_by, j.requirements)
        ) = public.analytics_norm_key(p_lead_source_key)
      )
      AND (p_technician_id IS NULL OR j.assigned_technician_id = p_technician_id)
      AND (
        p_payment_method IS NULL
        OR coalesce(nullif(btrim(j.payment_method), ''), 'Unknown') = p_payment_method
      )
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN v_granularity = 'day' THEN
          to_char(
            public.analytics_job_completed_at(j.end_time, j.completed_at) AT TIME ZONE 'UTC',
            'YYYY-MM-DD'
          )
        WHEN v_granularity = 'week' THEN
          to_char(
            public.analytics_job_completed_at(j.end_time, j.completed_at) AT TIME ZONE 'UTC',
            'IYYY-"W"IW'
          )
        ELSE
          to_char(
            public.analytics_job_completed_at(j.end_time, j.completed_at) AT TIME ZONE 'UTC',
            'YYYY-MM'
          )
      END AS period_key,
      count(*)::integer AS jobs,
      coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS revenue
    FROM filtered_completed j
    GROUP BY 1
  ),
  totals AS (
    SELECT
      coalesce(sum(jobs), 0)::integer AS total_jobs,
      coalesce(sum(revenue), 0)::numeric AS total_revenue
    FROM bucketed
  ),
  ranked AS (
    SELECT
      b.period_key,
      b.jobs,
      b.revenue,
      row_number() OVER (ORDER BY b.revenue DESC, b.period_key) AS best_rank,
      row_number() OVER (ORDER BY b.revenue ASC, b.period_key) AS worst_rank
    FROM bucketed b
  ),
  extremes AS (
    SELECT
      (SELECT jsonb_build_object(
        'period_key', r.period_key,
        'revenue', r.revenue,
        'jobs', r.jobs
      ) FROM ranked r WHERE r.best_rank = 1 LIMIT 1) AS best_period,
      (SELECT jsonb_build_object(
        'period_key', r.period_key,
        'revenue', r.revenue,
        'jobs', r.jobs
      ) FROM ranked r WHERE r.worst_rank = 1 LIMIT 1) AS worst_period
  )
  SELECT jsonb_build_object(
    'granularity', v_granularity,
    'total_jobs', t.total_jobs,
    'total_revenue', t.total_revenue,
    'best_period', e.best_period,
    'worst_period', e.worst_period,
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'period_key', b.period_key,
          'jobs', b.jobs,
          'revenue', b.revenue,
          'avg_bill', CASE WHEN b.jobs > 0 THEN round(b.revenue / b.jobs, 2) ELSE 0 END
        )
        ORDER BY b.period_key
      )
      FROM bucketed b
    ), '[]'::jsonb)
  )
  INTO result
  FROM totals t
  CROSS JOIN extremes e;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_monthly_trends(
  timestamptz, timestamptz, text, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_monthly_trends(
  timestamptz, timestamptz, text, text, text, text, text, text, uuid, text
) TO authenticated;
