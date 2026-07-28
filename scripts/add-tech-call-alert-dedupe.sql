-- Dedupe admin “customer called technician” pushes.
-- One row per (technician, call_id). call_id = CallLog DATE ms (or ring session id).
-- Re-calls get a new CallLog DATE → new push. Duplicate POST of same call → ignored.

CREATE TABLE IF NOT EXISTS public.tech_call_alert_events (
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  call_id text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (technician_id, call_id)
);

CREATE INDEX IF NOT EXISTS tech_call_alert_events_created_at_idx
  ON public.tech_call_alert_events (created_at DESC);

ALTER TABLE public.tech_call_alert_events ENABLE ROW LEVEL SECURITY;

-- Service role only (Netlify). No client policies.
DROP POLICY IF EXISTS tech_call_alert_events_deny_all ON public.tech_call_alert_events;
CREATE POLICY tech_call_alert_events_deny_all
  ON public.tech_call_alert_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.tech_call_alert_events IS
  'Idempotency for tech inbound call → admin FCM. PK (technician_id, call_id).';
