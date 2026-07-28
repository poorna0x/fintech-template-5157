-- Pending cash handover reminders for technicians.
-- When admin taps "No" on the 9 PM cash check, we push the tech immediately
-- and store a row here so morning-cash-reminder can push again at 8:30 AM IST.
-- Run in Supabase SQL editor. Service-role only (Netlify functions).

CREATE TABLE IF NOT EXISTS public.technician_cash_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  cash_date date NOT NULL,              -- IST collection day (yyyy-mm-dd)
  amount_inr integer NOT NULL CHECK (amount_inr > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  morning_sent_at timestamptz,          -- set after next-morning 8:30 push
  CONSTRAINT technician_cash_pending_tech_date_uniq UNIQUE (technician_id, cash_date)
);

CREATE INDEX IF NOT EXISTS technician_cash_pending_morning_idx
  ON public.technician_cash_pending (morning_sent_at)
  WHERE morning_sent_at IS NULL;

ALTER TABLE public.technician_cash_pending ENABLE ROW LEVEL SECURITY;

-- No authenticated policies — only service_role (Netlify) reads/writes.
DROP POLICY IF EXISTS tech_cash_pending_deny_all ON public.technician_cash_pending;

REVOKE ALL ON public.technician_cash_pending FROM PUBLIC;
REVOKE ALL ON public.technician_cash_pending FROM anon;
REVOKE ALL ON public.technician_cash_pending FROM authenticated;
GRANT ALL ON public.technician_cash_pending TO service_role;

COMMENT ON TABLE public.technician_cash_pending IS
  'Cash not handed over (admin said No at 9 PM). Morning cron re-pushes tech at 8:30 AM IST.';
