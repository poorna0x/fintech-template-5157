import { toast } from 'sonner';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

const PDF_ENDPOINT = '/.netlify/functions/generate-pdf';
const PDF_REQUEST_TIMEOUT_MS = 55_000;

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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
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

async function parsePdfResponse(response: Response, fallbackFilename: string): Promise<ArrayBuffer> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      pdfBase64?: string;
      filename?: string;
      error?: string;
      details?: string;
    };
    if (payload.error) {
      throw new Error(payload.details || payload.error);
    }
    if (!payload.pdfBase64) {
      throw new Error('Server response missing PDF data');
    }
    const buffer = base64ToArrayBuffer(payload.pdfBase64);
    const bytes = new Uint8Array(buffer);
    if (!isPdfBytes(bytes)) {
      throw new Error('Server did not return a valid PDF file');
    }
    return buffer;
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfBytes(bytes)) {
    throw new Error('Server did not return a valid PDF file');
  }
  void fallbackFilename;
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function postPdfRequest(html: string, filename: string, accessToken: string) {
  const response = await fetch(PDF_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ html, filename }),
    signal: AbortSignal.timeout(PDF_REQUEST_TIMEOUT_MS),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `PDF generation failed (${response.status})`;
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { error?: string; details?: string };
      message = payload.error || payload.details || message;
    }
    return { response, error: message as string | null, payload: null as null };
  }

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      pdfBase64?: string;
      filename?: string;
      error?: string;
      details?: string;
    };
    if (payload.error) {
      return {
        response,
        error: payload.error || payload.details || 'PDF generation failed',
        payload: null,
      };
    }
    return { response, error: null, payload };
  }

  const buffer = await response.arrayBuffer();
  return { response, error: null, payload: { rawBuffer: buffer } as { rawBuffer: ArrayBuffer } };
}

async function fetchPdfFromServer(html: string, filename: string): Promise<{
  buffer: ArrayBuffer;
  pdfBase64: string;
  filename: string;
}> {
  let accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    throw new Error('Sign in to generate PDFs');
  }

  let attempt = await postPdfRequest(html, filename, accessToken);

  if (attempt.response.status === 401 || attempt.response.status === 403) {
    const retryToken = await resolveSupabaseAccessTokenForApi();
    if (retryToken && retryToken !== accessToken) {
      accessToken = retryToken;
      attempt = await postPdfRequest(html, filename, retryToken);
    }
  }

  if (attempt.error) {
    throw new Error(attempt.error);
  }

  if (attempt.payload && 'rawBuffer' in attempt.payload) {
    const bytes = new Uint8Array(attempt.payload.rawBuffer);
    if (!isPdfBytes(bytes)) {
      throw new Error('Server did not return a valid PDF file');
    }
    const pdfBase64 = arrayBufferToBase64(attempt.payload.rawBuffer);
    return {
      buffer: attempt.payload.rawBuffer,
      pdfBase64,
      filename: sanitizeFilename(filename),
    };
  }

  const payload = attempt.payload as {
    pdfBase64?: string;
    filename?: string;
  };
  if (!payload?.pdfBase64) {
    throw new Error('Server response missing PDF data');
  }

  const buffer = base64ToArrayBuffer(payload.pdfBase64);
  const bytes = new Uint8Array(buffer);
  if (!isPdfBytes(bytes)) {
    throw new Error('Server did not return a valid PDF file');
  }

  return {
    buffer,
    pdfBase64: payload.pdfBase64,
    filename: sanitizeFilename(payload.filename || filename),
  };
}

async function downloadViaServer(html: string, filename: string): Promise<void> {
  const { buffer, filename: resolvedFilename } = await fetchPdfFromServer(html, filename);
  triggerFileDownload(buffer, resolvedFilename);
}

export interface GenerateDocumentPdfBase64Result {
  pdfBase64: string;
  filename: string;
  size: number;
}

/** Generate a PDF via Puppeteer and return base64 (for email attachments). */
export async function generateDocumentPdfBase64(
  options: DownloadDocumentPdfOptions
): Promise<GenerateDocumentPdfBase64Result> {
  const html = withAbsoluteAssetUrls(options.html, options.origin);
  const filename = sanitizeFilename(options.filename);
  const { pdfBase64, filename: resolvedFilename } = await fetchPdfFromServer(html, filename);
  const size = Math.ceil((pdfBase64.length * 3) / 4);
  return { pdfBase64, filename: resolvedFilename, size };
}

/**
 * Download a PDF via the Netlify Puppeteer function (same layout as Generate / print).
 */
export async function downloadDocumentPdf(options: DownloadDocumentPdfOptions): Promise<void> {
  const html = withAbsoluteAssetUrls(options.html, options.origin);
  const filename = sanitizeFilename(options.filename);
  const toastId = toast.loading('Generating PDF…');

  try {
    await downloadViaServer(html, filename);
    toast.success('PDF downloaded', { id: toastId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    toast.error('Could not download PDF', {
      id: toastId,
      description: `${message}. Ensure dev server is running (npm run dev) and a Chromium browser is installed.`,
    });
    throw error;
  }
}
