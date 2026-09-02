-- Job delete remarks: survives hard job delete; shown on Customer Report.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Requires public.is_admin_user().

CREATE TABLE IF NOT EXISTS public.customer_job_delete_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_id uuid,
  job_number text,
  job_status text,
  service_type text,
  remark text,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_job_delete_events_remark_len
    CHECK (remark IS NULL OR char_length(remark) <= 2000)
);

CREATE INDEX IF NOT EXISTS customer_job_delete_events_customer_created_idx
  ON public.customer_job_delete_events (customer_id, created_at DESC);

COMMENT ON TABLE public.customer_job_delete_events IS
  'Admin job-delete audit on the customer. Optional remark; job row is hard-deleted.';

ALTER TABLE public.customer_job_delete_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_job_delete_events_admin_select ON public.customer_job_delete_events;
CREATE POLICY customer_job_delete_events_admin_select
  ON public.customer_job_delete_events FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS customer_job_delete_events_admin_insert ON public.customer_job_delete_events;
CREATE POLICY customer_job_delete_events_admin_insert
  ON public.customer_job_delete_events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.customer_job_delete_events FROM anon;
GRANT SELECT, INSERT ON TABLE public.customer_job_delete_events TO authenticated;
GRANT ALL ON TABLE public.customer_job_delete_events TO service_role;
