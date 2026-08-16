/**
 * Localhost-only mock provider for AI inbox suggestions.
 * Deterministic structured JSON — no network, no secrets.
 */

function lastCustomerText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === 'user' && m.text) return m.text;
  }
  return '';
}

function detectIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/quot|price|cost|rate|how much/.test(t)) return 'quotation';
  if (/book|visit|service|repair|install|amc|filter/.test(t)) return 'booking';
  if (/thanks|thank you|ok|okay|noted/.test(t)) return 'ack';
  return 'general_reply';
}

async function generateWithMock(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const last = lastCustomerText(messages);
  const intent = detectIntent(last);
  const includeQuotation =
    input.operation === 'suggest_quotation' ||
    input.operation === 'build_quotation' ||
    intent === 'quotation';

  let replyText =
    'Thanks for your message. Our team will help you with this shortly. Could you share a bit more detail if needed?';
  if (intent === 'booking') {
    replyText =
      'Thanks for reaching out. We can schedule a service visit. Please share your preferred date, time slot, and location/pin if you have not already.';
  } else if (intent === 'ack') {
    replyText = 'Thank you. Noted — we will update you here on WhatsApp.';
  } else if (includeQuotation) {
    replyText =
      'Thanks. I can prepare a quotation draft for our team to review. Please confirm the product/service items you want priced, and we will send the final quotation after admin pricing.';
  }

  // Mock only echoes a price when the brief clearly contains one.
  const briefPrice = Number((String(last).match(/(?:₹|rs\.?\s*)(\d{2,7})/i) || [])[1] || 0);

  const quotation = includeQuotation
    ? {
        items: [
          {
            description: /install/i.test(last)
              ? 'RO Water Purifier Installation'
              : 'RO Service / Repair (as discussed)',
            quantity: 1,
            unitPrice: briefPrice > 0 ? briefPrice : 0,
          },
          ...(/(filter|cartridge|membrane)/i.test(last)
            ? [{ description: 'Filter / membrane replacement (as needed)', quantity: 1, unitPrice: 0 }]
            : []),
        ],
        notes: ['Prices to be filled by admin before sending to customer.'],
        warnings: ['AI draft only — selling prices left blank on purpose.'],
        notesHeading: 'Scope & Notes',
        terms: [
          'Final scope and selling prices are subject to admin confirmation.',
          'Payment is due as agreed in the approved quotation.',
          'Warranty applies only when explicitly stated in the final quotation.',
          'Additional work or materials outside this scope will be charged separately.',
          'All disputes are subject to Bengaluru, Karnataka jurisdiction.',
        ],
        validityNote: 'This quotation is valid for 30 days from the date of issue.',
        validityDays: 30,
        gstOption: 'include',
        showBankDetails: false,
      }
    : null;

  const payload = {
    replyText,
    intent: includeQuotation ? 'quotation' : intent,
    confidence: 0.72,
    requiresHuman: intent === 'general_reply',
    warnings: includeQuotation
      ? ['Review item descriptions and enter selling prices before sending.']
      : [],
    quotation,
  };

  return {
    text: JSON.stringify(payload),
    toolCalls: [],
    usage: { inputTokens: 120, outputTokens: 90, totalTokens: 210 },
    finishReason: 'stop',
    providerRequestId: `mock-${Date.now()}`,
    rawMetadata: { provider: 'mock' },
  };
}

module.exports = {
  generateWithMock,
};
