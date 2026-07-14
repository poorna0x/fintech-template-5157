-- Allow technicians to delete parts they logged on jobs they can access.
-- Previously DELETE was admin-only, so technician "remove part" updated UI only
-- and the row came back on reload.
-- Run in Supabase SQL Editor. Safe to re-run.

DROP POLICY IF EXISTS job_parts_used_delete ON public.job_parts_used;
DROP POLICY IF EXISTS "Allow all users to delete job_parts_used" ON public.job_parts_used;

CREATE POLICY job_parts_used_delete
  ON public.job_parts_used
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.technician_can_access_job(job_id)
  );
