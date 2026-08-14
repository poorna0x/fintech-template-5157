/**
 * Cookie / analytics consent (DPDP-oriented).
 * Stores choice in localStorage; GA only loads after accept.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hro_cookie_consent_v1';
const NOTICE_VERSION = '2026-08-14';

export type CookieConsentChoice = 'accepted' | 'rejected';

export type CookieConsentState = {
  choice: CookieConsentChoice;
  noticeVersion: string;
  at: string;
};

export function readCookieConsent(): CookieConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentState;
    if (parsed?.choice !== 'accepted' && parsed?.choice !== 'rejected') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCookieConsent(choice: CookieConsentChoice): CookieConsentState {
  const state: CookieConsentState = {
    choice,
    noticeVersion: NOTICE_VERSION,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('hro-cookie-consent', { detail: state }));
  } catch {
    /* ignore */
  }
  return state;
}

export function hasAcceptedAnalyticsCookies(): boolean {
  return readCookieConsent()?.choice === 'accepted';
}

/** React hook — subscribe to consent changes for GA gate. */
export function useAnalyticsConsentAllowed(): boolean {
  const [ok, setOk] = useState(() =>
    typeof window !== 'undefined' ? hasAcceptedAnalyticsCookies() : false
  );
  useEffect(() => {
    const sync = (state?: CookieConsentState | null) => {
      setOk((state ?? readCookieConsent())?.choice === 'accepted');
    };
    sync();
    const onCustom = (e: Event) => {
      sync((e as CustomEvent<CookieConsentState>).detail);
    };
    window.addEventListener('hro-cookie-consent', onCustom as EventListener);
    return () => window.removeEventListener('hro-cookie-consent', onCustom as EventListener);
  }, []);
  return ok;
}

export { NOTICE_VERSION as COOKIE_NOTICE_VERSION };
