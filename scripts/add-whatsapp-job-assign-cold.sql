-- Cold template auto-send on job assign (technician WhatsApp outside 24h).
-- Safe to re-run.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_job_assign_cold_whatsapp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_crm_settings.auto_send_job_assign_cold_whatsapp IS
  'When true and Dashboard job WhatsApp is on, Assign sends svc_job_assigned_tech_v1 in the background.';
