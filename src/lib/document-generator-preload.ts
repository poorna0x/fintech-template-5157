let preloaded = false;

/** Warm document modal chunks during idle time so first open feels instant. */
export function preloadDocumentGeneratorModals() {
  if (preloaded) return;
  preloaded = true;
  void import('@/components/BillModal');
  void import('@/components/QuotationModal');
  void import('@/components/AMCModal');
  void import('@/components/TaxInvoiceModal');
}

export function scheduleDocumentGeneratorPreload() {
  if (typeof window === 'undefined') return;

  const run = () => preloadDocumentGeneratorModals();

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 1200);
  }
}
