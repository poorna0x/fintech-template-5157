-- Lead-source performance trend: completed jobs by resolved lead source over time.
-- Mirrors business trend filters (company brand, service type, granularity).
-- Requires: analytics_job_completed_at, analytics_job_billing, analytics_resolve_lead_source,
--           analytics_norm_key, is_admin_user().
-- Run in Supabase SQL editor (safe to re-run).

CREATE OR REPLACE FUNCTION public.get_analytics_lead_source_trend(
  p_start timestamptz,
  p_end timestamptz,
  p_granularity text DEFAULT 'month',
  p_service_type text DEFAULT NULL,
  p_service_brand text DEFAULT NULL
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
  v_catalog_start timestamptz;
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

  v_catalog_start := date_trunc('month', (now() AT TIME ZONE 'UTC') - interval '36 months');

  RETURN (
    WITH completed_raw AS (
      SELECT
        j.id,
        j.service_type,
        j.service_brand,
        public.analytics_job_completed_at(j.end_time, j.completed_at) AS completed_at_ts,
        public.analytics_job_billing(j.payment_amount, j.actual_cost) AS revenue,
        public.analytics_resolve_lead_source(j.lead_source, j.assigned_by, j.requirements) AS resolved_lead
      FROM public.jobs j
      WHERE j.status = 'COMPLETED'
        AND public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
        AND public.analytics_job_completed_at(j.end_time, j.completed_at) >= LEAST(v_start, v_catalog_start)
        AND public.analytics_job_completed_at(j.end_time, j.completed_at) <= v_end
    ),
    filtered AS (
      SELECT
        r.*,
        coalesce(nullif(btrim(r.resolved_lead), ''), 'Direct call') AS lead_label,
        public.analytics_norm_key(coalesce(nullif(btrim(r.resolved_lead), ''), 'Direct call')) AS lead_key
      FROM completed_raw r
      WHERE (
        p_service_type IS NULL
        OR upper(btrim(r.service_type)) = upper(btrim(p_service_type))
      )
      AND (
        p_service_brand IS NULL
        OR coalesce(nullif(btrim(r.service_brand), ''), 'hydrogenro') = lower(btrim(p_service_brand))
      )
    ),
    primary_jobs AS (
      SELECT * FROM filtered
      WHERE completed_at_ts >= v_start AND completed_at_ts <= v_end
    ),
    catalog_jobs AS (
      SELECT * FROM filtered
      WHERE completed_at_ts >= v_catalog_start
    ),
    perioded AS (
      SELECT
        pj.*,
        CASE
          WHEN v_granularity = 'day' THEN to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          WHEN v_granularity = 'week' THEN to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'IYYY-"W"IW')
          ELSE to_char(pj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM')
        END AS period_key
      FROM primary_jobs pj
    ),
    source_totals AS (
      SELECT
        lead_key,
        max(lead_label) AS lead_label,
        count(*)::integer AS jobs,
        coalesce(sum(revenue), 0)::numeric AS revenue
      FROM primary_jobs
      GROUP BY lead_key
    ),
    period_source AS (
      SELECT
        period_key,
        lead_key,
        max(lead_label) AS lead_label,
        count(*)::integer AS jobs,
        coalesce(sum(revenue), 0)::numeric AS revenue
      FROM perioded
      GROUP BY period_key, lead_key
    ),
    period_totals AS (
      SELECT
        period_key,
        count(*)::integer AS jobs,
        coalesce(sum(revenue), 0)::numeric AS revenue
      FROM perioded
      GROUP BY period_key
    ),
    catalog_month_source AS (
      SELECT
        to_char(cj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM') AS period_key,
        cj.lead_key,
        max(cj.lead_label) AS lead_label,
        count(*)::integer AS jobs,
        coalesce(sum(cj.revenue), 0)::numeric AS revenue
      FROM catalog_jobs cj
      GROUP BY 1, 2
    ),
    catalog_month_totals AS (
      SELECT
        to_char(cj.completed_at_ts AT TIME ZONE 'UTC', 'YYYY-MM') AS period_key,
        count(*)::integer AS jobs,
        coalesce(sum(cj.revenue), 0)::numeric AS revenue
      FROM catalog_jobs cj
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularity', v_granularity,
      'summary', jsonb_build_object(
        'jobs', coalesce((SELECT sum(jobs)::integer FROM source_totals), 0),
        'revenue', coalesce((SELECT sum(revenue) FROM source_totals), 0),
        'source_count', coalesce((SELECT count(*)::integer FROM source_totals), 0)
      ),
      'sources', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'key', s.lead_key,
            'label', s.lead_label,
            'jobs', s.jobs,
            'revenue', s.revenue,
            'avg_bill', CASE WHEN s.jobs > 0 THEN round(s.revenue / s.jobs, 2) ELSE 0 END
          )
          ORDER BY s.revenue DESC, s.jobs DESC, s.lead_label
        )
        FROM source_totals s
      ), '[]'::jsonb),
      'periods', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'period_key', pt.period_key,
            'jobs', pt.jobs,
            'revenue', pt.revenue,
            'sources', coalesce((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'key', ps.lead_key,
                  'label', ps.lead_label,
                  'jobs', ps.jobs,
                  'revenue', ps.revenue
                )
                ORDER BY ps.revenue DESC, ps.jobs DESC
              )
              FROM period_source ps
              WHERE ps.period_key = pt.period_key
            ), '[]'::jsonb)
          )
          ORDER BY pt.period_key
        )
        FROM period_totals pt
      ), '[]'::jsonb),
      'month_catalog', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'period_key', cmt.period_key,
            'jobs', cmt.jobs,
            'revenue', cmt.revenue,
            'sources', coalesce((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'key', cms.lead_key,
                  'label', cms.lead_label,
                  'jobs', cms.jobs,
                  'revenue', cms.revenue
                )
                ORDER BY cms.revenue DESC, cms.jobs DESC
              )
              FROM catalog_month_source cms
              WHERE cms.period_key = cmt.period_key
            ), '[]'::jsonb)
          )
          ORDER BY cmt.period_key DESC
        )
        FROM catalog_month_totals cmt
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_lead_source_trend(timestamptz, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_lead_source_trend(timestamptz, timestamptz, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.get_analytics_lead_source_trend IS
  'Admin Analytics: completed-job lead-source trend by month/week/day with optional service brand filter.';
