-- Remove legacy wide-open technician_payments policies (USING true) left from old schema.
-- Run if verify-all-rls shows policy_count = 8 on technician_payments (should be 4 after this).
-- Safe to re-run.

DROP POLICY IF EXISTS technician_payments_select_policy ON public.technician_payments;
DROP POLICY IF EXISTS technician_payments_insert_policy ON public.technician_payments;
DROP POLICY IF EXISTS technician_payments_update_policy ON public.technician_payments;
DROP POLICY IF EXISTS technician_payments_delete_policy ON public.technician_payments;
