/**
 * Client facade for admin-reviewed AI inbox suggestions.
 * Never auto-sends WhatsApp; never deletes CRM data.
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { saveDraft } from '@/lib/document-drafts';

export type AiSuggestOperation = 'suggest_reply' | 'suggest_quotation';

export type AiQuotationItemProposal = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
};

export type AiQuotationProposal = {
  items: AiQuotationItemProposal[];
  notes: string[];
  warnings: string[];
  customerName?: string | null;
};

export type AiInboxSuggestion = {
  replyText: string;
  intent: string;
  confidence: number;
  requiresHuman: boolean;
  warnings: string[];
  quotation: AiQuotationProposal | null;
  customerId?: string | null;
  customerName?: string | null;
  detailVerification?: {
    kind: 'location' | 'photo';
    label: string;
    status: 'still_missing';
    receivedType: string;
    reason: string;
    reaskAction: 'request_location' | 'request_photo';
    source: 'booking_state' | 'recent_thread';
  } | null;
};

export type AiInboxSuggestResult =
  | {
      ok: true;
      suggestion: AiInboxSuggestion;
      meta: {
        provider?: string;
        model?: string;
        canAutoSend: false;
        canDelete: false;
        canCreateJob: false;
        latencyMs?: number;
      };
    }
  | { ok: false; error: string };

function forceZeroPrices(items: AiQuotationItemProposal[] | undefined): AiQuotationItemProposal[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const description = String(item.description || '').trim() || `Item ${index + 1}`;
    return {
      description,
      quantity,
      unitPrice: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 0,
    };
  });
}

export async function requestAiInboxSuggestion(opts: {
  operation: AiSuggestOperation;
  phoneE164: string;
  customerId?: string | null;
}): Promise<AiInboxSuggestResult> {
  const phone = String(opts.phoneE164 || '').trim();
  if (!phone) return { ok: false, error: 'Phone required' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  try {
    const res = await fetch('/.netlify/functions/ai-inbox-suggest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        operation: opts.operation,
        phoneE164: phone,
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success || !data?.suggestion) {
      return {
        ok: false,
        error: String(data?.error || `AI request failed (${res.status})`),
      };
    }

    const suggestion = data.suggestion as AiInboxSuggestion;
    if (suggestion.quotation?.items) {
      suggestion.quotation.items = forceZeroPrices(suggestion.quotation.items);
    }

    return {
      ok: true,
      suggestion,
      meta: {
        provider: data?.meta?.provider,
        model: data?.meta?.model,
        canAutoSend: false,
        canDelete: false,
        canCreateJob: false,
        latencyMs: data?.meta?.latencyMs,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'AI request failed',
    };
  }
}

/** Build a QuotationGenerator-compatible draft snapshot with blank selling prices. */
export function buildAiQuotationDraftSnapshot(opts: {
  suggestion: AiInboxSuggestion;
  customer: {
    id?: string | null;
    fullName?: string | null;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: Record<string, string | undefined> | string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  };
}): Record<string, unknown> {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  const valid = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const validYmd = `${valid.getFullYear()}-${String(valid.getMonth() + 1).padStart(2, '0')}-${String(
    valid.getDate()
  ).padStart(2, '0')}`;

  const name =
    opts.suggestion.customerName ||
    opts.customer.fullName ||
    opts.customer.full_name ||
    'Customer';

  const addressObj =
    opts.customer.address && typeof opts.customer.address === 'object'
      ? opts.customer.address
      : {
          street: typeof opts.customer.address === 'string' ? opts.customer.address : '',
          city: opts.customer.city || '',
          state: opts.customer.state || '',
          pincode: opts.customer.pincode || '',
        };

  const items = forceZeroPrices(opts.suggestion.quotation?.items).map((item, index) => ({
    id: `ai-${Date.now()}-${index}`,
    description: item.description,
    quantity: item.quantity,
    unitPrice: 0,
    total: 0,
    taxRate: 0,
    taxAmount: 0,
  }));

  const notes = [
    ...(opts.suggestion.quotation?.notes || []),
    'AI draft — enter approved selling prices before sending.',
  ];

  return {
    v: 1,
    quotationNumber: `QUO-AI-${ymd}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    quotationDate: ymd,
    validUntilDate: validYmd,
    isValidUntilManuallySet: false,
    items:
      items.length > 0
        ? items
        : [
            {
              id: `ai-${Date.now()}-0`,
              description: 'Service / product (describe and price)',
              quantity: 1,
              unitPrice: 0,
              total: 0,
              taxRate: 0,
              taxAmount: 0,
            },
          ],
    serviceCharge: 0,
    notes,
    notesHeading: 'Notes',
    customImageBlocks: [],
    validityNote: '',
    showValidityNote: false,
    termItems: [],
    terms: '',
    gstOption: 'exclude',
    addGSTNoteToNotes: false,
    showBankDetails: false,
    sealVariant: 'stamp',
    bankDetails: {},
    placeOfSupply: '',
    placeOfSupplyCode: '',
    editableCustomer: {
      name,
      phone: opts.customer.phone || '',
      email: opts.customer.email || '',
      address: addressObj,
    },
    aiDraft: true,
  };
}

export async function saveAiQuotationDraft(opts: {
  suggestion: AiInboxSuggestion;
  customer: {
    id?: string | null;
    fullName?: string | null;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: Record<string, string | undefined> | string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  };
}): Promise<{ ok: true; draftId: string; label: string } | { ok: false; error: string }> {
  if (!opts.customer?.id && !opts.suggestion.customerId) {
    return { ok: false, error: 'Customer is required to save a quotation draft' };
  }
  const snapshot = buildAiQuotationDraftSnapshot(opts);
  const label = `${String(snapshot.quotationNumber || 'AI draft')} — ${
    (snapshot.editableCustomer as { name?: string })?.name || 'Customer'
  }`;
  const draftId = await saveDraft('quotation', snapshot, { label });
  if (!draftId) return { ok: false, error: 'Could not save quotation draft' };
  return { ok: true, draftId, label };
}
