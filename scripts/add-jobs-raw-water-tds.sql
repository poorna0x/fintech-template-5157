-- Store raw water TDS (ppm) on each job at completion. customers.raw_water_tds
-- remains the latest value. Safe to re-run.
-- Run in Supabase SQL editor.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS raw_water_tds integer;

COMMENT ON COLUMN public.jobs.raw_water_tds IS
  'Raw water TDS in ppm captured at this visit (RO complete). Null for softener / not entered. customers.raw_water_tds is the latest only.';

-- Analytics: prefer the visit reading, else the current customer value (legacy jobs).
CREATE OR REPLACE FUNCTION public.get_analytics_top_locations(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer;
  off integer;
  search_norm text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  lim := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
  off := GREATEST(0, COALESCE(p_offset, 0));
  search_norm := public.analytics_norm_key(coalesce(p_search, ''));

  RETURN (
    WITH period_jobs AS (
      SELECT j.id, j.payment_amount, j.actual_cost, j.service_sub_type, j.customer_id, j.raw_water_tds
      FROM public.jobs j
      WHERE (
        p_start IS NULL AND p_end IS NULL
      ) OR (
        (
          j.status = 'COMPLETED'
          AND (
            (j.end_time IS NOT NULL AND j.end_time >= p_start AND j.end_time <= p_end)
            OR (j.end_time IS NULL AND j.completed_at IS NOT NULL AND j.completed_at >= p_start AND j.completed_at <= p_end)
          )
        )
        OR (
          j.status <> 'COMPLETED'
          AND j.created_at >= p_start
          AND j.created_at <= p_end
        )
      )
    ),
    job_rows AS (
      SELECT
        public.analytics_norm_key(
          coalesce(
            nullif(btrim(c.visible_address), ''),
            nullif(btrim(c.address->>'visible_address'), ''),
            nullif(btrim(c.address->>'area'), ''),
            ''
          )
        ) AS location_key,
        coalesce(
          nullif(btrim(c.visible_address), ''),
          nullif(btrim(c.address->>'visible_address'), ''),
          nullif(btrim(c.address->>'area'), ''),
          'Unknown'
        ) AS display_label,
        coalesce(j.payment_amount, j.actual_cost, 0)::numeric AS revenue,
        j.service_sub_type,
        coalesce(nullif(j.raw_water_tds, 0), nullif(c.raw_water_tds, 0)) AS raw_water_tds
      FROM period_jobs j
      JOIN public.customers c ON c.id = j.customer_id
    ),
    grouped AS (
      SELECT
        jr.location_key,
        mode() WITHIN GROUP (ORDER BY jr.display_label) AS display_name,
        count(*)::integer AS job_count,
        sum(jr.revenue)::numeric AS total_revenue,
        sum(CASE WHEN public.analytics_is_installation(jr.service_sub_type) THEN 1 ELSE 0 END)::integer AS installation,
        sum(CASE WHEN NOT public.analytics_is_installation(jr.service_sub_type) THEN 1 ELSE 0 END)::integer AS service,
        sum(CASE WHEN jr.raw_water_tds IS NOT NULL AND jr.raw_water_tds > 0 THEN jr.raw_water_tds ELSE 0 END)::numeric AS tds_sum,
        sum(CASE WHEN jr.raw_water_tds IS NOT NULL AND jr.raw_water_tds > 0 THEN 1 ELSE 0 END)::integer AS tds_count
      FROM job_rows jr
      GROUP BY jr.location_key
    ),
    filtered AS (
      SELECT
        g.location_key,
        g.display_name,
        g.job_count,
        g.total_revenue,
        g.installation,
        g.service,
        CASE WHEN g.tds_count > 0 THEN round((g.tds_sum / g.tds_count)::numeric, 1) ELSE NULL END AS avg_tds,
        CASE WHEN g.job_count > 0 THEN (g.total_revenue / g.job_count) ELSE 0 END AS avg_call_billing
      FROM grouped g
      WHERE coalesce(p_search, '') = ''
        OR g.display_name ILIKE '%' || btrim(p_search) || '%'
        OR g.location_key LIKE '%' || search_norm || '%'
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*)::integer FROM filtered),
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'location_key', f.location_key,
            'display_name', f.display_name,
            'job_count', f.job_count,
            'total_revenue', f.total_revenue,
            'service_type_breakdown', jsonb_build_object('Installation', f.installation, 'Service', f.service),
            'avg_tds', f.avg_tds,
            'avg_call_billing', f.avg_call_billing
          )
          ORDER BY f.job_count DESC, f.display_name
        )
        FROM (
          SELECT * FROM filtered
          ORDER BY job_count DESC, display_name
          LIMIT lim OFFSET off
        ) f
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_top_locations(timestamptz, timestamptz, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_top_locations(timestamptz, timestamptz, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_technician_customer_jobs_report(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin_user() THEN
    RAISE EXCEPTION 'Use admin job queries';
  END IF;

  IF NOT public.is_active_technician() THEN
    RAISE EXCEPTION 'Technician access required';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'job_number', j.job_number,
        'customer_id', j.customer_id,
        'status', j.status,
        'priority', j.priority,
        'service_type', j.service_type,
        'service_sub_type', j.service_sub_type,
        'service_brand', j.service_brand,
        'scheduled_date', j.scheduled_date,
        'scheduled_time_slot', j.scheduled_time_slot,
        'created_at', j.created_at,
        'updated_at', j.updated_at,
        'completed_at', j.completed_at,
        'end_time', j.end_time,
        'denied_at', j.denied_at,
        'denial_reason', j.denial_reason,
        'assigned_technician_id', j.assigned_technician_id,
        'completed_by', j.completed_by,
        'payment_amount', j.payment_amount,
        'actual_cost', j.actual_cost,
        'estimated_cost', j.estimated_cost,
        'payment_method', j.payment_method,
        'parts_cost_total', j.parts_cost_total,
        'requirements', j.requirements,
        'brand', j.brand,
        'model', j.model,
        'completion_notes', j.completion_notes,
        'description', j.description,
        'after_photos', j.after_photos,
        'raw_water_tds', j.raw_water_tds
      )
      ORDER BY j.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.status = 'COMPLETED';

  RETURN v_result;
END;
$$;
