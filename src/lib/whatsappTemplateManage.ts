/**
 * WhatsApp Meta template manage API (Settings → WhatsApp → Templates).
 * Separate from fetchApprovedWhatsAppTemplates (inbox cold picker).
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type WhatsAppManagedTemplateButton = {
  type: string;
  text?: string | null;
  phone?: string | null;
  url?: string | null;
};

export type WhatsAppManagedTemplate = {
  id?: string | null;
  name: string;
  language: string;
  status: string;
  category?: string | null;
  bodyParamCount: number;
  bodyPreview?: string | null;
  header?: { format?: string | null } | null;
  buttons: WhatsAppManagedTemplateButton[];
  components?: unknown[];
};

export type WhatsAppTemplateCounts = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  other: number;
};

export type CreateWhatsAppTemplateInput = {
  name: string;
  body: string;
  language?: string;
  examples?: string[];
  callPhone?: string;
  callButtonText?: string;
  urlButtonUrl?: string;
  urlButtonText?: string;
  quickReply?: string;
};

async function authHeaders(): Promise<HeadersInit | null> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return null;
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/** Fill {{1}}… with sample values for preview. */
export function fillWhatsAppTemplatePreview(
  body: string | null | undefined,
  samples?: string[]
): string {
  let out = String(body || '');
  const defaults = ['Rahul', '500', '15 Aug 2026', 'RO2608121234', '10:30 AM', 'Tech'];
  const vals = samples?.length ? samples : defaults;
  out = out.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const i = Number(n) - 1;
    return vals[i] != null && String(vals[i]).trim() ? String(vals[i]) : `{{${n}}}`;
  });
  return out;
}

export async function fetchManagedWhatsAppTemplates(): Promise<{
  ok: boolean;
  templates: WhatsAppManagedTemplate[];
  counts?: WhatsAppTemplateCounts;
  error?: string;
}> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, templates: [], error: 'Not signed in' };
  try {
    const res = await fetch('/.netlify/functions/whatsapp-templates?manage=1', { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        templates: [],
        error: data?.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      templates: Array.isArray(data.templates) ? data.templates : [],
      counts: data.counts,
    };
  } catch (err) {
    return {
      ok: false,
      templates: [],
      error: err instanceof Error ? err.message : 'Failed to load templates',
    };
  }
}

export async function createWhatsAppTemplate(
  input: CreateWhatsAppTemplateInput
): Promise<{ ok: boolean; name?: string; status?: string; error?: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  try {
    const res = await fetch('/.netlify/functions/whatsapp-templates', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      name: data.name || input.name,
      status: data.status || 'PENDING',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create template',
    };
  }
}

export async function deleteWhatsAppTemplate(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'Missing template name' };
  try {
    const res = await fetch(
      `/.netlify/functions/whatsapp-templates?name=${encodeURIComponent(n)}`,
      { method: 'DELETE', headers }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to delete template',
    };
  }
}
