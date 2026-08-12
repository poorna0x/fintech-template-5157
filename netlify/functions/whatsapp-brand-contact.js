/**
 * Brand contact lines for WhatsApp free-form + letter-style copy (matches src/lib/whatsappBrandContact.ts).
 */

const BRAND_CONTACT = {
  hydrogenro: {
    label: 'Hydrogen RO',
    phone: '8884944288',
    email: 'mail@hydrogenro.com',
    webHost: 'hydrogenro.com',
  },
  elevenro: {
    label: 'Eleven RO',
    phone: '9880693311',
    email: 'mail@elevenro.com',
    webHost: 'elevenro.com',
  },
};

function normalizeWaBrand(brand) {
  return String(brand || '').toLowerCase() === 'elevenro' ? 'elevenro' : 'hydrogenro';
}

function letterLabelValue(label, value) {
  const v = String(value || '').trim();
  const l = String(label || '').trim();
  if (!v) return `${l}:`;
  return `${l}:\n${v}`;
}

function brandContact(brand) {
  return BRAND_CONTACT[normalizeWaBrand(brand)];
}

function brandLetterFooterLines(brand) {
  const b = brandContact(brand);
  return [
    `Thank you for choosing ${b.label}.`,
    letterLabelValue('Call', b.phone),
    letterLabelValue('Email', b.email),
    letterLabelValue('Website', b.webHost),
  ];
}

function authenticityHost(brand) {
  return brandContact(brand).webHost;
}

function authenticityLine(brand, code) {
  const host = authenticityHost(brand);
  const c = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (!c) return `Verify authenticity at ${host}/authenticity`;
  return `Verify authenticity at ${host}/authenticity · Code ${c}`;
}

/** Post-Accept original PDF — valid doc + save + company footer + authenticity (24h free-form). */
function buildOriginalDocumentDeliveryBody(customerName, documentLabel, brand, verifyCode) {
  const label = String(documentLabel || 'document').trim() || 'document';
  const name = String(customerName || '').trim();
  const lines = [
    name ? `Hi ${name},` : 'Hi there,',
    '',
    `Your original ${label} is ready.`,
    'This is the valid original document — not a preview.',
    'Please download and save this PDF for your records.',
    '',
    ...brandLetterFooterLines(brand),
    '',
    authenticityLine(brand, verifyCode),
    '',
    'Reply on this chat if you need any help.',
  ];
  return lines.join('\n').slice(0, 1024);
}

module.exports = {
  normalizeWaBrand,
  brandContact,
  brandLetterFooterLines,
  authenticityHost,
  authenticityLine,
  buildOriginalDocumentDeliveryBody,
};
