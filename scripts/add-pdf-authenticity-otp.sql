-- Public PDF authenticity WhatsApp OTP (service_role only).
-- Safe to re-run.
--
-- Flow: visitor texts VERIFY → webhook stores hashed OTP → /authenticity verifies
-- phone+OTP via Netlify function (never client SELECT).

CREATE TABLE IF NOT EXISTS public.pdf_authenticity_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip text
);

CREATE INDEX IF NOT EXISTS pdf_authenticity_otp_phone_created_idx
  ON public.pdf_authenticity_otp (phone_e164, created_at DESC);

COMMENT ON TABLE public.pdf_authenticity_otp IS
  'Hashed WhatsApp VERIFY OTPs for public /authenticity; service_role only; short TTL.';

ALTER TABLE public.pdf_authenticity_otp ENABLE ROW LEVEL SECURITY;

-- Deny everyone except service_role (which bypasses RLS).
DROP POLICY IF EXISTS pdf_authenticity_otp_deny_all ON public.pdf_authenticity_otp;
CREATE POLICY pdf_authenticity_otp_deny_all
  ON public.pdf_authenticity_otp
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.pdf_authenticity_otp FROM PUBLIC;
REVOKE ALL ON TABLE public.pdf_authenticity_otp FROM anon;
REVOKE ALL ON TABLE public.pdf_authenticity_otp FROM authenticated;
GRANT ALL ON TABLE public.pdf_authenticity_otp TO service_role;

-- Extend purge_ephemeral_data to drop OTP rows older than 24h.
-- Mirrors scripts/whatsapp-inbox-long-retention.sql (+ pdf_authenticity_otp).
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

  -- whatsapp_messages retained (manual CRM timeline delete)

  SELECT coalesce(sum((value)::text::integer), 0)::integer
  INTO v_remaining_total
  FROM jsonb_each(v_remaining);

  RETURN jsonb_build_object(
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'incoming_calls_cutoff', v_incoming_cutoff,
    'deleted', v_deleted,
    'remaining_stale', v_remaining,
    'verified', v_remaining_total = 0,
    'whatsapp_messages', 'retained_manual_delete'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_ephemeral_data(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_ephemeral_data(integer) TO service_role;
