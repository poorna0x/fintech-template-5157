-- Optional customer-facing name for inventory items (bills / quotations / invoices).
-- Internal stock UIs keep using product_name; documents prefer full_name when set.
-- Safe to re-run.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS full_name text;

COMMENT ON COLUMN public.inventory.full_name IS
  'Customer-facing name for bills/quotes/invoices; falls back to product_name when null/empty';
