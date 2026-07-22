-- Weekly purge of short-lived operational rows (7-day default retention).
-- Invoked by the ephemeral-data-cleanup Netlify cron (service_role, Mondays 2 AM IST).
-- Skips any table that is not deployed yet (safe on partial migrations).
-- Run once in Supabase SQL Editor. Safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.technician_job_sync') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_technician_job_sync_created_at
      ON public.technician_job_sync (created_at);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.purge_ephemeral_data(
  p_retention_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_retention_days, 7), 365));
  v_cutoff timestamptz := now() - (v_days || ' days')::interval;
  v_incoming_cutoff timestamptz := now() - interval '1 hour';
  v_deleted jsonb := '{}'::jsonb;
  v_remaining jsonb := '{}'::jsonb;
  v_remaining_total integer := 0;
  v_n integer;
BEGIN
  IF to_regclass('public.admin_incoming_calls') IS NOT NULL THEN
    DELETE FROM public.admin_incoming_calls
    WHERE created_at < v_incoming_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('admin_incoming_calls', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.admin_incoming_calls
    WHERE created_at < v_incoming_cutoff;
    v_remaining := v_remaining || jsonb_build_object('admin_incoming_calls', v_n);
  END IF;

  IF to_regclass('public.technician_job_sync') IS NOT NULL THEN
    DELETE FROM public.technician_job_sync
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('technician_job_sync', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.technician_job_sync
    WHERE created_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('technician_job_sync', v_n);
  END IF;

  IF to_regclass('public.booking_abandonments') IS NOT NULL THEN
    DELETE FROM public.booking_abandonments
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('booking_abandonments', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.booking_abandonments
    WHERE created_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('booking_abandonments', v_n);
  END IF;

  IF to_regclass('public.website_booking_intent') IS NOT NULL THEN
    DELETE FROM public.website_booking_intent
    WHERE updated_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('website_booking_intent', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.website_booking_intent
    WHERE updated_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('website_booking_intent', v_n);
  END IF;

  IF to_regclass('public.website_booking_intent_archive') IS NOT NULL THEN
    DELETE FROM public.website_booking_intent_archive
    WHERE archived_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('website_booking_intent_archive', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.website_booking_intent_archive
    WHERE archived_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('website_booking_intent_archive', v_n);
  END IF;

  IF to_regclass('public.technician_otp_requests') IS NOT NULL THEN
    DELETE FROM public.technician_otp_requests
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('technician_otp_requests', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.technician_otp_requests
    WHERE created_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('technician_otp_requests', v_n);
  END IF;

  IF to_regclass('public.auth_login_attempts') IS NOT NULL THEN
    DELETE FROM public.auth_login_attempts
    WHERE last_attempt_at < v_cutoff
      AND (locked_until IS NULL OR locked_until <= now());
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('auth_login_attempts', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.auth_login_attempts
    WHERE last_attempt_at < v_cutoff
      AND (locked_until IS NULL OR locked_until <= now());
    v_remaining := v_remaining || jsonb_build_object('auth_login_attempts', v_n);
  END IF;

  IF to_regclass('public.website_analytics_events') IS NOT NULL THEN
    DELETE FROM public.website_analytics_events
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('website_analytics_events', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.website_analytics_events
    WHERE created_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('website_analytics_events', v_n);
  END IF;

  SELECT coalesce(sum((value)::text::integer), 0)::integer
  INTO v_remaining_total
  FROM jsonb_each(v_remaining);

  RETURN jsonb_build_object(
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'incoming_calls_cutoff', v_incoming_cutoff,
    'deleted', v_deleted,
    'remaining_stale', v_remaining,
    'verified', v_remaining_total = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_ephemeral_data(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_ephemeral_data(integer) TO service_role;
