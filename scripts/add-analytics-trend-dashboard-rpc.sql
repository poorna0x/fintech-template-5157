-- Consolidated business trend dashboard (one RPC = timeline + overlay + month catalog + insights).
-- Requires: analytics_* helpers from add-analytics-dashboard-rpc.sql / add-analytics-paginated-rpcs.sql
-- Run once in Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.get_analytics_trend_dashboard(
  p_start timestamptz,
  p_end timestamptz,
  p_granularity text DEFAULT 'month',
  p_compare_mode text DEFAULT NULL,
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
  v_granularity text;
  v_compare_mode text;
  v_cmp_start timestamptz;
  v_cmp_end timestamptz;
  v_catalog_start timestamptz;
  v_scan_start timestamptz;
  v_scan_end timestamptz;
  result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'invalid date range: both p_start and p_end required' USING ERRCODE = '22023';
  END IF;

  v_start := LEAST(p_start, p_end);
  v_end := GREATEST(p_start, p_end);
  v_granularity := lower(coalesce(nullif(btrim(p_granularity), ''), 'month'));
  IF v_granularity NOT IN ('month', 'week', 'day') THEN
    v_granularity := 'month';
  END IF;

  v_compare_mode := lower(coalesce(nullif(btrim(p_compare_mode), ''), ''));
  IF v_compare_mode NOT IN ('previous_period', 'previous_year') THEN
    v_compare_mode := '';
  END IF;

  v_catalog_start := date_trunc('month', (now() AT TIME ZONE 'UTC') - interval '36 months');

  IF v_compare_mode = 'previous_year' THEN
    v_cmp_start := v_start - interval '1 year';
    v_cmp_end := v_end - interval '1 year';
  ELSIF v_compare_mode = 'previous_period' THEN
    v_cmp_end := v_start - interval '1 millisecond';
    v_cmp_start := v_cmp_end - (v_end - v_start);
  ELSE
    v_cmp_start := NULL;
    v_cmp_end := NULL;
  END IF;

  v_scan_start := v_catalog_start;
  v_scan_end := v_end;
  IF v_cmp_start IS NOT NULL AND v_cmp_start < v_scan_start THEN
    v_scan_start := v_cmp_start;
  END IF;
  IF v_start < v_scan_start THEN
    v_scan_start := v_start;
  END IF;

  WITH completed_raw AS (
    SELECT
      j.id,
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
      c.brand AS customer_brand,
      public.analytics_job_completed_at(j.end_time, j.completed_at) AS completed_at_ts,
      public.analytics_job_billing(j.payment_amount, j.actual_cost) AS revenue,
      public.analytics_resolve_lead_source(j.lead_source, j.assigned_by, j.requirements) AS resolved_lead,
      coalesce(nullif(btrim(j.service_sub_type), ''), 'Unknown') AS service_sub_type_label,
      coalesce(nullif(btrim(j.brand), ''), nullif(btrim(c.brand), ''), 'Unknown') AS equipment_brand_label
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE j.status = 'COMPLETED'
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) >= v_scan_start
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) <= v_scan_end
  ),
  filtered AS (
    SELECT r.*
    FROM completed_raw r
    WHERE (
      p_service_type IS NULL
      OR upper(btrim(r.service_type)) = upper(btrim(p_service_type))
    )
    AND (
      p_service_sub_type IS NULL
      OR r.service_sub_type_label = p_service_sub_type
    )
    AND (
      p_equipment_brand IS NULL
      OR public.analytics_norm_key(r.equipment_brand_label) = public.analytics_norm_key(p_equipment_brand)
    )
    AND (
      p_service_brand IS NULL
      OR coalesce(nullif(btrim(r.service_brand), ''), 'hydrogenro') = lower(btrim(p_service_brand))
    )
    AND (
      p_lead_source_key IS NULL
      OR public.analytics_norm_key(r.resolved_lead) = public.analytics_norm_key(p_lead_source_key)
    )
    AND (p_technician_id IS NULL OR r.assigned_technician_id = p_technician_id)
    AND (
      p_payment_method IS NULL
      OR coalesce(nullif(btrim(r.payment_method), ''), 'Unknown') = p_payment_method
    )
  ),
  primary_jobs AS (
    SELECT * FROM filtered
    WHERE completed_at_ts >= v_start AND completed_at_ts <= v_end
  ),
  compare_jobs AS (
    SELECT * FROM filtered
    WHERE v_cmp_start IS NOT NULL
      AND completed_at_ts >= v_cmp_start
      AND completed_at_ts <= v_cmp_end
  ),
  catalog_jobs AS (
    SELECT * FROM filtered
    WHERE completed_at_ts >= v_catalog_start
  ),
  bucket_expr AS (
    SELECT CASE
      WHEN v_granularity = 'day' THEN 'day'
      WHEN v_granularity = 'week' THEN 'week'
      ELSE 'month'
    END AS kind
  ),
  primary_bucket AS (
    SELECT
      CASE
        WHEN (SELECT kind FROM bucket_expr) = 'day' THEN to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        WHEN (SELECT kind FROM bucket_expr) = 'week' THEN to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'IYYY-"W"IW')
        ELSE to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM')
      END AS period_key,
      count(*)::integer AS jobs,
      coalesce(sum(pj.revenue), 0)::numeric AS revenue
    FROM primary_jobs pj
    GROUP BY 1
  ),
  compare_bucket AS (
    SELECT
      CASE
        WHEN (SELECT kind FROM bucket_expr) = 'day' THEN to_char(cj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        WHEN (SELECT kind FROM bucket_expr) = 'week' THEN to_char(cj.completed_at_ts AT TIME ZONE 'UTC', 'IYYY-"W"IW')
        ELSE to_char(cj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM')
      END AS period_key,
      count(*)::integer AS jobs,
      coalesce(sum(cj.revenue), 0)::numeric AS revenue
    FROM compare_jobs cj
    GROUP BY 1
  ),
  catalog_bucket AS (
    SELECT
      to_char(cj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM') AS period_key,
      count(*)::integer AS jobs,
      coalesce(sum(cj.revenue), 0)::numeric AS revenue
    FROM catalog_jobs cj
    GROUP BY 1
  ),
  primary_pack AS (
    SELECT public.get_analytics_monthly_trends_from_buckets(
      v_granularity,
      coalesce((SELECT jsonb_agg(jsonb_build_object('period_key', b.period_key, 'jobs', b.jobs, 'revenue', b.revenue) ORDER BY b.period_key) FROM primary_bucket b), '[]'::jsonb)
    ) AS payload
  ),
  compare_pack AS (
    SELECT CASE
      WHEN v_cmp_start IS NULL THEN NULL::jsonb
      ELSE public.get_analytics_monthly_trends_from_buckets(
        v_granularity,
        coalesce((SELECT jsonb_agg(jsonb_build_object('period_key', b.period_key, 'jobs', b.jobs, 'revenue', b.revenue) ORDER BY b.period_key) FROM compare_bucket b), '[]'::jsonb)
      )
    END AS payload
  ),
  monthly_primary AS (
    SELECT
      to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key,
      count(*)::integer AS jobs,
      coalesce(sum(pj.revenue), 0)::numeric AS revenue
    FROM primary_jobs pj
    GROUP BY 1
  ),
  monthly_ordered AS (
    SELECT
      month_key,
      jobs,
      revenue,
      row_number() OVER (ORDER BY month_key DESC) AS rn_desc
    FROM monthly_primary
  ),
  lead_top AS (
    SELECT
      pj.resolved_lead AS label,
      count(*)::integer AS jobs,
      coalesce(sum(pj.revenue), 0)::numeric AS revenue
    FROM primary_jobs pj
    GROUP BY 1
    ORDER BY revenue DESC, jobs DESC
    LIMIT 5
  ),
  service_top AS (
    SELECT
      pj.service_sub_type_label AS label,
      count(*)::integer AS jobs,
      coalesce(sum(pj.revenue), 0)::numeric AS revenue
    FROM primary_jobs pj
    GROUP BY 1
    ORDER BY revenue DESC, jobs DESC
    LIMIT 5
  ),
  install_split AS (
    SELECT
      count(*) FILTER (WHERE public.analytics_is_installation(pj.service_sub_type_label))::integer AS installation_jobs,
      count(*) FILTER (WHERE NOT public.analytics_is_installation(pj.service_sub_type_label))::integer AS service_jobs,
      coalesce(sum(pj.revenue) FILTER (WHERE public.analytics_is_installation(pj.service_sub_type_label)), 0)::numeric AS installation_revenue,
      coalesce(sum(pj.revenue) FILTER (WHERE NOT public.analytics_is_installation(pj.service_sub_type_label)), 0)::numeric AS service_revenue
    FROM primary_jobs pj
  ),
  brand_opts AS (
    SELECT coalesce(jsonb_agg(DISTINCT to_jsonb(btrim(pj.equipment_brand_label)) ORDER BY to_jsonb(btrim(pj.equipment_brand_label))), '[]'::jsonb) AS brands
    FROM primary_jobs pj
    WHERE btrim(pj.equipment_brand_label) <> '' AND pj.equipment_brand_label <> 'Unknown'
  ),
  lead_opts AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'key', public.analytics_norm_key(pj.resolved_lead),
        'label', pj.resolved_lead
      )
      ORDER BY pj.resolved_lead
    ), '[]'::jsonb) AS sources
    FROM (
      SELECT DISTINCT resolved_lead
      FROM primary_jobs
      WHERE btrim(resolved_lead) <> ''
    ) pj
  ),
  insight_base AS (
    SELECT
      coalesce(sum(jobs), 0)::integer AS total_jobs,
      coalesce(sum(revenue), 0)::numeric AS total_revenue,
      count(*)::integer AS period_count,
      coalesce(max(revenue), 0)::numeric AS max_revenue,
      coalesce(min(revenue), 0)::numeric AS min_revenue
    FROM primary_bucket
  ),
  last3 AS (
    SELECT coalesce(sum(revenue), 0)::numeric AS revenue
    FROM monthly_ordered
    WHERE rn_desc BETWEEN 1 AND 3
  ),
  prior3 AS (
    SELECT coalesce(sum(revenue), 0)::numeric AS revenue
    FROM monthly_ordered
    WHERE rn_desc BETWEEN 4 AND 6
  )
  SELECT jsonb_build_object(
    'primary', (SELECT payload FROM primary_pack),
    'compare', (SELECT payload FROM compare_pack),
    'month_catalog', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'period_key', c.period_key,
          'jobs', c.jobs,
          'revenue', c.revenue,
          'avg_bill', CASE WHEN c.jobs > 0 THEN round(c.revenue / c.jobs, 2) ELSE 0 END
        )
        ORDER BY c.period_key
      )
      FROM catalog_bucket c
    ), '[]'::jsonb),
    'insights', (
      SELECT jsonb_build_object(
        'avg_period_revenue', CASE WHEN ib.period_count > 0 THEN round(ib.total_revenue / ib.period_count, 2) ELSE 0 END,
        'avg_period_jobs', CASE WHEN ib.period_count > 0 THEN round(ib.total_jobs::numeric / ib.period_count, 2) ELSE 0 END,
        'avg_bill', CASE WHEN ib.total_jobs > 0 THEN round(ib.total_revenue / ib.total_jobs, 2) ELSE 0 END,
        'last_3_revenue', (SELECT revenue FROM last3),
        'prior_3_revenue', (SELECT revenue FROM prior3),
        'last_3_growth_pct', CASE
          WHEN (SELECT revenue FROM prior3) > 0 THEN round((((SELECT revenue FROM last3) - (SELECT revenue FROM prior3)) / (SELECT revenue FROM prior3)) * 100, 2)
          WHEN (SELECT revenue FROM last3) > 0 THEN 100
          ELSE NULL
        END,
        'installation_jobs', ins.installation_jobs,
        'service_jobs', ins.service_jobs,
        'installation_revenue', ins.installation_revenue,
        'service_revenue', ins.service_revenue,
        'revenue_swings_pct', CASE
          WHEN ib.period_count > 0 AND (ib.total_revenue / ib.period_count) > 0 THEN round(((ib.max_revenue - ib.min_revenue) / (ib.total_revenue / ib.period_count)) * 100, 2)
          ELSE NULL
        END,
        'growing_streak_months', 0,
        'top_lead_sources', coalesce((SELECT jsonb_agg(jsonb_build_object('label', lt.label, 'jobs', lt.jobs, 'revenue', lt.revenue)) FROM lead_top lt), '[]'::jsonb),
        'top_service_types', coalesce((SELECT jsonb_agg(jsonb_build_object('label', st.label, 'jobs', st.jobs, 'revenue', st.revenue)) FROM service_top st), '[]'::jsonb)
      )
      FROM insight_base ib
      CROSS JOIN install_split ins
    ),
    'filter_options', jsonb_build_object(
      'equipment_brands', (SELECT brands FROM brand_opts),
      'lead_sources', (SELECT sources FROM lead_opts)
    )
  )
  INTO result;

  RETURN result;
END;
$$;

-- Helper: build monthly-trends-shaped json from pre-aggregated buckets
CREATE OR REPLACE FUNCTION public.get_analytics_monthly_trends_from_buckets(
  p_granularity text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH rows AS (
    SELECT
      (elem->>'period_key') AS period_key,
      coalesce((elem->>'jobs')::integer, 0) AS jobs,
      coalesce((elem->>'revenue')::numeric, 0) AS revenue
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS elem
  ),
  totals AS (
    SELECT
      coalesce(sum(jobs), 0)::integer AS total_jobs,
      coalesce(sum(revenue), 0)::numeric AS total_revenue
    FROM rows
  ),
  ranked AS (
    SELECT
      r.period_key,
      r.jobs,
      r.revenue,
      row_number() OVER (ORDER BY r.revenue DESC, r.period_key) AS best_rank,
      row_number() OVER (ORDER BY r.revenue ASC, r.period_key) AS worst_rank
    FROM rows r
  )
  SELECT jsonb_build_object(
    'granularity', coalesce(nullif(btrim(p_granularity), ''), 'month'),
    'total_jobs', t.total_jobs,
    'total_revenue', t.total_revenue,
    'best_period', (
      SELECT jsonb_build_object('period_key', r.period_key, 'revenue', r.revenue, 'jobs', r.jobs)
      FROM ranked r WHERE r.best_rank = 1 LIMIT 1
    ),
    'worst_period', (
      SELECT jsonb_build_object('period_key', r.period_key, 'revenue', r.revenue, 'jobs', r.jobs)
      FROM ranked r WHERE r.worst_rank = 1 LIMIT 1
    ),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'period_key', r.period_key,
          'jobs', r.jobs,
          'revenue', r.revenue,
          'avg_bill', CASE WHEN r.jobs > 0 THEN round(r.revenue / r.jobs, 2) ELSE 0 END
        )
        ORDER BY r.period_key
      )
      FROM rows r
    ), '[]'::jsonb)
  )
  FROM totals t;
$$;

-- Compare two arbitrary ranges in one round-trip
CREATE OR REPLACE FUNCTION public.get_analytics_trend_range_compare(
  p_a_start timestamptz,
  p_a_end timestamptz,
  p_b_start timestamptz,
  p_b_end timestamptz,
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
  v_a_start timestamptz := LEAST(p_a_start, p_a_end);
  v_a_end timestamptz := GREATEST(p_a_start, p_a_end);
  v_b_start timestamptz := LEAST(p_b_start, p_b_end);
  v_b_end timestamptz := GREATEST(p_b_start, p_b_end);
  v_scan_start timestamptz := LEAST(v_a_start, v_b_start);
  v_scan_end timestamptz := GREATEST(v_a_end, v_b_end);
  v_granularity text;
  result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_granularity := lower(coalesce(nullif(btrim(p_granularity), ''), 'month'));
  IF v_granularity NOT IN ('month', 'week', 'day') THEN
    v_granularity := 'month';
  END IF;

  WITH completed_raw AS (
    SELECT
      j.payment_amount,
      j.actual_cost,
      j.lead_source,
      j.requirements,
      j.assigned_by,
      j.assigned_technician_id,
      j.service_type,
      j.service_sub_type,
      j.payment_method,
      j.brand,
      j.service_brand,
      c.brand AS customer_brand,
      public.analytics_job_completed_at(j.end_time, j.completed_at) AS completed_at_ts
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE j.status = 'COMPLETED'
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) >= v_scan_start
      AND public.analytics_job_completed_at(j.end_time, j.completed_at) <= v_scan_end
  ),
  filtered AS (
    SELECT
      r.completed_at_ts,
      public.analytics_job_billing(r.payment_amount, r.actual_cost) AS revenue,
      coalesce(nullif(btrim(r.service_sub_type), ''), 'Unknown') AS service_sub_type_label,
      coalesce(nullif(btrim(r.brand), ''), nullif(btrim(r.customer_brand), ''), 'Unknown') AS equipment_brand_label
    FROM completed_raw r
    WHERE (
      p_service_type IS NULL OR upper(btrim(r.service_type)) = upper(btrim(p_service_type))
    )
    AND (p_service_sub_type IS NULL OR coalesce(nullif(btrim(r.service_sub_type), ''), 'Unknown') = p_service_sub_type)
    AND (
      p_equipment_brand IS NULL
      OR public.analytics_norm_key(r.equipment_brand_label) = public.analytics_norm_key(p_equipment_brand)
    )
    AND (
      p_service_brand IS NULL
      OR coalesce(nullif(btrim(r.service_brand), ''), 'hydrogenro') = lower(btrim(p_service_brand))
    )
    AND (
      p_lead_source_key IS NULL
      OR public.analytics_norm_key(public.analytics_resolve_lead_source(r.lead_source, r.assigned_by, r.requirements))
        = public.analytics_norm_key(p_lead_source_key)
    )
    AND (p_technician_id IS NULL OR r.assigned_technician_id = p_technician_id)
    AND (
      p_payment_method IS NULL
      OR coalesce(nullif(btrim(r.payment_method), ''), 'Unknown') = p_payment_method
    )
  ),
  bucket_a AS (
    SELECT
      CASE
        WHEN v_granularity = 'day' THEN to_char(f.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        WHEN v_granularity = 'week' THEN to_char(f.completed_at_ts AT TIME ZONE 'UTC', 'IYYY-"W"IW')
        ELSE to_char(f.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM')
      END AS period_key,
      count(*)::integer AS jobs,
      coalesce(sum(f.revenue), 0)::numeric AS revenue
    FROM filtered f
    WHERE f.completed_at_ts >= v_a_start AND f.completed_at_ts <= v_a_end
    GROUP BY 1
  ),
  bucket_b AS (
    SELECT
      CASE
        WHEN v_granularity = 'day' THEN to_char(f.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        WHEN v_granularity = 'week' THEN to_char(f.completed_at_ts AT TIME ZONE 'UTC', 'IYYY-"W"IW')
        ELSE to_char(f.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM')
      END AS period_key,
      count(*)::integer AS jobs,
      coalesce(sum(f.revenue), 0)::numeric AS revenue
    FROM filtered f
    WHERE f.completed_at_ts >= v_b_start AND f.completed_at_ts <= v_b_end
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'range_a', public.get_analytics_monthly_trends_from_buckets(
      v_granularity,
      coalesce((SELECT jsonb_agg(jsonb_build_object('period_key', b.period_key, 'jobs', b.jobs, 'revenue', b.revenue) ORDER BY b.period_key) FROM bucket_a b), '[]'::jsonb)
    ),
    'range_b', public.get_analytics_monthly_trends_from_buckets(
      v_granularity,
      coalesce((SELECT jsonb_agg(jsonb_build_object('period_key', b.period_key, 'jobs', b.jobs, 'revenue', b.revenue) ORDER BY b.period_key) FROM bucket_b b), '[]'::jsonb)
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_trend_dashboard(
  timestamptz, timestamptz, text, text, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_trend_dashboard(
  timestamptz, timestamptz, text, text, text, text, text, text, text, uuid, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_analytics_trend_range_compare(
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_trend_range_compare(
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, text, text, uuid, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_analytics_monthly_trends_from_buckets(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_monthly_trends_from_buckets(text, jsonb) TO authenticated;
