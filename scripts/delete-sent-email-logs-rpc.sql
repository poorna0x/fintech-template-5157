-- Admin delete for sent_email_logs (works even when table DELETE grant is missing).
-- Run in Supabase SQL editor (safe to re-run).

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

CREATE OR REPLACE FUNCTION public.delete_sent_email_logs(
  p_id uuid DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_brand text DEFAULT 'all',
  p_template_type text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_sent_from timestamptz DEFAULT NULL,
  p_sent_to timestamptz DEFAULT NULL
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
      AND (p_sent_from IS NULL OR l.sent_at >= p_sent_from)
      AND (p_sent_to IS NULL OR l.sent_at < p_sent_to)
  )
  DELETE FROM public.sent_email_logs l
  USING doomed d
  WHERE l.id = d.id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

DROP FUNCTION IF EXISTS public.delete_sent_email_logs(uuid, text, text, text, text);

REVOKE ALL ON FUNCTION public.delete_sent_email_logs(uuid, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_sent_email_logs(uuid, text, text, text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sent_email_logs(uuid, text, text, text, text, timestamptz, timestamptz) TO service_role;

-- Table grants (direct DELETE fallback if RPC unavailable)
DROP POLICY IF EXISTS sent_email_logs_admin_delete ON public.sent_email_logs;

CREATE POLICY sent_email_logs_admin_delete
  ON public.sent_email_logs FOR DELETE TO authenticated
  USING (public.is_admin_user());

REVOKE INSERT, UPDATE ON TABLE public.sent_email_logs FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.sent_email_logs TO authenticated;
