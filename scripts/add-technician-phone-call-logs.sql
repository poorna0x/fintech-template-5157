-- One snapshot of a technician phone's call log, fetched only when an admin asks.
-- Run in the Supabase SQL Editor. The phone keeps the log locally and uploads
-- it into this row. Nothing here is written on every call.

CREATE TABLE IF NOT EXISTS public.technician_phone_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz
);

CREATE INDEX IF NOT EXISTS technician_phone_call_logs_owner_idx
  ON public.technician_phone_call_logs (technician_id, created_at DESC);

ALTER TABLE public.technician_phone_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_phone_call_logs_select ON public.technician_phone_call_logs;

CREATE POLICY technician_phone_call_logs_select
  ON public.technician_phone_call_logs FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.technician_phone_call_logs FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.technician_phone_call_logs FROM authenticated;
GRANT SELECT ON public.technician_phone_call_logs TO authenticated;

COMMENT ON TABLE public.technician_phone_call_logs IS
  'Admin-requested snapshot of a technician phone call log. Service role writes.';
