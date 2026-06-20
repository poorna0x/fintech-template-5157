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

/**
 * POST HTML to the Netlify Puppeteer function and trigger a silent file download.
 */
export async function downloadDocumentPdf(options: DownloadDocumentPdfOptions): Promise<void> {
  const html = withAbsoluteAssetUrls(options.html, options.origin);
  const filename = sanitizeFilename(options.filename);
  const toastId = toast.loading('Generating PDF…');

  try {
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

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    toast.success('PDF downloaded', { id: toastId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    toast.error('Could not generate PDF', {
      id: toastId,
      description: message,
    });
    throw error;
  }
}
