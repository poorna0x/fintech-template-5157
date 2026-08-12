-- Admin-managed lead sources, sub-services, and per-pair lead cost rules.
-- Safe to re-run. Run: node scripts/apply-lead-catalog.mjs

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  requires_otp boolean NOT NULL DEFAULT false,
  allow_custom_text boolean NOT NULL DEFAULT false,
  default_cost_inr numeric(10, 2) NOT NULL DEFAULT 0,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_sub_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  allow_custom_text boolean NOT NULL DEFAULT false,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_cost_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_source_id uuid NOT NULL REFERENCES public.lead_sources (id) ON DELETE CASCADE,
  service_sub_type_id uuid REFERENCES public.service_sub_types (id) ON DELETE CASCADE,
  cost_inr numeric(10, 2) NOT NULL,
  priority integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_source_id, service_sub_type_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_active_sort
  ON public.lead_sources (active, sort_order);
CREATE INDEX IF NOT EXISTS idx_service_sub_types_active_sort
  ON public.service_sub_types (active, sort_order);
CREATE INDEX IF NOT EXISTS idx_lead_cost_rules_source
  ON public.lead_cost_rules (lead_source_id);

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_sub_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_cost_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_sources_admin ON public.lead_sources;
CREATE POLICY lead_sources_admin ON public.lead_sources
  FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS service_sub_types_admin ON public.service_sub_types;
CREATE POLICY service_sub_types_admin ON public.service_sub_types
  FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS lead_cost_rules_admin ON public.lead_cost_rules;
CREATE POLICY lead_cost_rules_admin ON public.lead_cost_rules
  FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- Seed (idempotent by slug)
-- ---------------------------------------------------------------------------
INSERT INTO public.lead_sources (slug, label, sort_order, requires_otp, allow_custom_text, default_cost_inr, aliases)
VALUES
  ('website', 'Website', 10, false, false, 0, ARRAY['website (hydrogenro)', 'website (elevenro)']),
  ('direct_call', 'Direct call', 20, false, false, 0, '{}'),
  ('google_leads', 'Google-Leads', 30, false, false, 0, '{}'),
  ('ro_care_india', 'RO care india', 40, false, false, 400, '{}'),
  ('home_triangle', 'Home Triangle', 50, true, false, 231, '{}'),
  ('home_triangle_srujan', 'Home Triangle-Srujan', 60, true, false, 231, '{}'),
  ('home_triangle_3', 'Home Triangle-3', 70, true, false, 231, '{}'),
  ('local_ramu', 'Local Ramu', 80, false, false, 500, '{}'),
  ('other', 'Other', 999, false, true, 0, '{}')
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  requires_otp = EXCLUDED.requires_otp,
  allow_custom_text = EXCLUDED.allow_custom_text,
  default_cost_inr = EXCLUDED.default_cost_inr,
  aliases = EXCLUDED.aliases,
  updated_at = now();

INSERT INTO public.service_sub_types (slug, label, sort_order, allow_custom_text, aliases)
VALUES
  ('service', 'Service', 10, false, '{}'),
  ('installation', 'Installation', 20, false, '{}'),
  ('reinstallation', 'Reinstallation', 30, false, '{}'),
  ('return_complaint', 'Return Complaint', 40, false, '{}'),
  ('return_service', 'Return Service', 50, false, '{}'),
  ('amc_service', 'AMC Service', 60, false, '{}'),
  ('new_purifier_installation', 'New Purifier Installation', 70, false, '{}'),
  ('un_installation', 'Un-Installation', 80, false, '{}'),
  ('repair', 'Repair', 90, false, '{}'),
  ('maintenance', 'Maintenance', 100, false, '{}'),
  ('replacement', 'Replacement', 110, false, '{}'),
  ('inspection', 'Inspection', 120, false, '{}'),
  ('other', 'Other', 999, true, '{}')
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  allow_custom_text = EXCLUDED.allow_custom_text,
  aliases = EXCLUDED.aliases,
  updated_at = now();

-- Home Triangle variants: Installation / Reinstallation → ₹116
INSERT INTO public.lead_cost_rules (lead_source_id, service_sub_type_id, cost_inr, priority)
SELECT ls.id, st.id, 116, 20
FROM public.lead_sources ls
CROSS JOIN public.service_sub_types st
WHERE ls.slug IN ('home_triangle', 'home_triangle_srujan', 'home_triangle_3')
  AND st.slug IN ('installation', 'reinstallation')
ON CONFLICT (lead_source_id, service_sub_type_id) DO UPDATE SET
  cost_inr = EXCLUDED.cost_inr,
  priority = EXCLUDED.priority,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Resolve lead source / sub-type text → catalog row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_catalog_match_source(p_text text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ls.id
  FROM public.lead_sources ls
  WHERE ls.active
    AND (
      lower(trim(ls.label)) = lower(trim(coalesce(p_text, '')))
      OR lower(trim(p_text)) = ANY (SELECT lower(unnest(ls.aliases)))
    )
  ORDER BY ls.sort_order
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.lead_catalog_match_sub_type(p_text text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT st.id
  FROM public.service_sub_types st
  WHERE st.active
    AND (
      lower(trim(st.label)) = lower(trim(coalesce(p_text, '')))
      OR lower(trim(p_text)) = ANY (SELECT lower(unnest(st.aliases)))
      OR st.slug = lower(regexp_replace(trim(coalesce(p_text, '')), '[^a-z0-9]+', '_', 'gi'))
    )
  ORDER BY st.sort_order
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_default_lead_cost(
  p_lead_source text,
  p_service_sub_type text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_source_id uuid;
  v_sub_type_id uuid;
  v_cost numeric;
  v_src text := lower(trim(coalesce(p_lead_source, '')));
  v_sub text := lower(trim(coalesce(p_service_sub_type, '')));
BEGIN
  v_source_id := public.lead_catalog_match_source(p_lead_source);
  IF v_source_id IS NOT NULL THEN
    IF v_sub <> '' THEN
      v_sub_type_id := public.lead_catalog_match_sub_type(p_service_sub_type);
    END IF;

    SELECT r.cost_inr INTO v_cost
    FROM public.lead_cost_rules r
    WHERE r.lead_source_id = v_source_id
      AND (
        (v_sub_type_id IS NOT NULL AND r.service_sub_type_id = v_sub_type_id)
        OR r.service_sub_type_id IS NULL
      )
    ORDER BY
      CASE WHEN r.service_sub_type_id IS NOT NULL AND r.service_sub_type_id = v_sub_type_id THEN 0 ELSE 1 END,
      r.priority DESC
    LIMIT 1;

    IF v_cost IS NOT NULL THEN
      RETURN v_cost;
    END IF;

    SELECT ls.default_cost_inr INTO v_cost FROM public.lead_sources ls WHERE ls.id = v_source_id;
    RETURN coalesce(v_cost, 0);
  END IF;

  -- Legacy fallback if catalog row missing (pre-migration / unknown label)
  IF v_src LIKE 'home triangle%' AND v_sub IN ('installation', 'reinstallation') THEN
    RETURN 116;
  END IF;
  IF v_src LIKE 'home triangle%' THEN RETURN 231; END IF;
  IF v_src = 'ro care india' THEN RETURN 400; END IF;
  IF v_src = 'local ramu' THEN RETURN 500; END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_lead_cost(p_lead_source text, p_service_sub_type text)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.resolve_default_lead_cost(p_lead_source, p_service_sub_type);
$$;

-- One round-trip catalog for admin UI (cached client-side; not polled).
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
          'aliases', ls.aliases
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

REVOKE ALL ON FUNCTION public.resolve_default_lead_cost(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_default_lead_cost(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_default_lead_cost(text, text) TO service_role;
