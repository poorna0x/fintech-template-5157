-- Consolidate multiple permissive RLS policies (one per table/action) so the linter is clear.
-- Behavior is preserved: combined policy = OR of the dropped policies.
-- Copy-paste into Supabase Dashboard > SQL Editor. Run in one go (wrapped in BEGIN/COMMIT).

BEGIN;

-- ---------------------------------------------------------------------------
-- CUSTOMERS: two policies per action -> one (anon + authenticated both allowed)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous to read customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated users to read customers" ON public.customers;
DROP POLICY IF EXISTS "customers_select" ON public.customers;
CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anonymous to update customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated users to update customers" ON public.customers;
DROP POLICY IF EXISTS "customers_update" ON public.customers;
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- FOLLOW_UPS: merge duplicates and combine "all" + "own" into one policy per action
-- ---------------------------------------------------------------------------
-- DELETE: keep one policy = (broad allow) OR (own rows)
DROP POLICY IF EXISTS "Allow authenticated users to delete follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Allow users to delete their own follow-ups" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_delete" ON public.follow_ups;
CREATE POLICY "follow_ups_delete" ON public.follow_ups FOR DELETE USING (
  ((select auth.role()) = 'authenticated' OR (select auth.role()) = 'anon' OR (select auth.uid()) IS NOT NULL)
  OR (scheduled_by = (select auth.uid()))
  OR (EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = follow_ups.job_id AND ((jobs.assigned_technician_id = (select auth.uid())) OR (jobs.assigned_by = (select auth.uid())))))
);

-- INSERT: one policy (drop "create follow-ups", keep equivalent of "insert follow_ups")
DROP POLICY IF EXISTS "Allow authenticated users to create follow-ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Allow authenticated users to insert follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert" ON public.follow_ups;
CREATE POLICY "follow_ups_insert" ON public.follow_ups FOR INSERT WITH CHECK (
  (select auth.role()) = 'authenticated' OR (select auth.role()) = 'anon' OR (select auth.uid()) IS NOT NULL
);

-- SELECT: one policy
DROP POLICY IF EXISTS "Allow authenticated users to read follow-ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Allow authenticated users to read follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_select" ON public.follow_ups;
CREATE POLICY "follow_ups_select" ON public.follow_ups FOR SELECT USING (
  (select auth.role()) = 'authenticated' OR (select auth.role()) = 'anon' OR (select auth.uid()) IS NOT NULL
);

-- UPDATE: one policy = (broad) OR (own)
DROP POLICY IF EXISTS "Allow authenticated users to update follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Allow users to update their own follow-ups" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_update" ON public.follow_ups;
CREATE POLICY "follow_ups_update" ON public.follow_ups FOR UPDATE USING (
  ((select auth.role()) = 'authenticated' OR (select auth.role()) = 'anon' OR (select auth.uid()) IS NOT NULL)
  OR (scheduled_by = (select auth.uid()))
  OR (EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = follow_ups.job_id AND ((jobs.assigned_technician_id = (select auth.uid())) OR (jobs.assigned_by = (select auth.uid())))))
);

-- ---------------------------------------------------------------------------
-- JOBS: keep only allow_all_jobs (already allows all); drop the rest
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anon to read jobs for Realtime" ON public.jobs;
DROP POLICY IF EXISTS "Allow anon to read jobs for realtime" ON public.jobs;
DROP POLICY IF EXISTS "Allow anonymous to read jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow authenticated users to read jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow anonymous to update jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow authenticated users to update jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow authenticated users to delete jobs" ON public.jobs;
DROP POLICY IF EXISTS jobs_anonymous_insert_policy ON public.jobs;
DROP POLICY IF EXISTS jobs_insert_policy ON public.jobs;

-- ---------------------------------------------------------------------------
-- TECHNICIAN_ADVANCES: keep "Allow all operations", drop the rest
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_advances" ON public.technician_advances;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_advances" ON public.technician_advances;
DROP POLICY IF EXISTS "Allow authenticated users to read technician_advances" ON public.technician_advances;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_advances" ON public.technician_advances;

-- ---------------------------------------------------------------------------
-- TECHNICIAN_EXPENSES: keep "Allow all operations", drop the rest
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_expenses" ON public.technician_expenses;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_expenses" ON public.technician_expenses;
DROP POLICY IF EXISTS "Allow authenticated users to read technician_expenses" ON public.technician_expenses;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_expenses" ON public.technician_expenses;

-- ---------------------------------------------------------------------------
-- TECHNICIANS: keep allow_all_technicians only; drop the rest
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to delete technicians" ON public.technicians;
DROP POLICY IF EXISTS "Allow authenticated users to read technicians" ON public.technicians;
DROP POLICY IF EXISTS "Allow authenticated users to update technicians" ON public.technicians;
DROP POLICY IF EXISTS "Allow public to read technician ID card data" ON public.technicians;
DROP POLICY IF EXISTS technicians_insert_policy ON public.technicians;

COMMIT;
