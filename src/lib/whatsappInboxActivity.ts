import { useEffect, useState } from 'react';

export type WhatsAppInboxActivity = {
  open: boolean;
  selectedPhone: string | null;
};

let activity: WhatsAppInboxActivity = { open: false, selectedPhone: null };

export function setWhatsAppInboxActivity(patch: Partial<WhatsAppInboxActivity>): void {
  activity = { ...activity, ...patch };
}

export function getWhatsAppInboxActivity(): WhatsAppInboxActivity {
  return activity;
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
