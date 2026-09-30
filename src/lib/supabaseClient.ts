/**
 * Minimal Supabase auth client for the public app shell (AuthContext, session refresh).
 * Full table/RPC access lives in supabase.ts (admin-data chunk — not loaded on marketing pages).
 */
import { createClient } from '@supabase/supabase-js';
import { chromeStorage } from './storage';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './supabaseConfig';
import { isPWAMode } from './pwa';
import { sanitizePostgrestErrorBody } from './sanitizePostgrestError';

if (import.meta.env.DEV) {
  console.log('[Supabase Config] URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.log(
    '[Supabase Config] Anon Key:',
    supabaseAnonKey ? '✓ Set (' + supabaseAnonKey.substring(0, 20) + '...)' : '✗ Missing'
  );
}

const buildTimeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const buildTimeKey = supabaseAnonKey || 'placeholder-key';

if (typeof window !== 'undefined' && !isSupabaseConfigured()) {
  console.error(
    '[Supabase Config] Missing or placeholder Supabase env at runtime — login will fail in production.'
  );
}

const supabaseStorageAdapter =
  typeof window !== 'undefined'
    ? {
        getItem: (key: string) => chromeStorage.getItem(key),
        setItem: (key: string, value: string) => chromeStorage.setItem(key, value),
        removeItem: (key: string) => chromeStorage.removeItem(key),
      }
    : undefined;

export const supabase = createClient(buildTimeUrl, buildTimeKey, {
  auth: {
    storage: supabaseStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    fetch: (url, options = {}) => {
      const existingHeaders = options.headers || {};
      const headers = new Headers(
        existingHeaders instanceof Headers ? existingHeaders : existingHeaders
      );

      const actualKey = supabaseAnonKey || buildTimeKey;
      if (!headers.has('apikey') && actualKey) {
        headers.set('apikey', actualKey);
      }
      // Do not fall back to the anon JWT on PostgREST / Realtime when the user JWT
      // is missing — that silently runs as `anon` and yields "permission denied"
      // on tables like technicians after RLS lockdown. Auth + Storage still get the
      // anon bearer when supabase-js omits Authorization.
      const requestUrl = String(url);
      const isDataApi =
        requestUrl.includes('/rest/v1/') || requestUrl.includes('/realtime/v1/');
      if (!headers.has('Authorization') && actualKey && !isDataApi) {
        headers.set('Authorization', `Bearer ${actualKey}`);
      }

      const controller = new AbortController();
      const fetchTimeoutMs = typeof window !== 'undefined' && isPWAMode() ? 60_000 : 30_000;
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

      if (!isSupabaseConfigured() && String(url).includes('placeholder.supabase.co')) {
        clearTimeout(timeoutId);
        throw new Error(
          'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY on Netlify and redeploy.'
        );
      }

      return fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })
        .then(async (response) => {
          clearTimeout(timeoutId);
          if (!response.ok && import.meta.env.PROD) {
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              try {
                const body = await response.clone().json();
                const sanitized = sanitizePostgrestErrorBody(body);
                return new Response(JSON.stringify(sanitized), {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                });
              } catch {
                /* keep original response */
              }
            }
          }
          return response;
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          if (import.meta.env.DEV) {
            console.error('[Supabase Fetch Error]', error);
          }
          if (error.name === 'AbortError') {
            throw new Error('Request timeout - please check your internet connection');
          }
          throw error;
        });
    },
  },
});

/**
 * Realtime's auth callback falls back to the anon key when getSession() is
 * briefly empty. Anon has no GRANT on admin tables, so Postgres logs
 * 42501 "permission denied for table …" for every live subscription.
 * Keep the last signed-in JWT instead, and never join a channel without one.
 */
const realtimeClient = supabase as unknown as {
  _getSessionToken: () => Promise<string | null>;
  _getAccessToken: () => Promise<string>;
};

let realtimeUserJwt: string | null = null;

function isUserJwt(token: string | null | undefined): token is string {
  return !!token && token !== supabaseAnonKey && token !== buildTimeKey;
}

realtimeClient._getAccessToken = async () => {
  try {
    const sessionToken = await realtimeClient._getSessionToken();
    if (isUserJwt(sessionToken)) {
      realtimeUserJwt = sessionToken;
      return sessionToken;
    }
  } catch {
    /* keep the last signed-in token */
  }
  return realtimeUserJwt ?? '';
};

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    realtimeUserJwt = null;
    return;
  }
  if (isUserJwt(session?.access_token)) realtimeUserJwt = session.access_token;
});

const openRealtimeChannel = supabase.channel.bind(supabase);
const realtimeJwtGuard = Symbol('realtimeUserJwt');

supabase.channel = ((name: string, opts?: Parameters<typeof openRealtimeChannel>[1]) => {
  const channel = openRealtimeChannel(name, opts);
  const guarded = channel as typeof channel & { [realtimeJwtGuard]?: boolean };
  if (guarded[realtimeJwtGuard]) return channel;
  guarded[realtimeJwtGuard] = true;

  const originalSubscribe = channel.subscribe.bind(channel);
  const originalUnsubscribe = channel.unsubscribe.bind(channel);
  let cancelled = false;

  channel.unsubscribe = (async () => {
    cancelled = true;
    return originalUnsubscribe();
  }) as typeof channel.unsubscribe;

  channel.subscribe = ((callback, timeout) => {
    void (async () => {
      let token: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        token = isUserJwt(data.session?.access_token) ? data.session.access_token : realtimeUserJwt;
      } catch {
        token = realtimeUserJwt;
      }
      if (cancelled) return;
      if (!isUserJwt(token)) {
        callback?.('CHANNEL_ERROR', new Error('No signed-in session for realtime'));
        return;
      }
      await supabase.realtime.setAuth(token);
      if (cancelled) return;
      originalSubscribe(callback, timeout);
    })();
    return channel;
  }) as typeof channel.subscribe;

  return channel;
}) as typeof supabase.channel;
