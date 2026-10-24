-- Completion WhatsApp rules. Safe to re-run.
-- Defaults match the product: skip Don't-send, skip a missing bill, include Review us.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS completion_skip_dont_send boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS completion_skip_missing_bill boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS completion_include_review boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.whatsapp_crm_settings.completion_skip_dont_send IS
  'When true, auto completion WhatsApp is skipped if the technician marked Dont send message.';
COMMENT ON COLUMN public.whatsapp_crm_settings.completion_skip_missing_bill IS
  'When true, auto completion WhatsApp is skipped when the job has no bill photo.';
COMMENT ON COLUMN public.whatsapp_crm_settings.completion_include_review IS
  'When true, the completion message includes the review link, and the cold template uses the Review us button.';
