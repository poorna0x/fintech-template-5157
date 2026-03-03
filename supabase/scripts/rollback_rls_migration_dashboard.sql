-- ROLLBACK: Copy everything below into Supabase Dashboard > SQL Editor if you need to undo the optimization.
-- Run this only after you applied the migration and something broke.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_follow_ups_follow_up_date ON public.follow_ups USING btree (follow_up_date);

DROP POLICY IF EXISTS "Allow authenticated users to read customers" ON public.customers;
CREATE POLICY "Allow authenticated users to read customers" ON public.customers FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to update customers" ON public.customers;
CREATE POLICY "Allow authenticated users to update customers" ON public.customers FOR UPDATE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to delete technicians" ON public.technicians;
CREATE POLICY "Allow authenticated users to delete technicians" ON public.technicians FOR DELETE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to read technicians" ON public.technicians;
CREATE POLICY "Allow authenticated users to read technicians" ON public.technicians FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to update technicians" ON public.technicians;
CREATE POLICY "Allow authenticated users to update technicians" ON public.technicians FOR UPDATE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to delete jobs" ON public.jobs;
CREATE POLICY "Allow authenticated users to delete jobs" ON public.jobs FOR DELETE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to read jobs" ON public.jobs;
CREATE POLICY "Allow authenticated users to read jobs" ON public.jobs FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to update jobs" ON public.jobs;
CREATE POLICY "Allow authenticated users to update jobs" ON public.jobs FOR UPDATE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to read service areas" ON public.service_areas;
CREATE POLICY "Allow authenticated users to read service areas" ON public.service_areas FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to read parts inventory" ON public.parts_inventory;
CREATE POLICY "Allow authenticated users to read parts inventory" ON public.parts_inventory FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to update parts inventory" ON public.parts_inventory;
CREATE POLICY "Allow authenticated users to update parts inventory" ON public.parts_inventory FOR UPDATE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to insert call history" ON public.call_history;
CREATE POLICY "Allow authenticated users to insert call history" ON public.call_history FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to read call history" ON public.call_history;
CREATE POLICY "Allow authenticated users to read call history" ON public.call_history FOR SELECT USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to update call history" ON public.call_history;
CREATE POLICY "Allow authenticated users to update call history" ON public.call_history FOR UPDATE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to delete follow_ups" ON public.follow_ups;
CREATE POLICY "Allow authenticated users to delete follow_ups" ON public.follow_ups FOR DELETE USING (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text) OR (auth.uid() IS NOT NULL)));

DROP POLICY IF EXISTS "Allow authenticated users to insert follow_ups" ON public.follow_ups;
CREATE POLICY "Allow authenticated users to insert follow_ups" ON public.follow_ups FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text) OR (auth.uid() IS NOT NULL)));

DROP POLICY IF EXISTS "Allow authenticated users to read follow_ups" ON public.follow_ups;
CREATE POLICY "Allow authenticated users to read follow_ups" ON public.follow_ups FOR SELECT USING (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text) OR (auth.uid() IS NOT NULL)));

DROP POLICY IF EXISTS "Allow authenticated users to update follow_ups" ON public.follow_ups;
CREATE POLICY "Allow authenticated users to update follow_ups" ON public.follow_ups FOR UPDATE USING (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text) OR (auth.uid() IS NOT NULL)));

DROP POLICY IF EXISTS "Allow users to delete their own follow-ups" ON public.follow_ups;
CREATE POLICY "Allow users to delete their own follow-ups" ON public.follow_ups FOR DELETE TO authenticated USING (((scheduled_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = follow_ups.job_id) AND ((jobs.assigned_technician_id = auth.uid()) OR (jobs.assigned_by = auth.uid())))))));

DROP POLICY IF EXISTS "Allow users to update their own follow-ups" ON public.follow_ups;
CREATE POLICY "Allow users to update their own follow-ups" ON public.follow_ups FOR UPDATE TO authenticated USING (((scheduled_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = follow_ups.job_id) AND ((jobs.assigned_technician_id = auth.uid()) OR (jobs.assigned_by = auth.uid())))))));

DROP POLICY IF EXISTS "Authenticated users can create job assignment requests" ON public.job_assignment_requests;
CREATE POLICY "Authenticated users can create job assignment requests" ON public.job_assignment_requests FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated users can delete job assignment requests" ON public.job_assignment_requests;
CREATE POLICY "Authenticated users can delete job assignment requests" ON public.job_assignment_requests FOR DELETE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated users can update job assignment requests" ON public.job_assignment_requests;
CREATE POLICY "Authenticated users can update job assignment requests" ON public.job_assignment_requests FOR UPDATE USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated users can view job assignment requests" ON public.job_assignment_requests;
CREATE POLICY "Authenticated users can view job assignment requests" ON public.job_assignment_requests FOR SELECT USING ((auth.role() = 'authenticated'::text));

COMMIT;
