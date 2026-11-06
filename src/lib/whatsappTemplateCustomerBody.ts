/**
 * Expand CRM-stored Meta template previews (`svc_…: param · param`) into the
 * same wording the customer sees on WhatsApp.
 */

function brandLabelFromTemplateName(name: string): string {
  if (/_ero(?:_|$)/i.test(name) || /_ero_v\d+/i.test(name)) return 'Eleven RO';
  return 'Hydrogen RO';
}

function fillSlots(template: string, params: string[]): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const idx = Math.max(0, Number(n) - 1);
    return params[idx] ?? '';
  });
}

/** Parse `svc_foo: a · b` (+ optional trailing CRM notes). */
export function parseStoredWhatsAppTemplateBody(raw: string): {
  templateName: string;
  params: string[];
  trailing: string;
} | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const firstLine = text.split(/\n/)[0]?.trim() || '';
  const m = firstLine.match(/^(svc_[a-z0-9_]+)\s*:\s*(.+)$/i);
  if (m) {
    const templateName = m[1];
    const params = m[2]
      .split(/\s*·\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const trailing = text.slice(firstLine.length).replace(/^\n+/, '').trim();
    return { templateName, params, trailing };
  }
  if (/^svc_[a-z0-9_]+$/i.test(text)) {
    return { templateName: text, params: [], trailing: '' };
  }
  return null;
}

/**
 * Customer-facing body for a known Meta template + params.
 * Returns null when we don't have a copy match (caller keeps stored text).
 */
export function renderWhatsAppTemplateCustomerBody(
  templateName: string,
  params: string[]
): string | null {
  const name = String(templateName || '').trim();
  if (!name) return null;
  const p = params.map((x) => String(x ?? '').trim());
  const brand = brandLabelFromTemplateName(name);

  if (/^svc_payment_received_letter_(ero|hro)_v4$/i.test(name)) {
    return fillSlots(
      [
        'Hi {{1}}, 👋',
        `Thank you. ${brand} has received your payment of INR {{2}} for your water purifier service. ✅`,
        '',
        '🧾 This payment is recorded on your service account.',
        '',
        `Thank you for choosing ${brand}.`,
        '',
        '💬 Reply on this chat if you need any help.',
      ].join('\n'),
      p
    );
  }

  if (/^svc_payment_received_letter_(ero|hro)_v2$/i.test(name)) {
    return fillSlots(
      [
        'Hi {{1}},',
        '',
        `Thank you. ${brand} has received your payment of INR {{2}} for your water purifier service.`,
        '',
        'This payment is recorded on your service account. Reply on this chat if you need a receipt or any help with this visit.',
      ].join('\n'),
      p
    );
  }

  if (/^svc_payment_received_letter_(ero|hro)_v1$/i.test(name)) {
    return fillSlots(
      [
        'Hi {{1}}, 👋',
        `This is an update from ${brand} regarding your payment.`,
        '',
        'We have received your payment of INR {{2}}. Thank you. ✅',
        '',
        '💬 Reply on this chat if you need any help.',
      ].join('\n'),
      p
    );
  }

  if (/^svc_payment_received$/i.test(name)) {
    return fillSlots(
      'Hi {{1}}, we have received payment of INR {{2}} for your service. Reply on this chat for any questions.',
      p
    );
  }

  if (/balance_due/i.test(name) && p.length >= 2) {
    const [customer, amount, due, invoice] = p;
    const lines = [
      `Hi ${customer || 'there'},`,
      `This is an update from ${brand} regarding your pending payment for water purifier service.`,
      '',
      `Amount pending: INR ${String(amount || '').replace(/[^\d.]/g, '') || amount || '0'}`,
    ];
    if (due) lines.push(`Due date: ${due}`);
    if (invoice) lines.push(`Invoice / Job: ${invoice}`);
    lines.push('');
    lines.push('Tap Pay now below or reply on this chat if you have already paid.');
    return lines.join('\n');
  }

  return null;
}

/**
 * If `body` looks like a stored template preview, return the customer WhatsApp text.
 * CRM-only stamps (awaiting-media notes) are dropped — they were never on the Meta send.
 */
export function expandWhatsAppTemplateInboxBody(
  body: string | null | undefined,
  templateNameHint?: string | null
): string | null {
  const raw = String(body || '').trim();
  const parsed = parseStoredWhatsAppTemplateBody(raw);
  const templateName = parsed?.templateName || String(templateNameHint || '').trim();
  if (!templateName) return null;

  const params = parsed?.params || [];
  // Body is already plain customer text (not a slug preview) — leave it alone.
  if (!parsed && raw && !/^svc_/i.test(raw)) return null;

  const rendered = renderWhatsAppTemplateCustomerBody(templateName, params);
  if (!rendered) return null;
  return rendered;
}
