import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabaseClient';
import {
  setNativeViewingWhatsAppPhone,
} from '@/lib/devicePrefs';
import {
  dismissWhatsAppTrayForPhone,
  dismissWhatsAppTraysFromReadMap,
  fetchWhatsAppInboxReadMap,
  mergeWhatsAppReadMap,
  resolveWhatsAppUnreadChatCount,
} from '@/lib/whatsappInbox';

export type WhatsAppInboxActivity = {
  open: boolean;
  selectedPhone: string | null;
};

let activity: WhatsAppInboxActivity = { open: false, selectedPhone: null };
let lastSyncedViewingPhone: string | null | undefined = undefined;
let pauseListenerAttached = false;

function phonesMatchWhatsApp(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = String(a || '').replace(/\D/g, '');
  const db = String(b || '').replace(/\D/g, '');
  if (!da || !db) return false;
  if (da === db) return true;
  return da.length >= 10 && db.length >= 10 && da.slice(-10) === db.slice(-10);
}

function viewingPhoneFromActivity(): string | null {
  if (!activity.open) return null;
  const digits = String(activity.selectedPhone || '').replace(/\D/g, '');
  return digits || null;
}

/** Native prefs + this device's FCM row only (desktop must not mute Admin phones). */
async function syncViewingWhatsAppPresence(phone: string | null): Promise<void> {
  const next = phone ? String(phone).replace(/\D/g, '') : '';
  const normalized = next || null;
  if (lastSyncedViewingPhone === normalized) return;
  lastSyncedViewingPhone = normalized;
  void setNativeViewingWhatsAppPhone(normalized);
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    let token: string | null = null;
    try {
      const raw = localStorage.getItem('hro_admin_push_persist_v2');
      const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
      token = parsed?.token || null;
    } catch {
      token = null;
    }
    if (!token) return;
    const { error } = await supabase
      .from('admin_push_tokens')
      .update({
        viewing_whatsapp_phone: normalized,
        viewing_whatsapp_at: normalized ? new Date().toISOString() : null,
      })
      .eq('user_id', userId)
      .eq('token', token);
    if (error) lastSyncedViewingPhone = undefined;
  } catch {
    lastSyncedViewingPhone = undefined;
  }
}

export function setWhatsAppInboxActivity(patch: Partial<WhatsAppInboxActivity>): void {
  activity = { ...activity, ...patch };
  const viewing = viewingPhoneFromActivity();
  if (viewing) {
    dismissWhatsAppTrayForPhone(viewing);
  }
  void syncViewingWhatsAppPresence(viewing);
}

export function getWhatsAppInboxActivity(): WhatsAppInboxActivity {
  return activity;
}

export function isViewingWhatsAppPhone(phone: string | null | undefined): boolean {
  return Boolean(activity.open && phonesMatchWhatsApp(activity.selectedPhone, phone));
}

/** Home / other tab: this admin should still get the next WhatsApp push. */
export function startWhatsAppViewingPresence(): () => void {
  if (pauseListenerAttached) return () => {};
  pauseListenerAttached = true;
  let handle: { remove: () => Promise<void> } | null = null;
  const onVisibility = () => {
    if (document.hidden) {
      lastSyncedViewingPhone = undefined;
      void syncViewingWhatsAppPresence(null);
      return;
    }
    void syncViewingWhatsAppPresence(viewingPhoneFromActivity());
  };
  document.addEventListener('visibilitychange', onVisibility);
  const heartbeat = window.setInterval(() => {
    if (document.hidden) return;
    const phone = viewingPhoneFromActivity();
    if (!phone) return;
    lastSyncedViewingPhone = undefined;
    void syncViewingWhatsAppPresence(phone);
  }, 45_000);
  if (Capacitor.isNativePlatform()) {
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
          void fetchWhatsAppInboxReadMap(supabase, { sinceHours: 24, force: true }).then((remote) => {
            if (!Object.keys(remote).length) return;
            const map = mergeWhatsAppReadMap(remote);
            dismissWhatsAppTraysFromReadMap(map);
          });
        });
      } catch {
        /* old APK */
      }
    })();
  }
  return () => {
    pauseListenerAttached = false;
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(heartbeat);
    void handle?.remove();
  };
}

export const WA_INBOX_UNREAD_EVENT = 'wa-inbox-unread';
export const WA_INBOX_CHAT_COUNT_KEY = 'wa_inbox_chat_count';
const UNREAD_COUNT_KEY = 'wa_inbox_unread_count';

export function readWhatsAppUnreadCount(): number {
  try {
    const n = Number(localStorage.getItem(UNREAD_COUNT_KEY) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function readWhatsAppChatCount(): number {
  try {
    const n = Number(localStorage.getItem(WA_INBOX_CHAT_COUNT_KEY) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Persist unread + chat totals and notify header badge listeners. */
export function dispatchWhatsAppUnreadChanged(count?: number, chats?: number): void {
  const unread = count !== undefined ? count : readWhatsAppUnreadCount();
  const chatN = chats !== undefined ? chats : resolveWhatsAppUnreadChatCount();
  try {
    localStorage.setItem(UNREAD_COUNT_KEY, String(unread));
    localStorage.setItem(WA_INBOX_CHAT_COUNT_KEY, String(chatN));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(
    new CustomEvent(WA_INBOX_UNREAD_EVENT, { detail: { count: unread, chats: chatN } })
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
    const onStorage = (e: StorageEvent) => {
      if (e.key === UNREAD_COUNT_KEY) setCount(readWhatsAppUnreadCount());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WA_INBOX_UNREAD_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return count;
}

/** Distinct unread WhatsApp chats — Tools badge. Synced from DB. */
export function useWhatsAppChatCount(): number {
  const [count, setCount] = useState(() => readWhatsAppChatCount());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ chats?: number }>).detail;
      if (detail?.chats !== undefined) {
        setCount(detail.chats);
        return;
      }
      setCount(readWhatsAppChatCount());
    };
    window.addEventListener(WA_INBOX_UNREAD_EVENT, onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === WA_INBOX_CHAT_COUNT_KEY) setCount(readWhatsAppChatCount());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WA_INBOX_UNREAD_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return count;
}
