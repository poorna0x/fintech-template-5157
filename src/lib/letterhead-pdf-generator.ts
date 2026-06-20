// Letterhead / Service Report PDF generator.
// Same browser-print pattern as quotation-pdf-generator.ts so we stay dependency-free
// and reuse the brand letterhead helpers (logo + company details + seal/footer).

import DOMPurify from 'dompurify';
import { sanitizeForTemplate } from './sanitize';
import {
  renderPdfCompanyDetailsHtml,
  renderPdfFooterHtml,
  renderPdfLogoHtml,
} from './document-pdf-brand';
import {
  DocumentBrand,
  DocumentSealVariant,
  getCompanyInfoForBrand,
  getDocumentBrandLabel,
  normalizeDocumentBrand,
  resolveBrandSealSrc,
} from './service-brands';
import { downloadDocumentPdf } from './server-pdf-download';

/**
 * DOMPurify config tuned for the rich text editor inside the letterhead builder.
 * We allow a slightly wider set than the default `sanitize.ts` rich text profile
 * because the editor produces alignment styles, headings up to h3, and links.
 */
const LETTERHEAD_RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'span',
    'div',
    'strong',
    'em',
    'u',
    's',
    'b',
    'i',
    'h1',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'a',
    'blockquote',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

function sanitizeRichTextHtml(html: string): string {
  if (!html) return '';
  return String(DOMPurify.sanitize(html, LETTERHEAD_RICH_TEXT_CONFIG));
}

export type LetterheadDocumentType =
  | 'service_report'
  | 'amc_report'
  | 'custom_document'
  | 'letterhead';

/** Single editable block in the document body. Order is preserved as authored. */
export type LetterheadBlock =
  | { id: string; kind: 'text'; html: string }
  | {
      id: string;
      kind: 'table';
      title?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      id: string;
      kind: 'image';
      src: string;
      caption?: string;
      widthPercent?: number;
      align?: 'left' | 'center' | 'right';
      /** When true, the image floats and following text flows beside it. */
      wrapText?: boolean;
    }
  | { id: string; kind: 'pagebreak' };

export interface LetterheadSignatory {
  /** Pre-printed name above the signature line. */
  name?: string;
  /** Role / designation printed under the name. */
  designation?: string;
  /** Optional data URL or URL for a signature image. */
  imageUrl?: string;
}

export interface LetterheadDocumentData {
  /** Auto-detected from brand (e.g. SR-2026-001). Editable in the builder. */
  documentNumber: string;
  documentType: LetterheadDocumentType;
  /** 'hydrogenro' | 'elevenro' */
  brand: DocumentBrand;

  /** Header form fields. */
  title: string;
  date: string;
  subject?: string;
  /** Free-text reference (PO / Work Order / Job ID). */
  referenceNumber?: string;
  cc?: string;
  customerName?: string;
  customerCompany?: string;
  siteLocation?: string;
  /** Optional link back to a CRM customer record (kept on saved drafts). */
  customerId?: string;
  customerCode?: string;
  customerPhone?: string;
  customerEmail?: string;

  /** Document body — alternating text blocks, tables, images and page breaks. */
  blocks: LetterheadBlock[];

  /** Left-hand signatory (defaults to "Authorized Signatory" using the brand seal). */
  leftSignatory?: LetterheadSignatory;
  /** Right-hand signatory (defaults to "Customer Signatory" with a blank line). */
  rightSignatory?: LetterheadSignatory;
  /** Show the brand seal automatically next to the left signatory. */
  useBrandSealAsStamp?: boolean;
  /** Signatory seal (default) or round stamp when useBrandSealAsStamp is true. */
  brandSealVariant?: DocumentSealVariant;
  /** Optional custom stamp/seal data URL to display next to the right signatory. */
  customStampUrl?: string;
  /** Don't print the left (authorized) signature block. */
  hideLeftSignatory?: boolean;
  /** Don't print the right (customer) signature block — useful for internal docs. */
  hideRightSignatory?: boolean;

  /** Optional final notes printed below signatures. */
  notes?: string;
  /** Optional list of terms (one per line). */
  terms?: string;
  /** Toggle the brand footer line ("Thank you for choosing …"). */
  hideBrandFooter?: boolean;
  /** Print a decorative page frame around the entire document. Defaults to true. */
  showPageBorder?: boolean;
}

export const LETTERHEAD_DOCUMENT_TYPE_LABEL: Record<LetterheadDocumentType, string> = {
  service_report: 'Service Report',
  amc_report: 'AMC Report',
  custom_document: 'Custom Document',
  letterhead: 'Company Letterhead',
};

export const LETTERHEAD_NUMBER_PREFIX: Record<LetterheadDocumentType, string> = {
  service_report: 'SR',
  amc_report: 'AMC-RPT',
  custom_document: 'DOC',
  letterhead: 'LTR',
};

/** Build an initial document number like SR-2026-0001 based on the type + year. */
export function buildDefaultLetterheadNumber(
  type: LetterheadDocumentType,
  sequence: number = 1
): string {
  const prefix = LETTERHEAD_NUMBER_PREFIX[type] ?? 'DOC';
  const year = new Date().getFullYear();
  const padded = String(Math.max(1, Math.floor(sequence))).padStart(4, '0');
  return `${prefix}-${year}-${padded}`;
}

/** Tiny helper used by the builder to create fresh block IDs (no extra deps). */
export function newBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Template starter blocks per document type. */
export function createStarterBlocks(type: LetterheadDocumentType): LetterheadBlock[] {
  switch (type) {
    case 'service_report':
      return [
        {
          id: newBlockId(),
          kind: 'text',
          html:
            '<p><strong>Dear Sir/Madam,</strong></p>' +
            '<p>This is to confirm that our service engineer attended the below-mentioned ' +
            'site and performed the service activities listed below. Please find the details ' +
            'of the work carried out, observations, and recommendations.</p>',
        },
        {
          id: newBlockId(),
          kind: 'table',
          title: 'Work Performed',
          columns: ['S.No', 'Activity', 'Status', 'Remarks'],
          rows: [
            ['1', 'Pre-filter cleaning', 'Done', ''],
            ['2', 'RO membrane check', 'Done', ''],
            ['3', 'TDS measurement', 'Done', ''],
          ],
        },
        {
          id: newBlockId(),
          kind: 'table',
          title: 'Parts Replaced',
          columns: ['S.No', 'Part Name', 'Qty', 'Remarks'],
          rows: [['1', '', '', '']],
        },
        {
          id: newBlockId(),
          kind: 'text',
          html:
            '<p><strong>Observations &amp; Recommendations:</strong></p>' +
            '<ul><li>Add observation here</li></ul>',
        },
      ];
    case 'amc_report':
      return [
        {
          id: newBlockId(),
          kind: 'text',
          html:
            '<p>This report summarises the Annual Maintenance Contract (AMC) activities ' +
            'carried out for the period mentioned below.</p>',
        },
        {
          id: newBlockId(),
          kind: 'table',
          title: 'Contract Details',
          columns: ['Field', 'Value'],
          rows: [
            ['Contract Period', ''],
            ['Number of Visits', ''],
            ['Spare Coverage', ''],
          ],
        },
        {
          id: newBlockId(),
          kind: 'table',
          title: 'Scheduled Visits',
          columns: ['Visit No.', 'Planned Date', 'Actual Date', 'Engineer', 'Remarks'],
          rows: [['1', '', '', '', '']],
        },
      ];
    case 'custom_document':
    case 'letterhead':
    default:
      return [
        {
          id: newBlockId(),
          kind: 'text',
          html:
            '<p>Start typing your document content here…</p>',
        },
      ];
  }
}

/** Build an empty document with safe defaults. */
export function createEmptyLetterhead(
  type: LetterheadDocumentType,
  brand: DocumentBrand = 'hydrogenro'
): LetterheadDocumentData {
  return {
    documentNumber: buildDefaultLetterheadNumber(type),
    documentType: type,
    brand,
    title: LETTERHEAD_DOCUMENT_TYPE_LABEL[type],
    date: new Date().toISOString().slice(0, 10),
    subject: '',
    referenceNumber: '',
    cc: '',
    customerName: '',
    customerCompany: '',
    siteLocation: '',
    blocks: createStarterBlocks(type),
    leftSignatory: {
      name: '',
      designation: 'Authorized Signatory',
    },
    rightSignatory: {
      name: '',
      designation: 'Customer Signatory',
    },
    useBrandSealAsStamp: true,
    brandSealVariant: 'sign',
    customStampUrl: '',
    notes: '',
    terms: '',
    showPageBorder: true,
  };
}

/** Robust normalizer used when restoring drafts from localStorage. */
export function normalizeLetterheadData(raw: any): LetterheadDocumentData {
  const type: LetterheadDocumentType =
    raw?.documentType && LETTERHEAD_DOCUMENT_TYPE_LABEL[raw.documentType as LetterheadDocumentType]
      ? raw.documentType
      : 'custom_document';
  const brand: DocumentBrand = normalizeDocumentBrand(raw?.brand) || 'hydrogenro';
  const base = createEmptyLetterhead(type, brand);
  return {
    ...base,
    ...raw,
    blocks: Array.isArray(raw?.blocks) && raw.blocks.length > 0 ? raw.blocks : base.blocks,
    brand,
    documentType: type,
  };
}

// ---------- HTML rendering ----------

function renderBlockHtml(block: LetterheadBlock): string {
  switch (block.kind) {
    case 'text':
      return `<div class="lh-text-block">${sanitizeRichTextHtml(block.html || '')}</div>`;
    case 'table': {
      const cols = block.columns.length > 0 ? block.columns : ['Column 1'];
      const rows = block.rows.length > 0 ? block.rows : [cols.map(() => '')];
      const titleHtml = block.title
        ? `<div class="lh-table-title">${sanitizeForTemplate(block.title)}</div>`
        : '';
      const headHtml = cols
        .map((c) => `<th>${sanitizeForTemplate(c || '')}</th>`)
        .join('');
      const bodyHtml = rows
        .map(
          (r) =>
            `<tr>${cols
              .map((_, i) => `<td>${sanitizeForTemplate(r[i] || '')}</td>`)
              .join('')}</tr>`
        )
        .join('');
      return `
        <div class="lh-table-block">
          ${titleHtml}
          <table class="lh-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
        </div>
      `;
    }
    case 'image': {
      const width = Math.min(Math.max(block.widthPercent ?? 80, 10), 100);
      const align = block.align === 'left' || block.align === 'right' ? block.align : 'center';
      const captionHtml = block.caption
        ? `<div class="lh-image-caption">${sanitizeForTemplate(block.caption)}</div>`
        : '';
      const imgHtml = `<img src="${block.src}" alt="${sanitizeForTemplate(block.caption || '')}" style="width: 100%; height: auto; border: 1px solid #e5e7eb; padding: 4px; background: #fff; box-sizing: border-box;" />`;

      // Wrap mode: float the image so the following text flows beside it.
      // Center has no meaningful wrap direction, so it floats left.
      if (block.wrapText) {
        const floatSide = align === 'right' ? 'right' : 'left';
        const margin = floatSide === 'left' ? '0 14px 6px 0' : '0 0 6px 14px';
        return `
        <div class="lh-image-block lh-image-wrap" style="float: ${floatSide}; width: ${width}%; margin: ${margin};">
          ${imgHtml}
          ${captionHtml}
        </div>
      `;
      }

      return `
        <div class="lh-image-block" style="text-align: ${align};">
          <span style="display: inline-block; width: ${width}%;">
            ${imgHtml}
            ${captionHtml}
          </span>
        </div>
      `;
    }
    case 'pagebreak':
      return '<div class="lh-page-break" style="clear: both; page-break-after: always; break-after: page;"></div>';
    default:
      return '';
  }
}

function renderHeaderTwoColHtml(data: LetterheadDocumentData): string {
  const left: string[] = [];
  if (data.customerName) {
    left.push(`<div><strong>To:</strong> ${sanitizeForTemplate(data.customerName)}</div>`);
  }
  if (data.customerCompany) {
    left.push(`<div>${sanitizeForTemplate(data.customerCompany)}</div>`);
  }
  if (data.siteLocation) {
    left.push(`<div>${sanitizeForTemplate(data.siteLocation)}</div>`);
  }

  const right: string[] = [];
  if (data.documentNumber) {
    right.push(
      `<div><strong>Doc #:</strong> ${sanitizeForTemplate(data.documentNumber)}</div>`
    );
  }
  if (data.date) {
    const formatted = new Date(data.date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    right.push(`<div><strong>Date:</strong> ${formatted}</div>`);
  }
  if (data.referenceNumber) {
    right.push(`<div><strong>Ref:</strong> ${sanitizeForTemplate(data.referenceNumber)}</div>`);
  }

  return `
    <div class="lh-meta-grid">
      <div class="lh-meta-col">${left.join('') || '<div>&nbsp;</div>'}</div>
      <div class="lh-meta-col lh-meta-col-right">${right.join('') || '<div>&nbsp;</div>'}</div>
    </div>
    ${
      data.subject
        ? `<div class="lh-subject"><strong>Subject:</strong> ${sanitizeForTemplate(
            data.subject
          )}</div>`
        : ''
    }
    ${
      data.cc
        ? `<div class="lh-cc"><strong>CC:</strong> ${sanitizeForTemplate(data.cc)}</div>`
        : ''
    }
  `;
}

function renderSignatureBlockHtml(
  signatory: LetterheadSignatory | undefined,
  stampUrl: string | null,
  defaultDesignation: string
): string {
  const safe = signatory || {};
  const designation = safe.designation || defaultDesignation;
  const stamp = stampUrl
    ? `<img src="${stampUrl}" alt="Stamp" class="lh-signature-stamp" />`
    : '<div class="lh-signature-stamp lh-signature-stamp-placeholder"></div>';
  const sigImage = safe.imageUrl
    ? `<img src="${safe.imageUrl}" alt="Signature" class="lh-signature-image" />`
    : '<div class="lh-signature-line"></div>';
  const name = safe.name ? sanitizeForTemplate(safe.name) : '';
  return `
    <div class="lh-signature-box">
      ${stamp}
      ${sigImage}
      <div class="lh-signature-name">${name || '&nbsp;'}</div>
      <div class="lh-signature-designation">${sanitizeForTemplate(designation)}</div>
    </div>
  `;
}

function renderSignaturesHtml(data: LetterheadDocumentData): string {
  const showLeft = !data.hideLeftSignatory;
  const showRight = !data.hideRightSignatory;
  if (!showLeft && !showRight) return '';
  const leftStamp = data.useBrandSealAsStamp
    ? resolveBrandSealSrc(data.brand, data.brandSealVariant ?? 'sign')
    : null;
  const rightStamp = data.customStampUrl?.trim() ? data.customStampUrl : null;

  const leftHtml = showLeft
    ? renderSignatureBlockHtml(data.leftSignatory, leftStamp, 'Authorized Signatory')
    : '';
  const rightHtml = showRight
    ? renderSignatureBlockHtml(data.rightSignatory, rightStamp, 'Customer Signatory')
    : '';

  // When only one side is shown, centre it so the single block doesn't look
  // off-balance hugging the left edge of the page.
  const justify = showLeft && showRight ? 'space-between' : 'center';
  return `
    <div class="lh-signatures" style="justify-content: ${justify};">
      ${leftHtml}
      ${rightHtml}
    </div>
  `;
}

function renderTermsHtml(terms?: string): string {
  if (!terms?.trim()) return '';
  const items = terms
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
  if (items.length === 0) return '';
  return `
    <div class="lh-terms">
      <div class="lh-terms-title">Terms &amp; Conditions:</div>
      <ol class="lh-terms-list">
        ${items.map((t) => `<li>${sanitizeForTemplate(t)}</li>`).join('')}
      </ol>
    </div>
  `;
}

/** Returns the body HTML (without <html>/<body>) — used by the live preview iframe. */
export function buildLetterheadInnerHtml(data: LetterheadDocumentData): string {
  const company = getCompanyInfoForBrand(data.brand);
  const typeLabel = LETTERHEAD_DOCUMENT_TYPE_LABEL[data.documentType] || 'Document';
  const brandLabel = getDocumentBrandLabel(data.brand);

  const bodyBlocks = (data.blocks || []).map((b) => renderBlockHtml(b)).join('');
  const headerMeta = renderHeaderTwoColHtml(data);
  const signaturesHtml = renderSignaturesHtml(data);
  const termsHtml = renderTermsHtml(data.terms);
  const notesHtml = data.notes?.trim()
    ? `<div class="lh-notes"><div class="lh-notes-title">Notes:</div><div class="lh-notes-body">${sanitizeForTemplate(
        data.notes
      )}</div></div>`
    : '';
  const footerHtml = data.hideBrandFooter
    ? ''
    : renderPdfFooterHtml(data.brand, company);

  return `
    <div class="lh-container">
      <div class="lh-header">
        <div class="lh-logo">${renderPdfLogoHtml(data.brand)}</div>
        <div class="lh-company">${renderPdfCompanyDetailsHtml(company, data.brand)}</div>
      </div>

      <div class="lh-title-row">
        <div class="lh-title">${sanitizeForTemplate(
          data.title || typeLabel
        )}</div>
        <div class="lh-brand-tag">${sanitizeForTemplate(brandLabel)}</div>
      </div>

      ${headerMeta}

      <div class="lh-body">
        ${bodyBlocks}
        <div style="clear: both;"></div>
      </div>

      ${signaturesHtml}

      ${notesHtml}
      ${termsHtml}

      ${footerHtml}
    </div>
  `;
}

/** Body class for preview/print — enables per-page frame padding. */
export function getLetterheadBodyClass(
  data: Pick<LetterheadDocumentData, 'showPageBorder'>
): string {
  return data.showPageBorder !== false ? 'lh-with-frame' : '';
}

const LETTERHEAD_BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* Explicit fallback chain prevents macOS Safari/Chrome from falling back to
     system San Francisco (which renders visibly heavier at 12px and made the
     letterhead look "bold by default" before Poppins finished loading). */
  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /*
   * The body itself owns the page border (same approach as amc-pdf-generator).
   * Browsers automatically repeat the body's own border on each printed page
   * — no position:fixed, no pseudo-elements, no overlap with content.
   */
  body {
    font-family: 'Poppins', system-ui, -apple-system, BlinkMacSystemFont,
      'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-weight: 400;
    color: #1f2937;
    background: #ffffff;
    line-height: 1.55;
    font-size: 12px;
    margin: 0 auto;
    padding: 14mm 12mm;
    width: 210mm;          /* A4 width */
    max-width: 210mm;
    min-height: 297mm;     /* A4 height — keeps the preview sheet tall */
    box-sizing: border-box;
  }

  /* Border-on-body only when the user has the frame turned on */
  body.lh-with-frame {
    border: 1px solid #0f172a;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  /* Defensive default weight (some browsers bump weight on contenteditable) */
  body, p, div, span, td, th, li { font-weight: 400; }

  .lh-container {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  /* Keep long content inside the page bounds */
  .lh-body,
  .lh-text-block,
  .lh-company,
  .lh-meta-grid {
    overflow-wrap: break-word;
    word-wrap: break-word;
  }
  .lh-container img {
    max-width: 100%;
    height: auto;
  }
  .lh-meta-col {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .lh-header {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 10px;
    margin-bottom: 14px;
    text-align: center;
  }

  .lh-logo { margin-bottom: 8px; }
  .lh-logo .full-logo {
    max-width: 220px;
    height: auto;
    max-height: 64px;
  }

  .lh-company {
    font-size: 12px;
    color: #4b5563;
    line-height: 1.5;
  }

  .lh-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 14px 0 8px 0;
    gap: 12px;
  }
  .lh-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .lh-brand-tag {
    font-size: 11px;
    font-weight: 600;
    color: #0ea5e9;
    border: 1px solid #0ea5e9;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .lh-meta-grid {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 10px;
    font-size: 12px;
  }
  .lh-meta-col { flex: 1; }
  .lh-meta-col-right { text-align: right; }

  .lh-subject {
    margin: 6px 0;
    font-size: 13px;
    background: #f8fafc;
    border-left: 3px solid #0ea5e9;
    padding: 6px 10px;
  }
  .lh-cc { margin: 4px 0; font-size: 12px; color: #4b5563; }

  .lh-body { margin-top: 14px; font-size: 12px; }
  .lh-body p { margin-bottom: 8px; }
  .lh-body ul, .lh-body ol { margin: 6px 0 8px 22px; }
  .lh-body h1, .lh-body h2, .lh-body h3 {
    margin: 12px 0 6px 0;
    color: #0f172a;
  }
  .lh-body h1 { font-size: 16px; }
  .lh-body h2 { font-size: 14px; }
  .lh-body h3 { font-size: 13px; }
  .lh-body a { color: #0369a1; }

  .lh-text-block { margin-bottom: 10px; }

  .lh-table-block { margin: 10px 0 14px 0; }
  .lh-table-title {
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .lh-table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 11px;
  }
  .lh-table td,
  .lh-table th {
    overflow-wrap: break-word;
    word-wrap: break-word;
  }
  .lh-table th {
    background: #f1f5f9;
    color: #0f172a;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    font-weight: 600;
  }
  .lh-table td {
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
  }
  .lh-table tr:nth-child(even) td { background: #f8fafc; }

  .lh-image-block { margin: 10px 0; }
  /* Floated image that text wraps around; caption sits under the image. */
  .lh-image-wrap { margin: 10px 0; }
  .lh-image-caption {
    margin-top: 4px;
    font-size: 11px;
    color: #6b7280;
    font-style: italic;
  }

  .lh-signatures {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    /* Clear any wrapped (floated) image so signatures never overlap it. */
    clear: both;
    /* Plenty of breathing room from the previous block (tables/text) so the
       seal can never bleed into the content above. */
    margin-top: 48px;
    gap: 24px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .lh-signature-box {
    flex: 1;
    max-width: 48%;
    text-align: center;
    border-top: 1px solid #cbd5e1;
    /* Reserves space for the seal that sits INSIDE the signature box (below
       the line). Keeping the seal inside avoids any chance of overlapping
       the previous block, which negative-margin "stamped over the line"
       layouts can do when content above is dense. */
    padding-top: 72px;
    position: relative;
  }
  .lh-signature-stamp {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 64px;
    max-height: 64px;
    opacity: 0.85;
    pointer-events: none;
  }
  .lh-signature-stamp-placeholder {
    display: none;
  }
  .lh-signature-image {
    max-width: 140px;
    max-height: 50px;
    display: block;
    margin: 0 auto 4px auto;
  }
  .lh-signature-line {
    height: 28px;
  }
  .lh-signature-name {
    font-size: 12px;
    font-weight: 600;
    color: #0f172a;
  }
  .lh-signature-designation {
    font-size: 11px;
    color: #4b5563;
  }

  .lh-notes {
    margin-top: 16px;
    clear: both;
    border: 1px dashed #cbd5e1;
    padding: 10px 12px;
    border-radius: 6px;
    background: #fafafa;
  }
  .lh-notes-title { font-weight: 600; color: #0f172a; margin-bottom: 4px; }
  .lh-notes-body { white-space: pre-wrap; font-size: 12px; color: #374151; }

  .lh-terms { margin-top: 14px; clear: both; }
  .lh-terms-title { font-weight: 600; color: #0f172a; margin-bottom: 4px; }
  .lh-terms-list { margin-left: 22px; font-size: 11px; color: #374151; }

  .footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 10px;
    color: #6b7280;
  }

  @media print {
    /* @page sets a generous margin around each physical page so the body
       border has space and content never touches the edge. */
    @page {
      size: A4;
      margin: 8mm;
    }

    /* Body now becomes the printable rectangle the browser repeats per page.
       Mirrors amc-pdf-generator's approach — single border, browser handles
       the per-page repetition automatically. */
    body {
      width: auto !important;
      max-width: none !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 10mm 12mm !important;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    body.lh-with-frame {
      border: 1px solid #0f172a !important;
    }

    .lh-table th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
    .lh-table tr:nth-child(even) td { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
    .lh-subject { -webkit-print-color-adjust: exact; }
    .lh-page-break {
      page-break-after: always;
      break-after: page;
    }
    /* Don't split tables or signatures across pages mid-row */
    .lh-table tr,
    .lh-signatures {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`;

/**
 * Full printable HTML document for letterhead PDFs.
 */
export function buildLetterheadDocumentHtml(data: LetterheadDocumentData): string {
  const inner = buildLetterheadInnerHtml(data);
  const title =
    data.documentNumber ||
    LETTERHEAD_DOCUMENT_TYPE_LABEL[data.documentType] ||
    'Document';
  const bodyClass = getLetterheadBodyClass(data);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${sanitizeForTemplate(title)}</title>
  <style>${LETTERHEAD_BASE_CSS}</style>
</head>
<body class="${bodyClass}">
${inner}
</body>
</html>`;
}

/**
 * Open a new window with the rendered letterhead and trigger the browser print dialog.
 * Caller decides whether the user wants to print or save as PDF (both go through the
 * same dialog).
 */
export function generateLetterheadPDF(
  data: LetterheadDocumentData,
  action: 'print' | 'pdf' = 'print'
): void {
  try {
    if (action === 'pdf') {
      const title =
        data.documentNumber ||
        LETTERHEAD_DOCUMENT_TYPE_LABEL[data.documentType] ||
        'Document';
      void downloadDocumentPdf({
        html: buildLetterheadDocumentHtml(data),
        filename: `${title.replace(/\s+/g, '_')}.pdf`,
      }).catch((err) => {
        console.warn('[letterhead-pdf] Server PDF failed, using print dialog', err);
        generateLetterheadPDF(data, 'print');
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow popups to print the document.');
      return;
    }

    printWindow.document.write(buildLetterheadDocumentHtml(data));
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          /* user closed the window early */
        }
        setTimeout(() => {
          try {
            printWindow.close();
          } catch {
            /* ignore */
          }
        }, 1000);
      }, 150);
    };

    // For browsers that don't fire onload reliably (Safari), fall back after a beat.
    setTimeout(() => {
      try {
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
        }
      } catch {
        /* ignore */
      }
    }, 800);
  } catch (err) {
    console.error('[letterhead-pdf] generate failed', err);
    alert('Error generating document. Please try again.');
  }
}

/** CSS bundle exposed so the live preview iframe inside the builder can reuse it. */
export function getLetterheadCss(): string {
  return LETTERHEAD_BASE_CSS;
}
