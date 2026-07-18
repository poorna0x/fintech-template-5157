-- Add customer-facing WhatsApp number for technicians (optional).
-- Distinct from `phone` (calling number shared to customers / login contact).
-- Safe to re-run.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS whatsapp_phone character varying(15);

COMMENT ON COLUMN public.technicians.whatsapp_phone IS
  'WhatsApp number for admin→technician messaging only. Customer-facing share/ID card use phone.';

-- Public ID card may show WhatsApp; grant anon SELECT like phone.
GRANT SELECT (whatsapp_phone) ON TABLE public.technicians TO anon;
GRANT SELECT (whatsapp_phone) ON TABLE public.technicians TO authenticated;
