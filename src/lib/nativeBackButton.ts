/**
 * Android gesture / hardware back for Capacitor wrappers (admin + technician).
 *
 * Without @capacitor/app, Android finishes the Activity → phone home screen,
 * even when the SPA has history (e.g. /admin → /admin?view=payments). The PWA
 * kept browser history; the native WebView needs this listener instead.
 *
 * Pages can register layered handlers (photo viewer → chat → exit) via
 * registerNativeBackHandler — last registered runs first.
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Return true if the back press was consumed. */
export type NativeBackHandler = () => boolean;

const backHandlers: NativeBackHandler[] = [];

export function registerNativeBackHandler(handler: NativeBackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const i = backHandlers.indexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

/** Run registered overlays/chat handlers (newest first). */
export function tryNativeBackHandlers(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    try {
      if (backHandlers[i]()) return true;
    } catch {
      /* ignore handler errors */
    }
  }
  return false;
}

function notifyReactRouter(): void {
  // pushState alone does not fire popstate; BrowserRouter needs the event.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Clear deep admin query (view/modal/tool/search) and stay on /admin. */
function collapseAdminDeepLink(): boolean {
  const { pathname, search } = window.location;
  if (!pathname.startsWith('/admin')) return false;
  const params = new URLSearchParams(search);
  if (
    !params.get('view') &&
    !params.get('modal') &&
    !params.get('tool') &&
    !params.get('search') &&
    !params.get('composeEmail') &&
    !params.get('composeWhatsApp')
  ) {
    return false;
  }
  window.history.pushState({}, '', '/admin');
  notifyReactRouter();
  return true;
}

/** Technician nested path → /technician */
function collapseTechnicianDeepLink(): boolean {
  const { pathname } = window.location;
  if (!pathname.startsWith('/technician')) return false;
  const rest = pathname.replace(/^\/technician\/?/, '');
  if (!rest) return false;
  window.history.pushState({}, '', '/technician');
  notifyReactRouter();
  return true;
}

/** Settings / calling under admin scope → /admin */
function collapseSettingsDeepLink(): boolean {
  const { pathname } = window.location;
  if (!pathname.startsWith('/settings') && !pathname.startsWith('/calling')) {
    return false;
  }
  window.history.pushState({}, '', '/admin');
  notifyReactRouter();
  return true;
}

/** WhatsApp inbox list (no overlay/chat) exits to dashboard home. */
function collapseWhatsAppInboxToHome(): boolean {
  const { pathname, search } = window.location;
  if (!pathname.startsWith('/settings')) return false;
  const panel = new URLSearchParams(search).get('panel');
  if (panel !== 'whatsapp-inbox') return false;
  window.history.pushState({}, '', '/admin');
  notifyReactRouter();
  return true;
}

let started = false;

export async function startNativeBackButtonHandler(): Promise<void> {
  if (started || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }
  started = true;

  await App.addListener('backButton', ({ canGoBack }) => {
    // Photo viewer / dialogs / open chat first — stay in WhatsApp.
    if (tryNativeBackHandlers()) return;
    // Inbox thread list → admin home (skip Settings even when history can go back).
    if (collapseWhatsAppInboxToHome()) return;
    if (canGoBack) {
      window.history.back();
      return;
    }
    // Cold-start / replace-only stacks: still walk "up" like the old PWA.
    if (collapseAdminDeepLink()) return;
    if (collapseSettingsDeepLink()) return;
    if (collapseTechnicianDeepLink()) return;
    // True root — leave the app without killing the process (same as home gesture).
    void App.minimizeApp();
  });
}
