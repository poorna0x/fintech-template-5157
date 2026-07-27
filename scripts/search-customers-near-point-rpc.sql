-- Nearby customers by lat/lng (advanced search "Near Maps location").
-- Haversine on customers.location + alternate_location JSONB coords.
-- Admin-only SECURITY DEFINER. Safe to re-run.
--
-- Run once in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.search_customers_near_point(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 2,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  customer_id uuid,
  distance_km double precision,
  matched_site text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_radius double precision;
  v_limit integer;
  v_lat_delta double precision;
  v_lng_delta double precision;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'lat and lng are required' USING ERRCODE = '22023';
  END IF;

  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'invalid coordinates' USING ERRCODE = '22023';
  END IF;

  -- Clamp radius (50 m–50 km) and result cap
  v_radius := LEAST(GREATEST(COALESCE(p_radius_km, 2), 0.05), 50);
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);

  -- Cheap bbox prefilter (~111 km per degree latitude)
  v_lat_delta := v_radius / 111.0;
  v_lng_delta := v_radius / (111.0 * GREATEST(ABS(COS(RADIANS(p_lat))), 0.01));

  RETURN QUERY
  WITH pins AS (
    SELECT
      c.id AS id,
      COALESCE(
        NULLIF(TRIM(c.location->>'latitude'), ''),
        NULLIF(TRIM(c.location->>'lat'), '')
      )::double precision AS lat,
      COALESCE(
        NULLIF(TRIM(c.location->>'longitude'), ''),
        NULLIF(TRIM(c.location->>'lng'), '')
      )::double precision AS lng,
      'primary'::text AS site
    FROM public.customers c
    WHERE c.location IS NOT NULL
      AND (
        (c.location ? 'latitude' AND c.location ? 'longitude')
        OR (c.location ? 'lat' AND c.location ? 'lng')
      )
    UNION ALL
    SELECT
      c.id,
      COALESCE(
        NULLIF(TRIM(c.alternate_location->>'latitude'), ''),
        NULLIF(TRIM(c.alternate_location->>'lat'), '')
      )::double precision,
      COALESCE(
        NULLIF(TRIM(c.alternate_location->>'longitude'), ''),
        NULLIF(TRIM(c.alternate_location->>'lng'), '')
      )::double precision,
      'alternate'::text
    FROM public.customers c
    WHERE c.alternate_location IS NOT NULL
      AND (
        (c.alternate_location ? 'latitude' AND c.alternate_location ? 'longitude')
        OR (c.alternate_location ? 'lat' AND c.alternate_location ? 'lng')
      )
  ),
  scored AS (
    SELECT
      p.id,
      p.site,
      (
        6371.0 * ACOS(
          LEAST(
            1.0,
            GREATEST(
              -1.0,
              COS(RADIANS(p_lat)) * COS(RADIANS(p.lat))
                * COS(RADIANS(p.lng) - RADIANS(p_lng))
                + SIN(RADIANS(p_lat)) * SIN(RADIANS(p.lat))
            )
          )
        )
      ) AS dist_km
    FROM pins p
    WHERE p.lat IS NOT NULL
      AND p.lng IS NOT NULL
      AND NOT (p.lat = 0 AND p.lng = 0)
      AND p.lat BETWEEN -90 AND 90
      AND p.lng BETWEEN -180 AND 180
      AND p.lat BETWEEN (p_lat - v_lat_delta) AND (p_lat + v_lat_delta)
      AND p.lng BETWEEN (p_lng - v_lng_delta) AND (p_lng + v_lng_delta)
  ),
  best AS (
    SELECT DISTINCT ON (s.id)
      s.id,
      s.dist_km,
      s.site
    FROM scored s
    WHERE s.dist_km <= v_radius
    ORDER BY s.id, s.dist_km ASC
  )
  SELECT b.id, ROUND(b.dist_km::numeric, 3)::double precision, b.site
  FROM best b
  ORDER BY b.dist_km ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_customers_near_point(double precision, double precision, double precision, integer) IS
  'Admin-only: customers whose primary or alternate map pin is within p_radius_km of (p_lat,p_lng). Returns id + distance_km + matched_site.';

REVOKE ALL ON FUNCTION public.search_customers_near_point(double precision, double precision, double precision, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_customers_near_point(double precision, double precision, double precision, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_customers_near_point(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_customers_near_point(double precision, double precision, double precision, integer) TO service_role;
