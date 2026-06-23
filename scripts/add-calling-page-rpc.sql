-- Server-side Calling page: filter, aggregate stats, and paginate in Postgres.
-- Returns only one page of slim customer rows (+ total + stats). Run in Supabase SQL editor.
-- Requires public.is_admin_user() from secure-customers-rls.sql.

DROP FUNCTION IF EXISTS public.get_calling_page(
  integer, integer, text, text, text, text, boolean, integer, text, text
);

CREATE OR REPLACE FUNCTION public.get_calling_page(
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_service_filter text DEFAULT 'all',
  p_service_history text DEFAULT 'all',
  p_service_sub_type text DEFAULT 'all',
  p_show_recently_contacted boolean DEFAULT false,
  p_recent_contact_days integer DEFAULT 7,
  p_status_filter text DEFAULT 'all',
  p_prefilter_filter text DEFAULT 'all'
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
  recent_days integer;
  search_digits text;
  total_count integer;
  over_one_year integer;
  six_to_twelve integer;
  rows_json jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  lim := GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));
  off := GREATEST(0, COALESCE(p_offset, 0));
  recent_days := GREATEST(0, COALESCE(p_recent_contact_days, 7));
  search_digits := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');

  WITH last_jobs AS (
    SELECT DISTINCT ON (j.customer_id)
      j.customer_id,
      j.completed_at,
      j.service_type,
      j.service_sub_type
    FROM public.jobs j
    WHERE j.status = 'COMPLETED'
      AND j.completed_at IS NOT NULL
    ORDER BY j.customer_id, j.completed_at DESC
  ),
  last_contacts AS (
    SELECT DISTINCT ON (ch.customer_id)
      ch.customer_id,
      ch.contacted_at,
      ch.status
    FROM public.call_history ch
    ORDER BY ch.customer_id, ch.contacted_at DESC
  ),
  enriched AS (
    SELECT
      c.id,
      c.customer_id,
      c.full_name,
      c.customer_tier,
      c.phone,
      c.alternate_phone,
      c.email,
      c.service_type,
      c.brand,
      c.model,
      c.status,
      c.has_prefilter,
      c.last_service_date,
      c.raw_water_tds,
      COALESCE(lj.completed_at, c.last_service_date) AS effective_last_service,
      lj.service_type AS last_service_type,
      lj.service_sub_type AS last_service_sub_type,
      lc.contacted_at AS last_contacted_at,
      lc.status AS last_contact_status,
      CASE
        WHEN COALESCE(lj.completed_at, c.last_service_date) IS NOT NULL THEN
          EXTRACT(EPOCH FROM (now() - COALESCE(lj.completed_at, c.last_service_date))) / 86400.0
        ELSE NULL
      END AS days_since_service,
      CASE
        WHEN lc.contacted_at IS NOT NULL THEN
          EXTRACT(EPOCH FROM (now() - lc.contacted_at)) / 86400.0
        ELSE NULL
      END AS days_since_contact
    FROM public.customers c
    LEFT JOIN last_jobs lj ON lj.customer_id = c.id
    LEFT JOIN last_contacts lc ON lc.customer_id = c.id
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE
      (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR e.full_name ILIKE '%' || p_search || '%'
        OR e.customer_id ILIKE '%' || p_search || '%'
        OR coalesce(e.email, '') ILIKE '%' || p_search || '%'
        OR coalesce(e.phone, '') LIKE '%' || p_search || '%'
        OR coalesce(e.alternate_phone, '') LIKE '%' || p_search || '%'
        OR (
          length(search_digits) >= 10
          AND (
            regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') = search_digits
            OR regexp_replace(coalesce(e.alternate_phone, ''), '\D', '', 'g') = search_digits
          )
        )
      )
      AND (
        p_service_filter = 'all'
        OR (p_service_filter = 'never' AND e.effective_last_service IS NULL)
        OR (
          p_service_filter = '3months'
          AND e.days_since_service >= 90
          AND e.days_since_service < 180
        )
        OR (
          p_service_filter = '6months'
          AND e.days_since_service >= 180
          AND e.days_since_service < 365
        )
        OR (p_service_filter = '1year' AND e.days_since_service >= 365)
      )
      AND (
        p_service_history = 'all'
        OR (p_service_history = 'serviced' AND e.effective_last_service IS NOT NULL)
        OR (p_service_history = 'never' AND e.effective_last_service IS NULL)
      )
      AND (
        p_service_sub_type = 'all'
        OR upper(coalesce(e.last_service_sub_type, '')) = upper(p_service_sub_type)
      )
      AND (
        p_show_recently_contacted
        OR e.last_contacted_at IS NULL
        OR coalesce(e.days_since_contact, 0) >= recent_days
      )
      AND (
        p_status_filter = 'all'
        OR (p_status_filter = 'never' AND e.last_contact_status IS NULL)
        OR (p_status_filter <> 'never' AND e.last_contact_status = p_status_filter)
      )
      AND (
        p_prefilter_filter = 'all'
        OR (p_prefilter_filter = 'yes' AND e.has_prefilter IS TRUE)
        OR (p_prefilter_filter = 'no' AND e.has_prefilter IS FALSE)
        OR (p_prefilter_filter = 'unknown' AND e.has_prefilter IS NULL)
      )
  ),
  stats AS (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE days_since_service >= 365)::integer AS over_one_year,
      count(*) FILTER (
        WHERE days_since_service >= 180 AND days_since_service < 365
      )::integer AS six_to_twelve
    FROM filtered
  )
  SELECT s.total, s.over_one_year, s.six_to_twelve
  INTO total_count, over_one_year, six_to_twelve
  FROM stats s;

  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.sort_days DESC), '[]'::jsonb)
  INTO rows_json
  FROM (
    SELECT
      f.id,
      f.customer_id,
      f.full_name,
      f.customer_tier,
      f.phone,
      f.alternate_phone,
      f.email,
      f.service_type,
      f.brand,
      f.model,
      f.status,
      f.has_prefilter,
      f.last_service_date,
      f.raw_water_tds,
      f.effective_last_service AS last_service_at,
      f.last_service_type,
      f.last_service_sub_type,
      f.last_contacted_at,
      f.last_contact_status,
      f.days_since_service,
      f.days_since_contact,
      COALESCE(f.days_since_service, -1) AS sort_days
    FROM filtered f
    ORDER BY COALESCE(f.days_since_service, -1) DESC, f.full_name ASC
    LIMIT lim OFFSET off
  ) p;

  RETURN jsonb_build_object(
    'total', total_count,
    'stats', jsonb_build_object(
      'over_one_year', over_one_year,
      'six_to_twelve', six_to_twelve
    ),
    'rows', rows_json,
    'server_paginated', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_calling_page(
  integer, integer, text, text, text, text, boolean, integer, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_calling_page(
  integer, integer, text, text, text, text, boolean, integer, text, text
) TO authenticated;
