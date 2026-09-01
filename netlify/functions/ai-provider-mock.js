/**
 * Localhost-only mock provider for AI inbox suggestions.
 * Deterministic structured JSON — no network, no secrets.
 */

function lastCustomerText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === 'user' && m.text) return m.text;
    if (m.role === 'user' && m.content) return m.content;
  }
  return '';
}

function extractDraftToPolish(text) {
  const m = String(text || '').match(/<draft>\s*([\s\S]*?)\s*<\/draft>/i);
  return m ? String(m[1] || '').trim() : '';
}

/** Local mock: tidy spacing/caps. Real Gemini does full grammar. */
function beautifyMockDraft(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function detectIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/last service/.test(t)) return 'last_service';
  if (/\bamc\b/.test(t)) return 'amc';
  if (/quot|price|cost|rate|how much/.test(t)) return 'quotation';
  if (/book|visit|repair|install|filter/.test(t)) return 'booking';
  if (/thanks|thank you|ok|okay|noted/.test(t)) return 'ack';
  return 'general_reply';
}

function factLine(text, label) {
  const m = String(text || '').match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  return m ? String(m[1] || '').trim() : '';
}

function isMissingFact(value) {
  const v = String(value || '').trim().toLowerCase();
  return !v || v === 'not on file' || v === 'not on file yet' || v === 'none on file';
}

function mockCrmFactReply(prompt) {
  const latest = String(prompt.match(/Latest customer message[^:]*:\s*(.+)/i)?.[1] || '').trim();
  const q = latest || String(prompt || '');
  const lastService = factLine(prompt, 'Last service date');
  const lastJob = factLine(prompt, 'Last job');
  const nextVisit = factLine(prompt, 'Next visit');
  const warranty = factLine(prompt, 'Warranty expiry');
  const amc = factLine(prompt, 'AMC');
  const purifier = factLine(prompt, 'Purifier');
  const address = factLine(prompt, 'Saved address label');
  if (/last service/i.test(q)) {
    if (isMissingFact(lastService)) {
      return {
        replyText:
          'We do not have a last service date on file yet. Our team can confirm after checking the records.',
        intent: 'last_service',
        requiresHuman: true,
      };
    }
    return {
      replyText: `Your last service was on ${lastService}.`,
      intent: 'last_service',
      requiresHuman: false,
    };
  }
  if (/next (?:visit|service)|upcoming (?:visit|job|service)|when is my (?:next )?visit/i.test(q)) {
    if (isMissingFact(nextVisit)) {
      return {
        replyText: 'We do not have a next visit scheduled on file yet.',
        intent: 'next_visit',
        requiresHuman: true,
      };
    }
    return {
      replyText: `Your next visit on file is ${nextVisit}.`,
      intent: 'next_visit',
      requiresHuman: false,
    };
  }
  if (/\bamc\b/i.test(q)) {
    if (isMissingFact(amc)) {
      return {
        replyText: 'We do not have an AMC on file for this number yet.',
        intent: 'amc',
        requiresHuman: true,
      };
    }
    return {
      replyText: `Your AMC on file is ${amc}.`,
      intent: 'amc',
      requiresHuman: false,
    };
  }
  if (/\bwarranty\b/i.test(q)) {
    if (isMissingFact(warranty)) {
      return {
        replyText: 'We do not have a warranty expiry on file yet.',
        intent: 'warranty',
        requiresHuman: true,
      };
    }
    return {
      replyText: `The warranty on file expires on ${warranty}.`,
      intent: 'warranty',
      requiresHuman: false,
    };
  }
  if (/\b(model|brand|purifier)\b/i.test(q)) {
    if (isMissingFact(purifier)) {
      return {
        replyText: 'We do not have the purifier model on file yet. Please share the brand and model if you have it.',
        intent: 'purifier',
        requiresHuman: true,
      };
    }
    return {
      replyText: `The purifier on file is ${purifier}.`,
      intent: 'purifier',
      requiresHuman: false,
    };
  }
  if (/\baddress\b/i.test(q)) {
    if (isMissingFact(address)) {
      return {
        replyText: 'We do not have a saved address label on file yet.',
        intent: 'address',
        requiresHuman: true,
      };
    }
    return {
      replyText: `The address on file is ${address}.`,
      intent: 'address',
      requiresHuman: false,
    };
  }
  if (/\b(last job|job number|job status)\b/i.test(q)) {
    if (isMissingFact(lastJob)) {
      return {
        replyText: 'We do not have a recent job on file for this number yet.',
        intent: 'last_job',
        requiresHuman: true,
      };
    }
    return {
      replyText: `The latest job on file is ${lastJob}.`,
      intent: 'last_job',
      requiresHuman: false,
    };
  }
  return null;
}

async function generateWithMock(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const last = lastCustomerText(messages);
  const draftToPolish = extractDraftToPolish(last);

  if (input.operation === 'suggest_reply' && draftToPolish) {
    const payload = {
      replyText: beautifyMockDraft(draftToPolish),
      intent: 'polish_draft',
      confidence: 0.9,
      requiresHuman: false,
      warnings: [],
      quotation: null,
    };
    return {
      text: JSON.stringify(payload),
      parsed: payload,
      toolCalls: [],
      usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      finishReason: 'stop',
      providerRequestId: `mock-polish-${Date.now()}`,
      rawMetadata: { provider: 'mock' },
    };
  }

  const crmReply = mockCrmFactReply(last);
  if ((input.operation === 'suggest_reply' || !input.operation) && crmReply) {
    const payload = {
      replyText: crmReply.replyText,
      intent: crmReply.intent,
      confidence: 0.88,
      requiresHuman: crmReply.requiresHuman === true,
      warnings: [],
      quotation: null,
    };
    return {
      text: JSON.stringify(payload),
      parsed: payload,
      toolCalls: [],
      usage: { inputTokens: 90, outputTokens: 50, totalTokens: 140 },
      finishReason: 'stop',
      providerRequestId: `mock-crm-fact-${Date.now()}`,
      rawMetadata: { provider: 'mock' },
    };
  }

  const intent = detectIntent(last);

  if (input.operation === 'document_draft') {
    const requestMatch = String(last).match(/<request>\s*([\s\S]*?)\s*<\/request>/i);
    const request = String(requestMatch?.[1] || last).trim();
    const notesMatch = String(last).match(/"notes"\s*:\s*(\[[\s\S]*?\])/);
    let currentNotes = [];
    try {
      currentNotes = notesMatch ? JSON.parse(notesMatch[1]) : [];
    } catch {
      currentNotes = [];
    }
    const operations = [];
    if (/\b(note|notes)\b/i.test(request)) {
      operations.push({
        field: 'notes',
        valueJson: JSON.stringify([...currentNotes, request].slice(-8)),
        explanation: 'Update document notes from your instruction',
      });
    }
    const payload = {
      answer: operations.length
        ? 'I prepared the requested document edit for review.'
        : 'Mock mode needs a request mentioning notes to demonstrate a document edit.',
      confidence: 0.72,
      warnings: ['Local mock mode — review before applying.'],
      operations,
    };
    return {
      text: JSON.stringify(payload),
      parsed: payload,
      toolCalls: [],
      usage: { inputTokens: 180, outputTokens: 100, totalTokens: 280 },
      finishReason: 'stop',
      providerRequestId: `mock-document-${Date.now()}`,
      rawMetadata: { provider: 'mock' },
    };
  }

  if (input.operation === 'crm_chat') {
    const wantsJob = /\b(new\s+job|create\s+job|book)\b/i.test(last);
    const wantsFollowUp = /\bfollow[- ]?up\b/i.test(last);
    const wantsReminder = /\breminder\b/i.test(last);
    const customerIdMatch = last.match(/id=([0-9a-f-]{8,})/i);
    const jobIdMatch = last.match(/Jobs:[\s\S]*?- id=([0-9a-f-]{8,})/i);
    const payload = {
      answer:
        'I found matching CRM records from the lookup. Review the source cards and confirm any draft action in the existing form.',
      confidence: 0.7,
      requiresHuman: true,
      warnings: ['Mock provider — confirm every action in the CRM form.'],
      proposedActions: [],
    };
    if (wantsJob && customerIdMatch) {
      payload.proposedActions.push({
        type: 'create_job',
        label: 'Create job draft',
        confidence: 0.7,
        requiresConfirm: true,
        payload: {
          customerId: customerIdMatch[1],
          serviceType: 'RO',
          serviceSubType: 'Service',
          description: 'AI draft job',
          priority: 'MEDIUM',
          leadSource: 'Call',
        },
      });
    }
    if (wantsFollowUp && jobIdMatch) {
      payload.proposedActions.push({
        type: 'schedule_follow_up',
        label: 'Schedule follow-up draft',
        confidence: 0.7,
        requiresConfirm: true,
        payload: {
          jobId: jobIdMatch[1],
          followUpReason: 'Not confirmed',
        },
      });
    }
    if (wantsReminder && customerIdMatch) {
      payload.proposedActions.push({
        type: 'create_reminder',
        label: 'Create reminder draft',
        confidence: 0.7,
        requiresConfirm: true,
        payload: {
          customerId: customerIdMatch[1],
          title: 'Follow up with customer',
          notes: 'AI draft reminder',
        },
      });
    }
    return {
      text: JSON.stringify(payload),
      parsed: payload,
      toolCalls: [],
      usage: { inputTokens: 160, outputTokens: 120, totalTokens: 280 },
      finishReason: 'stop',
      providerRequestId: `mock-crm-${Date.now()}`,
      rawMetadata: { provider: 'mock' },
    };
  }

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
