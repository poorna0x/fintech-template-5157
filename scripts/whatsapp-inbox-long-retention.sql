-- WhatsApp inbox: long retention + slim thread list RPC.
-- Safe to re-run. Removes whatsapp_messages from weekly purge; adds whatsapp_inbox_threads().

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


COMMENT ON TABLE public.whatsapp_messages IS
  'WhatsApp Cloud API thread rows; long retention. Media on private R2; purge via CRM timeline delete.';

-- Slim people list for inbox (one row per phone = latest message preview only).
-- Optional p_since: only threads whose latest message is on/after that time.
-- customer_name joined server-side — avoids extra CRM round-trips from the app.
DROP FUNCTION IF EXISTS public.whatsapp_inbox_threads(integer);
DROP FUNCTION IF EXISTS public.whatsapp_inbox_threads(integer, timestamptz);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_created_desc
  ON public.whatsapp_messages (phone_e164, created_at DESC);

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_threads(
  p_limit integer DEFAULT 200,
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  phone_e164 text,
  customer_id uuid,
  customer_name text,
  last_at timestamptz,
  last_direction text,
  last_msg_type text,
  last_status text,
  last_error text,
  last_body text,
  inbound_at timestamptz,
  has_failed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      m.phone_e164,
      m.customer_id,
      m.created_at,
      m.direction,
      m.msg_type,
      m.status,
      m.error_message,
      CASE
        WHEN m.body IS NOT NULL AND length(trim(m.body)) > 0 THEN left(trim(m.body), 160)
        WHEN m.filename IS NOT NULL AND length(trim(m.filename)) > 0 THEN left(trim(m.filename), 80)
        ELSE coalesce(m.msg_type, 'message')
      END AS preview
    FROM public.whatsapp_messages m
    WHERE m.phone_e164 IS NOT NULL
      AND length(trim(m.phone_e164)) > 0
      AND (p_since IS NULL OR m.created_at >= p_since)
  ),
  ranked AS (
    SELECT
      f.*,
      row_number() OVER (PARTITION BY f.phone_e164 ORDER BY f.created_at DESC) AS rn
    FROM filtered f
  ),
  latest AS (
    SELECT * FROM ranked WHERE rn = 1
    ORDER BY created_at DESC
    LIMIT v_limit
  ),
  inbound AS (
    SELECT
      m.phone_e164,
      max(m.created_at) AS inbound_at
    FROM public.whatsapp_messages m
    WHERE m.direction = 'inbound'
      AND m.phone_e164 IN (SELECT l.phone_e164 FROM latest l)
    GROUP BY m.phone_e164
  )
  SELECT
    l.phone_e164::text,
    l.customer_id,
    nullif(trim(c.full_name), '')::text AS customer_name,
    l.created_at AS last_at,
    l.direction::text AS last_direction,
    l.msg_type::text AS last_msg_type,
    l.status::text AS last_status,
    l.error_message::text AS last_error,
    l.preview::text AS last_body,
    i.inbound_at,
    (
      l.direction = 'outbound'
      AND (
        lower(coalesce(l.status, '')) IN ('failed', 'undelivered', 'error')
        OR (l.error_message IS NOT NULL AND length(trim(l.error_message)) > 0)
      )
    ) AS has_failed
  FROM latest l
  LEFT JOIN inbound i ON i.phone_e164 = l.phone_e164
  LEFT JOIN public.customers c ON c.id = l.customer_id
  ORDER BY l.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_inbox_threads(integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_threads(integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_threads(integer, timestamptz) TO service_role;

-- Search: latest preview row per phone (no media columns, no full thread dump).
DROP FUNCTION IF EXISTS public.whatsapp_inbox_latest_by_phones(text[]);

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_latest_by_phones(p_phones text[])
RETURNS TABLE (
  phone_e164 text,
  customer_id uuid,
  customer_name text,
  last_at timestamptz,
  last_direction text,
  last_msg_type text,
  last_status text,
  last_error text,
  last_body text,
  inbound_at timestamptz,
  has_failed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_phones IS NULL OR cardinality(p_phones) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH phones AS (
    SELECT DISTINCT nullif(trim(p), '') AS phone
    FROM unnest(p_phones) AS p
    WHERE nullif(trim(p), '') IS NOT NULL
  ),
  latest AS (
    SELECT DISTINCT ON (m.phone_e164)
      m.phone_e164,
      m.customer_id,
      m.created_at,
      m.direction,
      m.msg_type,
      m.status,
      m.error_message,
      CASE
        WHEN m.body IS NOT NULL AND length(trim(m.body)) > 0 THEN left(trim(m.body), 160)
        WHEN m.filename IS NOT NULL AND length(trim(m.filename)) > 0 THEN left(trim(m.filename), 80)
        ELSE coalesce(m.msg_type, 'message')
      END AS preview
    FROM public.whatsapp_messages m
    INNER JOIN phones p ON p.phone = m.phone_e164
    ORDER BY m.phone_e164, m.created_at DESC
  ),
  inbound AS (
    SELECT
      m.phone_e164,
      max(m.created_at) AS inbound_at
    FROM public.whatsapp_messages m
    INNER JOIN phones p ON p.phone = m.phone_e164
    WHERE m.direction = 'inbound'
    GROUP BY m.phone_e164
  )
  SELECT
    l.phone_e164::text,
    l.customer_id,
    nullif(trim(c.full_name), '')::text AS customer_name,
    l.created_at AS last_at,
    l.direction::text AS last_direction,
    l.msg_type::text AS last_msg_type,
    l.status::text AS last_status,
    l.error_message::text AS last_error,
    l.preview::text AS last_body,
    i.inbound_at,
    (
      l.direction = 'outbound'
      AND (
        lower(coalesce(l.status, '')) IN ('failed', 'undelivered', 'error')
        OR (l.error_message IS NOT NULL AND length(trim(l.error_message)) > 0)
      )
    ) AS has_failed
  FROM latest l
  LEFT JOIN inbound i ON i.phone_e164 = l.phone_e164
  LEFT JOIN public.customers c ON c.id = l.customer_id
  ORDER BY l.created_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_inbox_latest_by_phones(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_latest_by_phones(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_latest_by_phones(text[]) TO service_role;
