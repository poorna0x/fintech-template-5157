-- WhatsApp Cloud API message store (7-day retention).
-- Phase 1 foundation — run once in Supabase SQL Editor (or via psql / DATABASE_URL).
-- Safe to re-run.
--
-- AFTER running:
--   - Admins SELECT via is_admin_user(); anon has no access.
--   - INSERT/UPDATE only via service_role (Netlify webhook/send).
--   - purge_ephemeral_data() deletes rows older than retention (default 7 days).
--
-- Optional: store Cloud API credentials in app_secrets (keys below). Env vars still
-- work as local fallback: WHATSAPP_ACCESS_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN.
--
--   INSERT INTO public.app_secrets (key, value) VALUES
--     ('whatsapp_access_token', '<token>'),
--     ('whatsapp_phone_number_id', '<phone_number_id>'),
--     ('whatsapp_verify_token', '<verify_token>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_e164 text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  msg_type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  media_mime text,
  filename text,
  status text,
  template_name text,
  error_message text,
  sent_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_uidx
  ON public.whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_created_idx
  ON public.whatsapp_messages (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_messages_created_at_idx
  ON public.whatsapp_messages (created_at);

CREATE INDEX IF NOT EXISTS whatsapp_messages_customer_created_idx
  ON public.whatsapp_messages (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

COMMENT ON TABLE public.whatsapp_messages IS
  'WhatsApp Cloud API thread rows; 7-day retention via purge_ephemeral_data.';

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_messages_admin_select ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_select
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS whatsapp_messages_admin_delete ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_delete
  ON public.whatsapp_messages FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- No INSERT/UPDATE for authenticated — service role only (webhook/send).
REVOKE ALL ON TABLE public.whatsapp_messages FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.whatsapp_messages FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.whatsapp_messages TO authenticated;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;

-- ---------------------------------------------------------------------------
-- Extend weekly purge to include whatsapp_messages (same retention default).
-- ---------------------------------------------------------------------------

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

  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    DELETE FROM public.whatsapp_messages
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('whatsapp_messages', v_n);

    SELECT count(*)::integer INTO v_n
    FROM public.whatsapp_messages
    WHERE created_at < v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('whatsapp_messages', v_n);
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

-- Optional: live inbox updates (Phase 3)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END $$;
