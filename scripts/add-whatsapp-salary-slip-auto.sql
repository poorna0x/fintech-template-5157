-- Universal salary-slip WhatsApp master (same page as job-completion auto-send).
-- Safe to re-run. Defaults keep existing per-tech opt-in behavior.

ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS allow_salary_slip_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_crm_settings
  ADD COLUMN IF NOT EXISTS auto_send_salary_slip_whatsapp boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.whatsapp_crm_settings.allow_salary_slip_whatsapp IS
  'Allow month-end salary-slip PDFs via WhatsApp. Per-technician opt-in still applies.';
COMMENT ON COLUMN public.whatsapp_crm_settings.auto_send_salary_slip_whatsapp IS
  'Auto-send salary-slip PDFs on last calendar day (~9 PM IST) to opted-in active technicians.';
