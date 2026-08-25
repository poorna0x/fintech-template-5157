import { isNativeApp } from '@/lib/isNativeApp';
import { mapPasskeyError, passkeyHostnameHint } from '@/lib/passkeyErrors';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabaseConfig';
import { supabase } from '@/lib/supabaseClient';
import {
  deserializeCredentialCreationOptions,
  deserializeCredentialRequestOptions,
  serializeCredentialCreationResponse,
  serializeCredentialRequestResponse,
  type WebAuthnCreationOptionsJSON,
  type WebAuthnRequestOptionsJSON,
} from '@/lib/webauthnJson';

export type PasskeyListItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export { mapPasskeyError, passkeyHostnameHint };

export function browserSupportsWebAuthn(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.isSecureContext === true &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}

/** Admin web only — Capacitor WebView cannot use the hydrogenro.com RP ID. */
export function isPasskeyLoginAvailable(): boolean {
  if (isNativeApp()) return false;
  return browserSupportsWebAuthn();
}

function defaultPasskeyName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'This device';
}

async function gotrueJson(
  path: string,
  init: { method: string; accessToken?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  if (!isSupabaseConfigured() || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured');
  }
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1${path}`, {
    method: init.method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${init.accessToken || supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

async function requireAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sign in first, then add a passkey.');
  return token;
}

export async function createPasskeyAssertion(
  optionsJson: WebAuthnRequestOptionsJSON
): Promise<Record<string, unknown>> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser does not support passkeys.');
  }
  const publicKey = deserializeCredentialRequestOptions(optionsJson);
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error('Passkey sign-in did not complete.');
  }
  return serializeCredentialRequestResponse(credential);
}

export async function createPasskeyAttestation(
  optionsJson: WebAuthnCreationOptionsJSON
): Promise<Record<string, unknown>> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser does not support passkeys.');
  }
  const publicKey = deserializeCredentialCreationOptions(optionsJson);
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error('Passkey registration did not complete.');
  }
  return serializeCredentialCreationResponse(credential);
}

export async function listPasskeys(): Promise<PasskeyListItem[]> {
  const token = await requireAccessToken();
  const { ok, status, json } = await gotrueJson('/passkeys', { method: 'GET', accessToken: token });
  if (!ok) throw Object.assign(new Error(mapPasskeyError({ ...json, status })), { status, ...json });
  if (Array.isArray(json)) return json as PasskeyListItem[];
  if (Array.isArray(json.passkeys)) return json.passkeys as PasskeyListItem[];
  if (Array.isArray(json.data)) return json.data as PasskeyListItem[];
  return [];
}

export async function registerPasskey(): Promise<PasskeyListItem> {
  const token = await requireAccessToken();
  const started = await gotrueJson('/passkeys/registration/options', {
    method: 'POST',
    accessToken: token,
    body: {},
  });
  if (!started.ok) {
    throw Object.assign(new Error(mapPasskeyError({ ...started.json, status: started.status })), {
      status: started.status,
      ...started.json,
    });
  }
  const challengeId = String(started.json.challenge_id || '');
  const options = started.json.options as WebAuthnCreationOptionsJSON | undefined;
  if (!challengeId || !options) {
    throw new Error('Could not start passkey registration.');
  }
  const credential = await createPasskeyAttestation(options);
  const verified = await gotrueJson('/passkeys/registration/verify', {
    method: 'POST',
    accessToken: token,
    body: { challenge_id: challengeId, credential },
  });
  if (!verified.ok) {
    throw Object.assign(new Error(mapPasskeyError({ ...verified.json, status: verified.status })), {
      status: verified.status,
      ...verified.json,
    });
  }
  const created = verified.json as unknown as PasskeyListItem;
  const id = created.id;
  if (id) {
    await gotrueJson(`/passkeys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      accessToken: token,
      body: { friendly_name: defaultPasskeyName() },
    }).catch(() => undefined);
    return { ...created, friendly_name: created.friendly_name || defaultPasskeyName() };
  }
  return created;
}

export async function deletePasskey(passkeyId: string): Promise<void> {
  const token = await requireAccessToken();
  const { ok, status, json } = await gotrueJson(`/passkeys/${encodeURIComponent(passkeyId)}`, {
    method: 'DELETE',
    accessToken: token,
  });
  if (!ok && status !== 204) {
    throw Object.assign(new Error(mapPasskeyError({ ...json, status })), { status, ...json });
  }
}

export async function renamePasskey(passkeyId: string, friendlyName: string): Promise<void> {
  const token = await requireAccessToken();
  const name = friendlyName.trim().slice(0, 120);
  if (!name) throw new Error('Enter a name for this passkey.');
  const { ok, status, json } = await gotrueJson(`/passkeys/${encodeURIComponent(passkeyId)}`, {
    method: 'PATCH',
    accessToken: token,
    body: { friendly_name: name },
  });
  if (!ok) throw Object.assign(new Error(mapPasskeyError({ ...json, status })), { status, ...json });
}
