-- Known-customer calls only (name already on the phone). One slim row per call.
-- Run in the Supabase SQL Editor. Safe to re-run.
-- Service role writes from the existing call functions. Admins can read.

CREATE TABLE IF NOT EXISTS public.known_customer_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_key text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('technician', 'admin')),
  actor_id uuid,
  phone text NOT NULL,
  customer_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  outcome text NOT NULL CHECK (outcome IN ('answered', 'missed')),
  call_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS known_customer_calls_time_idx
  ON public.known_customer_calls (call_at DESC);

CREATE INDEX IF NOT EXISTS known_customer_calls_actor_idx
  ON public.known_customer_calls (source, actor_id, call_at DESC);

ALTER TABLE public.known_customer_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS known_customer_calls_admin_select ON public.known_customer_calls;
CREATE POLICY known_customer_calls_admin_select
  ON public.known_customer_calls FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.known_customer_calls FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.known_customer_calls FROM authenticated;
GRANT SELECT ON public.known_customer_calls TO authenticated;

COMMENT ON TABLE public.known_customer_calls IS
  'Slim log of customer calls already matched on a technician or admin phone. No personal numbers.';
