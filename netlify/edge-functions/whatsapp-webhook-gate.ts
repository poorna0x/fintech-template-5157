/**
 * ACK Meta status-only WhatsApp webhooks at the Edge so they do not burn
 * Netlify serverless invocations. Real inbound messages still hit whatsapp-webhook.js.
 */
import type { Config, Context } from '@netlify/edge-functions';

function hasInboundWhatsAppMessages(payload: unknown): boolean {
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes || [];
    for (const change of changes) {
      const c = change as { field?: string; value?: { messages?: unknown[] } };
      if (c.field && c.field !== 'messages') continue;
      const msgs = c.value?.messages;
      if (Array.isArray(msgs) && msgs.length > 0) return true;
    }
  }
  return false;
}

type WaStatus = { id: string; status: string; error: string | null };

function collectWhatsAppStatuses(payload: unknown): WaStatus[] {
  const out: WaStatus[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes || [];
    for (const change of changes) {
      const c = change as {
        field?: string;
        value?: { statuses?: Array<{ id?: string; status?: string; errors?: Array<{ title?: string; message?: string }> }> };
      };
      if (c.field && c.field !== 'messages') continue;
      const statuses = c.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const st of statuses) {
        if (!st?.id) continue;
        const err0 = st.errors?.[0];
        out.push({
          id: String(st.id),
          status: String(st.status || '').toLowerCase(),
          error: err0?.title || err0?.message ? String(err0.title || err0.message) : null,
        });
      }
    }
  }
  return out;
}

function shouldAckStatusOnlyAtEdge(payload: unknown): boolean {
  if (hasInboundWhatsAppMessages(payload)) return false;
  return collectWhatsAppStatuses(payload).length > 0;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supabaseConfig() {
  const url = (Deno.env.get('VITE_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '')
    .trim()
    .replace(/\/$/, '');
  const key = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  return { url, key };
}

async function hmacSha256Hex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function readWhatsAppAppSecret(url: string, key: string): Promise<string> {
  const fromEnv = (Deno.env.get('WHATSAPP_APP_SECRET') || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const res = await fetch(
      `${url}/rest/v1/app_secrets?key=eq.whatsapp_app_secret&select=value`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      }
    );
    if (!res.ok) return '';
    const rows = (await res.json()) as Array<{ value?: string }>;
    return String(rows?.[0]?.value || '').trim();
  } catch {
    return '';
  }
}

async function verifyWhatsAppSignature(raw: string, request: Request, appSecret: string): Promise<boolean> {
  const header = (request.headers.get('x-hub-signature-256') || '').trim();
  if (!header.startsWith('sha256=') || !appSecret) return false;
  const expected = await hmacSha256Hex(appSecret, raw);
  const provided = header.slice('sha256='.length).toLowerCase();
  return timingSafeEqualHex(expected, provided);
}

async function applyStatusesAtSupabase(url: string, key: string, statuses: WaStatus[]) {
  for (const st of statuses) {
    const patch: Record<string, string> = { status: st.status.slice(0, 40) || 'unknown' };
    if (st.error) patch.error_message = st.error.slice(0, 1000);
    try {
      await fetch(
        `${url}/rest/v1/whatsapp_messages?wa_message_id=eq.${encodeURIComponent(st.id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(patch),
        }
      );
    } catch {
      /* still ACK Meta */
    }
  }
}

function forwardToOrigin(request: Request, raw: string) {
  return new Request(request, { body: raw });
}

export default async (request: Request, context: Context) => {
  if (request.method !== 'POST') {
    return;
  }

  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return context.next();
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return context.next(forwardToOrigin(request, raw));
  }

  if (!shouldAckStatusOnlyAtEdge(payload)) {
    return context.next(forwardToOrigin(request, raw));
  }

  const { url, key } = supabaseConfig();
  if (!url || !key) {
    return context.next(forwardToOrigin(request, raw));
  }

  const appSecret = await readWhatsAppAppSecret(url, key);
  if (!appSecret || !(await verifyWhatsAppSignature(raw, request, appSecret))) {
    return json(401, { error: 'Invalid signature' });
  }

  const statuses = collectWhatsAppStatuses(payload);
  await applyStatusesAtSupabase(url, key, statuses);
  return json(200, { success: true, skipped: 'status_only', statuses: statuses.length });
};

export const config: Config = {
  path: '/.netlify/functions/whatsapp-webhook',
};
