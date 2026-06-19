-- First-party website analytics (hydrogenro.com + elevenro.com).
-- Inserts: Netlify function (service_role). Reads: admin RPC only.

CREATE TABLE IF NOT EXISTS public.website_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key text NOT NULL,
  event_type text NOT NULL,
  page_path text,
  session_hash text NOT NULL,
  client_ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_analytics_site_key_check CHECK (site_key IN ('hydrogenro', 'elevenro')),
  CONSTRAINT website_analytics_event_type_check CHECK (
    event_type IN (
      'page_view',
      'phone_click',
      'whatsapp_click',
      'booking_click',
      'booking_submit'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_website_analytics_site_created
  ON public.website_analytics_events (site_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_analytics_created
  ON public.website_analytics_events (created_at DESC);

ALTER TABLE public.website_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_analytics_events_admin_select ON public.website_analytics_events;
CREATE POLICY website_analytics_events_admin_select
  ON public.website_analytics_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- Aggregated summary for Settings dashboard (minimal egress).
CREATE OR REPLACE FUNCTION public.get_website_analytics_summary(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  WITH bounds AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Kolkata')::date AS today_ist,
      GREATEST(1, LEAST(COALESCE(p_days, 7), 90)) AS days_span
  ),
  range AS (
    SELECT
      b.today_ist,
      (b.today_ist - (b.days_span - 1)) AS start_ist,
      b.days_span
    FROM bounds b
  ),
  filtered AS (
    SELECT e.*
    FROM public.website_analytics_events e
    CROSS JOIN range r
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= r.start_ist
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
    CROSS JOIN range r
    WHERE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date = r.today_ist
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
    'days', (SELECT days_span FROM range)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_website_analytics_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_analytics_summary(integer) TO authenticated;

-- Optional retention: delete rows older than 180 days (run via pg_cron or manual).
-- DELETE FROM public.website_analytics_events WHERE created_at < now() - interval '180 days';
