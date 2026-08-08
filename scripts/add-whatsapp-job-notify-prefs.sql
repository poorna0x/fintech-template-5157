-- WhatsApp job-notify toggles + per-technician WhatsApp prefs.
-- Safe to re-run.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_job_assign_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_job_unassign_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_tech_unassigned boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_job_assign_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_job_unassign_whatsapp boolean NOT NULL DEFAULT false;

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS whatsapp_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.technicians.whatsapp_prefs IS
  'Per-technician WhatsApp job-notify toggles (job_assign, job_unassign, tech_assigned_customer, tech_unassigned_customer).';

GRANT SELECT (whatsapp_prefs) ON TABLE public.technicians TO authenticated;
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (whatsapp_prefs) ON TABLE public.technicians TO authenticated';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'whatsapp_prefs UPDATE grant skipped: %', SQLERRM;
END $$;
