import React, { useEffect, useMemo, useRef } from 'react';
import { generateTaxInvoiceHTML } from '@/lib/tax-invoice-pdf-generator';
import { withAbsoluteAssetUrls } from '@/lib/server-pdf-download';
import { taxInvoiceToPdfData, type TaxInvoiceRecord } from '@/lib/tax-invoice-edit-utils';

type TaxInvoiceDocumentPreviewProps = {
  invoice: TaxInvoiceRecord;
  className?: string;
};

/** Renders saved invoice HTML — same layout as Generate / Download PDF. */
export default function TaxInvoiceDocumentPreview({ invoice, className }: TaxInvoiceDocumentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewHtml = useMemo(() => {
    const data = taxInvoiceToPdfData(invoice);
    return withAbsoluteAssetUrls(generateTaxInvoiceHTML(data));
  }, [invoice]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-slate-500">Same layout as generated PDF</p>
      <div className="rounded-lg border border-slate-200/80 bg-slate-100/60 p-2 sm:p-3">
        <iframe
          ref={iframeRef}
          title={`Tax invoice ${invoice.invoice_number}`}
          className="mx-auto block w-full max-w-[820px] rounded-md border border-slate-300/80 bg-white shadow-lg"
          style={{ minHeight: 'min(1120px, 78vh)' }}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
