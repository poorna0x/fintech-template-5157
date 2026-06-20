-- On-demand analytics RPCs: return complaints + direct/website conversions.
-- Requires: public.is_admin_user(), analytics helpers from add-analytics-dashboard-rpc.sql
-- Run once in Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.analytics_is_return_complaint(p_service_sub_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    lower(coalesce(p_service_sub_type, '')) ~ 'return'
      AND (
        lower(coalesce(p_service_sub_type, '')) ~ 'complaint'
        OR lower(coalesce(p_service_sub_type, '')) ~ 'service'
      ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.analytics_normalize_lead_type(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g'))
    WHEN '' THEN ''
    WHEN 'website' THEN 'Website'
    WHEN 'directcall' THEN 'Direct call'
    WHEN 'googleleads' THEN 'Google-Leads'
    WHEN 'rocareindia' THEN 'RO care india'
    WHEN 'hometriangle' THEN 'Home Triangle'
    WHEN 'hometrianglesrujan' THEN 'Home Triangle-Srujan'
    WHEN 'hometriangle3' THEN 'Home Triangle-3'
    WHEN 'localramu' THEN 'Local Ramu'
    WHEN 'other' THEN 'Other'
    ELSE btrim(p)
  END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_is_direct_or_website_lead(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(btrim(p), '') = '' THEN true
    WHEN lower(btrim(p)) LIKE '%website%' THEN true
    WHEN public.analytics_normalize_lead_type(p) IN ('Direct call', 'Website') THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_is_first_touch_lead(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT public.analytics_is_direct_or_website_lead(p)
     AND public.analytics_normalize_lead_type(p) <> 'Google-Leads';
$$;

-- Return complaints: credits original (prior completed) technician when a different tech handles the return job.
CREATE OR REPLACE FUNCTION public.get_analytics_return_complaints(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
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

  IF v_all_time THEN
    WITH recent AS (
      SELECT
        j.id,
        j.customer_id,
        j.created_at,
        j.assigned_technician_id,
        j.service_sub_type
      FROM public.jobs j
      ORDER BY j.created_at DESC
      LIMIT 5000
    ),
    return_jobs AS (
      SELECT * FROM recent r
      WHERE public.analytics_is_return_complaint(r.service_sub_type)
        AND r.customer_id IS NOT NULL
    ),
    attributed AS (
      SELECT
        r.id,
        r.assigned_technician_id AS current_tech,
        (
          SELECT p.assigned_technician_id
          FROM public.jobs p
          WHERE p.customer_id = r.customer_id
            AND p.status = 'COMPLETED'
            AND p.id <> r.id
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) IS NOT NULL
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) < r.created_at
          ORDER BY public.analytics_job_completed_at(p.end_time, p.completed_at) DESC
          LIMIT 1
        ) AS original_tech
      FROM return_jobs r
    ),
    counts AS (
      SELECT original_tech AS technician_id, count(*)::integer AS cnt
      FROM attributed
      WHERE original_tech IS NOT NULL
        AND current_tech IS NOT NULL
        AND original_tech <> current_tech
      GROUP BY original_tech
    )
    SELECT jsonb_build_object(
      'total', coalesce((SELECT sum(cnt) FROM counts), 0),
      'by_technician', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('technician_id', c.technician_id, 'count', c.cnt)
          ORDER BY c.cnt DESC
        )
        FROM counts c
      ), '[]'::jsonb)
    )
    INTO result;
  ELSE
    WITH return_jobs AS (
      SELECT
        j.id,
        j.customer_id,
        j.created_at,
        j.assigned_technician_id
      FROM public.jobs j
      WHERE public.analytics_is_return_complaint(j.service_sub_type)
        AND j.customer_id IS NOT NULL
        AND j.created_at >= v_start
        AND j.created_at <= v_end
    ),
    attributed AS (
      SELECT
        r.id,
        r.assigned_technician_id AS current_tech,
        (
          SELECT p.assigned_technician_id
          FROM public.jobs p
          WHERE p.customer_id = r.customer_id
            AND p.status = 'COMPLETED'
            AND p.id <> r.id
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) IS NOT NULL
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) < r.created_at
          ORDER BY public.analytics_job_completed_at(p.end_time, p.completed_at) DESC
          LIMIT 1
        ) AS original_tech
      FROM return_jobs r
    ),
    counts AS (
      SELECT original_tech AS technician_id, count(*)::integer AS cnt
      FROM attributed
      WHERE original_tech IS NOT NULL
        AND current_tech IS NOT NULL
        AND original_tech <> current_tech
      GROUP BY original_tech
    )
    SELECT jsonb_build_object(
      'total', coalesce((SELECT sum(cnt) FROM counts), 0),
      'by_technician', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('technician_id', c.technician_id, 'count', c.cnt)
          ORDER BY c.cnt DESC
        )
        FROM counts c
      ), '[]'::jsonb)
    )
    INTO result;
  END IF;

  RETURN result;
END;
$$;

-- Direct/Website conversions: completed direct/website jobs attributed to first-touch lead source.
CREATE OR REPLACE FUNCTION public.get_analytics_direct_website_conversions(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
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

  IF v_all_time THEN
    WITH relevant_jobs AS (
      SELECT
        j.id,
        j.customer_id,
        j.status,
        j.created_at,
        j.end_time,
        j.completed_at,
        j.lead_source,
        j.assigned_by,
        j.assigned_technician_id,
        j.payment_amount,
        j.actual_cost
      FROM public.jobs j
      WHERE j.customer_id IS NOT NULL
      ORDER BY j.created_at DESC
      LIMIT 5000
    ),
    resolved AS (
      SELECT
        r.*,
        public.analytics_resolve_lead_source(r.lead_source, r.assigned_by) AS resolved_lead
      FROM relevant_jobs r
    ),
    first_touch AS (
      SELECT DISTINCT ON (customer_id)
        customer_id,
        public.analytics_normalize_lead_type(resolved_lead) AS first_lead,
        created_at AS first_touch_at
      FROM resolved
      WHERE status = 'COMPLETED'
        AND public.analytics_is_first_touch_lead(resolved_lead)
      ORDER BY customer_id, created_at ASC
    ),
    conversions AS (
      SELECT
        ft.first_lead,
        j.id AS job_id,
        j.created_at,
        j.assigned_technician_id,
        public.analytics_job_billing(j.payment_amount, j.actual_cost) AS amount,
        (
          SELECT p.assigned_technician_id
          FROM resolved p
          WHERE p.customer_id = j.customer_id
            AND p.status = 'COMPLETED'
            AND p.id <> j.id
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) IS NOT NULL
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) < j.created_at
          ORDER BY public.analytics_job_completed_at(p.end_time, p.completed_at) DESC
          LIMIT 1
        ) AS prev_tech_id
      FROM resolved j
      INNER JOIN first_touch ft ON ft.customer_id = j.customer_id
      WHERE j.status = 'COMPLETED'
        AND j.created_at > ft.first_touch_at
        AND public.analytics_is_direct_or_website_lead(j.resolved_lead)
    ),
    by_source AS (
      SELECT
        first_lead AS lead_type,
        count(*)::integer AS cnt,
        coalesce(sum(amount), 0)::numeric AS revenue
      FROM conversions
      GROUP BY first_lead
    ),
    by_tech AS (
      SELECT
        coalesce(prev_tech_id::text, '__unassigned__') AS technician_key,
        prev_tech_id AS technician_id,
        count(*)::integer AS cnt,
        coalesce(sum(amount), 0)::numeric AS revenue
      FROM conversions
      WHERE prev_tech_id IS NOT NULL
      GROUP BY prev_tech_id
    )
    SELECT jsonb_build_object(
      'total_jobs', coalesce((SELECT sum(cnt) FROM by_source), 0),
      'total_revenue', coalesce((SELECT sum(revenue) FROM by_source), 0),
      'by_original_source', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('lead_type', b.lead_type, 'count', b.cnt, 'revenue', b.revenue)
          ORDER BY b.cnt DESC
        )
        FROM by_source b
      ), '[]'::jsonb),
      'by_technician', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'technician_id', t.technician_id,
            'technician_key', t.technician_key,
            'count', t.cnt,
            'revenue', t.revenue
          )
          ORDER BY t.revenue DESC, t.cnt DESC
        )
        FROM by_tech t
      ), '[]'::jsonb)
    )
    INTO result;
  ELSE
    WITH period_customers AS (
      SELECT DISTINCT j.customer_id
      FROM public.jobs j
      WHERE j.customer_id IS NOT NULL
        AND public.analytics_job_in_period(
          j.status, j.created_at, j.end_time, j.completed_at, v_start, v_end
        )
    ),
    relevant_jobs AS (
      SELECT
        j.id,
        j.customer_id,
        j.status,
        j.created_at,
        j.end_time,
        j.completed_at,
        j.lead_source,
        j.assigned_by,
        j.assigned_technician_id,
        j.payment_amount,
        j.actual_cost
      FROM public.jobs j
      INNER JOIN period_customers pc ON pc.customer_id = j.customer_id
    ),
    resolved AS (
      SELECT
        r.*,
        public.analytics_resolve_lead_source(r.lead_source, r.assigned_by) AS resolved_lead
      FROM relevant_jobs r
    ),
    first_touch AS (
      SELECT DISTINCT ON (customer_id)
        customer_id,
        public.analytics_normalize_lead_type(resolved_lead) AS first_lead,
        created_at AS first_touch_at
      FROM resolved
      WHERE status = 'COMPLETED'
        AND public.analytics_is_first_touch_lead(resolved_lead)
      ORDER BY customer_id, created_at ASC
    ),
    conversions AS (
      SELECT
        ft.first_lead,
        j.id AS job_id,
        j.created_at,
        j.assigned_technician_id,
        public.analytics_job_billing(j.payment_amount, j.actual_cost) AS amount,
        (
          SELECT p.assigned_technician_id
          FROM resolved p
          WHERE p.customer_id = j.customer_id
            AND p.status = 'COMPLETED'
            AND p.id <> j.id
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) IS NOT NULL
            AND public.analytics_job_completed_at(p.end_time, p.completed_at) < j.created_at
          ORDER BY public.analytics_job_completed_at(p.end_time, p.completed_at) DESC
          LIMIT 1
        ) AS prev_tech_id
      FROM resolved j
      INNER JOIN first_touch ft ON ft.customer_id = j.customer_id
      WHERE j.status = 'COMPLETED'
        AND j.created_at > ft.first_touch_at
        AND public.analytics_is_direct_or_website_lead(j.resolved_lead)
        AND public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
        AND public.analytics_job_completed_at(j.end_time, j.completed_at) >= v_start
        AND public.analytics_job_completed_at(j.end_time, j.completed_at) <= v_end
    ),
    by_source AS (
      SELECT
        first_lead AS lead_type,
        count(*)::integer AS cnt,
        coalesce(sum(amount), 0)::numeric AS revenue
      FROM conversions
      GROUP BY first_lead
    ),
    by_tech AS (
      SELECT
        coalesce(prev_tech_id::text, '__unassigned__') AS technician_key,
        prev_tech_id AS technician_id,
        count(*)::integer AS cnt,
        coalesce(sum(amount), 0)::numeric AS revenue
      FROM conversions
      WHERE prev_tech_id IS NOT NULL
      GROUP BY prev_tech_id
    )
    SELECT jsonb_build_object(
      'total_jobs', coalesce((SELECT sum(cnt) FROM by_source), 0),
      'total_revenue', coalesce((SELECT sum(revenue) FROM by_source), 0),
      'by_original_source', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('lead_type', b.lead_type, 'count', b.cnt, 'revenue', b.revenue)
          ORDER BY b.cnt DESC
        )
        FROM by_source b
      ), '[]'::jsonb),
      'by_technician', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'technician_id', t.technician_id,
            'technician_key', t.technician_key,
            'count', t.cnt,
            'revenue', t.revenue
          )
          ORDER BY t.revenue DESC, t.cnt DESC
        )
        FROM by_tech t
      ), '[]'::jsonb)
    )
    INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_return_complaints(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_return_complaints(timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.get_analytics_direct_website_conversions(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_direct_website_conversions(timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.analytics_is_return_complaint(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_normalize_lead_type(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_is_direct_or_website_lead(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_is_first_touch_lead(text) FROM PUBLIC;
