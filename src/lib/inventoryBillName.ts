/**
 * Customer-facing inventory name for bills, quotations, and tax invoices.
 * Prefers optional full_name; falls back to product_name / custom_name.
 */
export function getInventoryBillName(item: {
  product_name?: string | null;
  full_name?: string | null;
  custom_name?: string | null;
}): string {
  const full = item.full_name?.trim();
  if (full) return full;
  const product = item.product_name?.trim();
  if (product) return product;
  return item.custom_name?.trim() || '';
}
