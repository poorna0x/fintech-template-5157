/** Next invoice number from localStorage — instant UI placeholder before DB refresh. */
export function getLocalFallbackTaxInvoiceNumber(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `INV-${year}-${month}`;
  const storageKey = `lastTaxInvoiceNumber_${year}_${month}`;
  const lastNumber = localStorage.getItem(storageKey);
  let nextNumber = 1;

  if (lastNumber && lastNumber.startsWith(prefix)) {
    const match = lastNumber.match(/-\d{3}$/);
    if (match) {
      nextNumber = parseInt(match[0].substring(1), 10) + 1;
    }
  }

  return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
}

/** Keep localStorage in sync when the server returns the authoritative next number. */
export function persistTaxInvoiceNumberHint(nextInvoiceNumber: string) {
  const match = nextInvoiceNumber.match(/^(INV-\d{4}-\d{2})-(\d{3})$/);
  if (!match) return;
  const [, prefix, seqStr] = match;
  const prev = parseInt(seqStr, 10) - 1;
  if (prev < 1) return;
  const [year, month] = prefix.replace('INV-', '').split('-');
  localStorage.setItem(
    `lastTaxInvoiceNumber_${year}_${month}`,
    `${prefix}-${String(prev).padStart(3, '0')}`
  );
}
