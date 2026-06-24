-- Server-paginated sent email log list (filters + total + one page of rows).
-- Run in Supabase SQL editor. Requires public.is_admin_user().

DROP FUNCTION IF EXISTS public.get_sent_email_logs_page(
  integer, integer, text, text, text, text, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.get_sent_email_logs_page(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_filter text DEFAULT 'all',
  p_brand text DEFAULT 'all',
  p_template_type text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_sent_from timestamptz DEFAULT NULL,
  p_sent_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer;
  off integer;
  filter_norm text;
  brand_norm text;
  type_norm text;
  search_term text;
  total_count integer;
  rows_json jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  lim := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  off := GREATEST(0, COALESCE(p_offset, 0));
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

  WITH filtered AS (
    SELECT
      l.id,
      l.recipient_email,
      l.subject,
      l.template_type,
      l.document_brand,
      l.sent_at,
      l.opened_at,
      l.tracking_pixel_enabled
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
  SELECT count(*)::integer INTO total_count FROM filtered;

  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.sent_at DESC), '[]'::jsonb)
  INTO rows_json
  FROM (
    SELECT
      f.id,
      f.recipient_email,
      f.subject,
      f.template_type,
      f.document_brand,
      f.sent_at,
      f.opened_at,
      f.tracking_pixel_enabled
    FROM filtered f
    ORDER BY f.sent_at DESC
    LIMIT lim OFFSET off
  ) p;

  RETURN jsonb_build_object(
    'total', total_count,
    'rows', rows_json,
    'server_paginated', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sent_email_logs_page(
  integer, integer, text, text, text, text, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sent_email_logs_page(
  integer, integer, text, text, text, text, timestamptz, timestamptz
) TO authenticated;
