-- Structured product/part warranties for customers (separate from AMC contracts).
-- A warranty belongs to a customer (optionally tied to a job), has a start/end date,
-- and a set of covered items. Each item has a category (electricals, consumables,
-- outside filter, membrane, body, other), an optional link to an inventory part and/or
-- a job_parts_used row, and its own end date (default 3 months).
--
-- The public /warranty page looks these up by phone via a Netlify function using the
-- service-role key (bypasses RLS), so no anon policy is needed. Admin writes go through
-- the authenticated client and are gated by public.is_admin_user().
--
-- Run once in the Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL,
  default_months integer NOT NULL DEFAULT 3,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warranties_default_months_check CHECK (default_months >= 0 AND default_months <= 120)
);

CREATE TABLE IF NOT EXISTS public.warranty_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid NOT NULL REFERENCES public.warranties(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'OTHER',
  label text NOT NULL,
  -- Optional links. We intentionally do NOT FK job_part_id so a part can be removed
  -- from a job without cascading away its warranty history.
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  job_part_id uuid,
  months integer NOT NULL DEFAULT 3,
  -- Exact duration in days (30-day months, e.g. 3 months = 90 days). Source of truth.
  duration_days integer NOT NULL DEFAULT 90,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL,
  -- When false, the item is explicitly NOT covered (no warranty) and dates are ignored.
  covered boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warranty_items_category_check CHECK (
    category IN ('ELECTRICAL', 'MEMBRANE', 'CONSUMABLE', 'OUTSIDE_FILTER', 'BODY', 'OTHER')
  ),
  CONSTRAINT warranty_items_months_check CHECK (months >= 0 AND months <= 120),
  CONSTRAINT warranty_items_duration_days_check CHECK (duration_days >= 0 AND duration_days <= 3650)
);

-- Safe to re-run: add the covered flag to pre-existing warranty_items tables.
ALTER TABLE public.warranty_items ADD COLUMN IF NOT EXISTS covered boolean NOT NULL DEFAULT true;
-- Safe to re-run: add duration_days and backfill from months (30-day months) for old rows.
ALTER TABLE public.warranty_items ADD COLUMN IF NOT EXISTS duration_days integer;
UPDATE public.warranty_items
  SET duration_days = GREATEST(0, COALESCE(months, 0) * 30)
  WHERE duration_days IS NULL;
ALTER TABLE public.warranty_items ALTER COLUMN duration_days SET DEFAULT 90;

-- Lookups: a customer's warranties newest-first; active warranties by end date; items per warranty.
CREATE INDEX IF NOT EXISTS idx_warranties_customer ON public.warranties (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranties_end_date ON public.warranties (end_date);
CREATE INDEX IF NOT EXISTS idx_warranty_items_warranty ON public.warranty_items (warranty_id);

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_items ENABLE ROW LEVEL SECURITY;

-- Admin-only CRUD (no anon, no technician) — same pattern as amount_trackers / admin_todos.
DROP POLICY IF EXISTS warranties_admin_select ON public.warranties;
DROP POLICY IF EXISTS warranties_admin_insert ON public.warranties;
DROP POLICY IF EXISTS warranties_admin_update ON public.warranties;
DROP POLICY IF EXISTS warranties_admin_delete ON public.warranties;

CREATE POLICY warranties_admin_select ON public.warranties
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY warranties_admin_insert ON public.warranties
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY warranties_admin_update ON public.warranties
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY warranties_admin_delete ON public.warranties
  FOR DELETE TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS warranty_items_admin_select ON public.warranty_items;
DROP POLICY IF EXISTS warranty_items_admin_insert ON public.warranty_items;
DROP POLICY IF EXISTS warranty_items_admin_update ON public.warranty_items;
DROP POLICY IF EXISTS warranty_items_admin_delete ON public.warranty_items;

CREATE POLICY warranty_items_admin_select ON public.warranty_items
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY warranty_items_admin_insert ON public.warranty_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY warranty_items_admin_update ON public.warranty_items
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY warranty_items_admin_delete ON public.warranty_items
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- Keep warranties.updated_at fresh on every change.
CREATE OR REPLACE FUNCTION public.touch_warranties_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warranties_updated_at ON public.warranties;
CREATE TRIGGER trg_warranties_updated_at
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.touch_warranties_updated_at();

-- Public lookup by phone for the /warranty page. SECURITY DEFINER so the Netlify
-- function (service role) — or any caller we grant — can fetch a customer's warranties
-- and items without exposing other PII. Returns minimal, customer-facing fields only.
CREATE OR REPLACE FUNCTION public.get_warranties_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_customer public.customers;
  v_address text;
  v_result jsonb;
BEGIN
  -- Same normalization as booking (handles +91, leading 0, etc.).
  BEGIN
    v_norm := public.normalize_indian_phone(p_phone);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('found', false);
  END;

  SELECT * INTO v_customer
  FROM public.customers c
  WHERE right(regexp_replace(c.phone, '\D', '', 'g'), 10) = v_norm
     OR right(regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g'), 10) = v_norm
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Build a readable single-line address from the address jsonb, dropping blanks.
  v_address := array_to_string(
    array_remove(ARRAY[
      nullif(btrim(coalesce(v_customer.address->>'street', '')), ''),
      nullif(btrim(coalesce(v_customer.address->>'area', '')), ''),
      nullif(btrim(coalesce(v_customer.address->>'city', '')), ''),
      nullif(btrim(coalesce(v_customer.address->>'state', '')), ''),
      nullif(btrim(coalesce(v_customer.address->>'pincode', '')), '')
    ], NULL),
    ', '
  );

  SELECT jsonb_build_object(
    'found', true,
    'customer', jsonb_build_object(
      'name', v_customer.full_name,
      'customer_id', v_customer.customer_id,
      'visible_address', coalesce(v_customer.visible_address, ''),
      'address', coalesce(v_address, ''),
      'brand', coalesce(v_customer.brand, ''),
      'model', coalesce(v_customer.model, ''),
      'customer_since', v_customer.customer_since,
      'last_service_date', v_customer.last_service_date,
      'installation_date', v_customer.installation_date
    ),
    'warranties', coalesce((
      SELECT jsonb_agg(w_obj ORDER BY w_start DESC)
      FROM (
        SELECT
          w.start_date AS w_start,
          jsonb_build_object(
            'id', w.id,
            'start_date', w.start_date,
            'end_date', w.end_date,
            'notes', w.notes,
            'items', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', wi.id,
                'category', wi.category,
                'label', wi.label,
                'covered', wi.covered,
                'duration_days', wi.duration_days,
                'start_date', wi.start_date,
                'end_date', wi.end_date
              ) ORDER BY wi.covered DESC, wi.end_date DESC)
              FROM public.warranty_items wi
              WHERE wi.warranty_id = w.id
            ), '[]'::jsonb)
          ) AS w_obj
        FROM public.warranties w
        WHERE w.customer_id = v_customer.id
      ) sub
    ), '[]'::jsonb),
    -- Active AMC (if any) so the public page can show "Covered under AMC".
    'amc', (
      SELECT jsonb_build_object(
        'active', (a.end_date IS NULL OR a.end_date >= CURRENT_DATE),
        'start_date', a.start_date,
        'end_date', a.end_date
      )
      FROM public.amc_contracts a
      WHERE a.customer_id = v_customer.id
        AND a.status = 'ACTIVE'
      ORDER BY a.end_date DESC NULLS LAST, a.created_at DESC
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_warranties_by_phone(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_warranties_by_phone(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_warranties_by_phone(text) FROM authenticated;
-- Netlify warranty-lookup uses service_role; admin preview may use authenticated.
GRANT EXECUTE ON FUNCTION public.get_warranties_by_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_warranties_by_phone(text) TO authenticated;
