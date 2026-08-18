-- Durable inbound customer-call history for each technician.
-- Run in Supabase SQL Editor before deploying the technician call-history UI.

CREATE TABLE IF NOT EXISTS public.technician_call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('answered', 'missed')),
  call_at timestamptz NOT NULL,
  call_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technician_id, call_id)
);

CREATE INDEX IF NOT EXISTS technician_call_history_owner_time_idx
  ON public.technician_call_history (technician_id, call_at DESC);

ALTER TABLE public.technician_call_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_call_history_select ON public.technician_call_history;
DROP POLICY IF EXISTS technician_call_history_delete ON public.technician_call_history;

-- Netlify writes with service_role. Technicians can only read/delete their own
-- history; admins can inspect or delete any row when supporting a technician.
CREATE POLICY technician_call_history_select
  ON public.technician_call_history FOR SELECT TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

CREATE POLICY technician_call_history_delete
  ON public.technician_call_history FOR DELETE TO authenticated
  USING (public.is_admin_user() OR technician_id = auth.uid());

REVOKE ALL ON public.technician_call_history FROM anon;
REVOKE INSERT, UPDATE ON public.technician_call_history FROM PUBLIC, authenticated;
GRANT SELECT, DELETE ON public.technician_call_history TO authenticated;

COMMENT ON TABLE public.technician_call_history IS
  'Technician-owned archive of known-customer inbound and missed calls.';
