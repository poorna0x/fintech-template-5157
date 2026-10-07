-- Auto pending-payment reminder + QR mode + payment-received send.
-- Safe to re-run. Run in the Supabase SQL editor.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_pending_payment_whatsapp boolean NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS pending_payment_qr_mode text NOT NULL DEFAULT 'dynamic';

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_payment_received_whatsapp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_crm_settings.auto_send_pending_payment_whatsapp IS
  'When true, the 9:00 AM reminder job sends the due pending-payment WhatsApp to the customer.';

COMMENT ON COLUMN public.whatsapp_crm_settings.pending_payment_qr_mode IS
  'dynamic = amount QR via pay link. static = uploaded QR photo.';

COMMENT ON COLUMN public.whatsapp_crm_settings.auto_send_payment_received_whatsapp IS
  'When true, marking a pending payment collected sends the payment-received WhatsApp.';
