-- Server-side analytics pagination (aggregate in DB; return one page + total count).
-- Run in Supabase SQL editor. Requires public.is_admin_user().

DROP FUNCTION IF EXISTS public.get_website_analytics_recent_events(date, date, text, integer);

CREATE OR REPLACE FUNCTION public.analytics_norm_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(t), '') IS NULL THEN '__unknown__'
    ELSE lower(regexp_replace(regexp_replace(btrim(t), '\.', '', 'g'), '\s+', '', 'g'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_is_installation(st text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    lower(coalesce(st, '')) ~ 'installation|reinstallation|uninstallation|re[[:space:]]*install|un[[:space:]]*install',
    false
  );
$$;

-- Recent website analytics events (paginated).
CREATE OR REPLACE FUNCTION public.get_website_analytics_recent_events(
  p_from_date date,
  p_to_date date,
  p_site_key text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_d date;
  to_d date;
  lim integer;
  off integer;
  total_count integer;
  rows_json jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  from_d := LEAST(COALESCE(p_from_date, CURRENT_DATE), COALESCE(p_to_date, CURRENT_DATE));
  to_d := GREATEST(COALESCE(p_from_date, CURRENT_DATE), COALESCE(p_to_date, CURRENT_DATE));
  lim := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
  off := GREATEST(0, COALESCE(p_offset, 0));

  SELECT count(*)::integer
  INTO total_count
  FROM public.website_analytics_events e
  WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= from_d
    AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
    AND (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO rows_json
  FROM (
    SELECT
      e.id,
      e.site_key,
      e.event_type,
      e.page_path,
      e.created_at,
      e.metadata
    FROM public.website_analytics_events e
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= from_d
      AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
      AND (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key)
    ORDER BY e.created_at DESC
    LIMIT lim OFFSET off
  ) r;

  RETURN jsonb_build_object('total', total_count, 'rows', rows_json);
END;
$$;

REVOKE ALL ON FUNCTION public.get_website_analytics_recent_events(date, date, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_analytics_recent_events(date, date, text, integer, integer) TO authenticated;

-- Top locations (aggregated, paginated).
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
      SELECT j.id, j.payment_amount, j.actual_cost, j.service_sub_type, j.customer_id
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
        c.raw_water_tds
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

-- Top brands (aggregated, paginated).
CREATE OR REPLACE FUNCTION public.get_analytics_top_brands(
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
      SELECT j.id, j.payment_amount, j.actual_cost, j.service_sub_type, j.brand, j.customer_id
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
        public.analytics_norm_key(coalesce(nullif(btrim(j.brand), ''), nullif(btrim(c.brand), ''), '')) AS brand_key,
        coalesce(nullif(btrim(j.brand), ''), nullif(btrim(c.brand), ''), 'Unknown') AS display_label,
        coalesce(j.payment_amount, j.actual_cost, 0)::numeric AS revenue,
        j.service_sub_type
      FROM period_jobs j
      JOIN public.customers c ON c.id = j.customer_id
    ),
    grouped AS (
      SELECT
        jr.brand_key,
        mode() WITHIN GROUP (ORDER BY jr.display_label) AS display_name,
        count(*)::integer AS job_count,
        sum(jr.revenue)::numeric AS total_revenue,
        sum(CASE WHEN public.analytics_is_installation(jr.service_sub_type) THEN 1 ELSE 0 END)::integer AS installation,
        sum(CASE WHEN NOT public.analytics_is_installation(jr.service_sub_type) THEN 1 ELSE 0 END)::integer AS service
      FROM job_rows jr
      GROUP BY jr.brand_key
    ),
    filtered AS (
      SELECT
        g.brand_key,
        g.display_name,
        g.job_count,
        g.total_revenue,
        g.installation,
        g.service,
        CASE WHEN g.job_count > 0 THEN (g.total_revenue / g.job_count) ELSE 0 END AS avg_call_billing
      FROM grouped g
      WHERE coalesce(p_search, '') = ''
        OR g.display_name ILIKE '%' || btrim(p_search) || '%'
        OR g.brand_key LIKE '%' || search_norm || '%'
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*)::integer FROM filtered),
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'brand_key', f.brand_key,
            'display_name', f.display_name,
            'job_count', f.job_count,
            'total_revenue', f.total_revenue,
            'service_type_breakdown', jsonb_build_object('Installation', f.installation, 'Service', f.service),
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

REVOKE ALL ON FUNCTION public.get_analytics_top_brands(timestamptz, timestamptz, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_top_brands(timestamptz, timestamptz, integer, integer, text) TO authenticated;

-- Spare parts usage (aggregated, paginated).
CREATE OR REPLACE FUNCTION public.get_analytics_spare_parts_usage(
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
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  lim := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
  off := GREATEST(0, COALESCE(p_offset, 0));

  RETURN (
    WITH raw_parts AS (
      SELECT
        CASE
          WHEN jpu.inventory_id IS NOT NULL THEN jpu.inventory_id::text
          ELSE 'custom:' || lower(coalesce(nullif(btrim(jpu.custom_name), ''), 'custom item'))
        END AS part_key,
        coalesce(i.product_name, nullif(btrim(jpu.custom_name), ''), 'Unknown part') AS product_name,
        coalesce(jpu.quantity_used, 0)::numeric AS qty,
        coalesce(jpu.quantity_used, 0) * coalesce(jpu.price_at_time_of_use, i.price, 0)::numeric AS line_value,
        jpu.job_id
      FROM public.job_parts_used jpu
      LEFT JOIN public.inventory i ON i.id = jpu.inventory_id
      WHERE (p_start IS NULL OR jpu.created_at >= p_start)
        AND (p_end IS NULL OR jpu.created_at <= p_end)
    ),
    grouped AS (
      SELECT
        rp.part_key,
        mode() WITHIN GROUP (ORDER BY rp.product_name) AS product_name,
        sum(rp.qty)::integer AS total_qty,
        sum(rp.line_value)::numeric AS total_value,
        count(DISTINCT rp.job_id)::integer AS job_count
      FROM raw_parts rp
      GROUP BY rp.part_key
    ),
    filtered AS (
      SELECT * FROM grouped g
      WHERE coalesce(p_search, '') = ''
        OR g.product_name ILIKE '%' || btrim(p_search) || '%'
    ),
    summary AS (
      SELECT
        count(*)::integer AS distinct_parts,
        coalesce(sum(total_qty), 0)::integer AS units_used,
        coalesce(sum(total_value), 0)::numeric AS parts_value
      FROM filtered
    )
    SELECT jsonb_build_object(
      'total', (SELECT distinct_parts FROM summary),
      'summary', (
        SELECT jsonb_build_object(
          'distinct_parts', s.distinct_parts,
          'units_used', s.units_used,
          'parts_value', s.parts_value
        )
        FROM summary s
      ),
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'part_key', f.part_key,
            'product_name', f.product_name,
            'total_qty', f.total_qty,
            'total_value', f.total_value,
            'job_count', f.job_count
          )
          ORDER BY f.total_qty DESC, f.product_name
        )
        FROM (
          SELECT * FROM filtered
          ORDER BY total_qty DESC, product_name
          LIMIT lim OFFSET off
        ) f
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_spare_parts_usage(timestamptz, timestamptz, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_spare_parts_usage(timestamptz, timestamptz, integer, integer, text) TO authenticated;
