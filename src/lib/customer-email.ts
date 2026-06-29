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

/** True when the entered email should be written to the customer record (missing email only). */
export function customerEmailNeedsSave(existing: unknown, next: string): boolean {
  const trimmedNext = next.trim();
  if (!trimmedNext) return false;
  // One-off send addresses must not overwrite an email already on the customer record.
  return !getValidCustomerEmail(existing);
}

export function getAdminEmailComposerUrl(
  customerId: string,
  template?:
    | 'general'
    | 'quotation'
    | 'service_reminder'
    | 'amc_document'
    | 'invoice'
    | 'service_bill'
    | 'booking_confirmation'
): string {
  const params = new URLSearchParams({ composeEmail: customerId });
  if (template) params.set('emailTemplate', template);
  return `/admin?${params.toString()}`;
}

export function getAdminWhatsAppComposerUrl(
  customerId: string,
  template?: 'general' | 'quotation' | 'service_reminder' | 'amc_document' | 'invoice' | 'booking_confirmation'
): string {
  const params = new URLSearchParams({ composeWhatsApp: customerId });
  if (template) params.set('whatsappTemplate', template);
  return `/admin?${params.toString()}`;
}

export function getAdminCompletionEmailComposerUrl(jobId: string): string {
  return `/admin?${new URLSearchParams({ composeEmailJob: jobId }).toString()}`;
}
