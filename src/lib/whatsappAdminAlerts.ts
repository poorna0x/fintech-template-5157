import { supabase } from '@/lib/supabaseClient';
import { settingsPanelPath } from '@/lib/settingsUrl';
import {
  showWhatsAppDesktopPermissionToast,
  showWhatsAppInboundToast,
} from '@/lib/showWhatsAppAdminToast';
import {
  clearWhatsAppUnreadCountForPhone,
  countUnreadWhatsAppThreads,
  dismissWhatsAppTrayForPhone,
  displayPhone,
  isWhatsAppThreadUnread,
  loadWhatsAppReadMap,
  mergeWhatsAppReadMap,
  patchThreadFromMessage,
  peekWhatsAppInboxThreadsCache,
  previewMessageBody,
  writeWhatsAppInboxThreadsCache,
  type WhatsAppMessageRow,
} from '@/lib/whatsappInbox';
import {
  dispatchWhatsAppUnreadChanged,
  getWhatsAppInboxActivity,
  readWhatsAppUnreadCount,
  startWhatsAppViewingPresence,
} from '@/lib/whatsappInboxActivity';
import { playWhatsAppAlertSound } from '@/lib/whatsappAlertSound';
import {
  requestNotificationPermission,
  showBrowserNotification,
  type NotificationData,
} from '@/lib/notifications';

const DESKTOP_NOTIFY_ENABLED_KEY = 'wa_desktop_notify_enabled';
const DESKTOP_NOTIFY_PROMPTED_KEY = 'wa_desktop_notify_prompted';

type WhatsAppThreadNameHint = { customerName: string | null; phone: string };

const seenMessageIds = new Set<string>();
const SEEN_MAX = 300;

let navigateToInbox: ((path: string) => void) | null = null;

function normalizePhone(phone: string | null | undefined): string {
  return String(phone || '').replace(/\D/g, '');
}

function rememberMessageId(id: string): boolean {
  if (!id || seenMessageIds.has(id)) return false;
  seenMessageIds.add(id);
  if (seenMessageIds.size > SEEN_MAX) {
    const drop = [...seenMessageIds].slice(0, seenMessageIds.size - SEEN_MAX);
    for (const key of drop) seenMessageIds.delete(key);
  }
  return true;
}

function isDesktopNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(DESKTOP_NOTIFY_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

function inboxPathForPhone(phoneE164: string): string {
  return settingsPanelPath('whatsapp-inbox', { id: phoneE164 });
}

function bumpUnreadFromInbound(row: WhatsAppMessageRow): WhatsAppThreadNameHint {
  const cached = peekWhatsAppInboxThreadsCache({ rangeKey: 'today' });
  const prevThreads = cached?.threads ?? [];
  const phone = normalizePhone(row.phone_e164);
  const prevThread = prevThreads.find((t) => t.phone_e164 === phone);
  const readMap = loadWhatsAppReadMap();
  const wasUnreadBefore = prevThread ? isWhatsAppThreadUnread(prevThread, readMap) : false;

  const threads = patchThreadFromMessage(prevThreads, row);
  writeWhatsAppInboxThreadsCache(threads, { rangeKey: 'today' });

  const thread = threads.find((t) => t.phone_e164 === phone);
  const isUnreadNow = thread ? isWhatsAppThreadUnread(thread, readMap) : false;

  if (isUnreadNow && !wasUnreadBefore) {
    dispatchWhatsAppUnreadChanged(readWhatsAppUnreadCount() + 1);
  } else if (prevThreads.length > 0) {
    dispatchWhatsAppUnreadChanged(countUnreadWhatsAppThreads(threads, readMap));
  } else if (isUnreadNow) {
    dispatchWhatsAppUnreadChanged(1);
  }

  return { customerName: thread?.customer_name || null, phone };
}

function shouldSuppressAlert(phone: string): boolean {
  const activity = getWhatsAppInboxActivity();
  return activity.open && normalizePhone(activity.selectedPhone) === phone;
}

function maybePromptDesktopPermission(): void {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  try {
    if (localStorage.getItem(DESKTOP_NOTIFY_PROMPTED_KEY) === '1') return;
    localStorage.setItem(DESKTOP_NOTIFY_PROMPTED_KEY, '1');
  } catch {
    /* ignore */
  }
  showWhatsAppDesktopPermissionToast({
    durationMs: 14_000,
    onEnable: () => {
      void requestNotificationPermission().then((perm) => {
        if (perm === 'granted') {
          try {
            localStorage.setItem(DESKTOP_NOTIFY_ENABLED_KEY, 'true');
          } catch {
            /* ignore */
          }
        }
      });
    },
  });
}

function notifyInbound(row: WhatsAppMessageRow, hint: WhatsAppThreadNameHint): void {
  const phone = hint.phone;
  if (!phone) return;

  const title = hint.customerName?.trim() || displayPhone(phone);
  const body = previewMessageBody(row);
  const path = inboxPathForPhone(phone);

  const openChat = () => {
    if (navigateToInbox) navigateToInbox(path);
    else window.location.assign(path);
  };

  playWhatsAppAlertSound();

  if (document.hidden) {
    if (!isDesktopNotifyEnabled()) return;
    if (Notification.permission !== 'granted') {
      maybePromptDesktopPermission();
      return;
    }
    const data: NotificationData = {
      type: 'whatsapp_inbound',
      title: `WhatsApp · ${title}`,
      message: body,
      whatsappPhoneE164: phone,
      timestamp: new Date(),
    };
    showBrowserNotification(data, {
      body,
      tag: `wa-${phone}`,
      icon: '/whatsapp.png',
      badge: '/whatsapp.png',
      onClick: openChat,
    });
    return;
  }

  showWhatsAppInboundToast({
    contactName: title,
    preview: body,
    onOpen: openChat,
  });
}

function handleInboundInsert(row: Partial<WhatsAppMessageRow> | null): void {
  if (!row?.id || !row.phone_e164 || !row.created_at) return;
  if (row.direction !== 'inbound') return;
  if (!rememberMessageId(row.id)) return;

  const phone = normalizePhone(row.phone_e164);
  if (shouldSuppressAlert(phone)) {
    dismissWhatsAppTrayForPhone(phone);
    const cached = peekWhatsAppInboxThreadsCache({ rangeKey: 'today' });
    const threads = patchThreadFromMessage(cached?.threads ?? [], row as WhatsAppMessageRow);
    writeWhatsAppInboxThreadsCache(threads, { rangeKey: 'today' });
    return;
  }

  const hint = bumpUnreadFromInbound(row as WhatsAppMessageRow);
  notifyInbound(row as WhatsAppMessageRow, hint);
}

/** Register React Router navigate for toast / notification clicks. */
export function setWhatsAppAlertNavigator(navigate: (path: string) => void): void {
  navigateToInbox = navigate;
}

/** Start global admin WhatsApp inbound alerts (one Realtime channel per session). */
export function startWhatsAppAdminAlerts(): () => void {
  const stopPresence = startWhatsAppViewingPresence();
  const channel = supabase
    .channel('whatsapp-admin-alerts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
      (payload) => {
        handleInboundInsert((payload.new || null) as Partial<WhatsAppMessageRow> | null);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_inbox_read' },
      (payload) => {
        const row = (payload.new || null) as { phone_e164?: string; read_at?: string } | null;
        const phone = normalizePhone(row?.phone_e164);
        const readAt = String(row?.read_at || '');
        if (!phone || !readAt) return;
        const map = mergeWhatsAppReadMap({ [phone]: readAt });
        clearWhatsAppUnreadCountForPhone(phone);
        const cached = peekWhatsAppInboxThreadsCache({ rangeKey: 'today' });
        if (cached?.threads?.length) {
          dispatchWhatsAppUnreadChanged(countUnreadWhatsAppThreads(cached.threads, map));
        } else {
          const cur = readWhatsAppUnreadCount();
          if (cur > 0) dispatchWhatsAppUnreadChanged(Math.max(0, cur - 1));
        }
      }
    )
    .subscribe();

  return () => {
    stopPresence();
    void supabase.removeChannel(channel);
    navigateToInbox = null;
  };
}
