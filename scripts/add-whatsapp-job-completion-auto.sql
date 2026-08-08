-- Job completion WhatsApp: allow + auto-send (customer completion message).
-- Safe to re-run. Defaults: allow ON, auto-send OFF until enabled in Settings.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_job_completion_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_job_completion_whatsapp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_crm_settings.allow_job_completion_whatsapp IS
  'Allow Cloud API job-completion messages to customers (manual Send Message + auto-send).';
COMMENT ON COLUMN public.whatsapp_crm_settings.auto_send_job_completion_whatsapp IS
  -- When true, auto-send brand completion WhatsApp after job complete (24h window only for now). Skips jobs with technician amc_info or dont_send_message (not DB active AMC).';
