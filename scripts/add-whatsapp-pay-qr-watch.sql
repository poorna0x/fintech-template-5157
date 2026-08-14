-- Pay-QR screenshot watch: technician sends Cloud API UPI QR, then inbound
-- photos from that WhatsApp number are forwarded to that technician for 30 minutes.
-- Run in Supabase SQL editor. Service-role writes only (Netlify webhook / send).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.whatsapp_pay_qr_watch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  technician_id uuid NOT NULL REFERENCES public.technicians (id) ON DELETE CASCADE,
  job_id uuid NULL,
  customer_name text NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_pay_qr_watch
  ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS whatsapp_pay_qr_watch_phone_exp_idx
  ON public.whatsapp_pay_qr_watch (phone_e164, expires_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_pay_qr_watch_exp_idx
  ON public.whatsapp_pay_qr_watch (expires_at);

COMMENT ON TABLE public.whatsapp_pay_qr_watch IS
  'Technician pay-QR Cloud send: forward inbound photos from this number until expires_at. Writes via service_role only.';

ALTER TABLE public.whatsapp_pay_qr_watch ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_pay_qr_watch FROM PUBLIC;
REVOKE ALL ON TABLE public.whatsapp_pay_qr_watch FROM anon;
REVOKE ALL ON TABLE public.whatsapp_pay_qr_watch FROM authenticated;
GRANT ALL ON TABLE public.whatsapp_pay_qr_watch TO service_role;
GRANT SELECT ON TABLE public.whatsapp_pay_qr_watch TO authenticated;

-- Explicit service_role policy in case FORCE ROW LEVEL SECURITY is ever enabled.
DROP POLICY IF EXISTS whatsapp_pay_qr_watch_service_all ON public.whatsapp_pay_qr_watch;
CREATE POLICY whatsapp_pay_qr_watch_service_all
  ON public.whatsapp_pay_qr_watch
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS whatsapp_pay_qr_watch_admin_select ON public.whatsapp_pay_qr_watch;
CREATE POLICY whatsapp_pay_qr_watch_admin_select
  ON public.whatsapp_pay_qr_watch
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());
