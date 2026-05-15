-- GST / tax invoice deletes were blocked for anon while insert/select/update allow all roles.
-- Symptom: UI shows "deleted" but invoice reappears after refresh or tab focus.
-- Run in Supabase SQL editor. Safe to re-run.

DROP POLICY IF EXISTS "Allow all users to delete tax invoices" ON public.tax_invoices;

CREATE POLICY "Allow all users to delete tax invoices"
  ON public.tax_invoices
  FOR DELETE
  USING (true);
