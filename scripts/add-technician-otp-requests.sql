-- OTP requests from admin to technician (Home Triangle jobs).
-- Admin asks for the customer's OTP; the technician enters the 4-digit code
-- in the app and the admin sees it live. One active request per job.
-- Run in Supabase SQL editor. Requires public.is_admin_user() from secure-all-rls.sql.

CREATE TABLE IF NOT EXISTS public.technician_otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  otp text,                          -- filled in by the technician
  reply_nonce text,                  -- one-time secret in the push; authenticates notification replies
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);

-- Safe to re-run if the table already existed without the column.
ALTER TABLE public.technician_otp_requests
  ADD COLUMN IF NOT EXISTS reply_nonce text;

-- One request per job: re-asking replaces the previous one.
CREATE UNIQUE INDEX IF NOT EXISTS technician_otp_requests_job_uniq
  ON public.technician_otp_requests (job_id);

CREATE INDEX IF NOT EXISTS technician_otp_requests_tech_idx
  ON public.technician_otp_requests (technician_id);

-- Realtime: admin watches for the technician's submission.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_otp_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.technician_otp_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tech_otp_req_select ON public.technician_otp_requests;
DROP POLICY IF EXISTS tech_otp_req_insert ON public.technician_otp_requests;
DROP POLICY IF EXISTS tech_otp_req_update ON public.technician_otp_requests;
DROP POLICY IF EXISTS tech_otp_req_delete ON public.technician_otp_requests;

-- Admins see everything; a technician sees only their own requests.
CREATE POLICY tech_otp_req_select
  ON public.technician_otp_requests FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

-- Only admins create requests.
CREATE POLICY tech_otp_req_insert
  ON public.technician_otp_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

-- The technician fills in the OTP on their own request; admins can too.
CREATE POLICY tech_otp_req_update
  ON public.technician_otp_requests FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid())
  WITH CHECK (public.is_admin_user() OR technician_id = auth.uid());

-- Only admins remove requests (re-ask replaces).
CREATE POLICY tech_otp_req_delete
  ON public.technician_otp_requests FOR DELETE TO authenticated
  USING (public.is_admin_user());
