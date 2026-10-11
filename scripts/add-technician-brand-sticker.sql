-- Per-technician brand-sticker photo on job complete.
-- Default off. Turn on in Settings → Edit technician.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS brand_sticker_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.technicians.brand_sticker_required IS
  'When true, this technician sees a brand-sticker photo step after the bill photo in job complete. They can skip.';

-- Column-level SELECT: authenticated can only read granted columns.
GRANT SELECT (brand_sticker_required) ON TABLE public.technicians TO authenticated;
