-- Admin Data Export (Settings → Download All Data): SELECT access for tables
-- that were service-role-only or deny-all under RLS.
-- Full admins only. Secret values are never returned (RPC redacts app_secrets).
-- Safe to re-run.

GRANT SELECT ON TABLE public.auth_login_attempts TO authenticated;
DROP POLICY IF EXISTS auth_login_attempts_admin_select ON public.auth_login_attempts;
CREATE POLICY auth_login_attempts_admin_select
  ON public.auth_login_attempts
  FOR SELECT TO authenticated
  USING (public.is_full_admin_user());

GRANT SELECT ON TABLE public.whatsapp_booking_bot_state TO authenticated;
DROP POLICY IF EXISTS whatsapp_booking_bot_state_admin_select ON public.whatsapp_booking_bot_state;
CREATE POLICY whatsapp_booking_bot_state_admin_select
  ON public.whatsapp_booking_bot_state
  FOR SELECT TO authenticated
  USING (public.is_full_admin_user());

GRANT SELECT ON TABLE public.pdf_authenticity_otp TO authenticated;
DROP POLICY IF EXISTS pdf_authenticity_otp_admin_select ON public.pdf_authenticity_otp;
CREATE POLICY pdf_authenticity_otp_admin_select
  ON public.pdf_authenticity_otp
  FOR SELECT TO authenticated
  USING (public.is_full_admin_user());

GRANT SELECT ON TABLE public.tech_call_alert_events TO authenticated;
DROP POLICY IF EXISTS tech_call_alert_events_admin_select ON public.tech_call_alert_events;
CREATE POLICY tech_call_alert_events_admin_select
  ON public.tech_call_alert_events
  FOR SELECT TO authenticated
  USING (public.is_full_admin_user());

GRANT SELECT ON TABLE public.technician_job_sync TO authenticated;
DROP POLICY IF EXISTS technician_job_sync_admin_select ON public.technician_job_sync;
CREATE POLICY technician_job_sync_admin_select
  ON public.technician_job_sync
  FOR SELECT TO authenticated
  USING (public.is_full_admin_user());

CREATE OR REPLACE FUNCTION public.admin_export_app_secrets()
RETURNS TABLE(key text, updated_at timestamptz, value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_full_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT s.key, s.updated_at, '[REDACTED]'::text
  FROM public.app_secrets s
  ORDER BY s.key;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_export_app_secrets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_export_app_secrets() TO authenticated, service_role;

-- Pay-QR watch: policy existed but SELECT was revoked from authenticated.
GRANT SELECT ON TABLE public.whatsapp_pay_qr_watch TO authenticated;

-- Live catalog + row dump for Data Export. New public tables are included automatically
-- (SECURITY DEFINER bypasses missing GRANT / RLS on future tables).
CREATE OR REPLACE FUNCTION public.admin_list_export_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT public.is_full_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', t.table_name,
        'order_by', t.order_by
      )
      ORDER BY t.table_name
    ),
    '[]'::jsonb
  )
  INTO v_out
  FROM (
    SELECT
      c.relname AS table_name,
      COALESCE(
        (
          SELECT a.attname
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND NOT a.attisdropped
            AND a.attnum > 0
            AND a.attname = 'created_at'
          LIMIT 1
        ),
        (
          SELECT a.attname
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND NOT a.attisdropped
            AND a.attnum > 0
            AND a.attname = 'updated_at'
          LIMIT 1
        ),
        (
          SELECT a.attname
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND NOT a.attisdropped
            AND a.attnum > 0
            AND a.attname = 'id'
          LIMIT 1
        ),
        (
          SELECT a.attname
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND NOT a.attisdropped
            AND a.attnum > 0
          ORDER BY a.attnum
          LIMIT 1
        )
      ) AS order_by
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
  ) t;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_table_rows(
  p_table text,
  p_order_by text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text := lower(trim(coalesce(p_table, '')));
  v_oid oid;
  v_order text;
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 1000), 1), 1000);
  v_sql text;
  v_rows jsonb;
BEGIN
  IF NOT public.is_full_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_table !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid table';
  END IF;

  SELECT c.oid INTO v_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = v_table;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'unknown table';
  END IF;

  v_order := NULLIF(trim(coalesce(p_order_by, '')), '');
  IF v_order IS NOT NULL THEN
    IF v_order !~ '^[a-z_][a-z0-9_]*$' THEN
      v_order := NULL;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = v_oid
        AND NOT a.attisdropped
        AND a.attnum > 0
        AND a.attname = v_order
    ) THEN
      v_order := NULL;
    END IF;
  END IF;

  IF v_table = 'app_secrets' THEN
    v_sql := format(
      'SELECT coalesce(jsonb_agg(q.row), ''[]''::jsonb) FROM (
         SELECT jsonb_build_object(
           ''key'', t.key,
           ''updated_at'', t.updated_at,
           ''value'', ''[REDACTED]''
         ) AS row
         FROM public.app_secrets t
         %s
         OFFSET %s LIMIT %s
       ) q',
      CASE WHEN v_order IS NOT NULL THEN format('ORDER BY t.%I NULLS LAST', v_order) ELSE 'ORDER BY t.key' END,
      v_offset,
      v_limit
    );
  ELSIF v_table = 'amc_pdf_authenticity' THEN
    v_sql := format(
      'SELECT coalesce(jsonb_agg(q.row), ''[]''::jsonb) FROM (
         SELECT (to_jsonb(t) - ''pdf_base64'') AS row
         FROM public.amc_pdf_authenticity t
         %s
         OFFSET %s LIMIT %s
       ) q',
      CASE WHEN v_order IS NOT NULL THEN format('ORDER BY t.%I NULLS LAST', v_order) ELSE '' END,
      v_offset,
      v_limit
    );
  ELSE
    v_sql := format(
      'SELECT coalesce(jsonb_agg(q.row), ''[]''::jsonb) FROM (
         SELECT to_jsonb(t) AS row
         FROM public.%I t
         %s
         OFFSET %s LIMIT %s
       ) q',
      v_table,
      CASE WHEN v_order IS NOT NULL THEN format('ORDER BY t.%I NULLS LAST', v_order) ELSE '' END,
      v_offset,
      v_limit
    );
  END IF;

  EXECUTE v_sql INTO v_rows;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'has_more', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) >= v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_export_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_export_table_rows(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_export_tables() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_export_table_rows(text, text, integer, integer) TO authenticated, service_role;
