/** True when the customer has a real email (not placeholder nomail values). */
export function isValidCustomerEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes('nomail') || lower.includes('no@mail')) return false;
  return trimmed.includes('@');
}

export function getValidCustomerEmail(email: unknown): string | null {
  return isValidCustomerEmail(email) ? email.trim() : null;
}

export function getAdminEmailComposerUrl(
  customerId: string,
  template?: 'general' | 'quotation' | 'service_reminder' | 'amc_document' | 'invoice' | 'booking_confirmation'
): string {
  const params = new URLSearchParams({ composeEmail: customerId });
  if (template) params.set('emailTemplate', template);
  return `/admin?${params.toString()}`;
}
