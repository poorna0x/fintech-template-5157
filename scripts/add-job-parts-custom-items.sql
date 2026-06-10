-- Allow logging a CUSTOM (one-off) part on a job that is not in the inventory
-- catalog. Such parts are entered by hand with a name, quantity and price, and
-- are NOT tracked in main / technician stock.
--
-- To support them we:
--   1) make inventory_id nullable (custom parts have no inventory row), and
--   2) add a custom_name column to hold the typed-in part name.
--
-- Custom rows use source = 'custom' so stock-restore logic skips them.
-- Postgres treats NULLs as distinct in UNIQUE keys, so multiple custom rows can
-- co-exist on the same job under the existing (job_id, inventory_id, source) key.
--
-- Safe to re-run.

ALTER TABLE public.job_parts_used
  ALTER COLUMN inventory_id DROP NOT NULL;

ALTER TABLE public.job_parts_used
  ADD COLUMN IF NOT EXISTS custom_name text;
