-- Per-technician: brand sticker photo cannot be skipped.
-- Only applies when brand_sticker_required is also true.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS brand_sticker_no_skip boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.technicians.brand_sticker_no_skip IS
  'When true (and brand_sticker_required is true), the technician must upload the brand sticker photo. Skip is hidden.';

GRANT SELECT (brand_sticker_no_skip) ON TABLE public.technicians TO authenticated;
