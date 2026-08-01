-- Day-scoped visit-order visibility (Tools → Arrange visit order toggle).
-- When admin turns the switch ON, it only stays on for that IST calendar day.
-- Next day it reads as OFF (and is cleared lazily on read).
-- Run in Supabase SQL editor (safe to re-run).

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS visit_order_visible_on date;

COMMENT ON COLUMN public.technicians.visit_order_visible_on IS
  'IST calendar date (YYYY-MM-DD) when visit_order_visible was last turned ON. Stale dates are treated as OFF.';

-- technicians uses column-level SELECT grants — new columns need an explicit grant.
GRANT SELECT (visit_order_visible_on) ON TABLE public.technicians TO authenticated;

-- Existing sticky ON flags: reset so they don't stay forever without a day stamp.
UPDATE public.technicians
SET
  visit_order_visible = false,
  visit_order_visible_on = NULL
WHERE visit_order_visible = true
  AND visit_order_visible_on IS NULL;
