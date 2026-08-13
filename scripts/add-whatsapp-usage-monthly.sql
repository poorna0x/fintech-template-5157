-- Monthly WhatsApp usage rollups for billing (admin-only).
-- Live counts always come from whatsapp_messages; this table stores snapshots per calendar month (IST).

CREATE OR REPLACE FUNCTION public.is_whatsapp_usage_excluded_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') IN (
    '919876543210',
    '9876543210'
  );
$$;

COMMENT ON FUNCTION public.is_whatsapp_usage_excluded_phone(text) IS
  'Test / placeholder numbers — Meta does not bill these; exclude from cold_utility.';

CREATE TABLE IF NOT EXISTS public.whatsapp_usage_monthly (
  month_key text PRIMARY KEY CHECK (month_key ~ '^\d{4}-\d{2}$'),
  cold_utility integer NOT NULL DEFAULT 0,
  session_messages integer NOT NULL DEFAULT 0,
  outbound integer NOT NULL DEFAULT 0,
  inbound integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  templates integer NOT NULL DEFAULT 0,
  documents integer NOT NULL DEFAULT 0,
  text_messages integer NOT NULL DEFAULT 0,
  rate_utility_inr numeric(12, 6) NOT NULL DEFAULT 0.35,
  rate_service_inr numeric(12, 6) NOT NULL DEFAULT 0,
  estimated_total_inr numeric(12, 2) NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_usage_monthly IS
  'Monthly snapshot of WhatsApp billable counts (cold template sends + session). Refreshed by cron or admin.';

ALTER TABLE public.whatsapp_usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_usage_monthly_admin ON public.whatsapp_usage_monthly;
CREATE POLICY whatsapp_usage_monthly_admin
  ON public.whatsapp_usage_monthly FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.whatsapp_usage_monthly FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_usage_monthly TO authenticated;
GRANT ALL ON TABLE public.whatsapp_usage_monthly TO service_role;

-- Shared aggregate for a time range (used by rolling window + monthly refresh).
CREATE OR REPLACE FUNCTION public.whatsapp_usage_aggregate(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'outbound', COUNT(*) FILTER (WHERE direction = 'outbound'),
    'inbound', COUNT(*) FILTER (WHERE direction = 'inbound'),
    'templates', COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type = 'template'),
    'documents', COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type IN ('document', 'pdf')),
    'text', COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type = 'text'),
    'failed', COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND lower(COALESCE(status, '')) IN ('failed', 'undelivered')
    ),
    'delivered_or_sent', COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND lower(COALESCE(status, '')) IN ('sent', 'delivered', 'read')
    ),
    'cold_utility', COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND template_name IS NOT NULL
        AND trim(template_name) <> ''
        AND coalesce(trim(wa_message_id), '') <> ''
        AND NOT public.is_whatsapp_usage_excluded_phone(phone_e164)
        AND lower(COALESCE(status, '')) NOT IN ('failed', 'undelivered')
    ),
    'session_messages', COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND (template_name IS NULL OR trim(template_name) = '')
        AND msg_type IN ('text', 'document', 'pdf', 'image', 'interactive', 'contacts')
        AND lower(COALESCE(status, '')) NOT IN ('failed', 'undelivered')
    )
  )
  FROM public.whatsapp_messages
  WHERE created_at >= p_from AND created_at < p_to;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_usage_aggregate(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_aggregate(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_aggregate(timestamptz, timestamptz) TO service_role;

-- Admin stats: optional p_to (default now). p_from defaults to 7 days ago.
DROP FUNCTION IF EXISTS public.whatsapp_usage_stats(timestamptz);

CREATE OR REPLACE FUNCTION public.whatsapp_usage_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, now() - interval '7 days');
  v_to timestamptz := COALESCE(p_to, now());
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_to <= v_from THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  RETURN public.whatsapp_usage_aggregate(v_from, v_to);
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_usage_stats(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_stats(timestamptz, timestamptz) TO authenticated;

-- Calendar month in Asia/Kolkata (IST). Param order p_month, p_year matches PostgREST schema cache.
DROP FUNCTION IF EXISTS public.whatsapp_usage_stats_for_month(int, int);

CREATE OR REPLACE FUNCTION public.whatsapp_usage_stats_for_month(p_month int, p_year int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'invalid month';
  END IF;
  v_from := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Kolkata');
  IF p_month = 12 THEN
    v_to := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'Asia/Kolkata');
  ELSE
    v_to := make_timestamptz(p_year, p_month + 1, 1, 0, 0, 0, 'Asia/Kolkata');
  END IF;
  RETURN public.whatsapp_usage_aggregate(v_from, v_to)
    || jsonb_build_object('month_key', to_char(v_from AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM'));
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_usage_stats_for_month(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_stats_for_month(int, int) TO authenticated;

-- Upsert monthly snapshot from whatsapp_messages + current rate card.
CREATE OR REPLACE FUNCTION public.whatsapp_usage_monthly_refresh(p_month_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := COALESCE(NULLIF(trim(p_month_key), ''), to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM'));
  v_year int;
  v_month int;
  v_from timestamptz;
  v_to timestamptz;
  v_stats jsonb;
  v_rate_utility numeric := 0.35;
  v_rate_service numeric := 0;
  v_estimated numeric := 0;
BEGIN
  IF NOT (
    public.is_admin_user()
    OR coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_key !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'month_key must be YYYY-MM';
  END IF;
  v_year := split_part(v_key, '-', 1)::int;
  v_month := split_part(v_key, '-', 2)::int;
  v_from := make_timestamptz(v_year, v_month, 1, 0, 0, 0, 'Asia/Kolkata');
  IF v_month = 12 THEN
    v_to := make_timestamptz(v_year + 1, 1, 1, 0, 0, 0, 'Asia/Kolkata');
  ELSE
    v_to := make_timestamptz(v_year, v_month + 1, 1, 0, 0, 0, 'Asia/Kolkata');
  END IF;
  v_stats := public.whatsapp_usage_aggregate(v_from, v_to);

  SELECT
    COALESCE(rate_utility_inr, 0.35),
    COALESCE(rate_service_inr, 0)
  INTO v_rate_utility, v_rate_service
  FROM public.whatsapp_crm_settings
  WHERE id = 1;

  v_estimated :=
    COALESCE((v_stats->>'cold_utility')::int, 0) * v_rate_utility
    + COALESCE((v_stats->>'session_messages')::int, 0) * v_rate_service;

  INSERT INTO public.whatsapp_usage_monthly (
    month_key,
    cold_utility,
    session_messages,
    outbound,
    inbound,
    failed,
    templates,
    documents,
    text_messages,
    rate_utility_inr,
    rate_service_inr,
    estimated_total_inr,
    updated_at
  )
  VALUES (
    v_key,
    COALESCE((v_stats->>'cold_utility')::int, 0),
    COALESCE((v_stats->>'session_messages')::int, 0),
    COALESCE((v_stats->>'outbound')::int, 0),
    COALESCE((v_stats->>'inbound')::int, 0),
    COALESCE((v_stats->>'failed')::int, 0),
    COALESCE((v_stats->>'templates')::int, 0),
    COALESCE((v_stats->>'documents')::int, 0),
    COALESCE((v_stats->>'text')::int, 0),
    v_rate_utility,
    v_rate_service,
    round(v_estimated::numeric, 2),
    now()
  )
  ON CONFLICT (month_key) DO UPDATE SET
    cold_utility = EXCLUDED.cold_utility,
    session_messages = EXCLUDED.session_messages,
    outbound = EXCLUDED.outbound,
    inbound = EXCLUDED.inbound,
    failed = EXCLUDED.failed,
    templates = EXCLUDED.templates,
    documents = EXCLUDED.documents,
    text_messages = EXCLUDED.text_messages,
    rate_utility_inr = EXCLUDED.rate_utility_inr,
    rate_service_inr = EXCLUDED.rate_service_inr,
    estimated_total_inr = EXCLUDED.estimated_total_inr,
    updated_at = now();

  RETURN (
    SELECT to_jsonb(m.*) FROM public.whatsapp_usage_monthly m WHERE m.month_key = v_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_usage_monthly_refresh(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_monthly_refresh(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_monthly_refresh(text) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_usage_monthly_list(p_limit int DEFAULT 24)
RETURNS SETOF public.whatsapp_usage_monthly
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.whatsapp_usage_monthly
  WHERE public.is_admin_user()
  ORDER BY month_key DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 60));
$$;

REVOKE ALL ON FUNCTION public.whatsapp_usage_monthly_list(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_monthly_list(int) TO authenticated;

-- Reload PostgREST schema cache (Supabase API).
NOTIFY pgrst, 'reload schema';
