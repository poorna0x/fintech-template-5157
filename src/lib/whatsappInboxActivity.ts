import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabaseClient';
import {
  clearNativeWhatsAppTrayNotification,
  setNativeViewingWhatsAppPhone,
} from '@/lib/devicePrefs';
import {
  dismissWhatsAppTraysFromReadMap,
  fetchWhatsAppInboxReadMap,
  loadWhatsAppReadMap,
  mergeWhatsAppReadMap,
} from '@/lib/whatsappInbox';

export type WhatsAppInboxActivity = {
  open: boolean;
  selectedPhone: string | null;
};

let activity: WhatsAppInboxActivity = { open: false, selectedPhone: null };
let lastSyncedViewingPhone: string | null | undefined = undefined;
let pauseListenerAttached = false;

function thisAdminFcmToken(): string | null {
  try {
    const raw = localStorage.getItem('hro_admin_push_persist_v2');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed?.token === 'string' && parsed.token ? parsed.token : null;
  } catch {
    return null;
  }
}

function viewingPhoneFromActivity(): string | null {
  if (!activity.open) return null;
  const digits = String(activity.selectedPhone || '').replace(/\D/g, '');
  return digits || null;
}

/** Native prefs + this device's FCM row. Other admin phones still get the push. */
async function syncViewingWhatsAppPresence(phone: string | null): Promise<void> {
  const next = phone ? String(phone).replace(/\D/g, '') : '';
  const normalized = next || null;
  if (lastSyncedViewingPhone === normalized) return;
  lastSyncedViewingPhone = normalized;
  void setNativeViewingWhatsAppPhone(normalized);
  const token = thisAdminFcmToken();
  if (!token || !Capacitor.isNativePlatform()) return;
  try {
    await supabase
      .from('admin_push_tokens')
      .update({
        viewing_whatsapp_phone: normalized,
        viewing_whatsapp_at: normalized ? new Date().toISOString() : null,
      })
      .eq('token', token);
  } catch {
    lastSyncedViewingPhone = undefined;
  }
}

export function setWhatsAppInboxActivity(patch: Partial<WhatsAppInboxActivity>): void {
  activity = { ...activity, ...patch };
  const viewing = viewingPhoneFromActivity();
  if (viewing) {
    void clearNativeWhatsAppTrayNotification(viewing);
  }
  void syncViewingWhatsAppPresence(viewing);
}

export function getWhatsAppInboxActivity(): WhatsAppInboxActivity {
  return activity;
}

/** Home button / app background: this APK should still get the next WhatsApp push. */
export function startWhatsAppViewingPresence(): () => void {
  if (!Capacitor.isNativePlatform() || pauseListenerAttached) return () => {};
  pauseListenerAttached = true;
  let handle: { remove: () => Promise<void> } | null = null;
  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          lastSyncedViewingPhone = undefined;
          void syncViewingWhatsAppPresence(null);
          return;
        }
        void syncViewingWhatsAppPresence(viewingPhoneFromActivity());
        // Local first (no network), then slim catch-up for reads missed while backgrounded.
        dismissWhatsAppTraysFromReadMap(loadWhatsAppReadMap());
        void fetchWhatsAppInboxReadMap(supabase, { sinceHours: 6, force: true }).then((remote) => {
          if (!Object.keys(remote).length) return;
          const map = mergeWhatsAppReadMap(remote);
          dismissWhatsAppTraysFromReadMap(map);
        });
      });
    } catch {
      pauseListenerAttached = false;
    }
  })();
  return () => {
    pauseListenerAttached = false;
    void handle?.remove();
  };
}

export const WA_INBOX_UNREAD_EVENT = 'wa-inbox-unread';

export function readWhatsAppUnreadCount(): number {
  try {
    const n = Number(localStorage.getItem('wa_inbox_unread_count') || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Persist unread count and notify header badge listeners. */
export function dispatchWhatsAppUnreadChanged(count?: number): void {
  const resolved = count !== undefined ? count : readWhatsAppUnreadCount();
  try {
    localStorage.setItem('wa_inbox_unread_count', String(resolved));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(
    new CustomEvent(WA_INBOX_UNREAD_EVENT, { detail: { count: resolved } })
  );
}

export function useWhatsAppUnreadCount(): number {
  const [count, setCount] = useState(() => readWhatsAppUnreadCount());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (detail?.count !== undefined) {
        setCount(detail.count);
        return;
      }
      setCount(readWhatsAppUnreadCount());
    };
    window.addEventListener(WA_INBOX_UNREAD_EVENT, onChange);
    return () => window.removeEventListener(WA_INBOX_UNREAD_EVENT, onChange);
  }, []);

  return count;
}
