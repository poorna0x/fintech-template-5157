import React, { useEffect, useMemo, useRef } from 'react';
import { Bill } from '@/types';
import {
  billToAmcPdfData,
  generateAMCHTML,
  type AMCPDFOptions,
} from '@/lib/amc-pdf-generator';
import { withAbsoluteAssetUrls } from '@/lib/server-pdf-download';
import DocumentHtmlPreview from '@/components/document/DocumentHtmlPreview';

type AmcDocumentPreviewProps = {
  bill: Bill;
  options?: AMCPDFOptions;
  className?: string;
  fillHeight?: boolean;
};

/** Local HTML preview for AMC agreements. */
export default function AmcDocumentPreview({
  bill,
  options,
  className,
  fillHeight = false,
}: AmcDocumentPreviewProps) {
  const previewHtml = useMemo(() => {
    const data = billToAmcPdfData(bill);
    return withAbsoluteAssetUrls(generateAMCHTML(data, options));
  }, [bill, options]);

  return (
    <DocumentHtmlPreview
      html={previewHtml}
      title={`AMC agreement ${bill.billNumber}`}
      className={className}
      fillHeight={fillHeight}
    />
  );
}
