import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { supabase } from '@/lib/supabaseClient';

export const CUSTOMER_DOC_MAX_BYTES = 4 * 1024 * 1024;

export type CustomerGalleryDocument = {
  id: string;
  filename: string | null;
  media_url: string;
  media_mime: string | null;
  byte_size: number | null;
  created_at: string;
};

let customerDocumentsTableMissing = false;

function isMissingTableError(message: string | null | undefined): boolean {
  return /does not exist|schema cache|could not find the table/i.test(String(message || ''));
}

export function customerDocumentsTableHint(): string {
  return 'Run scripts/add-customer-documents.sql in the Supabase SQL Editor, then retry.';
}

function markTableMissing(): void {
  customerDocumentsTableMissing = true;
}

function fileToPdfBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Could not read PDF'));
    reader.readAsDataURL(file);
  });
}

export function isCustomerPdfFile(file: File): boolean {
  const name = String(file.name || '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

export async function listCustomerGalleryDocuments(
  customerUuid: string
): Promise<{ rows: CustomerGalleryDocument[]; error?: string; missingTable?: boolean }> {
  const id = String(customerUuid || '').trim();
  if (!id.includes('-')) return { rows: [] };
  if (customerDocumentsTableMissing) {
    return { rows: [], missingTable: true, error: customerDocumentsTableHint() };
  }

  const { data, error } = await supabase
    .from('customer_documents')
    .select('id, filename, media_url, media_mime, byte_size, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) {
    if (isMissingTableError(error.message)) {
      markTableMissing();
      return { rows: [], missingTable: true, error: customerDocumentsTableHint() };
    }
    return { rows: [], error: error.message };
  }

  return {
    rows: (data || []).map((row) => ({
      id: String(row.id),
      filename: row.filename ? String(row.filename) : null,
      media_url: String(row.media_url || ''),
      media_mime: row.media_mime ? String(row.media_mime) : 'application/pdf',
      byte_size: typeof row.byte_size === 'number' ? row.byte_size : null,
      created_at: String(row.created_at || ''),
    })),
  };
}

export async function uploadCustomerGalleryPdf(opts: {
  customerId: string;
  file: File;
}): Promise<{ ok: boolean; document?: CustomerGalleryDocument; error?: string; missingTable?: boolean }> {
  if (!isCustomerPdfFile(opts.file)) {
    return { ok: false, error: 'Only PDF files can be added to Documents' };
  }
  if (opts.file.size > CUSTOMER_DOC_MAX_BYTES) {
    return { ok: false, error: 'PDF is too large (max 4 MB)' };
  }

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  let pdfBase64: string;
  try {
    pdfBase64 = await fileToPdfBase64(opts.file);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not read PDF' };
  }

  try {
    const res = await fetch('/.netlify/functions/customer-documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'upload',
        customerId: opts.customerId,
        filename: opts.file.name || 'document.pdf',
        mimeType: 'application/pdf',
        pdfBase64,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data?.error || `HTTP ${res.status}`);
      if (res.status === 404) {
        return {
          ok: false,
          error:
            'Upload service not found. Restart npm run dev so customer-documents runs on localhost:8888.',
        };
      }
      const missingTable = res.status === 503 || isMissingTableError(msg);
      if (missingTable) markTableMissing();
      return {
        ok: false,
        error: msg,
        missingTable,
      };
    }
    const row = data?.document;
    if (!row?.id || !row?.media_url) {
      return { ok: false, error: 'Upload succeeded but the server returned no document' };
    }
    return {
      ok: true,
      document: {
        id: String(row.id),
        filename: row.filename ? String(row.filename) : opts.file.name,
        media_url: String(row.media_url),
        media_mime: 'application/pdf',
        byte_size: typeof row.byte_size === 'number' ? row.byte_size : opts.file.size,
        created_at: String(row.created_at || new Date().toISOString()),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return {
        ok: false,
        error:
          'Could not reach the upload service. Restart npm run dev and ensure customer-documents runs on :8888.',
      };
    }
    return { ok: false, error: message };
  }
}

export async function deleteCustomerGalleryDocument(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  try {
    const res = await fetch('/.netlify/functions/customer-documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: 'delete', id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String(data?.error || `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}
