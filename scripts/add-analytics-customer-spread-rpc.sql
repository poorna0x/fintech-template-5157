-- Customer spread map: every pinned customer, plus period billing/brands.
-- Admin-only. Safe to re-run.

CREATE OR REPLACE FUNCTION public.analytics_json_coord(loc jsonb, k text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN loc IS NULL OR k IS NULL THEN NULL
    WHEN nullif(btrim(loc->>k), '') IS NULL THEN NULL
    WHEN btrim(loc->>k) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(loc->>k)::numeric
    ELSE NULL
  END;
$$;

-- Short locality for a pocket: prefer address.area, then last useful comma part of visible address.
-- Skips city/state/pincode so 6 km pockets are not titled with a full street.
CREATE OR REPLACE FUNCTION public.analytics_spread_area_label(p_area text, p_visible text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    CASE
      WHEN nullif(btrim(p_area), '') IS NULL THEN NULL
      WHEN btrim(p_area) ~* '^(bengaluru|bangalore|karnataka|india|in)$' THEN NULL
      ELSE btrim(p_area)
    END,
    (
      SELECT btrim(x.part)
      FROM unnest(string_to_array(replace(coalesce(p_visible, ''), '，', ','), ',')) WITH ORDINALITY AS x(part, ord)
      WHERE btrim(x.part) <> ''
        AND btrim(x.part) !~* '^(bengaluru|bangalore|karnataka|india|in)$'
        AND btrim(x.part) !~* 'karnataka'
        AND btrim(x.part) !~ '^[0-9]{3,6}$'
        AND char_length(btrim(x.part)) BETWEEN 2 AND 48
      ORDER BY x.ord DESC
      LIMIT 1
    ),
    CASE
      WHEN char_length(btrim(coalesce(p_visible, ''))) BETWEEN 2 AND 48 THEN btrim(p_visible)
      ELSE NULL
    END
  );
$$;

DROP FUNCTION IF EXISTS public.get_analytics_customer_spread(timestamptz, timestamptz, numeric);
DROP FUNCTION IF EXISTS public.get_analytics_customer_spread(timestamptz, timestamptz, numeric, boolean);

CREATE OR REPLACE FUNCTION public.get_analytics_customer_spread(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_cell_km numeric DEFAULT 6,
  p_active_only boolean DEFAULT false
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

  cell_deg := GREATEST(0.007, LEAST(0.09, COALESCE(NULLIF(p_cell_km, 0), 6) / 111.32));

  RETURN (
    WITH pinned AS (
      SELECT
        c.id AS customer_id,
        coalesce(
          public.analytics_spread_area_label(c.address->>'area', coalesce(c.visible_address, c.address->>'visible_address')),
          'Unknown'
        ) AS area_label,
        coalesce(
          public.analytics_json_coord(c.location, 'latitude'),
          public.analytics_json_coord(c.location, 'lat')
        ) AS lat,
        coalesce(
          public.analytics_json_coord(c.location, 'longitude'),
          public.analytics_json_coord(c.location, 'lng')
        ) AS lng,
        true AS is_primary
      FROM public.customers c
      UNION ALL
      SELECT
        c.id,
        coalesce(
          public.analytics_spread_area_label(
            c.alternate_address->>'area',
            coalesce(c.alternate_visible_address, c.alternate_address->>'visible_address')
          ),
          'Unknown'
        ),
        coalesce(
          public.analytics_json_coord(c.alternate_location, 'latitude'),
          public.analytics_json_coord(c.alternate_location, 'lat')
        ),
        coalesce(
          public.analytics_json_coord(c.alternate_location, 'longitude'),
          public.analytics_json_coord(c.alternate_location, 'lng')
        ),
        false
      FROM public.customers c
    ),
    valid_pinned AS (
      SELECT *
      FROM pinned
      WHERE lat IS NOT NULL
        AND lng IS NOT NULL
        AND lat BETWEEN -90 AND 90
        AND lng BETWEEN -180 AND 180
        AND NOT (lat = 0 AND lng = 0)
    ),
    period_jobs AS (
      SELECT
        j.id,
        j.customer_id,
        j.payment_amount,
        j.actual_cost,
        j.service_sub_type,
        j.brand,
        j.model,
        j.service_location,
        j.service_address,
        j.service_site
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
    pinned_grid AS (
      SELECT
        v.*,
        round(v.lat / cell_deg) * cell_deg AS cell_lat,
        round(v.lng / cell_deg) * cell_deg AS cell_lng
      FROM valid_pinned v
      WHERE NOT coalesce(p_active_only, false)
        OR v.customer_id IN (SELECT pj.customer_id FROM period_jobs pj WHERE pj.customer_id IS NOT NULL)
    ),
    customer_cells AS (
      SELECT
        g.cell_lat,
        g.cell_lng,
        count(DISTINCT g.customer_id)::integer AS customers,
        mode() WITHIN GROUP (ORDER BY g.area_label) AS area
      FROM pinned_grid g
      GROUP BY g.cell_lat, g.cell_lng
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
        loc.cell_lat,
        loc.cell_lng,
        loc.area_label,
        c.raw_water_tds
      FROM period_jobs j
      JOIN public.customers c ON c.id = j.customer_id
      JOIN LATERAL (
        SELECT
          CASE
            WHEN lower(coalesce(j.service_site, 'primary')) IN ('secondary', 'alternate', 'alt') THEN false
            ELSE true
          END AS want_primary
      ) site ON true
      LEFT JOIN LATERAL (
        SELECT pg.cell_lat, pg.cell_lng, pg.area_label
        FROM pinned_grid pg
        WHERE pg.customer_id = j.customer_id
        ORDER BY (pg.is_primary = site.want_primary) DESC, pg.is_primary DESC
        LIMIT 1
      ) pg ON true
      JOIN LATERAL (
        SELECT
          coalesce(
            public.analytics_json_coord(j.service_location, 'latitude'),
            public.analytics_json_coord(j.service_location, 'lat')
          ) AS job_lat,
          coalesce(
            public.analytics_json_coord(j.service_location, 'longitude'),
            public.analytics_json_coord(j.service_location, 'lng')
          ) AS job_lng
      ) jl ON true
      JOIN LATERAL (
        SELECT
          CASE
            WHEN jl.job_lat IS NOT NULL AND jl.job_lng IS NOT NULL
              AND jl.job_lat BETWEEN -90 AND 90
              AND jl.job_lng BETWEEN -180 AND 180
              AND NOT (jl.job_lat = 0 AND jl.job_lng = 0)
            THEN round(jl.job_lat / cell_deg) * cell_deg
            ELSE pg.cell_lat
          END AS cell_lat,
          CASE
            WHEN jl.job_lat IS NOT NULL AND jl.job_lng IS NOT NULL
              AND jl.job_lat BETWEEN -90 AND 90
              AND jl.job_lng BETWEEN -180 AND 180
              AND NOT (jl.job_lat = 0 AND jl.job_lng = 0)
            THEN round(jl.job_lng / cell_deg) * cell_deg
            ELSE pg.cell_lng
          END AS cell_lng,
          coalesce(
            nullif(
              public.analytics_spread_area_label(
                j.service_address->>'area',
                coalesce(j.service_address->>'visible_address', j.service_address->>'formatted_address')
              ),
              'Unknown'
            ),
            pg.area_label,
            'Unknown'
          ) AS area_label
      ) loc ON loc.cell_lat IS NOT NULL AND loc.cell_lng IS NOT NULL
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN NOT site.want_primary THEN
              coalesce(nullif(btrim(j.brand), ''), nullif(btrim(c.alternate_brand), ''), nullif(btrim(c.brand), ''))
            ELSE
              coalesce(nullif(btrim(j.brand), ''), nullif(btrim(c.brand), ''))
          END AS brand_name,
          CASE
            WHEN NOT site.want_primary THEN
              coalesce(nullif(btrim(j.model), ''), nullif(btrim(c.alternate_model), ''), nullif(btrim(c.model), ''))
            ELSE
              coalesce(nullif(btrim(j.model), ''), nullif(btrim(c.model), ''))
          END AS model_name
      ) x
    ),
    brand_counts AS (
      SELECT
        g.cell_lat,
        g.cell_lng,
        g.brand_key,
        mode() WITHIN GROUP (ORDER BY g.brand_label) AS brand_label,
        count(*)::integer AS jobs,
        sum(g.revenue)::numeric AS revenue
      FROM located g
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
    job_cells AS (
      SELECT
        g.cell_lat,
        g.cell_lng,
        count(*)::integer AS jobs,
        sum(g.revenue)::numeric AS revenue,
        sum(CASE WHEN public.analytics_is_installation(g.service_sub_type) THEN 1 ELSE 0 END)::integer AS installation,
        sum(CASE WHEN NOT public.analytics_is_installation(g.service_sub_type) THEN 1 ELSE 0 END)::integer AS service,
        sum(CASE WHEN g.raw_water_tds IS NOT NULL AND g.raw_water_tds > 0 THEN g.raw_water_tds ELSE 0 END)::numeric AS tds_sum,
        sum(CASE WHEN g.raw_water_tds IS NOT NULL AND g.raw_water_tds > 0 THEN 1 ELSE 0 END)::integer AS tds_count,
        mode() WITHIN GROUP (ORDER BY g.area_label) AS area
      FROM located g
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
    cell_keys AS (
      SELECT cell_lat, cell_lng FROM customer_cells
      UNION
      SELECT cell_lat, cell_lng FROM job_cells
    ),
    ranked_cells AS (
      SELECT
        k.cell_lat,
        k.cell_lng,
        coalesce(cu.customers, 0)::integer AS customers,
        coalesce(jb.jobs, 0)::integer AS jobs,
        coalesce(jb.revenue, 0)::numeric AS revenue,
        coalesce(nullif(cu.area, 'Unknown'), nullif(jb.area, 'Unknown'), cu.area, jb.area, 'Unknown') AS area,
        coalesce(jb.installation, 0)::integer AS installation,
        coalesce(jb.service, 0)::integer AS service,
        CASE WHEN coalesce(jb.jobs, 0) > 0 THEN round(jb.revenue / jb.jobs, 0) ELSE 0 END AS avg_bill,
        CASE WHEN coalesce(jb.tds_count, 0) > 0 THEN round(jb.tds_sum / jb.tds_count, 1) ELSE NULL END AS avg_tds,
        coalesce(cb.brands, '[]'::jsonb) AS brands,
        coalesce(cb.top_brand, '') AS top_brand,
        coalesce(cb.top_brand_jobs, 0)::integer AS top_brand_jobs,
        CASE
          WHEN coalesce(jb.jobs, 0) > 0 THEN round((coalesce(cb.top_brand_jobs, 0)::numeric / jb.jobs) * 100, 0)
          ELSE 0
        END AS top_brand_share
      FROM cell_keys k
      LEFT JOIN customer_cells cu ON cu.cell_lat = k.cell_lat AND cu.cell_lng = k.cell_lng
      LEFT JOIN job_cells jb ON jb.cell_lat = k.cell_lat AND jb.cell_lng = k.cell_lng
      LEFT JOIN cell_brands cb ON cb.cell_lat = k.cell_lat AND cb.cell_lng = k.cell_lng
    )
    SELECT jsonb_build_object(
      'cell_km', round((cell_deg * 111.32)::numeric, 2),
      'jobs_total', (SELECT count(*)::integer FROM period_jobs),
      'jobs_with_pin', (SELECT count(*)::integer FROM located),
      'customers_total', CASE
        WHEN coalesce(p_active_only, false) THEN (SELECT count(DISTINCT customer_id)::integer FROM period_jobs)
        ELSE (SELECT count(*)::integer FROM public.customers)
      END,
      'customers_with_pin', (SELECT count(DISTINCT customer_id)::integer FROM pinned_grid),
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
          LIMIT 4000
        ) r
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_customer_spread(timestamptz, timestamptz, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_customer_spread(timestamptz, timestamptz, numeric, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.analytics_json_coord(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_spread_area_label(text, text) FROM PUBLIC;
