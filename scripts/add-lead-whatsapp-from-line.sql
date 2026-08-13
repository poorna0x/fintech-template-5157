-- Per-lead WhatsApp “from …” line for Quick Customer / Water Filter Service.
-- Empty = client resolver (Home Triangle / brand / "{label} Water Filter Service").
-- Safe to re-run.

ALTER TABLE public.lead_sources
  ADD COLUMN IF NOT EXISTS whatsapp_from_line text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.lead_sources.whatsapp_from_line IS
  'WhatsApp greeting identity when Quick Customer uses From lead. Empty = resolver fallback.';

UPDATE public.lead_sources
SET whatsapp_from_line = 'Home Triangle Water Filter Service',
    updated_at = now()
WHERE slug IN ('home_triangle', 'home_triangle_srujan', 'home_triangle_3')
  AND coalesce(trim(whatsapp_from_line), '') = '';

CREATE OR REPLACE FUNCTION public.get_lead_catalog(p_include_inactive boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN jsonb_build_object(
    'sources',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ls.id,
          'slug', ls.slug,
          'label', ls.label,
          'sort_order', ls.sort_order,
          'active', ls.active,
          'requires_otp', ls.requires_otp,
          'allow_custom_text', ls.allow_custom_text,
          'default_cost_inr', ls.default_cost_inr,
          'aliases', ls.aliases,
          'whatsapp_from_line', coalesce(ls.whatsapp_from_line, '')
        )
        ORDER BY ls.sort_order, ls.label
      )
      FROM public.lead_sources ls
      WHERE p_include_inactive OR ls.active
    ), '[]'::jsonb),
    'sub_types',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', st.id,
          'slug', st.slug,
          'label', st.label,
          'sort_order', st.sort_order,
          'active', st.active,
          'allow_custom_text', st.allow_custom_text,
          'aliases', st.aliases
        )
        ORDER BY st.sort_order, st.label
      )
      FROM public.service_sub_types st
      WHERE p_include_inactive OR st.active
    ), '[]'::jsonb),
    'rules',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'lead_source_id', r.lead_source_id,
          'service_sub_type_id', r.service_sub_type_id,
          'cost_inr', r.cost_inr,
          'priority', r.priority
        )
      )
      FROM public.lead_cost_rules r
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_lead_catalog(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lead_catalog(boolean) TO authenticated;
