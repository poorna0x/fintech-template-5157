-- Add "New Softener Installation" to the shared sub-service catalog.
-- Safe to re-run.

INSERT INTO public.service_sub_types (slug, label, sort_order, allow_custom_text, aliases)
VALUES ('new_softener_installation', 'New Softener Installation', 75, false, '{}')
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  allow_custom_text = EXCLUDED.allow_custom_text,
  updated_at = now();
