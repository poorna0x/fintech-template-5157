/**
 * Admin-only: upload / delete customer gallery PDFs on private Cloudflare R2.
 * Body:
 *   { action: 'upload', customerId, filename, mimeType?, pdfBase64 }
 *   { action: 'delete', id }
 * List is client-side SELECT (RLS). Bytes never stored in Postgres.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { checkRateLimit } = require('./rate-limiter');
const { getServiceSupabase, pdfBase64ToBuffer } = require('./whatsapp-helper');
const { uploadCustomerDocumentToR2, deleteR2Object } = require('./r2-helper');

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function safePdfFilename(name) {
  const base = String(name || 'document.pdf')
    .replace(/^.*[/\\]/, '')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
  const withExt = /\.pdf$/i.test(base) ? base : `${base || 'document'}.pdf`;
  return withExt || 'document.pdf';
}

exports.handler = async (event) => {
  const cors = getCorsHeaders(event.headers?.origin || event.headers?.Origin);
  const headers = {
    ...cors,
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, { error: auth.error || 'Unauthorized' });
  }

  const rateLimit = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: `customer-documents:${auth.userId || 'anon'}`,
  });
  if (!rateLimit.allowed) {
    return json(429, headers, { error: 'Too many document uploads. Wait a minute and try again.' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const action = String(body.action || body.op || '').trim().toLowerCase();
  const db = getServiceSupabase();
  if (!db) return json(500, headers, { error: 'Server misconfigured' });

  if (action === 'delete') {
    const id = String(body.id || body.documentId || '').trim();
    if (!UUID_RE.test(id)) return json(400, headers, { error: 'id required' });

    const { data: row, error: fetchErr } = await db
      .from('customer_documents')
      .select('id, media_url')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      if (/does not exist|schema cache/i.test(fetchErr.message || '')) {
        return json(503, headers, {
          error: 'Customer documents table is missing. Run scripts/add-customer-documents.sql in Supabase.',
        });
      }
      return json(500, headers, { error: fetchErr.message });
    }
    if (!row) return json(404, headers, { error: 'Document not found' });

    if (row.media_url) {
      const purged = await deleteR2Object(row.media_url);
      if (!purged?.ok && !purged?.skipped) {
        console.warn('[customer-documents] R2 delete failed', purged?.error);
      }
    }

    const { error: delErr } = await db.from('customer_documents').delete().eq('id', id);
    if (delErr) return json(500, headers, { error: delErr.message });
    return json(200, headers, { ok: true, id });
  }

  if (action !== 'upload') {
    return json(400, headers, { error: 'action must be upload or delete' });
  }

  const customerId = String(body.customerId || body.customer_id || '').trim();
  if (!UUID_RE.test(customerId)) {
    return json(400, headers, { error: 'customerId (UUID) required' });
  }

  const mime = String(body.mimeType || body.media_mime || 'application/pdf').trim().toLowerCase();
  if (mime && mime !== 'application/pdf') {
    return json(400, headers, { error: 'Only PDF files can be added to Documents' });
  }

  const filename = safePdfFilename(body.filename || body.fileName || 'document.pdf');
  const buf = pdfBase64ToBuffer(body.pdfBase64 || body.fileBase64 || '');
  if (!buf?.length) {
    return json(400, headers, { error: 'pdfBase64 required' });
  }
  if (buf.length > MAX_PDF_BYTES) {
    return json(413, headers, { error: 'PDF is too large (max 4 MB)' });
  }
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') {
    return json(400, headers, { error: 'File is not a PDF' });
  }

  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .maybeSingle();
  if (custErr) return json(500, headers, { error: custErr.message });
  if (!customer) return json(404, headers, { error: 'Customer not found' });

  const uploaded = await uploadCustomerDocumentToR2(buf, 'application/pdf', filename, customerId);
  if (!uploaded?.ref) {
    return json(502, headers, { error: 'Could not store PDF on Cloudflare (check R2 env / restart :8888)' });
  }

  const { data: inserted, error: insErr } = await db
    .from('customer_documents')
    .insert({
      customer_id: customerId,
      filename: uploaded.filename || filename,
      media_url: uploaded.ref,
      media_mime: 'application/pdf',
      byte_size: buf.length,
      uploaded_by: auth.userId || null,
    })
    .select('id, customer_id, filename, media_url, media_mime, byte_size, created_at')
    .maybeSingle();

  if (insErr) {
    await deleteR2Object(uploaded.ref);
    if (/does not exist|schema cache/i.test(insErr.message || '')) {
      return json(503, headers, {
        error: 'Customer documents table is missing. Run scripts/add-customer-documents.sql in Supabase.',
      });
    }
    return json(500, headers, { error: insErr.message });
  }

  return json(200, headers, { ok: true, document: inserted });
};
