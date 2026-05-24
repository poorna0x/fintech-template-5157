import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Cloudflare Turnstile widget — captures a token Supabase will verify server-side
 * when "Bot and Abuse Protection" is enabled in Auth settings. This is the only
 * mechanism that stops brute force against the raw /auth/v1/token endpoint, which
 * sits in front of Supabase and bypasses our /.netlify/functions/secure-auth-login
 * proxy entirely (the proxy still gates ALTCHA + IP/email limits + lockout).
 *
 * Soft-deployable: if VITE_TURNSTILE_SITE_KEY is not set, this component renders
 * nothing and reports verified=true so the existing login flow is unchanged. Once
 * the env var is set AND Supabase Dashboard → Authentication → Bot and Abuse
 * Protection is configured with the matching secret, login MUST carry a token.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          'timeout-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible' | 'invisible';
          appearance?: 'always' | 'execute' | 'interaction-only';
          action?: string;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
    __turnstileScriptLoading?: Promise<void>;
  }
}

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileScriptLoading) return window.__turnstileScriptLoading;

  window.__turnstileScriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${TURNSTILE_SCRIPT_URL.split('?')[0]}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile load failed')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Turnstile load failed')), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return window.__turnstileScriptLoading;
}

interface TurnstileWidgetProps {
  /** Fires with the token on solve, '' on reset / expire / error. */
  onToken: (token: string) => void;
  /** Optional Cloudflare 'action' tag (analytics + per-action rules). */
  action?: string;
  className?: string;
  size?: 'normal' | 'compact' | 'flexible';
  theme?: 'light' | 'dark' | 'auto';
}

function readSiteKey(): string {
  const key = (import.meta as ImportMeta & { env: { VITE_TURNSTILE_SITE_KEY?: string } })
    .env.VITE_TURNSTILE_SITE_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onToken,
  action,
  className = '',
  size = 'flexible',
  theme = 'light',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const siteKey = readSiteKey();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  // Soft-off when not configured: emit a sentinel token so the login form is not blocked.
  // (Supabase will still reject the request if dashboard CAPTCHA is enabled — that's the
  // signal to set VITE_TURNSTILE_SITE_KEY and redeploy.)
  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current('');
    }
  }, [siteKey]);

  const renderWidget = useCallback(async () => {
    if (!siteKey || !containerRef.current) return;
    try {
      await loadTurnstileScript();
      if (!window.turnstile || !containerRef.current) return;

      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme,
        size,
        appearance: 'interaction-only',
        callback: (token: string) => {
          setError(null);
          onTokenRef.current(token);
        },
        'error-callback': () => {
          setError('Security check failed. Please try again.');
          onTokenRef.current('');
        },
        'expired-callback': () => {
          setError('Security check expired. Please verify again.');
          onTokenRef.current('');
        },
        'timeout-callback': () => {
          setError('Security check timed out. Please try again.');
          onTokenRef.current('');
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load security check';
      setError(msg);
      onTokenRef.current('');
    }
  }, [siteKey, action, theme, size]);

  useEffect(() => {
    void renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      <div ref={containerRef} className="cf-turnstile-container" />
      {error && (
        <p className="mt-2 text-xs text-destructive text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

/** True when Turnstile is enabled for this build (site key present). */
export function isTurnstileEnabled(): boolean {
  return readSiteKey().length > 0;
}

export default TurnstileWidget;
