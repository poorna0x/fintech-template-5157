-- Step 4: repeat vs new customers RPC + website analytics summary by date range.
-- Requires: public.is_admin_user(), analytics helpers from add-analytics-dashboard-rpc.sql

-- ─── Repeat vs new customers (on-demand analytics) ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_analytics_repeat_vs_new(
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
    WITH recent_jobs AS (
      SELECT
        j.customer_id,
        j.created_at,
        j.status,
        j.payment_amount,
        j.actual_cost
      FROM public.jobs j
      WHERE j.customer_id IS NOT NULL
      ORDER BY j.created_at DESC
      LIMIT 8000
    ),
    returning_customers AS (
      SELECT customer_id
      FROM recent_jobs
      GROUP BY customer_id
      HAVING count(*) > 1
    ),
    customer_stats AS (
      SELECT
        rj.customer_id,
        (rc.customer_id IS NULL) AS is_new_customer,
        coalesce(
          sum(
            CASE
              WHEN rj.status = 'COMPLETED'
              THEN public.analytics_job_billing(rj.payment_amount, rj.actual_cost)
              ELSE 0
            END
          ),
          0
        )::numeric AS revenue
      FROM recent_jobs rj
      LEFT JOIN returning_customers rc ON rc.customer_id = rj.customer_id
      GROUP BY rj.customer_id, (rc.customer_id IS NULL)
    ),
    customer_months AS (
      SELECT DISTINCT
        rj.customer_id,
        to_char(rj.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key,
        (rc.customer_id IS NULL) AS is_new_customer,
        min(to_char(rj.created_at AT TIME ZONE 'UTC', 'YYYY-MM'))
          OVER (PARTITION BY rj.customer_id) AS first_month
      FROM recent_jobs rj
      LEFT JOIN returning_customers rc ON rc.customer_id = rj.customer_id
    ),
    monthly AS (
      SELECT
        cm.month_key,
        count(*) FILTER (
          WHERE cm.is_new_customer AND cm.month_key = cm.first_month
        )::integer AS new_customers,
        count(*) FILTER (
          WHERE NOT cm.is_new_customer OR cm.month_key <> cm.first_month
        )::integer AS returning_customers,
        coalesce((
          SELECT sum(public.analytics_job_billing(rj.payment_amount, rj.actual_cost))
          FROM recent_jobs rj
          WHERE rj.status = 'COMPLETED'
            AND to_char(rj.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = cm.month_key
        ), 0)::numeric AS revenue
      FROM customer_months cm
      GROUP BY cm.month_key
    )
    SELECT jsonb_build_object(
      'active_customers', (SELECT count(*)::integer FROM customer_stats),
      'new_customers', (SELECT count(*)::integer FROM customer_stats WHERE is_new_customer),
      'repeat_customers', (SELECT count(*)::integer FROM customer_stats WHERE NOT is_new_customer),
      'repeat_rate', CASE
        WHEN (SELECT count(*) FROM customer_stats) > 0
        THEN round(
          (
            (SELECT count(*)::numeric FROM customer_stats WHERE NOT is_new_customer)
            / (SELECT count(*)::numeric FROM customer_stats)
          ) * 100,
          2
        )
        ELSE 0
      END,
      'new_revenue', coalesce((SELECT sum(revenue) FROM customer_stats WHERE is_new_customer), 0),
      'repeat_revenue', coalesce((SELECT sum(revenue) FROM customer_stats WHERE NOT is_new_customer), 0),
      'is_all_time', true,
      'monthly', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'month', m.month_key,
            'new_customers', m.new_customers,
            'returning_customers', m.returning_customers,
            'revenue', m.revenue
          )
          ORDER BY m.month_key
        )
        FROM monthly m
      ), '[]'::jsonb)
    )
    INTO result;
  ELSE
    WITH period_jobs AS (
      SELECT
        j.customer_id,
        j.created_at,
        j.status,
        j.payment_amount,
        j.actual_cost
      FROM public.jobs j
      WHERE j.customer_id IS NOT NULL
        AND j.created_at >= v_start
        AND j.created_at <= v_end
    ),
    returning_customers AS (
      SELECT DISTINCT pj.customer_id
      FROM period_jobs pj
      WHERE EXISTS (
        SELECT 1
        FROM public.jobs old
        WHERE old.customer_id = pj.customer_id
          AND old.created_at < v_start
      )
    ),
    customer_stats AS (
      SELECT
        pj.customer_id,
        (rc.customer_id IS NULL) AS is_new_customer,
        coalesce(
          sum(
            CASE
              WHEN pj.status = 'COMPLETED'
              THEN public.analytics_job_billing(pj.payment_amount, pj.actual_cost)
              ELSE 0
            END
          ),
          0
        )::numeric AS revenue
      FROM period_jobs pj
      LEFT JOIN returning_customers rc ON rc.customer_id = pj.customer_id
      GROUP BY pj.customer_id, (rc.customer_id IS NULL)
    ),
    customer_months AS (
      SELECT DISTINCT
        pj.customer_id,
        to_char(pj.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key,
        (rc.customer_id IS NULL) AS is_new_customer,
        min(to_char(pj.created_at AT TIME ZONE 'UTC', 'YYYY-MM'))
          OVER (PARTITION BY pj.customer_id) AS first_month
      FROM period_jobs pj
      LEFT JOIN returning_customers rc ON rc.customer_id = pj.customer_id
    ),
    monthly AS (
      SELECT
        cm.month_key,
        count(*) FILTER (
          WHERE cm.is_new_customer AND cm.month_key = cm.first_month
        )::integer AS new_customers,
        count(*) FILTER (
          WHERE NOT cm.is_new_customer OR cm.month_key <> cm.first_month
        )::integer AS returning_customers,
        coalesce((
          SELECT sum(public.analytics_job_billing(pj.payment_amount, pj.actual_cost))
          FROM period_jobs pj
          WHERE pj.status = 'COMPLETED'
            AND to_char(pj.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = cm.month_key
        ), 0)::numeric AS revenue
      FROM customer_months cm
      GROUP BY cm.month_key
    )
    SELECT jsonb_build_object(
      'active_customers', (SELECT count(*)::integer FROM customer_stats),
      'new_customers', (SELECT count(*)::integer FROM customer_stats WHERE is_new_customer),
      'repeat_customers', (SELECT count(*)::integer FROM customer_stats WHERE NOT is_new_customer),
      'repeat_rate', CASE
        WHEN (SELECT count(*) FROM customer_stats) > 0
        THEN round(
          (
            (SELECT count(*)::numeric FROM customer_stats WHERE NOT is_new_customer)
            / (SELECT count(*)::numeric FROM customer_stats)
          ) * 100,
          2
        )
        ELSE 0
      END,
      'new_revenue', coalesce((SELECT sum(revenue) FROM customer_stats WHERE is_new_customer), 0),
      'repeat_revenue', coalesce((SELECT sum(revenue) FROM customer_stats WHERE NOT is_new_customer), 0),
      'is_all_time', false,
      'monthly', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'month', m.month_key,
            'new_customers', m.new_customers,
            'returning_customers', m.returning_customers,
            'revenue', m.revenue
          )
          ORDER BY m.month_key
        )
        FROM monthly m
      ), '[]'::jsonb)
    )
    INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_repeat_vs_new(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_repeat_vs_new(timestamptz, timestamptz) TO authenticated;

-- ─── Website analytics summary by IST date range ─────────────────────────────

DROP FUNCTION IF EXISTS public.get_website_analytics_summary(integer);

CREATE OR REPLACE FUNCTION public.get_website_analytics_summary(
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  from_d date;
  to_d date;
  today_ist date;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF p_from_date IS NULL AND p_to_date IS NULL THEN
    from_d := today_ist - 6;
    to_d := today_ist;
  ELSE
    from_d := LEAST(COALESCE(p_from_date, today_ist), COALESCE(p_to_date, today_ist));
    to_d := GREATEST(COALESCE(p_from_date, today_ist), COALESCE(p_to_date, today_ist));
  END IF;

  WITH filtered AS (
    SELECT e.*
    FROM public.website_analytics_events e
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= from_d
      AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
  ),
  today_stats AS (
    SELECT
      e.site_key,
      count(DISTINCT e.session_hash) FILTER (WHERE e.event_type = 'page_view') AS visitors,
      count(*) FILTER (WHERE e.event_type = 'page_view') AS page_views,
      count(*) FILTER (WHERE e.event_type = 'phone_click') AS phone_clicks,
      count(*) FILTER (WHERE e.event_type = 'whatsapp_click') AS whatsapp_clicks,
      count(*) FILTER (WHERE e.event_type = 'booking_click') AS booking_clicks,
      count(*) FILTER (WHERE e.event_type = 'booking_submit') AS booking_submits
    FROM filtered e
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = today_ist
      AND today_ist >= from_d
      AND today_ist <= to_d
    GROUP BY e.site_key
  ),
  daily AS (
    SELECT
      (e.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      e.site_key,
      count(DISTINCT e.session_hash) FILTER (WHERE e.event_type = 'page_view') AS visitors,
      count(*) FILTER (WHERE e.event_type = 'page_view') AS page_views,
      count(*) FILTER (WHERE e.event_type = 'phone_click') AS phone_clicks,
      count(*) FILTER (WHERE e.event_type = 'whatsapp_click') AS whatsapp_clicks,
      count(*) FILTER (WHERE e.event_type = 'booking_click') AS booking_clicks,
      count(*) FILTER (WHERE e.event_type = 'booking_submit') AS booking_submits
    FROM filtered e
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2
  )
  SELECT jsonb_build_object(
    'today', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.site_key) FROM today_stats t), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day DESC, d.site_key) FROM daily d), '[]'::jsonb),
    'days', (to_d - from_d + 1),
    'from_date', from_d,
    'to_date', to_d
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_website_analytics_summary(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_analytics_summary(date, date) TO authenticated;
