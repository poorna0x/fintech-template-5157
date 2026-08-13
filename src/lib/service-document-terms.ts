export type ServiceDocumentTermGroup = 'standard' | 'warranty' | 'custom';

export type ServiceDocumentTermItem = {
  id: string;
  text: string;
  enabled: boolean;
  group: ServiceDocumentTermGroup;
};

export const STANDARD_SERVICE_DOCUMENT_TERMS: readonly string[] = [
  'Goods once sold will not be taken back or exchanged.',
  '90 days warranty only for RO membrane & pump. No warranty on consumables or spare parts unless specifically mentioned.',
  'Original invoice is mandatory for all warranty and service claims.',
  'Warranty is void in case of water TDS above 750 PPM, voltage fluctuations, dry run, physical damage, insect infestation, improper usage, or service by unauthorized persons.',
  'Service is carried out based on the existing condition of the machine. The company is not responsible for pre-existing faults, worn-out components, internal damages, or leakage occurring due to old parts.',
  'The customer must inspect the machine upon completion of service and report any issues within 24 hours.',
  'Advance payments and confirmed orders are non-refundable and cannot be cancelled.',
  'Additional charges may apply for revisits, shifting, or any extra work/materials not included in the original invoice.',
  'The company is not responsible for payments or transactions made directly with technicians without an official company receipt.',
  'Payment is due immediately upon completion of service unless otherwise agreed. Warranty and future services may be withheld until all outstanding dues are cleared.',
  "The company's liability is limited to the invoice value only. All disputes are subject to the jurisdiction of Bengaluru, Karnataka.",
];

export const OPTIONAL_WARRANTY_DOCUMENT_TERMS: readonly string[] = [
  'The purifier is covered by a 1 Year Onsite Warranty against manufacturing defects from the date of installation.',
  'Warranty is valid only when installation is carried out by an authorized ELEVEN RO technician.',
  'Consumables including filters, cartridges, UV lamp, mineral cartridge, and RO membrane (unless specifically covered) are not covered under warranty.',
  'Warranty does not cover physical damage, misuse, negligence, voltage fluctuations, dry run, insect infestation, fire, flood, lightning, or other natural disasters.',
  'Warranty becomes void if the product is repaired, modified, or serviced by any unauthorized person.',
  "Raw water TDS above the machine's specified operating limit is not covered under warranty.",
  "Periodic maintenance and timely replacement of consumables are the customer's responsibility and are chargeable.",
  'The customer shall provide access to water and electricity during installation and service visits.',
  'Service requests will normally be attended within 48 working hours, subject to technician availability and spare parts.',
  'The customer must inspect the product at the time of installation. Any installation-related issues should be reported within 24 hours.',
];

/** Short terms for Direct Sale / office bill PDFs (goods + warranty + jurisdiction). */
export const DIRECT_SALE_BILL_TERMS: readonly string[] = [
  'Parts and goods are considered sold only after full payment is received by the company.',
  'Once payment is received, goods sold will not be taken back or exchanged.',
  'Warranty, if any, starts only after payment and covers manufacturing defects for the period stated on this bill. Consumables and spare parts have no warranty unless specifically mentioned in writing.',
  'Original invoice is mandatory for all warranty and service claims. Warranty is void in case of misuse, physical damage, unauthorized repair or service, voltage fluctuations, dry run, insect infestation, or water TDS beyond the product\'s operating limit.',
  "The company's liability is limited to the invoice value only. All disputes are subject to the jurisdiction of Bengaluru, Karnataka.",
];

export function formatDirectSaleBillTermsForPdf(): string {
  return DIRECT_SALE_BILL_TERMS.map((text, index) => `${index + 1}. ${text}`).join('\n');
}

export function createDefaultServiceDocumentTerms(): ServiceDocumentTermItem[] {
  const standard = STANDARD_SERVICE_DOCUMENT_TERMS.map((text, index) => ({
    id: `standard-${index + 1}`,
    text,
    enabled: true,
    group: 'standard' as const,
  }));

  const warranty = OPTIONAL_WARRANTY_DOCUMENT_TERMS.map((text, index) => ({
    id: `warranty-${index + 1}`,
    text,
    enabled: false,
    group: 'warranty' as const,
  }));

  return [...standard, ...warranty];
}

export function formatServiceDocumentTermsForPdf(items: ServiceDocumentTermItem[]): string {
  return items
    .filter((item) => item.enabled && item.text.trim())
    .map((item, index) => `${index + 1}. ${item.text.trim()}`)
    .join('\n');
}

export function termsStringToItems(terms: string): ServiceDocumentTermItem[] {
  const lines = terms
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return createDefaultServiceDocumentTerms();
  }

  return lines.map((line, index) => ({
    id: `legacy-${index + 1}`,
    text: line.replace(/^\d+\.\s*/, '').trim(),
    enabled: true,
    group: 'custom' as const,
  }));
}

export function serializeTermItems(items: ServiceDocumentTermItem[]): ServiceDocumentTermItem[] {
  return items.map(({ id, text, enabled, group }) => ({ id, text, enabled, group }));
}

export function deserializeTermItems(raw: unknown): ServiceDocumentTermItem[] | null {
  if (!Array.isArray(raw)) return null;

  const items: ServiceDocumentTermItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Partial<ServiceDocumentTermItem>;
    if (typeof row.id !== 'string' || typeof row.text !== 'string') return null;
    if (typeof row.enabled !== 'boolean') return null;
    if (row.group !== 'standard' && row.group !== 'warranty' && row.group !== 'custom') return null;
    items.push({
      id: row.id,
      text: row.text,
      enabled: row.enabled,
      group: row.group,
    });
  }

  return items.length ? items : null;
}

export function coerceTermItemsFromSnapshot(snapshot: {
  termItems?: unknown;
  terms?: string;
}): ServiceDocumentTermItem[] {
  const parsed = deserializeTermItems(snapshot.termItems);
  if (parsed) return parsed;
  if (typeof snapshot.terms === 'string' && snapshot.terms.trim()) {
    return termsStringToItems(snapshot.terms);
  }
  return createDefaultServiceDocumentTerms();
}

export function moveTermItem(
  items: ServiceDocumentTermItem[],
  fromIndex: number,
  toIndex: number
): ServiceDocumentTermItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  if (fromIndex >= items.length || toIndex >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
