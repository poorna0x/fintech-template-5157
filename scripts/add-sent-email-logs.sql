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
AS $$
  SELECT public.auth_user_role() IS DISTINCT FROM 'technician';
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
ON CONFLICT (key) DO NOTHING;

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

-- No INSERT/UPDATE/DELETE for authenticated — Netlify service role only.
REVOKE ALL ON TABLE public.sent_email_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sent_email_logs FROM authenticated;
GRANT SELECT ON TABLE public.sent_email_logs TO authenticated;
