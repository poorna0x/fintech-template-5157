import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type AiDocumentKind = 'bill' | 'quotation' | 'tax_invoice' | 'amc' | 'warranty';

export type AiDocumentChatTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type AiDocumentDraftResult =
  | {
      ok: true;
      answer: string;
      patch: Record<string, unknown>;
      changes: Array<{ field: string; explanation: string }>;
      warnings: string[];
      confidence: number;
      meta: {
        provider?: string;
        model?: string;
        latencyMs?: number;
        canMutate: false;
        canDelete: false;
        canSave: false;
        canSend: false;
      };
    }
  | { ok: false; error: string };

export async function requestAiDocumentDraft(opts: {
  kind: AiDocumentKind;
  message: string;
  currentDraft: Record<string, unknown>;
  history: AiDocumentChatTurn[];
}): Promise<AiDocumentDraftResult> {
  const message = String(opts.message || '').trim();
  if (message.length < 2) return { ok: false, error: 'Describe what you want to change' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  try {
    const response = await fetch('/.netlify/functions/ai-document-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        kind: opts.kind,
        message,
        currentDraft: opts.currentDraft,
        history: opts.history.slice(-10),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      return {
        ok: false,
        error: String(data?.error || `AI request failed (${response.status})`),
      };
    }
    return {
      ok: true,
      answer: String(data.answer || ''),
      patch: data.patch && typeof data.patch === 'object' ? data.patch : {},
      changes: Array.isArray(data.changes)
        ? data.changes
            .filter((row: unknown) => row && typeof row === 'object')
            .map((row: { field?: unknown; explanation?: unknown }) => ({
              field: String(row.field || ''),
              explanation: String(row.explanation || ''),
            }))
            .filter((row: { field: string }) => row.field)
        : [],
      warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
      confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0.5)),
      meta: {
        provider: data?.meta?.provider,
        model: data?.meta?.model,
        latencyMs: data?.meta?.latencyMs,
        canMutate: false,
        canDelete: false,
        canSave: false,
        canSend: false,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI request failed',
    };
  }
}

