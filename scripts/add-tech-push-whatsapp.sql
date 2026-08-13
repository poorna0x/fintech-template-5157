-- Global per-category: mirror technician FCM pushes to WhatsApp Cloud API.
-- Keys match TECH_PUSH_CATEGORIES (job_assigned, job_nudges, cash_handover, …).
-- Safe to re-run.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS tech_push_whatsapp jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.whatsapp_crm_settings.tech_push_whatsapp IS
  'Per tech-push category WhatsApp enable flags (same keys as FCM TECH_PUSH_CATEGORIES). Missing key = on.';

COMMENT ON COLUMN public.technicians.whatsapp_prefs IS
  'Per-technician WhatsApp toggles: tech push category keys + tech_assigned_customer / tech_unassigned_customer. Legacy job_assign/job_unassign still accepted.';
