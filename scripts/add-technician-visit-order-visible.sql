-- Per-technician visit-order visibility (Tools → Arrange visit order toggle).
-- Default OFF. Admin turns it on for one technician at a time.
-- Replaces the old global crm_settings key `visit_order_visible_to_technicians`.
-- Run in Supabase SQL editor (safe to re-run).

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS visit_order_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.technicians.visit_order_visible IS
  'When true, this technician sees visit-order stop numbers (#1, #2…) on their app. Toggled per tech in Arrange visit order.';

-- technicians uses column-level SELECT grants — new columns need an explicit grant.
GRANT SELECT (visit_order_visible) ON TABLE public.technicians TO authenticated;

-- Optional cleanup: old master switch is unused after this migration.
DELETE FROM public.crm_settings
WHERE key = 'visit_order_visible_to_technicians';

DROP FUNCTION IF EXISTS public.is_visit_order_visible_to_technicians();
