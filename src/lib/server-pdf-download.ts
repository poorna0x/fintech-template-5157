import { toast } from 'sonner';

const PDF_ENDPOINT = '/.netlify/functions/generate-pdf';

function sanitizeFilename(raw: string): string {
  const base = raw
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

/** Rewrite root-relative asset URLs so headless Chromium can load logos/seals. */
export function withAbsoluteAssetUrls(html: string, origin?: string): string {
  const base = (origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    ''
  );
  if (!base) return html;

  return html
    .replace(/\bsrc="\//g, `src="${base}/`)
    .replace(/\bhref="\//g, `href="${base}/`)
    .replace(/\burl\(\//g, `url(${base}/`);
}

export interface DownloadDocumentPdfOptions {
  html: string;
  filename: string;
  origin?: string;
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function triggerFileDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, 2000);
}

async function downloadViaServer(html: string, filename: string): Promise<void> {
  const response = await fetch(PDF_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  });

  if (!response.ok) {
    let message = `PDF generation failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string; details?: string };
      message = payload.details || payload.error || message;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfBytes(bytes)) {
    throw new Error('Server did not return a valid PDF file');
  }

  triggerFileDownload(buffer, filename);
}

/** Client-side fallback when the Netlify function is unavailable. */
async function downloadViaBrowser(html: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('Could not prepare document for PDF export');
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(resolve, 1200);
  });

  try {
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf()
      .set({
        margin: [0, 0, 0, 0],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(doc.body)
      .save();
  } finally {
    iframe.remove();
  }
}

/**
 * Download a PDF file. Tries the Netlify Puppeteer function first, then a browser fallback.
 * Never opens the print dialog.
 */
export async function downloadDocumentPdf(options: DownloadDocumentPdfOptions): Promise<void> {
  const html = withAbsoluteAssetUrls(options.html, options.origin);
  const filename = sanitizeFilename(options.filename);
  const toastId = toast.loading('Generating PDF…');

  try {
    try {
      await downloadViaServer(html, filename);
      toast.success('PDF downloaded', { id: toastId });
      return;
    } catch (serverError) {
      console.warn('[pdf-download] Server PDF failed, trying browser fallback', serverError);
      toast.loading('Server busy — generating PDF in browser…', { id: toastId });
      await downloadViaBrowser(html, filename);
      toast.success('PDF downloaded', { id: toastId });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    toast.error('Could not download PDF', {
      id: toastId,
      description: message,
    });
    throw error;
  }
}
