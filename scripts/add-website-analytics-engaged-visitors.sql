-- Count website analytics "visitors" only when a session has real engagement
-- (click/tap), not passive page loads alone.
-- Run in Supabase SQL editor after deploy.

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
      count(DISTINCT e.session_hash) FILTER (
        WHERE e.event_type IN ('engagement', 'phone_click', 'whatsapp_click', 'booking_click', 'booking_submit')
      ) AS visitors,
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
      count(DISTINCT e.session_hash) FILTER (
        WHERE e.event_type IN ('engagement', 'phone_click', 'whatsapp_click', 'booking_click', 'booking_submit')
      ) AS visitors,
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
