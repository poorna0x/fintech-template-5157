-- Cleanup policy for "live booking intent" rows.
-- Option B: delete rows older than a TTL (default: 3 days) based on updated_at.
-- Run in Supabase SQL editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.cleanup_website_booking_intent(p_ttl interval DEFAULT interval '3 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  -- Guardrails: keep TTL within a reasonable range to avoid accidental mass deletes.
  IF p_ttl < interval '6 hours' OR p_ttl > interval '30 days' THEN
    RAISE EXCEPTION 'cleanup_website_booking_intent: ttl out of range: %', p_ttl;
  END IF;

  DELETE FROM public.website_booking_intent
  WHERE updated_at < (now() - p_ttl);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_website_booking_intent(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_website_booking_intent(interval) TO service_role;

-- Optional: schedule daily cleanup (requires pg_cron). If pg_cron isn't available, this block does nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 03:10 Asia/Kolkata-ish (DB timezone is usually UTC). Adjust as you prefer.
    -- Avoid duplicates if re-running.
    IF NOT EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'cleanup_website_booking_intent_daily'
    ) THEN
      PERFORM cron.schedule(
        'cleanup_website_booking_intent_daily',
        '10 21 * * *',
        $cmd$SELECT public.cleanup_website_booking_intent(interval '3 days');$cmd$
      );
    END IF;
  END IF;
EXCEPTION
  WHEN undefined_table OR insufficient_privilege THEN
    -- cron schema or permissions not available in this project; ignore.
    NULL;
END $$;

