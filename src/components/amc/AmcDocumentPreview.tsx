import React, { useEffect, useMemo, useRef } from 'react';
import { Bill } from '@/types';
import {
  billToAmcPdfData,
  generateAMCHTML,
  type AMCPDFOptions,
} from '@/lib/amc-pdf-generator';
import { withAbsoluteAssetUrls } from '@/lib/server-pdf-download';

const PREVIEW_FIT_CSS = `
  html {
    background: #f8fafc;
    overflow-x: hidden;
  }
  body {
    width: 100% !important;
    max-width: 100% !important;
    min-height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .bill-container {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 14mm 12mm !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
`;

type AmcDocumentPreviewProps = {
  bill: Bill;
  options?: AMCPDFOptions;
  className?: string;
  /** Fill dialog width (A4-proportioned modal). */
  fillHeight?: boolean;
};

/** Local HTML preview — same layout as Generate / PDF, no server call. */
export default function AmcDocumentPreview({
  bill,
  options,
  className,
  fillHeight = false,
}: AmcDocumentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewHtml = useMemo(() => {
    const data = billToAmcPdfData(bill);
    return withAbsoluteAssetUrls(generateAMCHTML(data, options));
  }, [bill, options]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();

    if (fillHeight) {
      const style = doc.createElement('style');
      style.textContent = PREVIEW_FIT_CSS;
      doc.head?.appendChild(style);
    }
  }, [previewHtml, fillHeight]);

  if (fillHeight) {
    return (
      <div className={className}>
        <iframe
          ref={iframeRef}
          title={`AMC agreement ${bill.billNumber}`}
          className="block w-full min-h-[70vh] rounded-md border border-slate-300/80 bg-white shadow-sm"
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-slate-500">Same layout as generated PDF — scroll to review all pages</p>
      <div className="rounded-lg border border-slate-200/80 bg-slate-100/60 p-2 sm:p-3">
        <iframe
          ref={iframeRef}
          title={`AMC agreement ${bill.billNumber}`}
          className="mx-auto block w-full max-w-[820px] rounded-md border border-slate-300/80 bg-white shadow-lg"
          style={{ minHeight: 'min(1120px, 78vh)' }}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
