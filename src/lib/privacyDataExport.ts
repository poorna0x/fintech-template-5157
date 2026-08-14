import JSZip from 'jszip';

type PrivacyExportPack = {
  exported_at: string;
  export_purpose: string;
  brand: string;
  lookup_phone: string;
  customer_found: boolean;
  customer: Record<string, unknown> | null;
  jobs: Record<string, unknown>[];
  consents: Record<string, unknown>[];
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

function buildReadableHtml(pack: PrivacyExportPack): string {
  const c = pack.customer || {};
  const name = esc(c.full_name || pack.privacy_request?.requester_name || 'Customer');
  const jobsRows = (pack.jobs || [])
    .map(
      (j) =>
        `<tr><td>${esc(j.job_number)}</td><td>${esc(j.status)}</td><td>${esc(j.scheduled_date)}</td><td>${esc(j.total_amount)}</td><td>${esc(j.payment_status)}</td></tr>`
    )
    .join('');
  const consentRows = (pack.consents || [])
    .map(
      (x) =>
        `<tr><td>${esc(x.purpose)}</td><td>${esc(x.brand)}</td><td>${esc(x.granted)}</td><td>${esc(x.consented_at)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Data export — ${name}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#0f172a;line-height:1.45}
  h1{font-size:1.4rem;margin:0 0 4px}
  .muted{color:#64748b;font-size:0.9rem}
  table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:0.9rem}
  th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}
  th{background:#f8fafc}
  .box{border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:14px 0;background:#fafafa}
  @media print{body{margin:0} .noprint{display:none}}
</style>
</head>
<body>
  <p class="muted noprint">Open this file and use Print → Save as PDF if you need a PDF copy.</p>
  <h1>Personal data export</h1>
  <p class="muted">${esc(pack.export_purpose)} · ${esc(pack.brand)} · Exported ${esc(pack.exported_at)}</p>
  <div class="box">
    <strong>${name}</strong><br/>
    Phone: ${esc(pack.lookup_phone)} · Email: ${esc(c.email || pack.privacy_request?.requester_email || '—')}<br/>
    Address: ${esc(c.visible_address || (typeof c.address === 'object' ? JSON.stringify(c.address) : c.address) || '—')}<br/>
    Customer ID: ${esc(c.customer_id || c.id || 'not found')}
  </div>
  ${pack.notes ? `<p class="muted">${esc(pack.notes)}</p>` : ''}
  <h2>Service / jobs (${pack.jobs.length})</h2>
  <table>
    <thead><tr><th>Job</th><th>Status</th><th>Date</th><th>Amount</th><th>Payment</th></tr></thead>
    <tbody>${jobsRows || '<tr><td colspan="5">None</td></tr>'}</tbody>
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
  const base = `privacy-export-${phone}-${stamp}`;

  zip.file(`${base}.json`, JSON.stringify(pack, null, 2));
  zip.file(`${base}.html`, buildReadableHtml(pack));
  if (requestId) {
    zip.file(
      'README.txt',
      [
        'HydrogenRO / ElevenRO — privacy access export',
        `Request id: ${requestId}`,
        `Phone: ${phone}`,
        '',
        '1) Open the .html file and Print → Save as PDF if needed.',
        '2) Send the ZIP or PDF to the verified WhatsApp/email on the request.',
        '3) Mark the Privacy Center request Complete and note how you sent it.',
      ].join('\n')
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${base}.zip`);
}
