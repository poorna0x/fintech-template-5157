-- Lock all write operations (INSERT/UPDATE/DELETE) to authenticated users only.
-- Goal: Only your people (admin/technician who log in) can change data.
-- Anon / unauthenticated (e.g. someone with only the anon key) cannot insert, update, or delete.
--
-- How to apply: run this migration (e.g. supabase db push, or run in Dashboard SQL Editor).
--
-- We drop the permissive policies that used USING (true) / WITH CHECK (true) for writes
-- and replace them with the same scope but TO authenticated only.
--
-- Note: "Allow anonymous to insert customers" is now authenticated-only. If you have a
-- public signup flow that inserts into customers without login, do that via a
-- backend/Edge Function with service role, or add a separate anon policy for that one use.

-- ---------------------------------------------------------------------------
-- admin_todos
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "todos_delete_anon" ON public.admin_todos;
CREATE POLICY "todos_delete_anon" ON public.admin_todos FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "todos_insert_anon" ON public.admin_todos;
CREATE POLICY "todos_insert_anon" ON public.admin_todos FOR INSERT TO authenticated WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- amc_contracts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to update amc_contracts" ON public.amc_contracts;
CREATE POLICY "Allow all users to update amc_contracts" ON public.amc_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- business_expenses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public delete access" ON public.business_expenses;
CREATE POLICY "Allow public delete access" ON public.business_expenses FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON public.business_expenses;
CREATE POLICY "Allow public insert access" ON public.business_expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access" ON public.business_expenses;
CREATE POLICY "Allow public update access" ON public.business_expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- common_qr_codes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to delete common_qr_codes" ON public.common_qr_codes;
CREATE POLICY "Allow all users to delete common_qr_codes" ON public.common_qr_codes FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all users to insert common_qr_codes" ON public.common_qr_codes;
CREATE POLICY "Allow all users to insert common_qr_codes" ON public.common_qr_codes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update common_qr_codes" ON public.common_qr_codes;
CREATE POLICY "Allow all users to update common_qr_codes" ON public.common_qr_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous to insert customers" ON public.customers;
CREATE POLICY "Allow anonymous to insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON public.customers;
CREATE POLICY "Allow authenticated users to delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "customers_update" ON public.customers;
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to delete inventory" ON public.inventory;
CREATE POLICY "Allow all users to delete inventory" ON public.inventory FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all users to insert inventory" ON public.inventory;
CREATE POLICY "Allow all users to insert inventory" ON public.inventory FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update inventory" ON public.inventory;
CREATE POLICY "Allow all users to update inventory" ON public.inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- job_parts_used
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to delete job_parts_used" ON public.job_parts_used;
CREATE POLICY "Allow all users to delete job_parts_used" ON public.job_parts_used FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all users to insert job_parts_used" ON public.job_parts_used;
CREATE POLICY "Allow all users to insert job_parts_used" ON public.job_parts_used FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update job_parts_used" ON public.job_parts_used;
CREATE POLICY "Allow all users to update job_parts_used" ON public.job_parts_used FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "allow_all_jobs" ON public.jobs;
CREATE POLICY "allow_all_jobs" ON public.jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- product_qr_codes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to delete product_qr_codes" ON public.product_qr_codes;
CREATE POLICY "Allow all users to delete product_qr_codes" ON public.product_qr_codes FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all users to insert product_qr_codes" ON public.product_qr_codes;
CREATE POLICY "Allow all users to insert product_qr_codes" ON public.product_qr_codes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update product_qr_codes" ON public.product_qr_codes;
CREATE POLICY "Allow all users to update product_qr_codes" ON public.product_qr_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anon delete reminders" ON public.reminders;
CREATE POLICY "Allow anon delete reminders" ON public.reminders FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon insert reminders" ON public.reminders;
CREATE POLICY "Allow anon insert reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update reminders" ON public.reminders;
CREATE POLICY "Allow anon update reminders" ON public.reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated delete reminders" ON public.reminders;
CREATE POLICY "Allow authenticated delete reminders" ON public.reminders FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert reminders" ON public.reminders;
CREATE POLICY "Allow authenticated insert reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update reminders" ON public.reminders;
CREATE POLICY "Allow authenticated update reminders" ON public.reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- tax_invoices
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to insert tax invoices" ON public.tax_invoices;
CREATE POLICY "Allow all users to insert tax invoices" ON public.tax_invoices FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update tax invoices" ON public.tax_invoices;
CREATE POLICY "Allow all users to update tax invoices" ON public.tax_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete tax invoices" ON public.tax_invoices;
CREATE POLICY "Allow authenticated users to delete tax invoices" ON public.tax_invoices FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- technician_advances
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on technician_advances" ON public.technician_advances;
CREATE POLICY "Allow all operations on technician_advances" ON public.technician_advances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technician_common_qr
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to delete technician_common_qr" ON public.technician_common_qr;
CREATE POLICY "Allow all users to delete technician_common_qr" ON public.technician_common_qr FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all users to insert technician_common_qr" ON public.technician_common_qr;
CREATE POLICY "Allow all users to insert technician_common_qr" ON public.technician_common_qr FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update technician_common_qr" ON public.technician_common_qr;
CREATE POLICY "Allow all users to update technician_common_qr" ON public.technician_common_qr FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technician_expenses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on technician_expenses" ON public.technician_expenses;
CREATE POLICY "Allow all operations on technician_expenses" ON public.technician_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technician_extra_commissions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_extra_commission" ON public.technician_extra_commissions;
CREATE POLICY "Allow authenticated users to delete technician_extra_commission" ON public.technician_extra_commissions FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_extra_commission" ON public.technician_extra_commissions;
CREATE POLICY "Allow authenticated users to insert technician_extra_commission" ON public.technician_extra_commissions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update technician_extra_commission" ON public.technician_extra_commissions;
CREATE POLICY "Allow authenticated users to update technician_extra_commission" ON public.technician_extra_commissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technician_holidays
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_holidays" ON public.technician_holidays;
CREATE POLICY "Allow authenticated users to delete technician_holidays" ON public.technician_holidays FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_holidays" ON public.technician_holidays;
CREATE POLICY "Allow authenticated users to insert technician_holidays" ON public.technician_holidays FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update technician_holidays" ON public.technician_holidays;
CREATE POLICY "Allow authenticated users to update technician_holidays" ON public.technician_holidays FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technician_inventory
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all users to delete technician_inventory" ON public.technician_inventory;
CREATE POLICY "Allow all users to delete technician_inventory" ON public.technician_inventory FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all users to insert technician_inventory" ON public.technician_inventory;
CREATE POLICY "Allow all users to insert technician_inventory" ON public.technician_inventory FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update technician_inventory" ON public.technician_inventory;
CREATE POLICY "Allow all users to update technician_inventory" ON public.technician_inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technician_payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "technician_payments_delete_policy" ON public.technician_payments;
CREATE POLICY "technician_payments_delete_policy" ON public.technician_payments FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "technician_payments_insert_policy" ON public.technician_payments;
CREATE POLICY "technician_payments_insert_policy" ON public.technician_payments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "technician_payments_update_policy" ON public.technician_payments;
CREATE POLICY "technician_payments_update_policy" ON public.technician_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- technicians
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "allow_all_technicians" ON public.technicians;
CREATE POLICY "allow_all_technicians" ON public.technicians FOR ALL TO authenticated USING (true) WITH CHECK (true);
