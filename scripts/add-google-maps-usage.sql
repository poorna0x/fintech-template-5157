-- Google Maps Essentials free-cap counters (IST calendar month).
-- Run in Supabase SQL Editor. Safe to re-run.
-- Public booking + CRM increment via RPC; admins read rows for Settings → Storage.

CREATE TABLE IF NOT EXISTS public.google_maps_usage_counters (
  month_key text NOT NULL,
  sku text NOT NULL,
  requests bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month_key, sku),
  CONSTRAINT google_maps_usage_counters_sku_chk
    CHECK (sku IN ('dynamic_maps', 'places', 'geocoding', 'distance')),
  CONSTRAINT google_maps_usage_counters_month_chk
    CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT google_maps_usage_counters_requests_chk
    CHECK (requests >= 0)
);

ALTER TABLE public.google_maps_usage_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.google_maps_usage_counters FROM PUBLIC;
GRANT SELECT ON TABLE public.google_maps_usage_counters TO authenticated, service_role;
GRANT INSERT, UPDATE ON TABLE public.google_maps_usage_counters TO service_role;

DROP POLICY IF EXISTS google_maps_usage_admin_select ON public.google_maps_usage_counters;
CREATE POLICY google_maps_usage_admin_select
  ON public.google_maps_usage_counters
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.increment_google_maps_usage(p_counts jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text;
  v_sku text;
  v_n integer;
BEGIN
  IF p_counts IS NULL OR jsonb_typeof(p_counts) <> 'object' THEN
    RETURN;
  END IF;

  v_month := to_char((now() AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM');

  FOREACH v_sku IN ARRAY ARRAY['dynamic_maps', 'places', 'geocoding', 'distance']
  LOOP
    BEGIN
      v_n := LEAST(40, GREATEST(0, COALESCE((p_counts ->> v_sku)::integer, 0)));
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_n := 0;
    END;
    IF v_n <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.google_maps_usage_counters (month_key, sku, requests, updated_at)
    VALUES (v_month, v_sku, v_n, now())
    ON CONFLICT (month_key, sku)
    DO UPDATE SET
      requests = public.google_maps_usage_counters.requests + EXCLUDED.requests,
      updated_at = now();
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_google_maps_usage(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_google_maps_usage(jsonb) TO anon, authenticated, service_role;
