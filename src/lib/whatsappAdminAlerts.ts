import { supabase } from '@/lib/supabaseClient';
import { settingsPanelPath } from '@/lib/settingsUrl';
import {
  showWhatsAppDesktopPermissionToast,
  showWhatsAppInboundToast,
} from '@/lib/showWhatsAppAdminToast';
import {
  applyWhatsAppTeamRead,
  bumpWhatsAppUnreadCountForPhone,
  clearWhatsAppUnreadCountForPhone,
  dismissWhatsAppTrayForPhone,
  displayPhone,
  fetchWhatsAppInboxUnreadSummary,
  applyWhatsAppUnreadSummary,
  isBotFlowAdminAlertSkip,
  isWhatsAppThreadUnread,
  loadWhatsAppReadMap,
  patchThreadFromMessage,
  peekWhatsAppInboxThreadsCache,
  previewMessageBody,
  resolveWhatsAppHeaderUnreadCount,
  writeWhatsAppInboxThreadsCache,
  type WhatsAppMessageRow,
} from '@/lib/whatsappInbox';
import {
  dispatchWhatsAppUnreadChanged,
  isViewingWhatsAppPhone,
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
  const readMap = loadWhatsAppReadMap();

  const threads = patchThreadFromMessage(prevThreads, row);
  writeWhatsAppInboxThreadsCache(threads, { rangeKey: 'today' });

  const thread = threads.find((t) => t.phone_e164 === phone);
  const isUnreadNow = thread ? isWhatsAppThreadUnread(thread, readMap) : true;

  if (isUnreadNow) {
    bumpWhatsAppUnreadCountForPhone(phone, 1);
  }
  dispatchWhatsAppUnreadChanged(resolveWhatsAppHeaderUnreadCount(threads, readMap));

  return { customerName: thread?.customer_name || null, phone };
}

function shouldSuppressAlert(phone: string): boolean {
  return isViewingWhatsAppPhone(phone);
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
      tag: `wa-${phone}-${row.id || Date.now()}`,
      renotify: true,
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
  if (!row?.id || !row.phone_e164) return;
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

  if (isBotFlowAdminAlertSkip(row as WhatsAppMessageRow)) {
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
  let hydrateTimer: number | null = null;
  const hydrateFromServer = () => {
    void fetchWhatsAppInboxUnreadSummary().then((summary) => {
      if (!summary) return;
      dispatchWhatsAppUnreadChanged(applyWhatsAppUnreadSummary(summary), summary.chats);
    });
  };
  const scheduleHydrate = (ms: number) => {
    if (hydrateTimer != null) window.clearTimeout(hydrateTimer);
    hydrateTimer = window.setTimeout(() => {
      hydrateTimer = null;
      hydrateFromServer();
    }, ms);
  };

  const channel = supabase
    .channel('whatsapp-admin-alerts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
      (payload) => {
        handleInboundInsert((payload.new || null) as Partial<WhatsAppMessageRow> | null);
        scheduleHydrate(1200);
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
        const map = applyWhatsAppTeamRead(phone, readAt);
        clearWhatsAppUnreadCountForPhone(phone);
        // Keep Tools / header badge aligned with inbox (message counts, not stale +1/-1).
        dispatchWhatsAppUnreadChanged(resolveWhatsAppHeaderUnreadCount(null, map));
      }
    )
    .subscribe();

  hydrateFromServer();

  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    scheduleHydrate(400);
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopPresence();
    document.removeEventListener('visibilitychange', onVisibility);
    if (hydrateTimer != null) window.clearTimeout(hydrateTimer);
    void supabase.removeChannel(channel);
    navigateToInbox = null;
  };
}
