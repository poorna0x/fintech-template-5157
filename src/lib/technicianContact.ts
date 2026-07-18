/**
 * Number admin uses to WhatsApp a technician.
 * Prefers `whatsapp_phone` / `whatsappPhone`; falls back to calling/contact `phone`.
 */
export function getTechnicianAdminWhatsAppPhone(tech: {
  phone?: string | null;
  whatsappPhone?: string | null;
  whatsapp_phone?: string | null;
} | null | undefined): string {
  if (!tech) return '';
  const wa = String(tech.whatsappPhone || tech.whatsapp_phone || '').trim();
  if (wa) return wa;
  return String(tech.phone || '').trim();
}
