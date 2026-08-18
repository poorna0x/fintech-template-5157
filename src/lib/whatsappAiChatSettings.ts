import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type WhatsAppAiChatSettings = {
  reviewAllChats: boolean;
  autoReplyEnabled: boolean;
  lastReviewedWaMessageId: string | null;
  updatedAt: string | null;
};

const DEFAULTS: WhatsAppAiChatSettings = {
  reviewAllChats: false,
  autoReplyEnabled: false,
  lastReviewedWaMessageId: null,
  updatedAt: null,
};

async function callSettings(
  phone?: string | null,
  body?: Record<string, unknown>
): Promise<
  | { ok: true; settings: WhatsAppAiChatSettings }
  | { ok: false; error: string; setupRequired?: boolean }
> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };
  try {
    const method = body ? 'POST' : 'GET';
    const query = !body && phone ? `?phone=${encodeURIComponent(phone)}` : '';
    const response = await fetch(`/.netlify/functions/whatsapp-ai-chat-settings${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify({ ...body, ...(phone ? { phone } : {}) }) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      return {
        ok: false,
        error: String(data?.error || `AI settings failed (${response.status})`),
        setupRequired: data?.setupRequired === true,
      };
    }
    return {
      ok: true,
      settings: {
        ...DEFAULTS,
        ...(data.settings || {}),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI settings request failed',
    };
  }
}

export function fetchWhatsAppAiChatSettings(phone?: string | null) {
  return callSettings(phone);
}

export function setWhatsAppAiReviewAll(enabled: boolean, phone?: string | null) {
  return callSettings(phone, { action: 'set_review_all', enabled });
}

export function setWhatsAppChatAutoReply(phone: string, enabled: boolean) {
  return callSettings(phone, { action: 'set_auto_reply', enabled });
}

export function markWhatsAppChatAiReviewed(phone: string, waMessageId: string) {
  return callSettings(phone, { action: 'mark_reviewed', waMessageId });
}
