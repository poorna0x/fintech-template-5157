let preloaded = false;

/** Warm AMC / tax-invoice modal chunks during idle time so first open feels instant. */
export function preloadDocumentGeneratorModals() {
  if (preloaded) return;
  preloaded = true;
  void import('@/components/AMCModal');
  void import('@/components/TaxInvoiceModal');
}

export function scheduleDocumentGeneratorPreload() {
  if (typeof window === 'undefined') return;

  const run = () => preloadDocumentGeneratorModals();

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 2500);
  }
}
