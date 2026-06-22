/** Open tel: link for public marketing pages (no tracking). */
export function openPublicPhoneCall(phone: string): void {
  const digits = phone.replace(/\D/g, '');
  if (digits) window.open(`tel:${digits}`, '_self');
}
