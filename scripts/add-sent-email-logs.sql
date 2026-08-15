-- Sent email log + open tracking (tracking pixel via Netlify email-open-track).
-- Run once in Supabase SQL Editor.
--
-- AFTER running:
--   - All outbound CRM emails logged by Netlify send functions (service role).
--   - Admins can read logs in Settings; anon has no access.
--   - Open tracking uses opaque UUID tokens (not job/customer ids in URLs).
--   - Egress: slim list columns in app; pixel uses record_sent_email_open RPC (one write, no SELECT).

-- ---------------------------------------------------------------------------
-- Helpers (reuse from secure-customers-rls.sql if missing)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE lower(a.email) = lower(coalesce(
              nullif(auth.jwt() ->> 'email', ''),
              ''
            ))
        AND coalesce(a.is_active, true) = true
    );
$$;

-- ---------------------------------------------------------------------------
-- CRM settings (admin-only key/value)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'true'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_settings (key, value)
VALUES ('email_open_tracking_enabled', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = 'true'::jsonb,
    updated_at = now();

ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_settings_admin_select ON public.crm_settings;
DROP POLICY IF EXISTS crm_settings_admin_update ON public.crm_settings;
DROP POLICY IF EXISTS crm_settings_admin_insert ON public.crm_settings;

CREATE POLICY crm_settings_admin_select
  ON public.crm_settings FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY crm_settings_admin_update
  ON public.crm_settings FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY crm_settings_admin_insert
  ON public.crm_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.crm_settings FROM anon;

-- ---------------------------------------------------------------------------
-- Sent email logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sent_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_token uuid UNIQUE,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  template_type text NOT NULL DEFAULT 'unknown',
  document_brand text NOT NULL DEFAULT 'hydrogenro',
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  sent_by_user_id uuid,
  smtp_message_id text,
  tracking_pixel_enabled boolean NOT NULL DEFAULT true,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sent_email_logs_sent_at_idx
  ON public.sent_email_logs (sent_at DESC);

CREATE INDEX IF NOT EXISTS sent_email_logs_tracking_token_idx
  ON public.sent_email_logs (tracking_token)
  WHERE tracking_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS sent_email_logs_job_id_idx
  ON public.sent_email_logs (job_id)
  WHERE job_id IS NOT NULL;

-- Settings list: "not opened yet" filter (tracking on, no open timestamp)
CREATE INDEX IF NOT EXISTS sent_email_logs_unopened_list_idx
  ON public.sent_email_logs (sent_at DESC)
  WHERE opened_at IS NULL AND tracking_pixel_enabled = true;

-- Pixel handler: one UPDATE per first open (no SELECT round-trip from Netlify)
CREATE OR REPLACE FUNCTION public.record_sent_email_open(p_token uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.sent_email_logs
    SET opened_at = now(), open_count = 1
    WHERE tracking_token = p_token
      AND opened_at IS NULL
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

REVOKE ALL ON FUNCTION public.record_sent_email_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sent_email_open(uuid) TO service_role;

ALTER TABLE public.sent_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sent_email_logs_admin_select ON public.sent_email_logs;

CREATE POLICY sent_email_logs_admin_select
  ON public.sent_email_logs FOR SELECT TO authenticated
  USING (public.is_admin_user());

-- No INSERT/UPDATE for authenticated — Netlify service role only; admins may DELETE log rows.
REVOKE ALL ON TABLE public.sent_email_logs FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.sent_email_logs FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.sent_email_logs TO authenticated;

DROP POLICY IF EXISTS sent_email_logs_admin_delete ON public.sent_email_logs;

CREATE POLICY sent_email_logs_admin_delete
  ON public.sent_email_logs FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- Admin delete RPC (SECURITY DEFINER — use when table DELETE grant fails in PostgREST).
CREATE OR REPLACE FUNCTION public.delete_sent_email_logs(
  p_id uuid DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_brand text DEFAULT 'all',
  p_template_type text DEFAULT 'all',
  p_search text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
  search_term text;
  filter_norm text;
  brand_norm text;
  type_norm text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  filter_norm := coalesce(nullif(btrim(p_filter), ''), 'all');
  brand_norm := coalesce(nullif(btrim(p_brand), ''), 'all');
  type_norm := coalesce(nullif(btrim(p_template_type), ''), 'all');

  search_term := nullif(btrim(coalesce(p_search, '')), '');
  IF search_term IS NOT NULL THEN
    search_term := left(regexp_replace(search_term, '[%_,]', ' ', 'g'), 80);
    IF search_term = '' THEN
      search_term := NULL;
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    DELETE FROM public.sent_email_logs WHERE id = p_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END IF;

  WITH doomed AS (
    SELECT l.id
    FROM public.sent_email_logs l
    WHERE
      (
        filter_norm = 'all'
        OR (filter_norm = 'opened' AND l.opened_at IS NOT NULL)
        OR (filter_norm = 'not_opened' AND l.opened_at IS NULL AND l.tracking_pixel_enabled = true)
        OR (filter_norm = 'tracking_off' AND l.tracking_pixel_enabled = false)
      )
      AND (brand_norm = 'all' OR l.document_brand = brand_norm)
      AND (type_norm = 'all' OR l.template_type = type_norm)
      AND (
        search_term IS NULL
        OR l.recipient_email ILIKE '%' || search_term || '%'
        OR l.subject ILIKE '%' || search_term || '%'
      )
  )
  DELETE FROM public.sent_email_logs l
  USING doomed d
  WHERE l.id = d.id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_sent_email_logs(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_sent_email_logs(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sent_email_logs(uuid, text, text, text, text) TO service_role;
