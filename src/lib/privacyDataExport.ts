import JSZip from 'jszip';

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
  whatsapp_message_total?: number;
  consents: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  privacy_request: Record<string, unknown> | null;
  notes?: string | null;
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
  if (c.address && typeof c.address === 'object') {
    const a = c.address as Record<string, unknown>;
    return String(a.street || a.formattedAddress || JSON.stringify(a));
  }
  return String(c.address || '—');
}

function fmtLocation(c: Record<string, unknown>): string {
  const loc = c.location;
  if (!loc || typeof loc !== 'object') return '—';
  const L = loc as Record<string, unknown>;
  const lat = L.latitude;
  const lng = L.longitude;
  const link =
    L.googleLocation ||
    (lat != null && lng != null ? `https://www.google.com/maps/place/${lat},${lng}` : '');
  const label = L.shortLocation || L.formattedAddress || `${lat}, ${lng}`;
  return link ? `${label} (${link})` : String(label || '—');
}

function trunc(s: unknown, n = 120): string {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function buildReadableHtml(pack: PrivacyExportPack): string {
  const c = pack.customer || {};
  const name = esc(c.full_name || pack.privacy_request?.requester_name || 'Customer');
  const photos = Array.isArray(c.photos) ? (c.photos as string[]) : [];
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
      const info =
        a.additional_info && typeof a.additional_info === 'object'
          ? (a.additional_info as Record<string, unknown>)
          : {};
      return `<tr><td>${esc(info.agreement_number || a.id)}</td><td>${esc(a.status)}</td><td>${esc(a.start_date)}</td><td>${esc(a.end_date)}</td><td>${esc(info.amc_cost ?? info.total_amount)}</td></tr>`;
    })
    .join('');
  const docRows = (pack.pdf_authenticity || [])
    .map(
      (d) =>
        `<tr><td>${esc(d.doc_type)}</td><td>${esc(d.document_ref)}</td><td>${esc(d.verify_code)}</td><td>${esc(d.pdf_filename)}</td><td>${esc(d.generated_on || d.created_at)}</td></tr>`
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
  const photoList = photos.length
    ? `<ul>${photos.map((u) => `<li><a href="${esc(u)}">${esc(u)}</a></li>`).join('')}</ul>`
    : '<p class="muted">None on file</p>';

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
  <p class="muted noprint">Open this file and use Print → Save as PDF if you need a PDF copy. Full raw data is also in the companion .json file.</p>
  <h1>Personal data export</h1>
  <p class="muted">${esc(pack.export_purpose)} · ${esc(pack.brand)} · Exported ${esc(pack.exported_at)}</p>
  <div class="box chips">
    <span>Photos ${esc(summary.photos ?? photos.length)}</span>
    <span>Jobs ${esc(summary.jobs ?? pack.jobs.length)}</span>
    <span>AMC ${esc(summary.amc ?? (pack.amc_contracts || []).length)}</span>
    <span>PDFs ${esc(summary.pdf_fingerprints ?? (pack.pdf_authenticity || []).length)}</span>
    <span>Invoices ${esc(summary.tax_invoices ?? (pack.tax_invoices || []).length)}</span>
    <span>Calls ${esc(summary.call_history ?? (pack.call_history || []).length)}</span>
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
    Customer ID: <strong>${esc(c.customer_id || pack.customer_code || 'not found')}</strong> · Internal: ${esc(c.id || '—')}
  </div>
  ${pack.notes ? `<p class="muted">${esc(pack.notes)}</p>` : ''}
  <h2>Photos (${photos.length})</h2>
  ${photoList}
  <h2>Service / jobs (${pack.jobs.length})</h2>
  <table>
    <thead><tr><th>Job</th><th>Status</th><th>Type</th><th>Date</th><th>Amount</th><th>Payment</th></tr></thead>
    <tbody>${jobsRows || '<tr><td colspan="6">None linked to this customer id</td></tr>'}</tbody>
  </table>
  <h2>AMC contracts (${(pack.amc_contracts || []).length})</h2>
  <table>
    <thead><tr><th>Agreement</th><th>Status</th><th>Start</th><th>End</th><th>Amount</th></tr></thead>
    <tbody>${amcRows || '<tr><td colspan="5">None</td></tr>'}</tbody>
  </table>
  <h2>Tax invoices (${(pack.tax_invoices || []).length})</h2>
  <table>
    <thead><tr><th>Number</th><th>Date</th><th>Type</th><th>Amount</th><th>Service</th></tr></thead>
    <tbody>${invRows || '<tr><td colspan="5">None</td></tr>'}</tbody>
  </table>
  <h2>Document fingerprints (${(pack.pdf_authenticity || []).length})</h2>
  <p class="muted">These are authenticity records only (verify code + hash). PDF files are not stored for download. Regenerate from CRM and send a fresh copy if the customer needs the document. They can check a code at your authenticity page.</p>
  <table>
    <thead><tr><th>Type</th><th>Ref</th><th>Verify code</th><th>File</th><th>When</th></tr></thead>
    <tbody>${docRows || '<tr><td colspan="5">None</td></tr>'}</tbody>
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
  <p class="muted">This pack is for fulfilling a data-principal access request. Do not share beyond the verified requester.</p>
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

/** Download ZIP containing data.json + readable.html (print to PDF). */
export async function downloadPrivacyDataPackZip(
  pack: PrivacyExportPack,
  requestId?: string
): Promise<void> {
  const zip = new JSZip();
  const stamp = new Date().toISOString().slice(0, 10);
  const phone = String(pack.lookup_phone || 'unknown').slice(-10);
  const code = String(pack.customer_code || pack.customer?.customer_id || 'unknown');
  const base = `privacy-export-${code}-${phone}-${stamp}`;

  zip.file(`${base}.json`, JSON.stringify(pack, null, 2));
  zip.file(`${base}.html`, buildReadableHtml(pack));
  if (requestId) {
    zip.file(
      'README.txt',
      [
        'HydrogenRO / ElevenRO — privacy access export',
        `Request id: ${requestId}`,
        `Customer: ${code}`,
        `Phone: ${phone}`,
        '',
        '1) Open the .html file and Print → Save as PDF if needed.',
        '2) data.json has the full structured pack (photos URLs, WhatsApp, AMC, etc.).',
        '3) Send the ZIP or PDF to the verified WhatsApp/email on the request.',
        '4) Mark the Privacy Center request Complete (or Anonymize if erasure).',
      ].join('\n')
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${base}.zip`);
}
