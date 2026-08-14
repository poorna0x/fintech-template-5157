-- Team-wide WhatsApp unread total for Tools / header (any admin device).
-- Counts inbound messages after each chat's shared read watermark.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_unread_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '30 days';
  v_total int := 0;
  v_per jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH inbound AS (
    SELECT
      regexp_replace(coalesce(m.phone_e164, ''), '\D', '', 'g') AS phone,
      m.created_at
    FROM public.whatsapp_messages m
    WHERE m.direction = 'inbound'
      AND m.created_at > v_since
      AND coalesce(m.phone_e164, '') <> ''
  ),
  counted AS (
    SELECT
      i.phone,
      LEAST(COUNT(*)::int, 999) AS n
    FROM inbound i
    LEFT JOIN public.whatsapp_inbox_read r ON r.phone_e164 = i.phone
    WHERE i.phone <> ''
      AND (r.read_at IS NULL OR i.created_at > r.read_at)
    GROUP BY i.phone
    HAVING COUNT(*) > 0
  )
  SELECT
    LEAST(COALESCE(SUM(n), 0)::int, 999),
    COALESCE(jsonb_object_agg(phone, n), '{}'::jsonb)
  INTO v_total, v_per
  FROM counted;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'per_phone', COALESCE(v_per, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.whatsapp_inbox_unread_summary() IS
  'Admin-only team unread: inbound whatsapp_messages after whatsapp_inbox_read watermarks (30 days).';

REVOKE ALL ON FUNCTION public.whatsapp_inbox_unread_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_unread_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_unread_summary() TO service_role;
