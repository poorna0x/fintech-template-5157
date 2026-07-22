-- Master switch: technicians only see visit-order (#1/#2) when this is ON.
-- Default OFF. Admin toggles it in Tools → Arrange visit order.
-- Run in Supabase SQL Editor. Safe to re-run.

INSERT INTO public.crm_settings (key, value)
VALUES ('visit_order_visible_to_technicians', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Technicians cannot SELECT crm_settings (admin-only RLS). This RPC exposes
-- only the one boolean they need.
CREATE OR REPLACE FUNCTION public.is_visit_order_visible_to_technicians()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT CASE
        WHEN s.value = 'true'::jsonb THEN true
        WHEN s.value = 'false'::jsonb THEN false
        ELSE false
      END
      FROM public.crm_settings s
      WHERE s.key = 'visit_order_visible_to_technicians'
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_visit_order_visible_to_technicians() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_visit_order_visible_to_technicians() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_visit_order_visible_to_technicians() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_visit_order_visible_to_technicians() TO service_role;
