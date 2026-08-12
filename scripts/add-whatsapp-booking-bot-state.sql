-- Booking bot ephemeral state (one row per phone — not inbox timeline rows).
-- Replaces stuffing JSON into whatsapp_messages.body on every bot step.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.whatsapp_booking_bot_state (
  phone_e164 text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  remembered_location jsonb,
  awaiting_media boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_booking_bot_state_updated_idx
  ON public.whatsapp_booking_bot_state (updated_at);

COMMENT ON TABLE public.whatsapp_booking_bot_state IS
  'Ephemeral WhatsApp booking-bot session (upsert per phone). Purged after ~48h. Not shown in inbox.';

ALTER TABLE public.whatsapp_booking_bot_state ENABLE ROW LEVEL SECURITY;

-- Service role only (Netlify webhook / booking bot).
REVOKE ALL ON TABLE public.whatsapp_booking_bot_state FROM anon;
REVOKE ALL ON TABLE public.whatsapp_booking_bot_state FROM authenticated;
GRANT ALL ON TABLE public.whatsapp_booking_bot_state TO service_role;

-- Extend weekly purge: drop stale bot sessions (not whatsapp_messages).
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
  v_bot_cutoff timestamptz := now() - interval '48 hours';
  v_otp_cutoff timestamptz := now() - interval '24 hours';
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

  IF to_regclass('public.technician_cash_pending') IS NOT NULL THEN
    DELETE FROM public.technician_cash_pending
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('technician_cash_pending', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.technician_cash_pending
    WHERE created_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('technician_cash_pending', v_n);
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

  IF to_regclass('public.pdf_authenticity_otp') IS NOT NULL THEN
    DELETE FROM public.pdf_authenticity_otp
    WHERE created_at < v_otp_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('pdf_authenticity_otp', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.pdf_authenticity_otp
    WHERE created_at < v_otp_cutoff;
    v_remaining := v_remaining || jsonb_build_object('pdf_authenticity_otp', v_n);
  END IF;

  IF to_regclass('public.whatsapp_booking_bot_state') IS NOT NULL THEN
    DELETE FROM public.whatsapp_booking_bot_state
    WHERE updated_at < v_bot_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('whatsapp_booking_bot_state', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.whatsapp_booking_bot_state
    WHERE updated_at < v_bot_cutoff;
    v_remaining := v_remaining || jsonb_build_object('whatsapp_booking_bot_state', v_n);
  END IF;

  -- whatsapp_messages retained (manual CRM timeline delete)

  SELECT coalesce(sum((value)::text::integer), 0)::integer
  INTO v_remaining_total
  FROM jsonb_each(v_remaining);

  RETURN jsonb_build_object(
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'incoming_calls_cutoff', v_incoming_cutoff,
    'booking_bot_cutoff', v_bot_cutoff,
    'deleted', v_deleted,
    'remaining_stale', v_remaining,
    'verified', v_remaining_total = 0,
    'whatsapp_messages', 'retained_manual_delete'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_ephemeral_data(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_ephemeral_data(integer) TO service_role;

-- Optional one-time cleanup of legacy bot state rows stuffed into inbox table.
DELETE FROM public.whatsapp_messages
WHERE direction = 'outbound'
  AND (
    body LIKE '[Booking bot state]%'
    OR body LIKE '[Booking bot loc]%'
  );
