-- Admin-only delete / preview for website_analytics_events (IST).
-- Modes: older_than | single_day | date_range | time_window (minute-precision IST range on one day).
-- Run in Supabase SQL editor (safe to re-run).

DROP FUNCTION IF EXISTS public.preview_website_analytics_delete(text, integer, date, date, text);
DROP FUNCTION IF EXISTS public.delete_website_analytics_events(text, integer, date, date, text);

CREATE OR REPLACE FUNCTION public.preview_website_analytics_delete(
  p_mode text,
  p_older_than_days integer DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_site_key text DEFAULT NULL,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_ist date;
  from_d date;
  to_d date;
  start_t time;
  end_t time;
  match_count integer;
  rows_json jsonb;
  mode_norm text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  mode_norm := lower(btrim(coalesce(p_mode, '')));
  today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF mode_norm = 'older_than' THEN
    IF coalesce(p_older_than_days, 0) < 1 THEN
      RAISE EXCEPTION 'p_older_than_days must be at least 1' USING ERRCODE = '22023';
    END IF;
    from_d := NULL;
    to_d := today_ist - GREATEST(1, LEAST(p_older_than_days, 3650));
  ELSIF mode_norm = 'single_day' THEN
    IF p_from_date IS NULL THEN
      RAISE EXCEPTION 'p_from_date is required for single_day' USING ERRCODE = '22023';
    END IF;
    from_d := p_from_date;
    to_d := p_from_date;
  ELSIF mode_norm = 'date_range' THEN
    from_d := LEAST(COALESCE(p_from_date, today_ist), COALESCE(p_to_date, today_ist));
    to_d := GREATEST(COALESCE(p_from_date, today_ist), COALESCE(p_to_date, today_ist));
  ELSIF mode_norm = 'time_window' THEN
    IF p_from_date IS NULL OR nullif(btrim(p_start_time), '') IS NULL OR nullif(btrim(p_end_time), '') IS NULL THEN
      RAISE EXCEPTION 'p_from_date, p_start_time and p_end_time are required for time_window' USING ERRCODE = '22023';
    END IF;
    from_d := p_from_date;
    to_d := p_from_date;
    start_t := p_start_time::time;
    end_t := p_end_time::time;
    IF end_t < start_t THEN
      RAISE EXCEPTION 'end time must be on or after start time (same IST day)' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid p_mode (use older_than, single_day, date_range, or time_window)' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO match_count
  FROM public.website_analytics_events e
  WHERE (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key)
    AND (
      (
        mode_norm = 'older_than'
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
      )
      OR (
        mode_norm = 'single_day'
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = from_d
      )
      OR (
        mode_norm = 'date_range'
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= from_d
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
      )
      OR (
        mode_norm = 'time_window'
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = from_d
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::time >= start_t
        AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::time <= end_t
      )
    );

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
    WHERE (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key)
      AND (
        (
          mode_norm = 'older_than'
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
        )
        OR (
          mode_norm = 'single_day'
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = from_d
        )
        OR (
          mode_norm = 'date_range'
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= from_d
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
        )
        OR (
          mode_norm = 'time_window'
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = from_d
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::time >= start_t
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::time <= end_t
        )
      )
    ORDER BY e.created_at DESC
    LIMIT 25
  ) r;

  RETURN jsonb_build_object(
    'mode', mode_norm,
    'match_count', match_count,
    'rows', rows_json,
    'from_date', from_d,
    'to_date', to_d,
    'older_than_days', CASE WHEN mode_norm = 'older_than' THEN p_older_than_days ELSE NULL END,
    'start_time', CASE WHEN mode_norm = 'time_window' THEN to_char(start_t, 'HH24:MI') ELSE NULL END,
    'end_time', CASE WHEN mode_norm = 'time_window' THEN to_char(end_t, 'HH24:MI') ELSE NULL END,
    'site_key', nullif(btrim(p_site_key), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_website_analytics_events(
  p_mode text,
  p_older_than_days integer DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_site_key text DEFAULT NULL,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_ist date;
  from_d date;
  to_d date;
  start_t time;
  end_t time;
  deleted_count integer;
  mode_norm text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  mode_norm := lower(btrim(coalesce(p_mode, '')));
  today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF mode_norm = 'older_than' THEN
    IF coalesce(p_older_than_days, 0) < 1 THEN
      RAISE EXCEPTION 'p_older_than_days must be at least 1' USING ERRCODE = '22023';
    END IF;
    from_d := NULL;
    to_d := today_ist - GREATEST(1, LEAST(p_older_than_days, 3650));
  ELSIF mode_norm = 'single_day' THEN
    IF p_from_date IS NULL THEN
      RAISE EXCEPTION 'p_from_date is required for single_day' USING ERRCODE = '22023';
    END IF;
    from_d := p_from_date;
    to_d := p_from_date;
  ELSIF mode_norm = 'date_range' THEN
    from_d := LEAST(COALESCE(p_from_date, today_ist), COALESCE(p_to_date, today_ist));
    to_d := GREATEST(COALESCE(p_from_date, today_ist), COALESCE(p_to_date, today_ist));
  ELSIF mode_norm = 'time_window' THEN
    IF p_from_date IS NULL OR nullif(btrim(p_start_time), '') IS NULL OR nullif(btrim(p_end_time), '') IS NULL THEN
      RAISE EXCEPTION 'p_from_date, p_start_time and p_end_time are required for time_window' USING ERRCODE = '22023';
    END IF;
    from_d := p_from_date;
    to_d := p_from_date;
    start_t := p_start_time::time;
    end_t := p_end_time::time;
    IF end_t < start_t THEN
      RAISE EXCEPTION 'end time must be on or after start time (same IST day)' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid p_mode (use older_than, single_day, date_range, or time_window)' USING ERRCODE = '22023';
  END IF;

  IF mode_norm = 'older_than' THEN
    DELETE FROM public.website_analytics_events e
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
      AND (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key);
  ELSIF mode_norm = 'time_window' THEN
    DELETE FROM public.website_analytics_events e
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = from_d
      AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::time >= start_t
      AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::time <= end_t
      AND (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key);
  ELSE
    DELETE FROM public.website_analytics_events e
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= from_d
      AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= to_d
      AND (p_site_key IS NULL OR p_site_key = '' OR e.site_key = p_site_key);
  END IF;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_count', deleted_count,
    'mode', mode_norm,
    'from_date', from_d,
    'to_date', to_d,
    'older_than_days', CASE WHEN mode_norm = 'older_than' THEN p_older_than_days ELSE NULL END,
    'start_time', CASE WHEN mode_norm = 'time_window' THEN to_char(start_t, 'HH24:MI') ELSE NULL END,
    'end_time', CASE WHEN mode_norm = 'time_window' THEN to_char(end_t, 'HH24:MI') ELSE NULL END,
    'site_key', nullif(btrim(p_site_key), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_website_analytics_delete(text, integer, date, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_website_analytics_delete(text, integer, date, date, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_website_analytics_events(text, integer, date, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_website_analytics_events(text, integer, date, date, text, text, text) TO authenticated;
