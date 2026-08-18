-- Per-chat AI review/auto-reply controls and webhook idempotency.
-- Safe to re-run. Auto reply defaults OFF.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS ai_review_all_chats boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_crm_settings.ai_review_all_chats IS
  'When enabled, the open CRM inbox automatically prepares a review-only AI draft for each new inbound message.';

CREATE TABLE IF NOT EXISTS public.whatsapp_chat_ai_settings (
  phone_e164 text PRIMARY KEY CHECK (phone_e164 ~ '^[1-9][0-9]{7,14}$'),
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  last_ai_reviewed_wa_message_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.whatsapp_chat_ai_settings IS
  'Team-wide per-WhatsApp-chat AI controls. Auto reply is explicit opt-in per phone.';

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_auto_reply_claims (
  inbound_wa_message_id text PRIMARY KEY,
  phone_e164 text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'escalated', 'yielded', 'failed')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_ai_auto_reply_claims_phone_created_idx
  ON public.whatsapp_ai_auto_reply_claims (phone_e164, created_at DESC);

ALTER TABLE public.whatsapp_chat_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ai_auto_reply_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_chat_ai_settings_admin_select
  ON public.whatsapp_chat_ai_settings;
CREATE POLICY whatsapp_chat_ai_settings_admin_select
  ON public.whatsapp_chat_ai_settings FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS whatsapp_ai_auto_reply_claims_admin_select
  ON public.whatsapp_ai_auto_reply_claims;
CREATE POLICY whatsapp_ai_auto_reply_claims_admin_select
  ON public.whatsapp_ai_auto_reply_claims FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON TABLE public.whatsapp_chat_ai_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_ai_auto_reply_claims FROM anon, authenticated;
GRANT SELECT ON TABLE public.whatsapp_chat_ai_settings TO authenticated;
GRANT SELECT ON TABLE public.whatsapp_ai_auto_reply_claims TO authenticated;
GRANT ALL ON TABLE public.whatsapp_chat_ai_settings TO service_role;
GRANT ALL ON TABLE public.whatsapp_ai_auto_reply_claims TO service_role;
