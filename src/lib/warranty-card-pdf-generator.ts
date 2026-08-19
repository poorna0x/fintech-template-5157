import { sanitizeForTemplate } from './sanitize';
import { getPublicSiteOrigin } from './publicSiteSeo';
import {
  renderPdfCompanyDetailsHtml,
  renderPdfLogoHtml,
  resolvePdfDocumentBrand,
} from './document-pdf-brand';
import { formatDocumentPdfVerifyFooterLine } from './documentPdfAuthenticity';
import {
  addDuration,
  formatWarrantyDate,
  type DurationUnit,
  type PublicAmcInfo,
  type PublicWarranty,
  type PublicWarrantyItem,
  type WarrantyCategory,
} from './warranty';
import {
  getCompanyInfoForBrand,
  getDocumentBrandLabel,
  resolveBrandSealSrc,
  type DocumentBrand,
} from './service-brands';
import { POPPINS_FONT_FAMILY, renderPoppinsFontHeadLinks } from './pdf-document-fonts';
import { withAbsoluteAssetUrls } from './server-pdf-download';

export interface WarrantyCardPDFCustomer {
  name: string;
  customer_id: string;
  phone: string;
  address?: string;
  brand?: string;
  model?: string;
}

export interface WarrantyCardPDFData {
  documentBrand?: DocumentBrand;
  customer: WarrantyCardPDFCustomer;
  warranty: PublicWarranty;
  amc?: PublicAmcInfo | null;
  issuedDate?: string;
  /** Footer verify code for CRM authenticity check (hash stored separately). */
  authenticityVerifyCode?: string;
  /** Stable “Generated on” date (YYYY-MM-DD) so fingerprint stays stable. */
  authenticityGeneratedOnYmd?: string;
}

export interface WarrantyDraftItemInput {
  key: string;
  category: WarrantyCategory;
  label: string;
  durValue: number;
  durUnit: DurationUnit;
  covered: boolean;
}

function resolveBrand(data: WarrantyCardPDFData): DocumentBrand {
  return resolvePdfDocumentBrand(data);
}

function formatLongIndianDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function buildWarrantyFromFormDraft(options: {
  startDate: string;
  defaultValue: number;
  defaultUnit: DurationUnit;
  items: WarrantyDraftItemInput[];
  notes: string | null;
  warrantyId?: string;
}): PublicWarranty {
  const itemRows = options.items
    .map((it) => ({ ...it, label: it.label.trim() }))
    .filter((it) => it.label.length > 0);

  const warrantyItems: PublicWarrantyItem[] = itemRows.map((it) => {
    const endDate = it.covered ? addDuration(options.startDate, it.durValue, it.durUnit) : options.startDate;
    return {
      id: it.key,
      category: it.category,
      label: it.label,
      covered: it.covered,
      start_date: options.startDate,
      end_date: endDate,
    };
  });

  const coveredEnds = warrantyItems.filter((it) => it.covered !== false).map((it) => it.end_date);
  const headerEnd = coveredEnds.reduce(
    (max, end) => (end > max ? end : max),
    coveredEnds.length > 0
      ? coveredEnds[0]
      : addDuration(options.startDate, options.defaultValue, options.defaultUnit)
  );

  return {
    id: options.warrantyId || 'draft',
    start_date: options.startDate,
    end_date: headerEnd,
    notes: options.notes,
    items: warrantyItems,
  };
}

function coveredItemEndDates(warranty: PublicWarranty): string[] {
  const ends = warranty.items
    .filter((it) => it.covered !== false)
    .map((it) => it.end_date);
  if (ends.length === 0) return warranty.end_date ? [warranty.end_date] : [];
  return [...new Set(ends)];
}

function hasVaryingItemEndDates(warranty: PublicWarranty): boolean {
  return coveredItemEndDates(warranty).length > 1;
}

function renderCoverageTable(warranty: PublicWarranty): string {
  if (warranty.items.length === 0) {
    return `
      <tr>
        <td colspan="3" class="coverage-empty">
          General warranty from <strong>${sanitizeForTemplate(formatWarrantyDate(warranty.start_date))}</strong>
          until <strong>${sanitizeForTemplate(formatWarrantyDate(warranty.end_date))}</strong>
        </td>
      </tr>
    `;
  }

  return warranty.items
    .map((it) => {
      const notCovered = it.covered === false;

      return `
        <tr class="${notCovered ? 'row-muted' : ''}">
          <td class="col-part">
            <div class="part-name">${sanitizeForTemplate(it.label)}</div>
          </td>
          <td class="col-from">${notCovered ? '—' : sanitizeForTemplate(formatWarrantyDate(it.start_date))}</td>
          <td class="col-until">${notCovered ? 'Not covered' : sanitizeForTemplate(formatWarrantyDate(it.end_date))}</td>
        </tr>
      `;
    })
    .join('');
}

function parseNotesToList(notes: string): string {
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const boldMatch = line.match(/^([^:]+):\s*(.*)$/);
      if (boldMatch && boldMatch[2].trim()) {
        return `<li><strong>${sanitizeForTemplate(boldMatch[1].trim())}:</strong> ${sanitizeForTemplate(boldMatch[2].trim())}</li>`;
      }
      return `<li>${sanitizeForTemplate(line)}</li>`;
    })
    .join('');
}

export function generateWarrantyCardHTML(data: WarrantyCardPDFData): string {
  const brand = resolveBrand(data);
  const company = getCompanyInfoForBrand(brand);
  const brandLabel = getDocumentBrandLabel(brand);
  const headerLogo = renderPdfLogoHtml(brand);
  const companyDetails = renderPdfCompanyDetailsHtml(company, brand);
  const issued = data.issuedDate || data.warranty.start_date;
  const itemEndDates = coveredItemEndDates(data.warranty);
  const varyingEnds = hasVaryingItemEndDates(data.warranty);
  const singleEndDate = itemEndDates.length === 1 ? itemEndDates[0] : data.warranty.end_date;
  const warrantyCheckUrl = `${getPublicSiteOrigin(brand)}/warranty`;
  const roModel = [data.customer.brand, data.customer.model].filter(Boolean).join(' · ');
  const sealSrc = resolveBrandSealSrc(brand, 'sign');
  const isDraft = data.warranty.id === 'draft';

  const amcNotice = data.amc?.active
    ? `
      <div class="notice notice-amc">
        <div class="notice-title">Also covered under AMC</div>
        <p>Your RO has an active Annual Maintenance Contract${data.amc.end_date ? ` valid till <strong>${sanitizeForTemplate(formatWarrantyDate(data.amc.end_date))}</strong>` : ''}. Service visits are handled under your AMC agreement.</p>
      </div>
    `
    : '';

  const termsSection = data.warranty.notes?.trim()
    ? `
      <div class="terms-block">
        <h3 class="block-title">Terms &amp; conditions</h3>
        <ul class="terms-list">${parseNotesToList(data.warranty.notes)}</ul>
      </div>
    `
    : '';

  const draftNotice = isDraft
    ? `
      <div class="notice notice-draft">
        <div class="notice-title">Draft preview</div>
        <p>Save the warranty to issue the final card. Details below reflect the current form only.</p>
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Warranty Card - ${sanitizeForTemplate(data.customer.customer_id)}</title>
  ${renderPoppinsFontHeadLinks()}
  <style>

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: ${POPPINS_FONT_FAMILY};
      line-height: 1.55;
      color: #1e293b;
      background: white;
      width: 210mm;
      min-height: 297mm;
      max-width: 210mm;
      margin: 0 auto;
      padding: 14mm 12mm;
      box-sizing: border-box;
    }

    body.warranty-with-frame {
      border: 2px solid #0f172a;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    .bill-container {
      width: 100%;
      max-width: 100%;
      background: white;
    }

    .header {
      text-align: center;
      margin-bottom: 22px;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f172a;
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }

    .full-logo { max-width: 190px; max-height: 56px; height: auto; }

    .company-details {
      font-size: 12px;
      color: #64748b;
      line-height: 1.45;
    }

    .doc-kicker {
      margin-top: 14px;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
    }

    .doc-title {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
      letter-spacing: 0.04em;
    }

    .notice {
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 16px;
      font-size: 12px;
      line-height: 1.5;
    }

    .notice-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 4px;
    }

    .notice-draft {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      color: #92400e;
    }

    .notice-amc {
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      color: #3730a3;
    }

    .notice-amc .notice-title { color: #4338ca; }

    .warranty-hero {
      margin-bottom: 18px;
      padding: 18px;
      border-radius: 12px;
      border: 1px solid #bae6fd;
      background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 55%, #f8fafc 100%);
    }

    .hero-left { min-width: 0; }

    .hero-eyebrow {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #0369a1;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .hero-name {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
      margin-bottom: 8px;
      word-break: break-word;
    }

    .hero-meta {
      font-size: 11.5px;
      color: #334155;
      line-height: 1.65;
    }

    .hero-meta-label {
      font-weight: 600;
      color: #0f172a;
    }

    .hero-meta-draft {
      font-weight: 600;
      color: #b45309;
    }

    .validity-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1.15fr;
      gap: 10px;
      margin-bottom: 18px;
    }

    .validity-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      background: #fff;
    }

    .validity-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .validity-value {
      font-size: 12.5px;
      font-weight: 600;
      color: #0f172a;
      line-height: 1.35;
    }

    .validity-value.date-range { color: #0369a1; }

    .validity-hint {
      font-size: 9px;
      color: #64748b;
      margin-top: 4px;
      word-break: break-all;
      line-height: 1.35;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 18px;
    }

    .info-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      background: #fafafa;
    }

    .info-card-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 11px;
      margin-bottom: 7px;
    }

    .info-row:last-child { margin-bottom: 0; }

    .info-label {
      color: #0f172a;
      font-weight: 600;
      flex-shrink: 0;
    }

    .info-value {
      color: #334155;
      font-weight: 400;
      text-align: right;
      word-break: break-word;
    }

    .coverage-block {
      margin-bottom: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
    }

    .block-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #0f172a;
      padding: 12px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    table.coverage {
      width: 100%;
      border-collapse: collapse;
    }

    table.coverage th {
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      font-weight: 600;
      padding: 10px 14px;
      background: #fff;
      border-bottom: 1px solid #f1f5f9;
    }

    table.coverage td {
      padding: 11px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      font-size: 11.5px;
    }

    table.coverage tr:last-child td { border-bottom: none; }

    .row-muted .part-name { color: #94a3b8; }

    .part-name { font-weight: 600; color: #0f172a; }

    .col-from {
      width: 24%;
      white-space: nowrap;
      color: #334155;
    }

    .col-until {
      width: 26%;
      color: #334155;
    }

    .row-muted .col-until {
      color: #94a3b8;
      font-style: italic;
    }

    .coverage-empty {
      text-align: center;
      color: #475569;
      padding: 16px !important;
    }

    .terms-block {
      margin-bottom: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      background: #fafafa;
    }

    .terms-list {
      margin: 0;
      padding: 12px 14px 12px 30px;
      font-size: 11px;
      color: #475569;
      line-height: 1.55;
    }

    .terms-list li { margin-bottom: 6px; }
    .terms-list li:last-child { margin-bottom: 0; }

    .bottom-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
    }

    .bottom-help {
      flex: 1;
      font-size: 10.5px;
      color: #64748b;
      line-height: 1.55;
    }

    .bottom-help strong { color: #0f172a; }

    .signature-box {
      flex-shrink: 0;
      text-align: center;
      width: 130px;
    }

    .signature-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #475569;
      margin-bottom: 6px;
    }

    .signature-seal {
      width: 96px;
      height: 96px;
      object-fit: contain;
      display: block;
      margin: 0 auto 6px;
    }

    .signature-date {
      font-size: 9px;
      color: #94a3b8;
    }

    .footer {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      line-height: 1.5;
    }

    @media print {
      @page {
        size: A4;
        margin: 8mm;
      }

      body {
        width: auto !important;
        max-width: none !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 10mm 12mm !important;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }

      body.warranty-with-frame {
        border: 2px solid #0f172a !important;
      }

      .warranty-hero,
      .coverage-block,
      .info-card,
      .terms-block {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      table.coverage tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body class="warranty-with-frame">
  <div class="bill-container">
    <div class="header">
      <div class="logo-container">${headerLogo}</div>
      <div class="company-details">${companyDetails}</div>
      <div class="doc-kicker">Official document</div>
      <h1 class="doc-title">Warranty Card</h1>
    </div>

    ${draftNotice}
    ${amcNotice}

    <div class="warranty-hero">
      <div class="hero-left">
        <div class="hero-eyebrow">Issued to</div>
        <div class="hero-name">${sanitizeForTemplate(data.customer.name)}</div>
        <div class="hero-meta">
          <div><span class="hero-meta-label">Card no.</span> ${sanitizeForTemplate(data.customer.customer_id)}${isDraft ? ' · <span class="hero-meta-draft">Draft</span>' : ''}</div>
          <div><span class="hero-meta-label">Phone</span> ${sanitizeForTemplate(data.customer.phone)}</div>
          <div><span class="hero-meta-label">Issued</span> ${sanitizeForTemplate(formatWarrantyDate(issued))}</div>
          ${roModel ? `<div><span class="hero-meta-label">RO model</span> ${sanitizeForTemplate(roModel)}</div>` : ''}
          ${
            sanitizeForTemplate(data.customer.address)
              ? `<div style="margin-top:4px"><span class="hero-meta-label">Address</span> ${sanitizeForTemplate(data.customer.address)}</div>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="validity-row">
      <div class="validity-card">
        <div class="validity-label">Warranty starts</div>
        <div class="validity-value">${sanitizeForTemplate(formatLongIndianDate(data.warranty.start_date))}</div>
      </div>
      <div class="validity-card">
        <div class="validity-label">${varyingEnds ? 'Warranty ends' : 'All covered parts until'}</div>
        <div class="validity-value date-range">${
          varyingEnds
            ? 'Varies by part'
            : sanitizeForTemplate(formatLongIndianDate(singleEndDate))
        }</div>
        ${
          varyingEnds
            ? '<div class="validity-hint">See the table — membrane, pump, filters, etc. may end on different dates</div>'
            : ''
        }
      </div>
      <div class="validity-card">
        <div class="validity-label">Check warranty online</div>
        <div class="validity-value">${sanitizeForTemplate(warrantyCheckUrl)}</div>
        <div class="validity-hint">Enter your phone number for today&apos;s status</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">Warranty details</div>
        <div class="info-row">
          <span class="info-label">Issued on</span>
          <span class="info-value">${sanitizeForTemplate(formatWarrantyDate(issued))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Issued by</span>
          <span class="info-value">${sanitizeForTemplate(brandLabel)}</span>
        </div>
      </div>
      <div class="info-card">
        <div class="info-card-title">Need help?</div>
        <div class="info-row">
          <span class="info-label">Phone</span>
          <span class="info-value">${sanitizeForTemplate(company.phone)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">${sanitizeForTemplate(company.email)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Website</span>
          <span class="info-value">${sanitizeForTemplate(company.website || '')}</span>
        </div>
      </div>
    </div>

    <div class="coverage-block">
      <h3 class="block-title">Part-wise warranty coverage</h3>
      <table class="coverage">
        <thead>
          <tr>
            <th>Part / component</th>
            <th>Warranty from</th>
            <th>Warranty until</th>
          </tr>
        </thead>
        <tbody>${renderCoverageTable(data.warranty)}</tbody>
      </table>
    </div>

    ${termsSection}

    <div class="bottom-row">
      <div class="bottom-help">
        <strong>Keep this card safe.</strong> Present it when requesting warranty service.
        Coverage applies only to the parts listed above, each for its own period, and is subject to the terms on this document.
        For service, call <strong>${sanitizeForTemplate(company.phone)}</strong>.
      </div>
      <div class="signature-box">
        <div class="signature-label">Authorized</div>
        <img src="${sealSrc}" alt="${sanitizeForTemplate(brandLabel)}" class="signature-seal" />
        <div class="signature-date">${new Date(`${issued}T12:00:00`).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}</div>
      </div>
    </div>

    <div class="footer">
      ${sanitizeForTemplate(brandLabel)} · Professional RO water purifier service in Bengaluru ·
      Generated ${(data.authenticityGeneratedOnYmd
        ? new Date(`${data.authenticityGeneratedOnYmd}T12:00:00`)
        : new Date()
      ).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      ${
        data.authenticityVerifyCode
          ? `<div style="margin-top: 6px; letter-spacing: 0.02em; color: #9ca3af;">${sanitizeForTemplate(
              formatDocumentPdfVerifyFooterLine(data.authenticityVerifyCode, brand)
            )}</div>`
          : ''
      }
    </div>
  </div>
</body>
</html>`;
}

function warrantyPdfFilename(data: WarrantyCardPDFData): string {
  const safeId = data.customer.customer_id.replace(/[/\\?%*:|"<>]/g, '_');
  const datePart = (data.warranty.start_date || 'card').replace(/-/g, '');
  const draft = data.warranty.id === 'draft' ? '_draft' : '';
  return `Warranty_${safeId}_${datePart}${draft}.pdf`;
}

export function generateWarrantyCardPDF(
  data: WarrantyCardPDFData,
  action: 'print' | 'pdf' = 'print'
): void {
  if (action === 'pdf') {
    void downloadWarrantyCardPdf(data);
    return;
  }

  try {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow popups to preview the warranty card.');
      return;
    }
    printWindow.document.write(withAbsoluteAssetUrls(generateWarrantyCardHTML(data)));
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  } catch (error) {
    console.error(error);
    alert('Could not open warranty card preview.');
  }
}

export async function downloadWarrantyCardPdf(
  data: WarrantyCardPDFData,
  opts?: { customerId?: string | null }
): Promise<void> {
  const { downloadDocumentPdfReturningBase64 } = await import('./server-pdf-download');
  const {
    generateDocumentPdfVerifyCode,
    recordDocumentPdfAuthenticity,
    todayYmdIst,
  } = await import('./documentPdfAuthenticity');
  const { toast } = await import('sonner');

  const verifyCode = data.authenticityVerifyCode || generateDocumentPdfVerifyCode();
  const generatedOnYmd = data.authenticityGeneratedOnYmd || todayYmdIst();
  const fingerprinted: WarrantyCardPDFData = {
    ...data,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  try {
    const pdf = await downloadDocumentPdfReturningBase64({
      html: generateWarrantyCardHTML(fingerprinted),
      filename: warrantyPdfFilename(fingerprinted),
    });
    const sourceKey =
      fingerprinted.warranty.id && fingerprinted.warranty.id !== 'draft'
        ? fingerprinted.warranty.id
        : `draft:${fingerprinted.customer.customer_id}:${fingerprinted.warranty.start_date || 'na'}`;
    const recorded = await recordDocumentPdfAuthenticity({
      docType: 'warranty',
      sourceKey,
      verifyCode,
      pdfBase64: pdf.pdfBase64,
      filename: pdf.filename,
      customerId: opts?.customerId || null,
      documentRef: fingerprinted.customer.customer_id,
      generatedOnYmd,
    });
    if (!recorded.ok) {
      toast.warning('PDF downloaded, but authenticity fingerprint was not saved', {
        description: recorded.error,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'PRINT_FALLBACK') return;
    throw error;
  }
}
