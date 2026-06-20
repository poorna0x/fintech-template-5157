-- Step 5 polish: slim website recent-events payload (drop bulky metadata JSON over the wire).
-- Requires: public.is_admin_user(), get_website_analytics_recent_events from add-analytics-paginated-rpcs.sql

CREATE OR REPLACE FUNCTION public.website_analytics_slim_metadata(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    jsonb_strip_nulls(
      jsonb_build_object(
        'client_at', nullif(btrim(p->>'client_at'), ''),
        'geo_city', nullif(btrim(p->>'geo_city'), ''),
        'geo_country', nullif(btrim(p->>'geo_country'), ''),
        'geo_tz', nullif(btrim(p->>'geo_tz'), ''),
        'device', nullif(btrim(p->>'device'), ''),
        'os', nullif(btrim(p->>'os'), ''),
        'browser', nullif(btrim(p->>'browser'), ''),
        'referrer', nullif(btrim(p->>'referrer'), ''),
        'referrer_host', nullif(btrim(p->>'referrer_host'), '')
      )
    ),
    '{}'::jsonb
  );
$$;

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
      public.website_analytics_slim_metadata(e.metadata) AS metadata
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

REVOKE ALL ON FUNCTION public.website_analytics_slim_metadata(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_website_analytics_recent_events(date, date, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_analytics_recent_events(date, date, text, integer, integer) TO authenticated;
