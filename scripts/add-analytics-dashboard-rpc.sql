-- Pre-aggregated CRM analytics dashboard (admin-only). Replaces full jobs table fetch for KPIs.
-- Requires: public.is_admin_user(), jobs.lead_source (scripts/add-job-lead-source-column.sql)
-- Run once in Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.analytics_resolve_lead_source(
  p_lead_source text,
  p_assigned_by uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(btrim(p_lead_source), ''),
    CASE WHEN p_assigned_by IS NOT NULL THEN 'Admin Created' ELSE 'Direct call' END
  );
$$;

CREATE OR REPLACE FUNCTION public.analytics_job_billing(
  p_payment_amount numeric,
  p_actual_cost numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_payment_amount, 0) > 0 THEN p_payment_amount
    WHEN coalesce(p_actual_cost, 0) > 0 THEN p_actual_cost
    ELSE 0::numeric
  END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_job_completed_at(
  p_end_time timestamptz,
  p_completed_at timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_end_time, p_completed_at);
$$;

CREATE OR REPLACE FUNCTION public.analytics_job_in_period(
  p_status text,
  p_created_at timestamptz,
  p_end_time timestamptz,
  p_completed_at timestamptz,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_start IS NULL AND p_end IS NULL THEN true
    WHEN p_status = 'COMPLETED' THEN
      public.analytics_job_completed_at(p_end_time, p_completed_at) IS NOT NULL
      AND public.analytics_job_completed_at(p_end_time, p_completed_at) >= p_start
      AND public.analytics_job_completed_at(p_end_time, p_completed_at) <= p_end
    ELSE
      p_created_at >= p_start AND p_created_at <= p_end
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_analytics_dashboard(
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

  WITH period_jobs AS (
    SELECT
      j.id,
      j.status,
      j.created_at,
      j.end_time,
      j.completed_at,
      j.lead_source,
      j.assigned_by,
      j.assigned_technician_id,
      j.payment_amount,
      j.actual_cost,
      j.lead_cost,
      j.parts_cost_total,
      j.service_type,
      j.service_sub_type,
      j.payment_method
    FROM public.jobs j
    WHERE public.analytics_job_in_period(
      j.status, j.created_at, j.end_time, j.completed_at, v_start, v_end
    )
  ),
  completed_jobs AS (
    SELECT * FROM period_jobs WHERE status = 'COMPLETED'
  ),
  job_counts AS (
    SELECT
      count(*)::integer AS period_job_count,
      count(*) FILTER (WHERE status = 'COMPLETED')::integer AS completed_status,
      count(*) FILTER (WHERE status IN ('DENIED', 'CANCELLED'))::integer AS denied,
      count(*) FILTER (WHERE status = 'PENDING')::integer AS pending,
      count(*) FILTER (WHERE status = 'ASSIGNED')::integer AS assigned,
      count(*) FILTER (WHERE status = 'IN_PROGRESS')::integer AS in_progress
    FROM period_jobs
  ),
  completed_metrics AS (
    SELECT
      count(*)::integer AS completed_in_period_count,
      coalesce(sum(public.analytics_job_billing(payment_amount, actual_cost)), 0)::numeric AS billing_total,
      coalesce(sum(coalesce(parts_cost_total, 0)), 0)::numeric AS total_spare_parts_cost
    FROM completed_jobs
  ),
  lead_by_service AS (
    SELECT
      public.analytics_norm_key(public.analytics_resolve_lead_source(j.lead_source, j.assigned_by)) AS norm_key,
      public.analytics_resolve_lead_source(j.lead_source, j.assigned_by) AS raw_label,
      coalesce(nullif(btrim(j.service_sub_type), ''), 'Unknown') AS service_sub_type,
      count(*)::integer AS cnt,
      coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS amt,
      coalesce(sum(coalesce(j.lead_cost, 0)), 0)::numeric AS lead_cost_sum,
      coalesce(sum(coalesce(j.parts_cost_total, 0)), 0)::numeric AS spare_cost_sum
    FROM completed_jobs j
    GROUP BY 1, 2, 3
  ),
  lead_service_json AS (
    SELECT
      lbs.norm_key,
      jsonb_agg(
        jsonb_build_object(
          'service_type', lbs.service_sub_type,
          'count', lbs.cnt,
          'amount', lbs.amt
        )
        ORDER BY lbs.amt DESC
      ) AS service_types
    FROM lead_by_service lbs
    GROUP BY lbs.norm_key
  ),
  lead_source_breakdown AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'normalized_key', t.norm_key,
        'display_name', t.display_name,
        'count', t.count,
        'amount', t.amount,
        'lead_cost', t.lead_cost,
        'spare_cost', t.spare_cost,
        'service_types', coalesce(ls.service_types, '[]'::jsonb)
      )
      ORDER BY t.amount DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        lbs.norm_key,
        mode() WITHIN GROUP (ORDER BY lbs.raw_label) AS display_name,
        sum(lbs.cnt)::integer AS count,
        sum(lbs.amt)::numeric AS amount,
        sum(lbs.lead_cost_sum)::numeric AS lead_cost,
        sum(lbs.spare_cost_sum)::numeric AS spare_cost
      FROM lead_by_service lbs
      GROUP BY lbs.norm_key
    ) t
    LEFT JOIN lead_service_json ls ON ls.norm_key = t.norm_key
  ),
  service_type_breakdown AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'service_type', st.service_sub_type,
        'count', st.cnt,
        'amount', st.amt
      )
      ORDER BY st.amt DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        coalesce(nullif(btrim(j.service_sub_type), ''), 'Unknown') AS service_sub_type,
        count(*)::integer AS cnt,
        coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS amt
      FROM completed_jobs j
      GROUP BY 1
    ) st
  ),
  payment_method_breakdown AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'method', pm.payment_method,
        'count', pm.cnt,
        'amount', pm.amt
      )
      ORDER BY pm.amt DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        coalesce(nullif(btrim(j.payment_method), ''), 'Unknown') AS payment_method,
        count(*)::integer AS cnt,
        coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS amt
      FROM completed_jobs j
      GROUP BY 1
    ) pm
  ),
  daily_stats AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'date', d.day,
        'jobs', d.cnt,
        'revenue', d.revenue
      )
      ORDER BY d.day
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        to_char(
          public.analytics_job_completed_at(j.end_time, j.completed_at) AT TIME ZONE 'UTC',
          'YYYY-MM-DD'
        ) AS day,
        count(*)::integer AS cnt,
        coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS revenue
      FROM completed_jobs j
      WHERE public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
      GROUP BY 1
    ) d
  ),
  tech_by_service AS (
    SELECT
      j.assigned_technician_id AS technician_id,
      coalesce(nullif(btrim(j.service_sub_type), ''), 'Unknown') AS service_sub_type,
      count(*) FILTER (WHERE j.status = 'COMPLETED')::integer AS completed_cnt,
      coalesce(
        sum(public.analytics_job_billing(j.payment_amount, j.actual_cost))
          FILTER (WHERE j.status = 'COMPLETED'),
        0
      )::numeric AS completed_amt,
      count(*)::integer AS total_cnt
    FROM period_jobs j
    WHERE j.assigned_technician_id IS NOT NULL
    GROUP BY 1, 2
  ),
  tech_service_json AS (
    SELECT
      tbs.technician_id,
      jsonb_agg(
        jsonb_build_object(
          'service_type', tbs.service_sub_type,
          'count', tbs.completed_cnt,
          'amount', tbs.completed_amt
        )
        ORDER BY tbs.completed_amt DESC
      ) AS service_types
    FROM tech_by_service tbs
    WHERE tbs.completed_cnt > 0
    GROUP BY tbs.technician_id
  ),
  technician_stats AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'technician_id', t.technician_id,
        'total_jobs', t.total_jobs,
        'completed_jobs', t.completed_jobs,
        'period_earnings', t.period_earnings,
        'service_types', coalesce(tsj.service_types, '[]'::jsonb)
      )
      ORDER BY t.completed_jobs DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        pj.assigned_technician_id AS technician_id,
        count(*)::integer AS total_jobs,
        count(*) FILTER (WHERE pj.status = 'COMPLETED')::integer AS completed_jobs,
        coalesce(
          sum(public.analytics_job_billing(pj.payment_amount, pj.actual_cost))
            FILTER (WHERE pj.status = 'COMPLETED'),
          0
        )::numeric AS period_earnings
      FROM period_jobs pj
      WHERE pj.assigned_technician_id IS NOT NULL
      GROUP BY pj.assigned_technician_id
    ) t
    LEFT JOIN tech_service_json tsj ON tsj.technician_id = t.technician_id
  ),
  softener_period AS (
    SELECT * FROM period_jobs
    WHERE upper(coalesce(service_type, '')) = 'SOFTENER'
  ),
  softener_completed AS (
    SELECT * FROM softener_period WHERE status = 'COMPLETED'
  ),
  softener_counts AS (
    SELECT
      count(*)::integer AS period_job_count,
      count(*) FILTER (WHERE status = 'COMPLETED')::integer AS completed_status,
      count(*) FILTER (WHERE status IN ('DENIED', 'CANCELLED'))::integer AS denied,
      count(*) FILTER (WHERE status = 'PENDING')::integer AS pending,
      count(*) FILTER (WHERE status = 'ASSIGNED')::integer AS assigned,
      count(*) FILTER (WHERE status = 'IN_PROGRESS')::integer AS in_progress
    FROM softener_period
  ),
  softener_completed_metrics AS (
    SELECT
      count(*)::integer AS completed_in_period_count,
      coalesce(sum(public.analytics_job_billing(payment_amount, actual_cost)), 0)::numeric AS billing_total
    FROM softener_completed
  ),
  softener_service_type AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('service_type', st.service_sub_type, 'count', st.cnt, 'amount', st.amt)
      ORDER BY st.amt DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        coalesce(nullif(btrim(j.service_sub_type), ''), 'Unknown') AS service_sub_type,
        count(*)::integer AS cnt,
        coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS amt
      FROM softener_completed j
      GROUP BY 1
    ) st
  ),
  softener_payment AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('method', pm.payment_method, 'count', pm.cnt, 'amount', pm.amt)
      ORDER BY pm.amt DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        coalesce(nullif(btrim(j.payment_method), ''), 'Unknown') AS payment_method,
        count(*)::integer AS cnt,
        coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS amt
      FROM softener_completed j
      GROUP BY 1
    ) pm
  ),
  softener_daily AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('date', d.day, 'jobs', d.cnt, 'revenue', d.revenue)
      ORDER BY d.day
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        to_char(
          public.analytics_job_completed_at(j.end_time, j.completed_at) AT TIME ZONE 'UTC',
          'YYYY-MM-DD'
        ) AS day,
        count(*)::integer AS cnt,
        coalesce(sum(public.analytics_job_billing(j.payment_amount, j.actual_cost)), 0)::numeric AS revenue
      FROM softener_completed j
      WHERE public.analytics_job_completed_at(j.end_time, j.completed_at) IS NOT NULL
      GROUP BY 1
    ) d
  ),
  softener_tech AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'technician_id', t.technician_id,
        'total_jobs', t.total_jobs,
        'completed_jobs', t.completed_jobs,
        'period_earnings', t.period_earnings
      )
      ORDER BY t.completed_jobs DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT
        sp.assigned_technician_id AS technician_id,
        count(*)::integer AS total_jobs,
        count(*) FILTER (WHERE sp.status = 'COMPLETED')::integer AS completed_jobs,
        coalesce(
          sum(public.analytics_job_billing(sp.payment_amount, sp.actual_cost))
            FILTER (WHERE sp.status = 'COMPLETED'),
          0
        )::numeric AS period_earnings
      FROM softener_period sp
      WHERE sp.assigned_technician_id IS NOT NULL
      GROUP BY sp.assigned_technician_id
    ) t
  )
  SELECT jsonb_build_object(
    'period_job_count', jc.period_job_count,
    'status_counts', jsonb_build_object(
      'completed', jc.completed_status,
      'denied', jc.denied,
      'pending', jc.pending,
      'assigned', jc.assigned,
      'in_progress', jc.in_progress
    ),
    'completed_in_period_count', cm.completed_in_period_count,
    'billing_total', cm.billing_total,
    'billing_average', CASE
      WHEN cm.completed_in_period_count > 0
      THEN round((cm.billing_total / cm.completed_in_period_count)::numeric, 2)
      ELSE 0
    END,
    'total_spare_parts_cost', cm.total_spare_parts_cost,
    'lead_source_breakdown', (SELECT rows FROM lead_source_breakdown),
    'service_type_breakdown', (SELECT rows FROM service_type_breakdown),
    'payment_method_breakdown', (SELECT rows FROM payment_method_breakdown),
    'daily_stats', (SELECT rows FROM daily_stats),
    'technician_stats', (SELECT rows FROM technician_stats),
    'softener', jsonb_build_object(
      'period_job_count', sc.period_job_count,
      'status_counts', jsonb_build_object(
        'completed', sc.completed_status,
        'denied', sc.denied,
        'pending', sc.pending,
        'assigned', sc.assigned,
        'in_progress', sc.in_progress
      ),
      'completed_in_period_count', scm.completed_in_period_count,
      'billing_total', scm.billing_total,
      'billing_average', CASE
        WHEN scm.completed_in_period_count > 0
        THEN round((scm.billing_total / scm.completed_in_period_count)::numeric, 2)
        ELSE 0
      END,
      'service_type_breakdown', (SELECT rows FROM softener_service_type),
      'payment_method_breakdown', (SELECT rows FROM softener_payment),
      'daily_stats', (SELECT rows FROM softener_daily),
      'technician_stats', (SELECT rows FROM softener_tech)
    )
  )
  INTO result
  FROM job_counts jc
  CROSS JOIN completed_metrics cm
  CROSS JOIN softener_counts sc
  CROSS JOIN softener_completed_metrics scm;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_dashboard(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_dashboard(timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.analytics_resolve_lead_source(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_job_billing(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_job_completed_at(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_job_in_period(text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
