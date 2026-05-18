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
      if (!headers.has('Authorization') && actualKey) {
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
