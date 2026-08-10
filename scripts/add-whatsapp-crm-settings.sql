-- WhatsApp CRM settings (singleton) + usage helper.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.whatsapp_crm_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  allow_cold_templates boolean NOT NULL DEFAULT true,
  allow_pdf_send boolean NOT NULL DEFAULT true,
  allow_freeform boolean NOT NULL DEFAULT true,
  allow_booking_bot boolean NOT NULL DEFAULT true,
  allow_inbox boolean NOT NULL DEFAULT true,
  allow_calling boolean NOT NULL DEFAULT true,
  allow_service_reminder boolean NOT NULL DEFAULT true,
  allow_pending_payment boolean NOT NULL DEFAULT true,
  allow_documents boolean NOT NULL DEFAULT true,
  allow_composer boolean NOT NULL DEFAULT true,
  allow_tech_assigned boolean NOT NULL DEFAULT true,
  rate_utility_inr numeric(12, 4) NOT NULL DEFAULT 0.1150,
  rate_marketing_inr numeric(12, 4) NOT NULL DEFAULT 0.8631,
  rate_authentication_inr numeric(12, 4) NOT NULL DEFAULT 0.1150,
  rate_service_inr numeric(12, 4) NOT NULL DEFAULT 0,
  monthly_budget_inr numeric(14, 2),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.whatsapp_crm_settings IS
  'Singleton WhatsApp CRM controls + editable Meta rate card (INR) for bill estimates.';

INSERT INTO public.whatsapp_crm_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Safe re-run: add booking-bot toggle if table already existed without it
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_booking_bot boolean NOT NULL DEFAULT true;

-- Per-surface Cloud API send toggles (where CRM sends WhatsApp)
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_inbox boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_calling boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_service_reminder boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_pending_payment boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_documents boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_composer boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_tech_assigned boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_online_booking_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_online_booking_whatsapp boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_crm_settings_admin_select ON public.whatsapp_crm_settings;
CREATE POLICY whatsapp_crm_settings_admin_select
  ON public.whatsapp_crm_settings FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS whatsapp_crm_settings_admin_update ON public.whatsapp_crm_settings;
CREATE POLICY whatsapp_crm_settings_admin_update
  ON public.whatsapp_crm_settings FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.whatsapp_crm_settings FROM anon;
GRANT SELECT, UPDATE ON TABLE public.whatsapp_crm_settings TO authenticated;
GRANT ALL ON TABLE public.whatsapp_crm_settings TO service_role;

-- Aggregate usage in DB (low egress). Admins only.
CREATE OR REPLACE FUNCTION public.whatsapp_usage_stats(p_from timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, now() - interval '7 days');
  v_outbound int := 0;
  v_inbound int := 0;
  v_templates int := 0;
  v_documents int := 0;
  v_text int := 0;
  v_failed int := 0;
  v_delivered int := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE direction = 'outbound'),
    COUNT(*) FILTER (WHERE direction = 'inbound'),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type = 'template'),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type IN ('document', 'pdf')),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type = 'text'),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND lower(COALESCE(status, '')) IN ('failed', 'undelivered')),
    COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND lower(COALESCE(status, '')) IN ('sent', 'delivered', 'read')
    )
  INTO v_outbound, v_inbound, v_templates, v_documents, v_text, v_failed, v_delivered
  FROM public.whatsapp_messages
  WHERE created_at >= v_from;

  RETURN jsonb_build_object(
    'from', v_from,
    'to', now(),
    'outbound', v_outbound,
    'inbound', v_inbound,
    'templates', v_templates,
    'documents', v_documents,
    'text', v_text,
    'failed', v_failed,
    'delivered_or_sent', v_delivered,
    -- Billable estimate: templates outside free service window ≈ utility cold;
    -- freeform text/PDF inside window ≈ service (usually ₹0).
    'cold_utility', v_templates,
    'session_messages', v_text + v_documents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_usage_stats(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_stats(timestamptz) TO authenticated;
