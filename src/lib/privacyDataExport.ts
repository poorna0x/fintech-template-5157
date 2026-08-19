import JSZip from 'jszip';
import { toast } from 'sonner';
import type { Bill } from '@/types';
import { stringifyCustomerAddressForTemplate } from '@/lib/customer-address';
import { generateAMCHTML, billToAmcPdfData } from '@/lib/amc-pdf-generator';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { generateDocumentPdfVerifyCode, todayYmdIst } from '@/lib/documentPdfAuthenticity';
import { getCompanyInfoForBrand } from '@/lib/service-brands';
import { fetchWhatsAppR2MediaBytes } from '@/lib/sendAdminWhatsAppApi';

type PrivacyExportPack = {
  exported_at: string;
  export_purpose: string;
  brand: string;
  lookup_phone: string;
  customer_found: boolean;
  customer_code?: string | null;
  customer: Record<string, unknown> | null;
  jobs: Record<string, unknown>[];
  amc_contracts?: Record<string, unknown>[];
  pdf_authenticity?: Record<string, unknown>[];
  tax_invoices?: Record<string, unknown>[];
  call_history?: Record<string, unknown>[];
  whatsapp_messages?: Record<string, unknown>[];
  whatsapp_documents?: Array<{
    id: string;
    filename: string;
    media_url: string;
    media_mime?: string;
    direction?: string;
    created_at?: string;
    is_preview?: boolean;
  }>;
  whatsapp_message_total?: number;
  consents: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  privacy_request: Record<string, unknown> | null;
  notes?: string | null;
  documents_note?: string | null;
};

type BundledFiles = {
  photos: string[];
  documents: string[];
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtAddress(c: Record<string, unknown>): string {
  if (c.visible_address) return String(c.visible_address);
  const line = stringifyCustomerAddressForTemplate(c.address);
  return line || '—';
}

/** Coords only — no Google Maps URL (safer when ZIP is forwarded). */
function fmtLocation(c: Record<string, unknown>): string {
  const loc = c.location;
  if (!loc || typeof loc !== 'object') return '—';
  const L = loc as Record<string, unknown>;
  const label = L.shortLocation || L.formattedAddress || '';
  const lat = L.latitude;
  const lng = L.longitude;
  if (lat != null && lng != null) {
    return `${label ? `${label} · ` : ''}${lat}, ${lng}`;
  }
  return String(label || '—');
}

function trunc(s: unknown, n = 120): string {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function safeFilePart(s: unknown): string {
  return String(s || 'file')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function parseAmcInfo(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function buildReadableHtml(pack: PrivacyExportPack, bundled: BundledFiles): string {
  const c = pack.customer || {};
  const name = esc(c.full_name || pack.privacy_request?.requester_name || 'Customer');
  const summary = pack.summary || {};
  const waTotal = pack.whatsapp_message_total ?? (pack.whatsapp_messages || []).length;

  const jobsRows = (pack.jobs || [])
    .map(
      (j) =>
        `<tr><td>${esc(j.job_number)}</td><td>${esc(j.status)}</td><td>${esc(j.service_type || j.service_sub_type)}</td><td>${esc(j.scheduled_date || j.completed_at || j.created_at)}</td><td>${esc(j.payment_amount ?? j.actual_cost)}</td><td>${esc(j.payment_status)}</td></tr>`
    )
    .join('');
  const amcRows = (pack.amc_contracts || [])
    .map((a) => {
      const info = parseAmcInfo(a.additional_info);
      return `<tr><td>${esc(info.agreement_number || a.id)}</td><td>${esc(a.status)}</td><td>${esc(a.start_date)}</td><td>${esc(a.end_date)}</td><td>${esc(info.amc_cost ?? info.total_amount)}</td></tr>`;
    })
    .join('');
  const docMetaRows = (pack.pdf_authenticity || [])
    .map(
      (d) =>
        `<tr><td>${esc(d.doc_type)}</td><td>${esc(d.document_ref)}</td><td>${esc(d.verify_code)}</td><td>${esc(d.generated_on || d.created_at)}</td></tr>`
    )
    .join('');
  const invRows = (pack.tax_invoices || [])
    .map(
      (i) =>
        `<tr><td>${esc(i.invoice_number)}</td><td>${esc(i.invoice_date)}</td><td>${esc(i.invoice_type)}</td><td>${esc(i.total_amount)}</td><td>${esc(i.service_type)}</td></tr>`
    )
    .join('');
  const callRows = (pack.call_history || [])
    .map(
      (x) =>
        `<tr><td>${esc(x.contact_type)}</td><td>${esc(x.contact_method)}</td><td>${esc(x.phone_number)}</td><td>${esc(x.status)}</td><td>${esc(x.contacted_at)}</td></tr>`
    )
    .join('');
  const waRows = (pack.whatsapp_messages || [])
    .map(
      (m) =>
        `<tr><td>${esc(m.created_at)}</td><td>${esc(m.direction)}</td><td>${esc(m.msg_type)}</td><td>${esc(trunc(m.body || m.filename || m.template_name || ''))}</td></tr>`
    )
    .join('');
  const consentRows = (pack.consents || [])
    .map(
      (x) =>
        `<tr><td>${esc(x.purpose)}</td><td>${esc(x.brand)}</td><td>${esc(x.granted)}</td><td>${esc(x.consented_at)}</td></tr>`
    )
    .join('');

  const photoList = bundled.photos.length
    ? `<ul>${bundled.photos.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    : '<p class="muted">None bundled</p>';
  const docList = bundled.documents.length
    ? `<ul>${bundled.documents.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    : '<p class="muted">No PDF files regenerated (open customer in CRM to download other doc types).</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Data export — ${name}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#0f172a;line-height:1.45}
  h1{font-size:1.4rem;margin:0 0 4px}
  h2{font-size:1.1rem;margin:22px 0 8px}
  .muted{color:#64748b;font-size:0.9rem}
  table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:0.85rem}
  th,td{border:1px solid #e2e8f0;padding:7px 8px;text-align:left;vertical-align:top;word-break:break-word}
  th{background:#f8fafc}
  .box{border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:14px 0;background:#fafafa}
  .chips span{display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border:1px solid #e2e8f0;border-radius:999px;font-size:0.8rem;background:#fff}
  @media print{body{margin:0} .noprint{display:none}}
</style>
</head>
<body>
  <p class="muted noprint">This ZIP includes real files under <code>photos/</code> and <code>documents/</code> — no public media links. Send the ZIP privately to the verified requester.</p>
  <h1>Personal data export</h1>
  <p class="muted">${esc(pack.export_purpose)} · ${esc(pack.brand)} · Exported ${esc(pack.exported_at)}</p>
  <div class="box chips">
    <span>Photo files ${esc(bundled.photos.length)}</span>
    <span>PDF files ${esc(bundled.documents.length)}</span>
    <span>Jobs ${esc(summary.jobs ?? pack.jobs.length)}</span>
    <span>AMC rows ${esc(summary.amc ?? (pack.amc_contracts || []).length)}</span>
    <span>WhatsApp ${esc(waTotal)}</span>
  </div>
  <div class="box">
    <strong>${name}</strong><br/>
    Phone: ${esc(pack.lookup_phone)} · Alt: ${esc(c.alternate_phone || '—')}<br/>
    Email: ${esc(c.email || pack.privacy_request?.requester_email || '—')}<br/>
    Address: ${esc(fmtAddress(c))}<br/>
    Location: ${esc(fmtLocation(c))}<br/>
    Service: ${esc(c.service_type || '—')} · Brand/model: ${esc(c.brand || '—')} ${esc(c.model || '')}<br/>
    TDS: ${esc(c.raw_water_tds ?? '—')} · Prefilter: ${esc(c.has_prefilter ?? '—')}<br/>
    Last service: ${esc(c.last_service_date || '—')} · Member since: ${esc(c.customer_since || '—')}<br/>
    Customer ID: <strong>${esc(c.customer_id || pack.customer_code || 'not found')}</strong>
  </div>
  <h2>Bundled photos (${bundled.photos.length})</h2>
  ${photoList}
  <p class="muted">PDFs below are real files in this ZIP (from WhatsApp storage). Fingerprint table further down is history/metadata only.</p>
  <h2>Bundled documents (${bundled.documents.length})</h2>
  ${docList}
  <h2>Service / jobs (${pack.jobs.length})</h2>
  <table>
    <thead><tr><th>Job</th><th>Status</th><th>Type</th><th>Date</th><th>Amount</th><th>Payment</th></tr></thead>
    <tbody>${jobsRows || '<tr><td colspan="6">None linked</td></tr>'}</tbody>
  </table>
  <h2>AMC contracts (${(pack.amc_contracts || []).length})</h2>
  <table>
    <thead><tr><th>Agreement</th><th>Status</th><th>Start</th><th>End</th><th>Amount</th></tr></thead>
    <tbody>${amcRows || '<tr><td colspan="5">None</td></tr>'}</tbody>
  </table>
  <h2>Tax invoices (${(pack.tax_invoices || []).length})</h2>
  <table>
    <thead><tr><th>Number</th><th>Date</th><th>Type</th><th>Amount</th><th>Service</th></tr></thead>
    <tbody>${invRows || '<tr><td colspan="5">None — regenerate from CRM if needed</td></tr>'}</tbody>
  </table>
  <h2>Prior document fingerprints (${(pack.pdf_authenticity || []).length})</h2>
  <table>
    <thead><tr><th>Type</th><th>Ref</th><th>Verify code</th><th>When</th></tr></thead>
    <tbody>${docMetaRows || '<tr><td colspan="4">None</td></tr>'}</tbody>
  </table>
  <h2>Call / contact history (${(pack.call_history || []).length})</h2>
  <table>
    <thead><tr><th>Type</th><th>Method</th><th>Phone</th><th>Status</th><th>When</th></tr></thead>
    <tbody>${callRows || '<tr><td colspan="5">None</td></tr>'}</tbody>
  </table>
  <h2>WhatsApp (latest ${(pack.whatsapp_messages || []).length} of ${esc(waTotal)})</h2>
  <table>
    <thead><tr><th>When</th><th>Dir</th><th>Type</th><th>Preview</th></tr></thead>
    <tbody>${waRows || '<tr><td colspan="4">None</td></tr>'}</tbody>
  </table>
  <h2>Consents (${pack.consents.length})</h2>
  <table>
    <thead><tr><th>Purpose</th><th>Brand</th><th>Granted</th><th>When</th></tr></thead>
    <tbody>${consentRows || '<tr><td colspan="4">None</td></tr>'}</tbody>
  </table>
  <p class="muted">Send only to the verified WhatsApp/email on the privacy request.</p>
</body>
</html>`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const raw = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const binary = atob(raw.replace(/\s/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function fetchPhotoIntoZip(
  zip: JSZip,
  url: string,
  index: number
): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let ext = 'bin';
    if (ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g(\?|$)/i.test(url)) ext = 'jpg';
    else if (ct.includes('png') || /\.png(\?|$)/i.test(url)) ext = 'png';
    else if (ct.includes('webp') || /\.webp(\?|$)/i.test(url)) ext = 'webp';
    else if (ct.includes('gif')) ext = 'gif';
    const name = `photos/photo-${String(index + 1).padStart(2, '0')}.${ext}`;
    zip.file(name, buf);
    return name;
  } catch {
    return null;
  }
}

function amcContractToBill(
  contract: Record<string, unknown>,
  customer: Record<string, unknown>,
  brand: string
): Bill {
  const info = parseAmcInfo(contract.additional_info);
  const addr =
    customer.address && typeof customer.address === 'object'
      ? (customer.address as Record<string, unknown>)
      : {};
  const amount = Number(info.amc_cost ?? info.total_amount ?? 0) || 0;
  const agreement =
    String(info.agreement_number || '').trim() ||
    `AMC-${String(contract.id || '').slice(0, 8)}`;
  const docBrand =
    (info.document_brand as 'hydrogenro' | 'elevenro') ||
    (brand === 'elevenro' ? 'elevenro' : 'hydrogenro');
  const company = getCompanyInfoForBrand(docBrand);
  const billDate = String(
    info.agreement_date || contract.start_date || todayYmdIst()
  ).slice(0, 10);

  return {
    id: String(contract.id || ''),
    billNumber: agreement,
    billDate,
    company,
    customer: {
      id: String(customer.id || ''),
      name: String(customer.full_name || info.customer_name || 'Customer'),
      address: String(
        (addr.street as string) ||
          customer.visible_address ||
          ''
      ),
      city: String(addr.city || ''),
      state: String(addr.state || ''),
      pincode: String(addr.pincode || ''),
      phone: String(customer.phone || info.customer_phone || ''),
      email: String(customer.email || info.customer_email || ''),
      gstNumber: customer.gst_number ? String(customer.gst_number) : undefined,
      ...( { roModel: String(info.ro_model || `${customer.brand || ''} ${customer.model || ''}`.trim()) } as {
        roModel?: string;
      }),
    },
    items: [
      {
        description: `AMC agreement ${agreement}`,
        quantity: 1,
        unitPrice: amount,
        total: amount,
        taxRate: 0,
        taxAmount: 0,
      },
    ],
    subtotal: amount,
    totalTax: 0,
    totalAmount: amount,
    paymentStatus: 'PAID',
    amountPaid: amount,
    validity: String(info.validity_period || (contract.years ? `${contract.years} Years` : '')),
    notes: info.notes ? String(info.notes) : undefined,
    documentBrand: docBrand,
    createdAt: String(contract.created_at || new Date().toISOString()),
    updatedAt: String(contract.created_at || new Date().toISOString()),
  } as Bill;
}

async function generateAmcPdfIntoZip(
  zip: JSZip,
  contract: Record<string, unknown>,
  customer: Record<string, unknown>,
  brand: string
): Promise<string | null> {
  try {
    const bill = amcContractToBill(contract, customer, brand);
    const verifyCode = generateDocumentPdfVerifyCode();
    const html = generateAMCHTML(billToAmcPdfData(bill), {
      authenticityVerifyCode: verifyCode,
      authenticityGeneratedOnYmd: todayYmdIst(),
    });
    const filename = `AMC_${safeFilePart(bill.billNumber)}.pdf`;
    const generated = await generateDocumentPdfBase64({ html, filename });
    const path = `documents/${filename}`;
    zip.file(path, base64ToUint8Array(generated.pdfBase64));
    return path;
  } catch (err) {
    console.warn('[privacy-export] AMC PDF soft-fail', err);
    return null;
  }
}

/** Download ZIP with data.json + readable.html + photos/ + documents/ (no public links). */
export async function downloadPrivacyDataPackZip(
  pack: PrivacyExportPack,
  requestId?: string
): Promise<void> {
  const zip = new JSZip();
  const stamp = new Date().toISOString().slice(0, 10);
  const phone = String(pack.lookup_phone || 'unknown').slice(-10);
  const code = String(pack.customer_code || pack.customer?.customer_id || 'unknown');
  const base = `privacy-export-${code}-${phone}-${stamp}`;
  const bundled: BundledFiles = { photos: [], documents: [] };

  const toastId = toast.loading('Building export ZIP (all linked PDFs + photos)…');

  try {
    const photoUrls = Array.isArray(pack.customer?.photos)
      ? (pack.customer!.photos as string[]).filter((u) => typeof u === 'string' && u.startsWith('http'))
      : [];
    for (let i = 0; i < photoUrls.length; i++) {
      const name = await fetchPhotoIntoZip(zip, photoUrls[i]!, i);
      if (name) bundled.photos.push(name);
    }

    // All WhatsApp-linked PDFs (quotations, bills, AMC, etc.) from private R2.
    const usedDocNames = new Set<string>();
    const waDocs = pack.whatsapp_documents || [];
    for (let i = 0; i < waDocs.length; i++) {
      const doc = waDocs[i]!;
      toast.loading(`Downloading document ${i + 1}/${waDocs.length}…`, { id: toastId });
      const fetched = await fetchWhatsAppR2MediaBytes({
        mediaUrl: doc.media_url,
        messageId: doc.id,
      });
      let bytes: ArrayBuffer | null = fetched.bytes || null;
      if (!bytes && fetched.url) {
        try {
          const res = await fetch(fetched.url);
          if (res.ok) bytes = await res.arrayBuffer();
        } catch {
          /* soft */
        }
      }
      if (!bytes) continue;
      let filename = safeFilePart(doc.filename || `document-${i + 1}.pdf`);
      if (!/\.pdf$/i.test(filename)) filename = `${filename}.pdf`;
      if (usedDocNames.has(filename.toLowerCase())) {
        filename = `${filename.replace(/\.pdf$/i, '')}-${String(doc.id).slice(0, 6)}.pdf`;
      }
      usedDocNames.add(filename.toLowerCase());
      const path = `documents/${filename}`;
      zip.file(path, bytes);
      bundled.documents.push(path);
    }

    // Regenerate AMC from CRM contracts if that agreement wasn't already pulled from WhatsApp.
    const customer = pack.customer || {};
    const brand = String(pack.brand || 'hydrogenro');
    for (const contract of pack.amc_contracts || []) {
      const info = parseAmcInfo(contract.additional_info);
      const agreement = String(info.agreement_number || '').trim();
      const already = [...usedDocNames].some(
        (n) => agreement && n.includes(agreement.toLowerCase().replace(/[^\w.-]+/g, '_'))
      );
      if (already) continue;
      toast.loading('Generating AMC PDF from CRM…', { id: toastId });
      const path = await generateAmcPdfIntoZip(zip, contract, customer, brand);
      if (path) {
        bundled.documents.push(path);
        usedDocNames.add(path.replace(/^documents\//, '').toLowerCase());
      }
    }

    // Safer JSON for handoff — no live media URLs.
    const safePack = {
      ...pack,
      customer: pack.customer
        ? {
            ...pack.customer,
            photos: bundled.photos,
            location:
              pack.customer.location && typeof pack.customer.location === 'object'
                ? {
                    latitude: (pack.customer.location as Record<string, unknown>).latitude,
                    longitude: (pack.customer.location as Record<string, unknown>).longitude,
                    shortLocation: (pack.customer.location as Record<string, unknown>).shortLocation,
                    formattedAddress: (pack.customer.location as Record<string, unknown>)
                      .formattedAddress,
                  }
                : pack.customer.location,
          }
        : null,
      bundled_files: bundled,
      documents_note:
        'PDFs under documents/ are copied from WhatsApp R2 (sent bills/quotations/AMC) plus any CRM AMC not already on chat. No public links.',
    };

    zip.file(`${base}.json`, JSON.stringify(safePack, null, 2));
    zip.file(`${base}.html`, buildReadableHtml(pack, bundled));
    zip.file(
      'README.txt',
      [
        'HydrogenRO / ElevenRO — privacy access export',
        requestId ? `Request id: ${requestId}` : '',
        `Customer: ${code}`,
        `Phone: ${phone}`,
        '',
        `Photos bundled: ${bundled.photos.length}`,
        `Documents bundled: ${bundled.documents.length}`,
        `WhatsApp PDF candidates: ${(pack.whatsapp_documents || []).length}`,
        '',
        'Send this ZIP privately to the verified requester only.',
      ]
        .filter(Boolean)
        .join('\n')
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(blob, `${base}.zip`);
    toast.success(
      `ZIP ready · ${bundled.documents.length} PDF(s) · ${bundled.photos.length} photo(s)`,
      { id: toastId }
    );
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not build export ZIP', { id: toastId });
    throw e;
  }
}
