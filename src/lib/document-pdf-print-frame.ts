export type DocumentPdfFrameOptions = {
  borderRadius?: string;
};

/**
 * Rounded page frame for bill / quotation / invoice PDFs.
 * Border on body + box-decoration-break keeps top/bottom padding on every printed page.
 */
export function getDocumentPdfPrintFrameCss(options: DocumentPdfFrameOptions = {}): string {
  const radius = options.borderRadius ?? '12px';
  return `
    @page {
      size: A4 !important;
      margin: 5mm !important;
    }

    body {
      margin: 0 !important;
      padding: 8mm 10mm !important;
      border: 2px solid #000000 !important;
      border-radius: ${radius} !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
      box-sizing: border-box !important;
    }

    .bill-container,
    .quotation-container {
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      outline: none !important;
      padding-top: 4mm !important;
      padding-bottom: 4mm !important;
      margin: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
    }

    .bill-container > *:first-child,
    .quotation-container > *:first-child {
      margin-top: 0 !important;
    }

    .notes-section,
    .signatures,
    .footer {
      padding-top: 2mm !important;
      padding-bottom: 2mm !important;
    }
  `;
}
