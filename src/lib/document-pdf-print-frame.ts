export type DocumentPdfFrameOptions = {
  borderRadius?: string;
  pageMargin?: string;
};

/**
 * Shared print frame for bill / quotation / invoice / AMC PDFs.
 *
 * Uses a single `position: fixed` body::before box so every printed page gets a
 * full-height rounded border (not clipped at content end). No @page or container
 * border — those cause double/darker lines when combined.
 */
export function getDocumentPdfPrintFrameCss(options: DocumentPdfFrameOptions = {}): string {
  const radius = options.borderRadius ?? '12px';
  const pageMargin = options.pageMargin ?? '13mm';
  const pageBorder = '2px solid #000000';

  return `
    @page {
      size: A4 !important;
      margin: ${pageMargin} !important;
    }

    @page :first {
      margin: ${pageMargin} !important;
    }

    @page :left {
      margin: ${pageMargin} !important;
    }

    @page :right {
      margin: ${pageMargin} !important;
    }

    html {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }

    body {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      width: 100% !important;
      min-height: auto !important;
      box-sizing: border-box !important;
      outline: none !important;
      box-shadow: none !important;
      position: relative !important;
    }

    /* Full-page rounded frame — repeats on every printed page in Chromium / Puppeteer */
    body::before {
      content: "" !important;
      display: block !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      border: ${pageBorder} !important;
      border-radius: ${radius} !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body::after {
      display: none !important;
      content: none !important;
      border: none !important;
      outline: none !important;
    }

    .bill-container,
    .quotation-container,
    .salary-container {
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      outline: none !important;
      overflow: visible !important;
      margin: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      padding-top: 4mm !important;
      padding-bottom: 4mm !important;
      padding-left: 2mm !important;
      padding-right: 2mm !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
    }

    .bill-container > *:first-child,
    .quotation-container > *:first-child,
    .salary-container > *:first-child {
      margin-top: 0 !important;
    }

    .signatures,
    .footer {
      border-top: 1px solid #e5e7eb !important;
      margin-top: 6mm !important;
      padding-top: 4mm !important;
    }

    .notes-section {
      padding-top: 2mm !important;
      padding-bottom: 2mm !important;
    }
  `;
}
