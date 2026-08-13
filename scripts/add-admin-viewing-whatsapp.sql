-- Per-device "I'm looking at this WhatsApp chat" so inbound FCM can skip that Admin APK.
-- Cleared when leaving the thread or backgrounding the app. Stale after ~2 minutes.
-- Safe to re-run.

ALTER TABLE public.admin_push_tokens
  ADD COLUMN IF NOT EXISTS viewing_whatsapp_phone text;
ALTER TABLE public.admin_push_tokens
  ADD COLUMN IF NOT EXISTS viewing_whatsapp_at timestamptz;

COMMENT ON COLUMN public.admin_push_tokens.viewing_whatsapp_phone IS
  'Digits of the WhatsApp chat currently open on this admin device. Null when not in a thread.';
COMMENT ON COLUMN public.admin_push_tokens.viewing_whatsapp_at IS
  'When viewing_whatsapp_phone was last set. Ignore if older than ~2 minutes.';
