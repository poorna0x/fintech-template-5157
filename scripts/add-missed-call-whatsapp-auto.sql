-- Auto-send missed-call callback WhatsApp (Cloud API template).
-- Safe to re-run.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_missed_call_whatsapp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_crm_settings.auto_send_missed_call_whatsapp IS
  'When true (and allow_calling ON): after a missed customer call alert, send missed_call_callback_*_cta via Cloud API.';
