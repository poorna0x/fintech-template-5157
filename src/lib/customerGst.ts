/** Normalize a customer GSTIN for storage / display (uppercase, no spaces). */
export function normalizeCustomerGstNumber(value: string | null | undefined): string {
  return (value || '').replace(/\s/g, '').toUpperCase().slice(0, 15);
}

type CustomerGstFields = {
  gstNumber?: string | null;
  gst_number?: string | null;
} | null | undefined;

/** Read GSTIN from camelCase or snake_case customer payloads. */
export function getCustomerGstNumber(customer: CustomerGstFields): string {
  return normalizeCustomerGstNumber(customer?.gstNumber || customer?.gst_number || '');
}

/**
 * Map DB / API customer row GST into both field names once (avoid double normalize).
 * Empty GSTIN omits both keys so list payloads stay small.
 */
export function mapCustomerGstFields(customer: CustomerGstFields): {
  gstNumber?: string;
  gst_number?: string;
} {
  const gst = getCustomerGstNumber(customer);
  if (!gst) return {};
  return { gstNumber: gst, gst_number: gst };
}
