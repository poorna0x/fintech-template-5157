-- Customer spread map: grid cells with jobs, billing, and top brands.
-- Admin-only. Safe to re-run.

CREATE OR REPLACE FUNCTION public.analytics_json_coord(loc jsonb, k text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN loc IS NULL OR k IS NULL THEN NULL
    WHEN nullif(btrim(loc->>k), '') IS NULL THEN NULL
    WHEN (loc->>k) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (loc->>k)::numeric
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_analytics_customer_spread(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_cell_km numeric DEFAULT 1.2
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cell_deg numeric;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  cell_deg := GREATEST(0.0045, LEAST(0.045, COALESCE(p_cell_km, 1.2) / 111.32));

  RETURN (
    WITH period_jobs AS (
      SELECT
        j.id,
        j.customer_id,
        j.payment_amount,
        j.actual_cost,
        j.service_sub_type,
        j.brand,
        j.model
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
    located AS (
      SELECT
        j.id,
        j.customer_id,
        CASE
          WHEN coalesce(j.payment_amount, 0) > 0 THEN j.payment_amount
          ELSE coalesce(j.actual_cost, 0)
        END::numeric AS revenue,
        j.service_sub_type,
        public.analytics_norm_key(
          coalesce(x.brand_name, '') || '|' || coalesce(x.model_name, '')
        ) AS brand_key,
        coalesce(
          nullif(btrim(concat_ws(' · ', x.brand_name, x.model_name)), ''),
          'Unknown'
        ) AS brand_label,
        coalesce(
          nullif(btrim(c.visible_address), ''),
          nullif(btrim(c.address->>'visible_address'), ''),
          nullif(btrim(c.address->>'area'), ''),
          'Unknown'
        ) AS area_label,
        c.raw_water_tds,
        coalesce(
          public.analytics_json_coord(c.location, 'latitude'),
          public.analytics_json_coord(c.location, 'lat')
        ) AS lat,
        coalesce(
          public.analytics_json_coord(c.location, 'longitude'),
          public.analytics_json_coord(c.location, 'lng')
        ) AS lng
      FROM period_jobs j
      JOIN public.customers c ON c.id = j.customer_id
      CROSS JOIN LATERAL (
        SELECT
          coalesce(nullif(btrim(j.brand), ''), nullif(btrim(c.brand), '')) AS brand_name,
          coalesce(nullif(btrim(j.model), ''), nullif(btrim(c.model), '')) AS model_name
      ) x
    ),
    valid AS (
      SELECT *
      FROM located
      WHERE lat IS NOT NULL
        AND lng IS NOT NULL
        AND lat BETWEEN -90 AND 90
        AND lng BETWEEN -180 AND 180
        AND NOT (lat = 0 AND lng = 0)
    ),
    gridded AS (
      SELECT
        v.*,
        round(v.lat / cell_deg) * cell_deg AS cell_lat,
        round(v.lng / cell_deg) * cell_deg AS cell_lng
      FROM valid v
    ),
    brand_counts AS (
      SELECT
        g.cell_lat,
        g.cell_lng,
        g.brand_key,
        mode() WITHIN GROUP (ORDER BY g.brand_label) AS brand_label,
        count(*)::integer AS jobs,
        sum(g.revenue)::numeric AS revenue
      FROM gridded g
      GROUP BY g.cell_lat, g.cell_lng, g.brand_key
    ),
    brand_ranked AS (
      SELECT
        b.*,
        row_number() OVER (
          PARTITION BY b.cell_lat, b.cell_lng
          ORDER BY b.jobs DESC, b.revenue DESC, b.brand_label
        ) AS rn
      FROM brand_counts b
    ),
    cells AS (
      SELECT
        g.cell_lat,
        g.cell_lng,
        count(DISTINCT g.customer_id)::integer AS customers,
        count(*)::integer AS jobs,
        sum(g.revenue)::numeric AS revenue,
        mode() WITHIN GROUP (ORDER BY g.area_label) AS area,
        sum(CASE WHEN public.analytics_is_installation(g.service_sub_type) THEN 1 ELSE 0 END)::integer AS installation,
        sum(CASE WHEN NOT public.analytics_is_installation(g.service_sub_type) THEN 1 ELSE 0 END)::integer AS service,
        sum(CASE WHEN g.raw_water_tds IS NOT NULL AND g.raw_water_tds > 0 THEN g.raw_water_tds ELSE 0 END)::numeric AS tds_sum,
        sum(CASE WHEN g.raw_water_tds IS NOT NULL AND g.raw_water_tds > 0 THEN 1 ELSE 0 END)::integer AS tds_count
      FROM gridded g
      GROUP BY g.cell_lat, g.cell_lng
    ),
    cell_brands AS (
      SELECT
        cell_lat,
        cell_lng,
        jsonb_agg(
          jsonb_build_object(
            'name', brand_label,
            'jobs', jobs,
            'revenue', revenue
          )
          ORDER BY rn
        ) FILTER (WHERE rn <= 3) AS brands,
        max(brand_label) FILTER (WHERE rn = 1) AS top_brand,
        max(jobs) FILTER (WHERE rn = 1) AS top_brand_jobs
      FROM brand_ranked
      GROUP BY cell_lat, cell_lng
    ),
    ranked_cells AS (
      SELECT
        c.cell_lat,
        c.cell_lng,
        c.customers,
        c.jobs,
        c.revenue,
        c.area,
        c.installation,
        c.service,
        CASE WHEN c.jobs > 0 THEN round(c.revenue / c.jobs, 0) ELSE 0 END AS avg_bill,
        CASE WHEN c.tds_count > 0 THEN round(c.tds_sum / c.tds_count, 1) ELSE NULL END AS avg_tds,
        cb.brands,
        cb.top_brand,
        cb.top_brand_jobs,
        CASE WHEN c.jobs > 0 THEN round((cb.top_brand_jobs::numeric / c.jobs) * 100, 0) ELSE 0 END AS top_brand_share
      FROM cells c
      JOIN cell_brands cb ON cb.cell_lat = c.cell_lat AND cb.cell_lng = c.cell_lng
    )
    SELECT jsonb_build_object(
      'cell_km', round((cell_deg * 111.32)::numeric, 2),
      'jobs_total', (SELECT count(*)::integer FROM located),
      'jobs_with_pin', (SELECT count(*)::integer FROM valid),
      'customers_with_pin', (SELECT count(DISTINCT customer_id)::integer FROM valid),
      'cells', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'lat', r.cell_lat,
            'lng', r.cell_lng,
            'customers', r.customers,
            'jobs', r.jobs,
            'revenue', r.revenue,
            'avg_bill', r.avg_bill,
            'avg_tds', r.avg_tds,
            'area', r.area,
            'installation', r.installation,
            'service', r.service,
            'top_brand', r.top_brand,
            'top_brand_jobs', r.top_brand_jobs,
            'top_brand_share', r.top_brand_share,
            'brands', coalesce(r.brands, '[]'::jsonb)
          )
          ORDER BY r.customers DESC, r.revenue DESC
        )
        FROM (
          SELECT * FROM ranked_cells
          ORDER BY customers DESC, revenue DESC
          LIMIT 200
        ) r
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_customer_spread(timestamptz, timestamptz, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_customer_spread(timestamptz, timestamptz, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.analytics_json_coord(jsonb, text) FROM PUBLIC;
