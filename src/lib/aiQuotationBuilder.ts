import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import type { BillItem } from '@/types';
import type { ServiceDocumentTermItem } from '@/lib/service-document-terms';

export type AiQuotationBuildResult =
  | {
      ok: true;
      draft: {
        items: BillItem[];
        notes: string[];
        notesHeading: string;
        termItems: ServiceDocumentTermItem[];
        validityNote: string;
        validityDays: number;
        gstOption: 'normal' | 'exclude' | 'include';
        showBankDetails: boolean;
      };
      pricedItemCount: number;
      warnings: string[];
      confidence: number;
      requiresHuman: boolean;
      meta: { provider?: string; model?: string; latencyMs?: number };
    }
  | { ok: false; error: string };

function cleanStrings(raw: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => String(value ?? '').trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export async function buildQuotationWithAi(opts: {
  customerId: string;
  instruction: string;
  allowPrices?: boolean;
}): Promise<AiQuotationBuildResult> {
  const instruction = String(opts.instruction || '').trim();
  if (instruction.length < 8) {
    return { ok: false, error: 'Describe the quotation in at least 8 characters' };
  }
  if (!opts.customerId) return { ok: false, error: 'Customer required' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  try {
    const response = await fetch('/.netlify/functions/ai-inbox-suggest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        operation: 'build_quotation',
        customerId: opts.customerId,
        instruction,
        allowPrices: opts.allowPrices === true,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success || !data?.suggestion?.quotation) {
      return {
        ok: false,
        error: String(data?.error || `AI request failed (${response.status})`),
      };
    }

    const allowPrices = opts.allowPrices === true;
    const proposal = data.suggestion.quotation as Record<string, unknown>;
    const rawItems = Array.isArray(proposal.items) ? proposal.items : [];
    const items: BillItem[] = rawItems.slice(0, 12).map((raw, index) => {
      const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const quantity = Number(row.quantity);
      const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.min(99, quantity) : 1;
      const price = Number(row.unitPrice);
      // Prices only survive when the admin opted in; otherwise the admin fills them.
      const unitPrice =
        allowPrices && Number.isFinite(price) && price > 0
          ? Math.min(10_000_000, Math.round(price * 100) / 100)
          : 0;
      return {
        id: `ai-quote-${Date.now()}-${index}`,
        description: String(row.description || `Item ${index + 1}`).trim().slice(0, 200),
        quantity: safeQuantity,
        unitPrice,
        total: Math.round(unitPrice * safeQuantity * 100) / 100,
        taxRate: 0,
        taxAmount: 0,
      };
    });
    if (!items.length) return { ok: false, error: 'AI did not return quotation items' };

    const terms = cleanStrings(proposal.terms, 16, 320);
    const termItems: ServiceDocumentTermItem[] = terms.map((text, index) => ({
      id: `ai-custom-${Date.now()}-${index}`,
      text,
      enabled: true,
      group: 'custom',
    }));
    const validityDays = Math.max(1, Math.min(180, Math.round(Number(proposal.validityDays) || 30)));
    const gstOption =
      proposal.gstOption === 'normal' ||
      proposal.gstOption === 'exclude' ||
      proposal.gstOption === 'include'
        ? proposal.gstOption
        : 'include';

    return {
      ok: true,
      draft: {
        items,
        notes: cleanStrings(proposal.notes, 8, 240),
        notesHeading: String(proposal.notesHeading || 'Additional Info').trim().slice(0, 80),
        termItems,
        validityNote: String(proposal.validityNote || '').trim().slice(0, 400),
        validityDays,
        gstOption,
        showBankDetails: proposal.showBankDetails === true,
      },
      pricedItemCount: items.filter((item) => item.unitPrice > 0).length,
      warnings: cleanStrings(
        [...(Array.isArray(data.suggestion.warnings) ? data.suggestion.warnings : []),
          ...(Array.isArray(proposal.warnings) ? proposal.warnings : [])],
        8,
        240
      ),
      confidence: Math.max(0, Math.min(1, Number(data.suggestion.confidence) || 0.5)),
      requiresHuman: data.suggestion.requiresHuman === true,
      meta: {
        provider: data?.meta?.provider,
        model: data?.meta?.model,
        latencyMs: data?.meta?.latencyMs,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI request failed',
    };
  }
}
