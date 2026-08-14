import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Settings,
  Trash2,
  UserRound,
  X,
  Zap,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buildAdminDashboardSearch } from '@/lib/adminDashboardUrl';
import { db, supabase } from '@/lib/supabase';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import WaterFilterServiceStartDialog from '@/components/whatsapp/WaterFilterServiceStartDialog';
import { WhatsAppMessageBubbleMenu } from '@/components/whatsapp/WhatsAppMessageBubbleMenu';
import { WhatsAppInboxLocationCard } from '@/components/whatsapp/WhatsAppInboxLocationCard';
import { isWhatsAppLocationMessage } from '@/lib/whatsappInboxApplyToCustomer';
import type { Customer, Technician } from '@/types';
import {
  startWhatsAppBookingQuickAction,
  type WhatsAppBookingQuickAction,
} from '@/lib/whatsappBookingStart';
import {
  WHATSAPP_THREAD_COLUMNS,
  WHATSAPP_THREAD_LIMIT,
  WHATSAPP_THREAD_PAGE_SIZE,
  countUnreadWhatsAppMessages,
  countInboundUnreadInMessages,
  displayPhone,
  fetchWhatsAppInboxThreads,
  fetchWhatsAppInboxUnreadSummary,
  applyWhatsAppUnreadSummary,
  fetchWhatsAppUnreadMessageCounts,
  inboxListRangeKey,
  inboxListRangeLabel,
  loadWhatsAppInboxListRange,
  loadWhatsAppUnreadCounts,
  saveWhatsAppInboxListRange,
  saveWhatsAppUnreadCounts,
  searchWhatsAppInboxThreads,
  formatBubbleTime,
  formatThreadTime,
  hoursLeftInWindow,
  invalidateInboundWindowCache,
  isFailedDeliveryStatus,
  isR2MediaRef,
  isWhatsAppInboxListCacheFresh,
  isWhatsAppThreadCacheFresh,
  isWhatsAppThreadUnread,
  isWithinCustomerServiceWindow,
  isWhatsAppMessageDeletedLocally,
  invalidateWhatsAppInboxThreadsCache,
  invalidateWhatsAppThreadMessagesCache,
  loadWhatsAppReadMap,
  mergeWhatsAppReadMap,
  applyWhatsAppTeamRead,
  persistWhatsAppThreadRead,
  fetchWhatsAppInboxReadMap,
  resolveWhatsAppHeaderUnreadCount,
  patchThreadFromMessage,
  peekWhatsAppInboxThreadsCache,
  peekWhatsAppThreadMessagesCache,
  removeWhatsAppThreadMessageCache,
  WA_INBOX_MESSAGE_DELETED_EVENT,
  previewMessageBody,
  formatAdminWhatsAppBody,
  isBookingBotStateMessage,
  latestInboundAtFromMessages,
  threadLastInboundAt,
  threadNeedsHumanReply,
  toWhatsAppPhoneDigits,
  unreadMessageCountForThread,
  upsertWhatsAppThreadMessageCache,
  writeWhatsAppInboxThreadsCache,
  writeWhatsAppThreadMessagesCache,
  clearWhatsAppUnreadCountForPhone,
  WA_INBOX_READ_SYNC_EVENT,
  type WhatsAppMessageRow,
  type WhatsAppInboxListRange,
  type WhatsAppThread,
} from '@/lib/whatsappInbox';
import {
  dispatchWhatsAppUnreadChanged,
  setWhatsAppInboxActivity,
} from '@/lib/whatsappInboxActivity';
import { WhatsAppPdfThumbnail } from '@/components/whatsapp/WhatsAppPdfThumbnail';
import {
  WhatsAppInboxPhotoViewer,
  type InboxPhotoSlide,
} from '@/components/whatsapp/WhatsAppInboxPhotoViewer';
import { WhatsAppAvatar, WhatsAppTicks } from '@/components/whatsapp/WhatsAppTicks';
import { WhatsAppLogo, WhatsAppUnreadBadge } from '@/components/whatsapp/WhatsAppLogo';
import {
  fetchApprovedWhatsAppTemplates,
  getWhatsAppMediaBytesCached,
  purgeWhatsAppMessages,
  readFileAsBase64,
  resolveWhatsAppMediaDisplayUrl,
  sendAdminWhatsAppMedia,
  sendAdminWhatsAppTemplate,
  sendAdminWhatsAppText,
  validateWhatsAppAttachFile,
  WHATSAPP_ATTACH_ACCEPT,
  type WhatsAppTemplateListItem,
} from '@/lib/sendAdminWhatsAppApi';
import {
  buildQuickHelloTemplate,
  quickReplyBookingUrl,
  waterFilterServiceFromLabel,
} from '@/lib/whatsappQuickMessages';
import {
  clearWhatsAppLocalDeviceData,
  buildWhatsAppLocalBackup,
  readWhatsAppLocalBackupFile,
  restoreWhatsAppLocalBackup,
  saveWhatsAppLocalBackupFile,
} from '@/lib/whatsappLocalBackup';
import { registerNativeBackHandler, tryNativeBackHandlers } from '@/lib/nativeBackButton';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Mobile / APK: Enter inserts a newline. Desktop: Enter sends (Shift+Enter = newline). */
function isMobileWhatsAppComposer(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }
  return (
    window.matchMedia('(max-width: 767px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

/** Soft charcoal chat wallpaper — warm, low contrast. */
const CHAT_THREAD_BG_DARK: CSSProperties = {
  backgroundColor: '#0b141a',
  backgroundImage: [
    'radial-gradient(ellipse at 18% 0%, rgba(17, 27, 33, 0.9) 0%, transparent 55%)',
    'radial-gradient(ellipse at 82% 100%, rgba(11, 20, 26, 0.85) 0%, transparent 50%)',
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
        <g fill='%23e9edef' fill-opacity='0.03'>
          <path d='M20 40c8-14 28-14 36 0 8 14-4 32-18 32s-26-18-18-32z'/>
          <path d='M78 78c6-10 20-10 26 0 6 10-3 24-13 24s-19-14-13-24z'/>
          <circle cx='96' cy='28' r='3'/>
          <circle cx='40' cy='96' r='2'/>
        </g>
      </svg>`
    )}")`,
  ].join(', '),
  backgroundSize: 'auto, auto, 120px 120px',
};


function formatDaySeparator(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || 'download';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
}

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
  /** Optional: open a phone thread immediately (digits). */
  initialPhone?: string | null;
};

const QUICK_ACTION_LABELS: Record<WhatsAppBookingQuickAction, string> = {
  book_service: 'Book service',
  request_location: 'Ask location',
  request_photo: 'Ask photo',
  request_building_flat: 'Ask flat / building',
  request_name: 'Ask name',
  water_filter_service: 'Water Filter Service',
  book_location_photo: 'Book · location + photo',
};

const BOOK_FLOW_ACTIONS = new Set<WhatsAppBookingQuickAction>([
  'book_service',
  'book_location_photo',
  'water_filter_service',
]);

type InboxQuickMessageAction = 'send_hello' | 'call_shortly' | 'thanks_reply';

const QUICK_MESSAGE_LABELS: Record<InboxQuickMessageAction, string> = {
  send_hello: 'Send hello',
  call_shortly: 'We’ll call you shortly',
  thanks_reply: 'Thanks — noted',
};

function quickActionConfirmCopy(
  action: WhatsAppBookingQuickAction,
  windowIsOpen: boolean
): { title: string; description: string; confirm: string } {
  const title = QUICK_ACTION_LABELS[action];
  if (action === 'book_service') {
    return {
      title,
      description: windowIsOpen
        ? 'Starts the booking flow on WhatsApp (date / time / details). Customer replies in this chat.'
        : '24h window closed — sends a cold book template; booking continues when they reply.',
      confirm: windowIsOpen ? 'Start booking' : 'Send book template',
    };
  }
  if (BOOK_FLOW_ACTIONS.has(action)) {
    return {
      title,
      description: windowIsOpen
        ? 'Starts a guided WhatsApp flow for this customer.'
        : '24h window closed — sends a cold template and continues when they reply.',
      confirm: windowIsOpen ? 'Start on WhatsApp' : 'Send template & wait',
    };
  }
  return {
    title,
    description: windowIsOpen
      ? 'Asks the customer for this info only — does not start booking. Use Book service to book.'
      : '24h window closed — sends an ask template only (no booking). Continues when they reply.',
    confirm: windowIsOpen ? 'Send ask' : 'Send template',
  };
}

function InboxChatPhoto({
  row,
  cachedSrc,
  onOpen,
  onResolve,
}: {
  row: WhatsAppMessageRow;
  cachedSrc: string | null;
  onOpen: () => void;
  onResolve: (row: WhatsAppMessageRow, opts?: { bustCache?: boolean }) => Promise<string | null>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    retriedRef.current = false;
    setFailed(false);
    // Only trust blob/data URLs in the session cache — signed https URLs expire
    // and show as broken images with the Meta filename as alt text on mobile.
    const stable =
      cachedSrc &&
      (cachedSrc.startsWith('blob:') || cachedSrc.startsWith('data:'))
        ? cachedSrc
        : null;
    if (stable) {
      setSrc(stable);
      return;
    }
    setSrc(null);
    let cancelled = false;
    void onResolve(row).then((url) => {
      if (cancelled) return;
      if (url) {
        setSrc(url);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cachedSrc, onResolve, row.id, row.media_url]);

  const handleImgError = () => {
    if (retriedRef.current) {
      setSrc(null);
      setFailed(true);
      return;
    }
    retriedRef.current = true;
    setRetrying(true);
    setSrc(null);
    void onResolve(row, { bustCache: true }).then((url) => {
      setRetrying(false);
      if (url) {
        setSrc(url);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
  };

  return (
    <button
      type="button"
      className="block w-full cursor-pointer touch-manipulation text-left"
      onClick={onOpen}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-72 w-full min-w-[180px] rounded-md object-contain bg-black/10"
          loading="eager"
          decoding="async"
          onError={handleImgError}
        />
      ) : failed ? (
        <span className="flex h-32 w-48 flex-col items-center justify-center gap-1 rounded-md bg-black/20 px-2 text-center text-xs text-[#667781]">
          Could not load photo
          <span className="text-[10px] opacity-80">Tap to retry open</span>
        </span>
      ) : (
        <span className="flex h-32 w-48 items-center justify-center rounded-md bg-black/20 text-xs text-[#667781]">
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          {retrying ? 'Retrying…' : 'Loading photo…'}
        </span>
      )}
    </button>
  );
}

function isImageMessage(row: WhatsAppMessageRow): boolean {
  return Boolean(
    row.media_url &&
      (row.msg_type === 'image' || String(row.media_mime || '').startsWith('image/'))
  );
}

function directInboxMediaUrl(ref: string | null | undefined): string | null {
  const raw = String(ref || '').trim();
  if (!raw || isR2MediaRef(raw) || raw.startsWith('whatsapp-media:')) return null;
  return /^https:\/\//i.test(raw) ? raw : null;
}

export default function WhatsAppInboxPage({ hideHeader, onBack, initialPhone }: Props) {
  const { cloudApiOn } = useWhatsAppCloudApiGate('inbox');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<WhatsAppThread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(
    initialPhone ? String(initialPhone).replace(/\D/g, '') : null
  );
  const [threadMessages, setThreadMessages] = useState<WhatsAppMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadLoadingOlder, setThreadLoadingOlder] = useState(false);
  const [threadHasMoreOlder, setThreadHasMoreOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [threadBrand, setThreadBrand] = useState<DocumentBrand>('hydrogenro');
  const [sending, setSending] = useState(false);
  const [purging, setPurging] = useState(false);
  const [query, setQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [searchThreads, setSearchThreads] = useState<WhatsAppThread[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [reportTechnicians, setReportTechnicians] = useState<Technician[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesHint, setTemplatesHint] = useState<string | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [readMap, setReadMap] = useState<Record<string, string>>(() => loadWhatsAppReadMap());
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(() =>
    loadWhatsAppUnreadCounts()
  );
  const [listRange, setListRange] = useState<WhatsAppInboxListRange>(() =>
    loadWhatsAppInboxListRange()
  );
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customRangeDate, setCustomRangeDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const listRangeRef = useRef(listRange);
  listRangeRef.current = listRange;

  useEffect(() => {
    setWhatsAppInboxActivity({ open: true, selectedPhone });
    return () => setWhatsAppInboxActivity({ open: false, selectedPhone: null });
  }, [selectedPhone]);

  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreviewUrl, setAttachPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mediaUrlCache, setMediaUrlCache] = useState<Record<string, string>>({});
  const [inboxPhotoViewer, setInboxPhotoViewer] = useState<{
    slides: InboxPhotoSlide[];
    startIndex: number;
    rows: WhatsAppMessageRow[];
  } | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [waterFilterOpen, setWaterFilterOpen] = useState(false);
  const [quickActionConfirm, setQuickActionConfirm] = useState<
    WhatsAppBookingQuickAction | InboxQuickMessageAction | null
  >(null);
  const [quickActionBusy, setQuickActionBusy] = useState(false);

  /** Android back / header Back: close overlay → leave chat → exit inbox. */
  useEffect(() => {
    return registerNativeBackHandler(() => {
      if (inboxPhotoViewer) {
        setInboxPhotoViewer(null);
        return true;
      }
      if (reportOpen) {
        setReportOpen(false);
        setReportCustomer(null);
        return true;
      }
      if (quickActionConfirm) {
        setQuickActionConfirm(null);
        return true;
      }
      if (newChatOpen) {
        setNewChatOpen(false);
        return true;
      }
      if (waterFilterOpen) {
        setWaterFilterOpen(false);
        return true;
      }
      if (customRangeOpen) {
        setCustomRangeOpen(false);
        return true;
      }
      if (selectedPhone) {
        setSelectedPhone(null);
        // Drop keyboard focus so Esc does not leave a white focus ring on a chat row.
        queueMicrotask(() => {
          const el = document.activeElement;
          if (el instanceof HTMLElement) el.blur();
        });
        return true;
      }
      return false;
    });
  }, [
    inboxPhotoViewer,
    reportOpen,
    quickActionConfirm,
    newChatOpen,
    waterFilterOpen,
    customRangeOpen,
    selectedPhone,
  ]);

  /** Esc → same as Android back: close overlay, else leave chat to Chats list (not exit inbox). */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (tryNativeBackHandlers()) {
        e.preventDefault();
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleChromeBack = useCallback(() => {
    if (tryNativeBackHandlers()) return;
    onBack?.();
  }, [onBack]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const loadOlderSentinelRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedPhoneRef = useRef(selectedPhone);
  selectedPhoneRef.current = selectedPhone;
  const threadMessagesRef = useRef(threadMessages);
  threadMessagesRef.current = threadMessages;
  const lastMarkedReadRef = useRef<Record<string, string>>({});
  const threadLoadingOlderRef = useRef(threadLoadingOlder);
  threadLoadingOlderRef.current = threadLoadingOlder;
  const threadHasMoreOlderRef = useRef(threadHasMoreOlder);
  threadHasMoreOlderRef.current = threadHasMoreOlder;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const attachFileRef = useRef(attachFile);
  attachFileRef.current = attachFile;
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  const windowOpenRef = useRef(false);

  useEffect(() => {
    if (!attachFile || !attachFile.type.startsWith('image/')) {
      setAttachPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachFile);
    setAttachPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachFile]);

  useEffect(() => {
    setAttachFile(null);
    setDraft('');
  }, [selectedPhone]);

  const pickAttachFile = (file: File | null | undefined) => {
    if (!file) return;
    const err = validateWhatsAppAttachFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    attachFileRef.current = file;
    setAttachFile(file);
    // After drag/drop or picker, focus composer for caption / typing
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  };

  const clearAttach = () => {
    attachFileRef.current = null;
    setAttachFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!initialPhone) return;
    const digits = String(initialPhone).replace(/\D/g, '');
    if (digits) setSelectedPhone(digits);
  }, [initialPhone]);

  const loadInbox = useCallback(async (opts?: { soft?: boolean; force?: boolean }) => {
    const rangeKey = inboxListRangeKey(listRangeRef.current);
    const cached = peekWhatsAppInboxThreadsCache({ rangeKey });
    // Soft refresh must NOT paint stale cache over live/optimistic patches.
    if (cached?.threads?.length && !opts?.force && !opts?.soft) {
      setThreads(cached.threads);
      setLoading(false);
      void fetchWhatsAppInboxReadMap(supabase).then((remoteRead) => {
        if (!Object.keys(remoteRead).length) return;
        setReadMap(mergeWhatsAppReadMap(remoteRead));
      });
      return;
    }
    if (!opts?.soft && !(cached?.threads?.length)) setLoading(true);
    try {
      const result = await fetchWhatsAppInboxThreads(supabase, {
        range: listRangeRef.current,
      });
      if (result.error) {
        if (!(cached?.threads?.length)) {
          toast.error(result.error || 'Failed to load WhatsApp threads');
        }
        return;
      }
      setThreads(result.threads);
      writeWhatsAppInboxThreadsCache(result.threads, { rangeKey });
      // Soft reloads: Realtime already patches reads — don't re-download the map.
      if (opts?.soft) {
        const map = loadWhatsAppReadMap();
        setUnreadCounts((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const t of result.threads) {
            if (next[t.phone_e164] && !isWhatsAppThreadUnread(t, map)) {
              delete next[t.phone_e164];
              changed = true;
            }
          }
          if (!changed) return prev;
          saveWhatsAppUnreadCounts(next);
          return next;
        });
      } else {
        const remoteRead = await fetchWhatsAppInboxReadMap(supabase);
        const map = Object.keys(remoteRead).length
          ? mergeWhatsAppReadMap(remoteRead)
          : loadWhatsAppReadMap();
        setReadMap(map);
        const summary = await fetchWhatsAppInboxUnreadSummary(supabase);
        if (summary) {
          applyWhatsAppUnreadSummary(summary);
          setUnreadCounts(summary.perPhone);
          dispatchWhatsAppUnreadChanged(summary.total);
        } else {
          void fetchWhatsAppUnreadMessageCounts(supabase, result.threads, map).then((counts) => {
            if (!counts || !Object.keys(counts).length) return;
            setUnreadCounts((prev) => {
              const next = { ...prev, ...counts };
              for (const t of result.threads) {
                if (!isWhatsAppThreadUnread(t, map)) {
                  delete next[t.phone_e164];
                }
              }
              saveWhatsAppUnreadCounts(next);
              return next;
            });
          });
        }
      }
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, []);

  const runLocalBackupExport = useCallback(async (includeMedia: boolean) => {
    const toastId = toast.loading(includeMedia ? 'Exporting chats + media…' : 'Exporting chats…');
    try {
      const backup = await buildWhatsAppLocalBackup({ includeMedia });
      const saved = await saveWhatsAppLocalBackupFile(backup);
      if (!saved.ok) throw new Error(saved.error || 'Export failed');
      const phones = Object.keys(backup.messagesByPhone || {}).length;
      toast.success(
        includeMedia
          ? `Exported ${backup.threads.length} chats · ${phones} threads · ${backup.media?.length || 0} files`
          : `Exported ${backup.threads.length} chats · ${phones} threads (text)`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: toastId });
    }
  }, []);

  const runLocalBackupImport = useCallback(async (file: File) => {
    const toastId = toast.loading('Importing local backup…');
    try {
      const backup = await readWhatsAppLocalBackupFile(file);
      const result = await restoreWhatsAppLocalBackup(backup);
      const rangeKey = inboxListRangeKey(listRangeRef.current);
      const cached = peekWhatsAppInboxThreadsCache({ rangeKey });
      if (cached?.threads?.length) setThreads(cached.threads);
      if (selectedPhoneRef.current) {
        const msgs = peekWhatsAppThreadMessagesCache(selectedPhoneRef.current);
        if (msgs?.messages?.length) {
          setThreadMessages(msgs.messages);
          setThreadHasMoreOlder(Boolean(msgs.hasMoreOlder));
        }
      }
      setReadMap(loadWhatsAppReadMap());
      toast.success(
        `Imported ${result.threads} chats · ${result.phones} threads` +
          (result.media ? ` · ${result.media} files` : ''),
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed', { id: toastId });
    }
  }, []);

  const runClearLocalCache = useCallback(async () => {
    if (
      !window.confirm(
        'Clear all on-device WhatsApp cache (chats + saved photos/PDFs)?\n\nServer data is unchanged. You can export a backup first.'
      )
    ) {
      return;
    }
    const toastId = toast.loading('Clearing local cache…');
    try {
      await clearWhatsAppLocalDeviceData({ includeMedia: true });
      setThreads([]);
      setThreadMessages([]);
      setSelectedPhone(null);
      toast.success('Local cache cleared', { id: toastId });
      void loadInbox({ force: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed', { id: toastId });
    }
  }, [loadInbox]);

  const applyListRange = useCallback(
    (range: WhatsAppInboxListRange) => {
      saveWhatsAppInboxListRange(range);
      setListRange(range);
      listRangeRef.current = range;
      invalidateWhatsAppInboxThreadsCache();
      void loadInbox({ force: true });
    },
    [loadInbox]
  );

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.message('Type at least 2 characters (name, phone, email, or customer ID)');
      return;
    }
    setSearchLoading(true);
    setAppliedSearch(q);
    try {
      const result = await searchWhatsAppInboxThreads(supabase, q);
      if (result.error) {
        toast.error(result.error);
        setSearchThreads([]);
        return;
      }
      setSearchThreads(result.threads);
      if (!result.threads.length) {
        toast.message('No customers or chats found');
      }
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setAppliedSearch('');
    setSearchThreads([]);
  }, []);

  const mediaUrlCacheRef = useRef<Record<string, string>>({});
  const loadThreadSeqRef = useRef(0);

  const loadThread = useCallback(async (phone: string, opts?: { soft?: boolean; force?: boolean }) => {
    const seq = ++loadThreadSeqRef.current;
    const phoneDigits = toWhatsAppPhoneDigits(phone);
    if (!phoneDigits) return;
    const cached = peekWhatsAppThreadMessagesCache(phoneDigits);
    const cacheFresh = isWhatsAppThreadCacheFresh(cached);
    // Soft refresh must not wipe newer optimistic/realtime messages with stale cache.
    if (cached?.messages?.length && !opts?.force && !opts?.soft) {
      setThreadMessages(cached.messages);
      setThreadHasMoreOlder(Boolean(cached.hasMoreOlder));
      setThreadLoading(false);
    }
    if (cacheFresh && !opts?.force && !opts?.soft) {
      setThreadLoading(false);
      return;
    }
    if (!opts?.soft && !(cached?.messages?.length)) setThreadLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(WHATSAPP_THREAD_COLUMNS)
        .eq('phone_e164', phoneDigits)
        .order('created_at', { ascending: false })
        .limit(WHATSAPP_THREAD_PAGE_SIZE);
      if (seq !== loadThreadSeqRef.current) return;
      if (error) {
        if (!(cached?.messages?.length)) {
          toast.error(error.message || 'Failed to load chat');
        }
        return;
      }
      const rows = ((data || []) as WhatsAppMessageRow[])
        .filter((r) => !isWhatsAppMessageDeletedLocally(r.id))
        .slice()
        .reverse();
      const pageHasMore = (data || []).length >= WHATSAPP_THREAD_PAGE_SIZE;
      const prev = threadMessagesRef.current.filter((m) => !isWhatsAppMessageDeletedLocally(m.id));
      let next = rows;
      if (opts?.soft && prev.length) {
        const serverIds = new Set(rows.map((r) => r.id));
        const oldestTs = rows.length
          ? Math.min(...rows.map((r) => new Date(r.created_at).getTime()))
          : 0;
        const byId = new Map<string, WhatsAppMessageRow>();
        for (const m of prev) {
          const ts = new Date(m.created_at).getTime();
          const keepOptimistic = String(m.id || '').startsWith('local-');
          const olderThanPage = rows.length > 0 && Number.isFinite(ts) && ts < oldestTs;
          if (keepOptimistic || olderThanPage || serverIds.has(m.id)) {
            byId.set(m.id, m);
          }
        }
        for (const r of rows) byId.set(r.id, { ...byId.get(r.id), ...r });
        next = [...byId.values()].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        if (next.length > WHATSAPP_THREAD_LIMIT) {
          next = next.slice(next.length - WHATSAPP_THREAD_LIMIT);
        }
      }
      const hasMore =
        pageHasMore ||
        (Boolean(opts?.soft) && threadHasMoreOlderRef.current && next.length > rows.length);
      threadHasMoreOlderRef.current = hasMore;
      setThreadMessages(next);
      setThreadHasMoreOlder(hasMore);
      writeWhatsAppThreadMessagesCache(phoneDigits, next, hasMore);
      if (next.length) {
        const readAt = loadWhatsAppReadMap()[phoneDigits];
        const exact = countInboundUnreadInMessages(next, readAt);
        setUnreadCounts((prev) => {
          const cur = prev[phoneDigits] || 0;
          if (cur === exact) return prev;
          const updated = { ...prev };
          if (exact > 0) updated[phoneDigits] = exact;
          else delete updated[phoneDigits];
          saveWhatsAppUnreadCounts(updated);
          return updated;
        });
      }
    } finally {
      if (seq === loadThreadSeqRef.current && !opts?.soft) setThreadLoading(false);
    }
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const phone = toWhatsAppPhoneDigits(selectedPhoneRef.current);
    if (!phone || threadLoadingOlderRef.current || !threadHasMoreOlderRef.current) return;
    const oldest = threadMessagesRef.current[0];
    if (!oldest?.created_at) return;
    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    threadLoadingOlderRef.current = true;
    setThreadLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(WHATSAPP_THREAD_COLUMNS)
        .eq('phone_e164', phone)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(WHATSAPP_THREAD_PAGE_SIZE);
      if (error) {
        toast.error(error.message || 'Could not load older messages');
        return;
      }
      const older = ((data || []) as WhatsAppMessageRow[]).slice().reverse();
      if (!older.length) {
        threadHasMoreOlderRef.current = false;
        setThreadHasMoreOlder(false);
        writeWhatsAppThreadMessagesCache(phone, threadMessagesRef.current, false);
        return;
      }
      const pageHasMore = (data || []).length >= WHATSAPP_THREAD_PAGE_SIZE;
      const prev = threadMessagesRef.current;
      const seen = new Set(prev.map((m) => m.id));
      const fresh = older.filter((m) => !seen.has(m.id));
      if (!fresh.length) {
        threadHasMoreOlderRef.current = false;
        setThreadHasMoreOlder(false);
        writeWhatsAppThreadMessagesCache(phone, prev, false);
        return;
      }
      // Keep newly loaded older messages — if over cap, drop newest (below viewport).
      let merged = [...fresh, ...prev];
      if (merged.length > WHATSAPP_THREAD_LIMIT) {
        merged = merged.slice(0, WHATSAPP_THREAD_LIMIT);
      }
      threadHasMoreOlderRef.current = pageHasMore;
      setThreadHasMoreOlder(pageHasMore);
      setThreadMessages(merged);
      writeWhatsAppThreadMessagesCache(phone, merged, pageHasMore);
      requestAnimationFrame(() => {
        const box = messagesScrollRef.current;
        if (!box) return;
        box.scrollTop = box.scrollHeight - prevHeight + prevTop;
      });
    } finally {
      threadLoadingOlderRef.current = false;
      setThreadLoadingOlder(false);
    }
  }, []);

  const loadOlderMessagesRef = useRef(loadOlderMessages);
  loadOlderMessagesRef.current = loadOlderMessages;

  const resolveMediaHref = useCallback(async (
    row: WhatsAppMessageRow,
    opts?: { bustCache?: boolean }
  ): Promise<string | null> => {
    const ref = row.media_url;
    if (!ref) return null;
    if (opts?.bustCache) {
      delete mediaUrlCacheRef.current[row.id];
      setMediaUrlCache((prev) => {
        if (!prev[row.id]) return prev;
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
    const cached = mediaUrlCacheRef.current[row.id];
    // Signed https URLs expire — only reuse blob/data object URLs in-session.
    if (cached && (cached.startsWith('blob:') || cached.startsWith('data:'))) {
      return cached;
    }
    const resolved = await resolveWhatsAppMediaDisplayUrl({
      mediaUrl: ref,
      messageId: row.id,
      mimeHint: row.media_mime,
      preferBlob: true,
    });
    if (!resolved.ok || !resolved.url) return null;
    const url = resolved.url;
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      mediaUrlCacheRef.current[row.id] = url;
      setMediaUrlCache((prev) => (prev[row.id] === url ? prev : { ...prev, [row.id]: url }));
    }
    return url;
  }, []);

  const openImageViewer = useCallback(
    async (row: WhatsAppMessageRow) => {
      if (!row.media_url) return;

      const imageRows = threadMessagesRef.current.filter(isImageMessage);
      const slides: InboxPhotoSlide[] = [];
      const rows: WhatsAppMessageRow[] = [];

      for (const m of imageRows) {
        const ref = m.media_url!;
        const url =
          mediaUrlCacheRef.current[m.id] || directInboxMediaUrl(ref);
        if (!url) continue;
        slides.push({
          src: url,
          alt: (m.filename || '').trim() || 'Photo',
        });
        rows.push(m);
      }

      let startIndex = rows.findIndex((m) => m.id === row.id);
      if (startIndex < 0) {
        const resolved = await resolveMediaHref(row);
        if (!resolved) {
          toast.error('Could not load photo');
          return;
        }
        slides.push({
          src: resolved,
          alt: (row.filename || '').trim() || 'Photo',
        });
        rows.push(row);
        startIndex = slides.length - 1;
      }

      setInboxPhotoViewer({ slides, startIndex, rows });
    },
    [resolveMediaHref]
  );

  const openMedia = useCallback(
    async (row: WhatsAppMessageRow) => {
      if (!row.media_url) return;
      if (isImageMessage(row)) {
        await openImageViewer(row);
        return;
      }
      // Prefer already-resolved / public URL — no loading toast
      const ready =
        mediaUrlCacheRef.current[row.id] ||
        (!isR2MediaRef(row.media_url) &&
        !row.media_url.startsWith('whatsapp-media:') &&
        /^https:\/\//i.test(row.media_url)
          ? row.media_url
          : null);
      if (ready) {
        window.open(ready, '_blank', 'noopener,noreferrer');
        return;
      }

      const toastId = toast.loading('Opening…');
      try {
        const href = await Promise.race([
          resolveMediaHref(row),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 20000);
          }),
        ]);
        if (!href) {
          toast.error('Could not open attachment', { id: toastId });
          return;
        }
        window.open(href, '_blank', 'noopener,noreferrer');
        toast.dismiss(toastId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not open attachment', {
          id: toastId,
        });
      }
    },
    [resolveMediaHref, openImageViewer]
  );

  const downloadMedia = useCallback(
    async (row: WhatsAppMessageRow) => {
      if (!row.media_url) return;
      const name =
        (row.filename || '').trim() ||
        (row.msg_type === 'image' || row.media_mime?.startsWith('image/')
          ? 'photo.jpg'
          : 'document.pdf');
      const toastId = toast.loading('Downloading…');
      try {
        const ref = row.media_url;
        if (isR2MediaRef(ref) || ref.startsWith('whatsapp-media:')) {
          const fetched = await getWhatsAppMediaBytesCached({
            mediaUrl: ref,
            messageId: row.id,
            mimeHint: row.media_mime,
          });
          if (fetched.ok && fetched.bytes) {
            const mime =
              row.media_mime ||
              (/\.pdf$/i.test(name) ? 'application/pdf' : 'application/octet-stream');
            triggerBlobDownload(new Blob([fetched.bytes], { type: mime }), name);
            toast.success('Downloaded', { id: toastId });
            return;
          }
          if (fetched.ok && fetched.url) {
            const res = await fetch(fetched.url);
            if (!res.ok) throw new Error('Download failed');
            triggerBlobDownload(await res.blob(), name);
            toast.success('Downloaded', { id: toastId });
            return;
          }
          throw new Error(fetched.error || 'Download failed');
        }
        const href = await resolveMediaHref(row);
        if (!href) throw new Error('Could not download');
        const res = await fetch(href);
        if (!res.ok) throw new Error('Download failed');
        triggerBlobDownload(await res.blob(), name);
        toast.success('Downloaded', { id: toastId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Download failed', { id: toastId });
      }
    },
    [resolveMediaHref]
  );

  // Prefetch recent image signed URLs in parallel (ref cache → fewer re-renders)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const candidates: WhatsAppMessageRow[] = [];
      for (let i = threadMessages.length - 1; i >= 0 && candidates.length < 10; i--) {
        const m = threadMessages[i];
        if (!m.media_url) continue;
        const isImage = m.msg_type === 'image' || m.media_mime?.startsWith('image/');
        if (!isImage) continue;
        if (mediaUrlCacheRef.current[m.id]) continue;
        const ref = m.media_url;
        if (/^https:\/\//i.test(ref) && !isR2MediaRef(ref)) {
          mediaUrlCacheRef.current[m.id] = ref;
          continue;
        }
        candidates.push(m);
      }
      if (!candidates.length) return;
      const results = await Promise.all(
        candidates.map(async (m) => {
          const resolved = await resolveWhatsAppMediaDisplayUrl({
            mediaUrl: m.media_url!,
            messageId: m.id,
            mimeHint: m.media_mime,
            preferBlob: true,
          });
          // Only keep durable blob URLs in the session cache (signed https expires).
          if (!resolved.ok || !resolved.url) return null;
          if (!resolved.url.startsWith('blob:') && !resolved.url.startsWith('data:')) {
            return null;
          }
          return { id: m.id, url: resolved.url };
        })
      );
      if (cancelled) return;
      const patch: Record<string, string> = {};
      for (const r of results) {
        if (!r) continue;
        mediaUrlCacheRef.current[r.id] = r.url;
        patch[r.id] = r.url;
      }
      for (let i = threadMessages.length - 1; i >= 0; i--) {
        const m = threadMessages[i];
        const ref = m.media_url;
        if (!ref || mediaUrlCacheRef.current[m.id]) continue;
        if (/^https:\/\//i.test(ref) && !isR2MediaRef(ref)) {
          patch[m.id] = ref;
          mediaUrlCacheRef.current[m.id] = ref;
        }
      }
      if (Object.keys(patch).length) {
        setMediaUrlCache((prev) => ({ ...prev, ...patch }));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [threadMessages]);

  const runPurge = useCallback(
    async (opts: { olderThanDays?: number; phoneE164?: string; keepMedia?: boolean }) => {
      const keepMedia = Boolean(opts.keepMedia);
      const label = opts.phoneE164
        ? keepMedia
          ? `Delete chat timeline with ${displayPhone(opts.phoneE164)}?\n\nMessages are removed from the inbox only. Photos and PDFs stay on storage (R2).`
          : `Delete entire chat with ${displayPhone(opts.phoneE164)}?\n\nThis removes all messages plus photos/PDFs from storage (frees space).`
        : keepMedia
          ? `Delete messages older than ${opts.olderThanDays} days from the inbox only?\n\nFiles on storage are kept.`
          : `Delete messages older than ${opts.olderThanDays} days?\n\nThis removes text plus photos/PDFs from storage (frees space).`;
      if (!window.confirm(label)) return;
      setPurging(true);
      const toastId = toast.loading(
        keepMedia ? 'Deleting messages…' : 'Deleting messages and files…'
      );
      try {
        const dry = await purgeWhatsAppMessages({ ...opts, dryRun: true });
        if (!dry.ok) {
          toast.error(dry.error || 'Cleanup failed', { id: toastId });
          return;
        }
        const n = dry.wouldDeleteRows ?? 0;
        const mediaN = dry.withMedia ?? 0;
        if (n === 0) {
          toast.message('Nothing to delete', { id: toastId });
          return;
        }
        if (
          !window.confirm(
            keepMedia
              ? `Permanently delete ${n} message(s) from the inbox?\n\nAbout ${mediaN} linked file(s) will stay on storage.`
              : `Permanently delete ${n} message(s)` +
                  (mediaN > 0 ? ` and about ${mediaN} file(s)` : '') +
                  `?\n\nThis cannot be undone.`
          )
        ) {
          toast.dismiss(toastId);
          return;
        }
        const result = await purgeWhatsAppMessages(opts);
        if (!result.ok) {
          toast.error(result.error || 'Cleanup failed', { id: toastId });
          return;
        }
        const files = result.deletedMedia ?? 0;
        const kept = result.keptMedia ?? 0;
        toast.success(
          keepMedia
            ? `Deleted ${result.deletedRows ?? 0} messages · ${kept > 0 ? `${kept} file(s) kept on storage` : 'no media linked'}`
            : `Deleted ${result.deletedRows ?? 0} messages` +
                (files > 0 ? ` · ${files} files removed from storage` : ' · no media files'),
          { id: toastId }
        );
        if (opts.phoneE164 && opts.phoneE164 === selectedPhoneRef.current) {
          setSelectedPhone(null);
          setThreadMessages([]);
        }
        invalidateWhatsAppThreadMessagesCache(opts.phoneE164 || null);
        invalidateWhatsAppInboxThreadsCache();
        await loadInbox({ soft: true, force: true });
      } finally {
        setPurging(false);
      }
    },
    [loadInbox]
  );

  const upsertMessageLocal = useCallback((row: WhatsAppMessageRow) => {
    if (isWhatsAppMessageDeletedLocally(row.id)) return;
    const rowPhone = toWhatsAppPhoneDigits(row.phone_e164);
    const selected = toWhatsAppPhoneDigits(selectedPhoneRef.current);
    setThreads((prev) => {
      const next = patchThreadFromMessage(prev, row);
      writeWhatsAppInboxThreadsCache(next, {
        rangeKey: inboxListRangeKey(listRangeRef.current),
      });
      return next;
    });
    if (rowPhone && rowPhone === selected) {
      setThreadMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === row.id);
        let next: WhatsAppMessageRow[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = { ...next[idx], ...row };
        } else {
          next = [...prev, row].slice(-WHATSAPP_THREAD_LIMIT);
        }
        const cached = peekWhatsAppThreadMessagesCache(rowPhone);
        writeWhatsAppThreadMessagesCache(
          rowPhone,
          next,
          cached?.hasMoreOlder ?? false
        );
        return next;
      });
      if (row.direction === 'inbound') {
        invalidateInboundWindowCache(rowPhone);
      }
    } else if (rowPhone) {
      upsertWhatsAppThreadMessageCache(rowPhone, row);
      if (row.direction === 'inbound') {
        setUnreadCounts((prev) => {
          const next = { ...prev, [rowPhone]: (prev[rowPhone] || 0) + 1 };
          saveWhatsAppUnreadCounts(next);
          return next;
        });
      }
    }
  }, []);

  /** Instantly update chat-list preview after an outbound send (don't wait for refresh). */
  const bumpThreadAfterOutbound = useCallback(
    (opts: {
      phone: string;
      body?: string | null;
      msgType?: string;
      filename?: string | null;
      mimeType?: string | null;
      messageId?: string | null;
      customerId?: string | null;
      templateName?: string | null;
    }) => {
      const phone = String(opts.phone || '').replace(/\D/g, '');
      if (!phone) return;
      const now = new Date().toISOString();
      const mime = opts.mimeType || null;
      const filename = opts.filename || null;
      let msgType = opts.msgType || 'text';
      if (!opts.msgType && mime) {
        if (mime.startsWith('image/')) msgType = 'image';
        else if (mime.includes('pdf') || /\.pdf$/i.test(filename || '')) msgType = 'document';
        else msgType = 'document';
      }
      if (opts.templateName && !opts.body) msgType = 'template';
      const row: WhatsAppMessageRow = {
        id: opts.messageId || `local-${Date.now()}`,
        wa_message_id: null,
        direction: 'outbound',
        phone_e164: phone,
        customer_id: opts.customerId || null,
        msg_type: msgType,
        body:
          opts.body?.trim() ||
          (opts.templateName ? String(opts.templateName) : null) ||
          null,
        media_url: filename || mime ? `local:${filename || 'file'}` : null,
        media_mime: mime,
        filename,
        status: 'sent',
        template_name: opts.templateName || null,
        error_message: null,
        created_at: now,
      };
      upsertMessageLocal(row);
      void loadInbox({ soft: true, force: true });
      if (phone === selectedPhoneRef.current) {
        void loadThread(phone, { soft: true });
      }
    },
    [upsertMessageLocal, loadInbox, loadThread]
  );

  useEffect(() => {
    const rangeKey = inboxListRangeKey(listRangeRef.current);
    const cached = peekWhatsAppInboxThreadsCache({ rangeKey });
    if (cached?.threads?.length) {
      setThreads(cached.threads);
      setLoading(false);
      void loadInbox({ soft: true });
      return;
    }
    void loadInbox({ force: true });
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedPhone) {
      setThreadMessages([]);
      setThreadHasMoreOlder(false);
      return;
    }
    const phoneDigits = toWhatsAppPhoneDigits(selectedPhone);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    const cached = peekWhatsAppThreadMessagesCache(phoneDigits);
    if (cached?.messages?.length) {
      // Paint cache immediately, then soft-fetch so sidebar preview can't drift from empty thread.
      setThreadMessages(cached.messages);
      setThreadHasMoreOlder(Boolean(cached.hasMoreOlder));
      setThreadLoading(false);
      void loadThread(phoneDigits, { soft: true });
      return;
    }
    setThreadHasMoreOlder(false);
    setThreadMessages([]);
    void loadThread(phoneDigits, { force: true });
  }, [selectedPhone, loadThread]);

  const lastThreadMessageId = threadMessages[threadMessages.length - 1]?.id ?? null;

  const isNearBottom = useCallback((el: HTMLElement, threshold = 80) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  const scrollChatToLatest = useCallback(() => {
    const el = messagesScrollRef.current;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, []);

  // Prefetch older when top sentinel enters view (covers short threads + scroll).
  useEffect(() => {
    const root = messagesScrollRef.current;
    const sentinel = loadOlderSentinelRef.current;
    if (!root || !sentinel || !selectedPhone || !threadHasMoreOlder) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (threadLoadingOlderRef.current) return;
        // Only when the list can scroll (or user already scrolled up).
        if (root.scrollHeight <= root.clientHeight + 24 && stickToBottomRef.current) return;
        void loadOlderMessagesRef.current();
      },
      { root, rootMargin: '120px 0px 0px 0px', threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [selectedPhone, threadHasMoreOlder, threadMessages.length, threadLoading]);

  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    stickToBottomRef.current = near;
    setShowJumpToLatest(!near && el.scrollHeight > el.clientHeight + 40);
    if (el.scrollTop < 96 && el.scrollHeight > el.clientHeight + 24) {
      void loadOlderMessagesRef.current();
    }
  }, [isNearBottom]);

  // Jump to latest when opening a chat / load finishes — only if stuck to bottom.
  useLayoutEffect(() => {
    if (!selectedPhone || threadLoading) return;
    if (!stickToBottomRef.current) {
      setShowJumpToLatest(true);
      return;
    }
    scrollChatToLatest();
    const t1 = window.setTimeout(() => {
      if (stickToBottomRef.current) scrollChatToLatest();
    }, 80);
    const t2 = window.setTimeout(() => {
      if (stickToBottomRef.current) scrollChatToLatest();
    }, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [selectedPhone, threadLoading, lastThreadMessageId, scrollChatToLatest]);

  // Photos/PDFs load after first paint and grow the thread — keep pinned to latest.
  useEffect(() => {
    const root = messagesScrollRef.current;
    const content = threadContentRef.current;
    if (!root || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      root.scrollTop = root.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [selectedPhone, threadLoading, lastThreadMessageId]);

  // Realtime: patch thread list + open chat; soft-reload people list at most every 12s
  useEffect(() => {
    let softReloadTimer: number | null = null;
    let lastSoftReload = 0;

    const scheduleSoftReload = () => {
      const now = Date.now();
      if (now - lastSoftReload < 25_000) return;
      if (softReloadTimer != null) return;
      softReloadTimer = window.setTimeout(() => {
        softReloadTimer = null;
        lastSoftReload = Date.now();
        void loadInbox({ soft: true });
      }, 2500);
    };

    const channel = supabase
      .channel('whatsapp-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        (payload) => {
          const row = (payload.new || payload.old) as Partial<WhatsAppMessageRow> | null;
          if (payload.eventType === 'DELETE' && row?.id) {
            removeWhatsAppThreadMessageCache(row.id, row.phone_e164);
            setThreadMessages((prev) => prev.filter((m) => m.id !== row.id));
            const rangeKey = inboxListRangeKey(listRangeRef.current);
            const list = peekWhatsAppInboxThreadsCache({ rangeKey });
            if (list?.threads) setThreads(list.threads);
            scheduleSoftReload();
            return;
          }
          if (row?.id && row.phone_e164 && row.created_at && row.direction) {
            upsertMessageLocal(row as WhatsAppMessageRow);
          } else {
            scheduleSoftReload();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_inbox_read' },
        (payload) => {
          const row = (payload.new || null) as { phone_e164?: string; read_at?: string } | null;
          const phone = String(row?.phone_e164 || '').replace(/\D/g, '');
          const readAt = String(row?.read_at || '');
          if (!phone || !readAt) return;
          const map = applyWhatsAppTeamRead(phone, readAt);
          setReadMap(map);
          clearWhatsAppUnreadCountForPhone(phone);
          setUnreadCounts((prev) => {
            if (!prev[phone]) return prev;
            const next = { ...prev };
            delete next[phone];
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      if (softReloadTimer != null) window.clearTimeout(softReloadTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadInbox, upsertMessageLocal]);

  const activeThread: WhatsAppThread | null = useMemo(() => {
    if (!selectedPhone) return null;
    return (
      searchThreads.find((t) => t.phone_e164 === selectedPhone) ||
      threads.find((t) => t.phone_e164 === selectedPhone) ||
      null
    );
  }, [threads, searchThreads, selectedPhone]);

  const unreadCount = useMemo(
    () => countUnreadWhatsAppMessages(threads, readMap, unreadCounts),
    [threads, readMap, unreadCounts]
  );

  useEffect(() => {
    dispatchWhatsAppUnreadChanged(resolveWhatsAppHeaderUnreadCount(null, readMap));
  }, [unreadCounts, readMap]);

  useEffect(() => {
    const onReadSync = () => setReadMap(loadWhatsAppReadMap());
    const onDeleted = (ev: Event) => {
      const id = String((ev as CustomEvent<{ id?: string }>).detail?.id || '').trim();
      if (!id) return;
      setThreadMessages((prev) => prev.filter((m) => m.id !== id));
      const rangeKey = inboxListRangeKey(listRangeRef.current);
      const list = peekWhatsAppInboxThreadsCache({ rangeKey });
      if (list?.threads) setThreads(list.threads);
    };
    window.addEventListener(WA_INBOX_READ_SYNC_EVENT, onReadSync);
    window.addEventListener(WA_INBOX_MESSAGE_DELETED_EVENT, onDeleted);
    return () => {
      window.removeEventListener(WA_INBOX_READ_SYNC_EVENT, onReadSync);
      window.removeEventListener(WA_INBOX_MESSAGE_DELETED_EVENT, onDeleted);
    };
  }, []);

  useEffect(() => {
    if (!selectedPhone) return;
    const phone = toWhatsAppPhoneDigits(selectedPhone);
    if (!phone) return;
    const fromThread = activeThread ? threadLastInboundAt(activeThread) : null;
    const fromMessages = latestInboundAtFromMessages(threadMessages);
    const watermark =
      fromThread && fromMessages
        ? new Date(fromMessages).getTime() > new Date(fromThread).getTime()
          ? fromMessages
          : fromThread
        : fromThread || fromMessages;
    if (!watermark) return;
    const prevMarked = lastMarkedReadRef.current[phone];
    if (prevMarked === watermark) return;
    lastMarkedReadRef.current[phone] = watermark;
    setReadMap(applyWhatsAppTeamRead(phone, watermark));
    setUnreadCounts((prev) => {
      if (!prev[phone]) return prev;
      const next = { ...prev };
      delete next[phone];
      saveWhatsAppUnreadCounts(next);
      return next;
    });
    void persistWhatsAppThreadRead(supabase, phone, watermark);
  }, [
    selectedPhone,
    activeThread?.inbound_at,
    activeThread?.last_at,
    activeThread?.last_direction,
    // Only re-evaluate when the newest message changes (not every array identity).
    threadMessages[threadMessages.length - 1]?.id,
    threadMessages[threadMessages.length - 1]?.created_at,
    threadMessages[threadMessages.length - 1]?.direction,
  ]);

  const filteredThreads = useMemo(() => {
    if (appliedSearch.trim()) return searchThreads;
    return threads;
  }, [threads, searchThreads, appliedSearch]);

  const listBusy = loading || searchLoading;
  const listRangeSubtitle = inboxListRangeLabel(listRange);

  const isListRangeActive = useCallback(
    (candidate: WhatsAppInboxListRange): boolean => {
      if (typeof candidate === 'object' && typeof listRange === 'object') {
        return candidate.custom === listRange.custom;
      }
      return candidate === listRange;
    },
    [listRange]
  );

  const rangeMenuItem = (label: string, range: WhatsAppInboxListRange) => (
    <DropdownMenuItem
      className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
      onClick={() => applyListRange(range)}
    >
      <span className="flex-1">{label}</span>
      {isListRangeActive(range) ? (
        <Check className="ml-2 h-4 w-4 shrink-0 text-[#8696a0]" />
      ) : null}
    </DropdownMenuItem>
  );

  const windowOpen = isWithinCustomerServiceWindow(activeThread?.inbound_at);
  windowOpenRef.current = Boolean(windowOpen);
  const hoursLeft = hoursLeftInWindow(activeThread?.inbound_at);

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateKey) return null;
    return templates.find((t) => `${t.name}::${t.language}` === selectedTemplateKey) || null;
  }, [templates, selectedTemplateKey]);

  const quickReplyContext = useMemo(
    () => ({
      customerName: activeThread?.customer_name || undefined,
      brand: threadBrand,
    }),
    [activeThread?.customer_name, threadBrand]
  );

  useEffect(() => {
    if (!activeThread?.customer_id) {
      setThreadBrand('hydrogenro');
      return;
    }
    let cancelled = false;
    void resolveCustomerSendBrand(activeThread.customer_id, 'hydrogenro').then((r) => {
      if (!cancelled) setThreadBrand(r.sendBrand || 'hydrogenro');
    });
    return () => {
      cancelled = true;
    };
  }, [activeThread?.customer_id]);

  const loadTemplates = useCallback(async (force = false) => {
    if (force || templates.length === 0) setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const result = await fetchApprovedWhatsAppTemplates({ force });
      if (!result.ok) {
        setTemplates([]);
        setTemplatesError(result.error || 'Could not load templates');
        if (result.recommended?.length) {
          setTemplatesHint(
            `Create & approve in Meta Manager: ${result.recommended.map((r) => r.name).join(', ')}`
          );
        }
        return;
      }
      setTemplates(result.templates);
      if (!result.templates.length && result.recommended?.length) {
        setTemplatesHint(
          `No approved templates yet. In Meta Business Manager create: ${result.recommended
            .map((r) => r.name)
            .join(', ')}`
        );
      } else {
        setTemplatesHint(null);
      }
    } finally {
      setTemplatesLoading(false);
    }
  }, [templates.length]);

  // Once per mount; Meta list is cached ~10m in fetchApprovedWhatsAppTemplates
  useEffect(() => {
    void loadTemplates(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once on open
  }, []);

  useEffect(() => {
    const count = selectedTemplate?.bodyParamCount ?? 0;
    const defaultName = whatsappGreetingName(activeThread?.customer_name, 'there');
    setTemplateParams((prev) => {
      const next = Array.from({ length: count }, (_, i) => {
        if (prev[i]?.trim()) return prev[i];
        // Prefill first body var with customer name; leave the rest blank for custom entry.
        if (i === 0) return defaultName;
        return '';
      });
      if (prev.length === count && prev.every((v, i) => v === next[i])) return prev;
      return next;
    });
  }, [
    selectedTemplate?.bodyParamCount,
    selectedTemplateKey,
    activeThread?.customer_name,
  ]);

  const openTemplatePicker = useCallback(() => {
    setTemplatePickerOpen(true);
    void loadTemplates(false);
  }, [loadTemplates]);

  const handleSend = useCallback(async () => {
    const phone = selectedPhoneRef.current;
    const text = draftRef.current.trim();
    const file = attachFileRef.current;
    if (!phone || sendingRef.current) return;
    if (!windowOpenRef.current) {
      toast.error('24-hour window closed — use Quick actions → Select template');
      return;
    }
    if (!file && !text) return;

    setSending(true);
    try {
      if (file) {
        const parsed = await readFileAsBase64(file);
        const result = await sendAdminWhatsAppMedia({
          to: phone,
          fileBase64: parsed.base64,
          filename: parsed.filename,
          mimeType: parsed.mimeType,
          caption: text || undefined,
          customerId: activeThread?.customer_id,
          source: 'inbox',
        });
        if (!result.ok) {
          toast.error(result.error || 'Attachment send failed');
          return;
        }
        setDraft('');
        clearAttach();
        toast.success(parsed.mimeType.startsWith('image/') ? 'Image sent' : 'File sent');
        bumpThreadAfterOutbound({
          phone,
          body: text || null,
          filename: parsed.filename,
          mimeType: parsed.mimeType,
          messageId: result.messageId,
          customerId: activeThread?.customer_id,
        });
        return;
      }

      const result = await sendAdminWhatsAppText({
        to: phone,
        text,
        customerId: activeThread?.customer_id,
        source: 'inbox',
        fallbackWaMe: false,
      });
      if (!result.ok) {
        toast.error(result.error || 'Send failed');
        return;
      }
      setDraft('');
      toast.success('Sent');
      bumpThreadAfterOutbound({
        phone,
        body: text,
        msgType: 'text',
        messageId: result.messageId,
        customerId: activeThread?.customer_id,
      });
    } finally {
      setSending(false);
    }
  }, [activeThread?.customer_id, bumpThreadAfterOutbound]);

  const copyBookLink = useCallback(async () => {
    const url = quickReplyBookingUrl(quickReplyContext);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Booking link copied');
    } catch {
      toast.message(url);
    }
  }, [quickReplyContext]);

  const handleSendTemplate = async () => {
    if (!selectedPhone || !selectedTemplate || sending) return;
    const needed = selectedTemplate.bodyParamCount;
    if (needed > 0 && templateParams.some((p) => !String(p).trim())) {
      toast.error('Fill all template fields');
      return;
    }
    setSending(true);
    try {
      const result = await sendAdminWhatsAppTemplate({
        to: selectedPhone,
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.language,
        bodyParams: templateParams.map((p) => String(p).trim()),
        customerId: activeThread?.customer_id,
        source: 'inbox',
      });
      if (!result.ok) {
        toast.error(result.error || 'Template send failed');
        return;
      }
      toast.success('Template sent');
      setSelectedTemplateKey('');
      setTemplateParams([]);
      setTemplatePickerOpen(false);
      bumpThreadAfterOutbound({
        phone: selectedPhone,
        body: selectedTemplate.name,
        msgType: 'template',
        templateName: selectedTemplate.name,
        messageId: result.messageId,
        customerId: activeThread?.customer_id,
      });
    } finally {
      setSending(false);
    }
  };

  const runQuickMessage = async (action: InboxQuickMessageAction) => {
    if (!selectedPhone || quickActionBusy) return;
    setQuickActionBusy(true);
    try {
      const name = whatsappGreetingName(activeThread?.customer_name, 'there');
      const who = waterFilterServiceFromLabel({
        customerName: name,
        brand: threadBrand,
      });
      const bodies: Record<InboxQuickMessageAction, string> = {
        send_hello: `Hi ${name}, this is ${who}. Please reply on this chat if you need help with your water purifier.`,
        call_shortly: `Hi ${name}, thanks for reaching out. We’ll call you shortly.`,
        thanks_reply: `Hi ${name}, thanks — we’ve noted your message. We’ll update you here.`,
      };

      if (!windowOpen && action === 'send_hello') {
        const payload = buildQuickHelloTemplate(quickReplyContext);
        const result = await sendAdminWhatsAppTemplate({
          to: selectedPhone,
          templateName: payload.templateName,
          languageCode: payload.language || 'en',
          bodyParams: payload.bodyParams,
          customerId: activeThread?.customer_id,
          source: 'inbox',
        });
        if (!result.ok) {
          toast.error(result.error || 'Could not send hello');
          return;
        }
        toast.success('Hello template sent');
        setQuickActionConfirm(null);
        bumpThreadAfterOutbound({
          phone: selectedPhone,
          body: payload.templateName,
          msgType: 'template',
          templateName: payload.templateName,
          customerId: activeThread?.customer_id,
        });
        void loadThread(selectedPhone, { soft: true, force: true });
        return;
      }

      if (!windowOpen) {
        toast.error('24h window closed — open with Hello / Book service, or wait for a customer reply.');
        return;
      }

      const text = bodies[action];
      const result = await sendAdminWhatsAppText({
        to: selectedPhone,
        text,
        customerId: activeThread?.customer_id,
        source: 'inbox',
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not send message');
        return;
      }
      toast.success(`${QUICK_MESSAGE_LABELS[action]} sent`);
      setQuickActionConfirm(null);
      bumpThreadAfterOutbound({
        phone: selectedPhone,
        body: text,
        msgType: 'text',
        customerId: activeThread?.customer_id,
      });
      void loadThread(selectedPhone, { soft: true, force: true });
    } finally {
      setQuickActionBusy(false);
    }
  };

  const runQuickAction = async (action: WhatsAppBookingQuickAction | InboxQuickMessageAction) => {
    if (action === 'send_hello' || action === 'call_shortly' || action === 'thanks_reply') {
      await runQuickMessage(action);
      return;
    }
    if (!selectedPhone || quickActionBusy) return;
    setQuickActionBusy(true);
    try {
      const result = await startWhatsAppBookingQuickAction({
        phone: selectedPhone,
        action,
        customerId: activeThread?.customer_id,
        customerName: activeThread?.customer_name,
        brand: threadBrand === 'elevenro' ? 'elevenro' : 'hydrogenro',
      });
      if (!result.ok) {
        toast.error(result.error || 'Quick action failed');
        return;
      }
      const isBook = action === 'book_service';
      if (result.via === 'template') {
        toast.success(
          isBook
            ? `Book template sent${result.templateName ? ` (${result.templateName})` : ''}. Booking continues when they reply.`
            : `Ask template sent${result.templateName ? ` (${result.templateName})` : ''} — not a booking.`
        );
      } else {
        toast.success(
          isBook
            ? 'Booking started on WhatsApp'
            : `${QUICK_ACTION_LABELS[action]} sent — booking not started`
        );
      }
      setQuickActionConfirm(null);
      bumpThreadAfterOutbound({
        phone: selectedPhone,
        body: result.templateName || QUICK_ACTION_LABELS[action],
        msgType: result.via === 'template' ? 'template' : 'interactive',
        templateName: result.templateName || null,
        customerId: activeThread?.customer_id,
      });
      void loadThread(selectedPhone, { soft: true, force: true });
    } finally {
      setQuickActionBusy(false);
    }
  };

  const showList = !selectedPhone;
  const showChat = Boolean(selectedPhone);

  const openNewChat = () => {
    let digits = newChatPhone.replace(/\D/g, '');
    if (digits.length === 10) digits = `91${digits}`;
    if (digits.length < 12) {
      toast.error('Enter a valid phone (10 digits or with 91)');
      return;
    }
    setSelectedPhone(digits);
    setNewChatOpen(false);
    setNewChatPhone('');
    void loadInbox({ soft: true });
  };

  const copyPhone = async () => {
    if (!selectedPhone) return;
    try {
      await navigator.clipboard.writeText(selectedPhone);
      toast.success('Number copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const openCustomerInCrm = () => {
    if (!activeThread?.customer_id) {
      toast.message('No CRM customer linked to this number');
      return;
    }
    navigate({
      pathname: '/admin',
      search: buildAdminDashboardSearch({
        customerId: activeThread.customer_id,
        modal: 'edit-customer',
        clearView: true,
        clearTool: true,
      }),
    });
  };

  const openCustomerReport = async () => {
    if (!activeThread?.customer_id) {
      toast.message('No CRM customer linked to this number');
      return;
    }
    setReportLoading(true);
    try {
      const [{ data: customer, error }, techRes] = await Promise.all([
        db.customers.getById(activeThread.customer_id),
        reportTechnicians.length
          ? Promise.resolve({ data: reportTechnicians })
          : db.technicians.getList(100),
      ]);
      if (error || !customer) {
        toast.error(error?.message || 'Could not load customer');
        return;
      }
      const row = customer as Record<string, unknown>;
      const mapped = {
        ...row,
        id: String(row.id),
        fullName: String(row.full_name || row.fullName || ''),
        full_name: String(row.full_name || row.fullName || ''),
        customerId: String(row.customer_id || row.customerId || ''),
        customer_id: String(row.customer_id || row.customerId || ''),
      } as unknown as Customer;
      if (!reportTechnicians.length && techRes.data) {
        setReportTechnicians(techRes.data as Technician[]);
      }
      setReportCustomer(mapped);
      setReportOpen(true);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0b141a]">
      {!hideHeader ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#2a3942] bg-[#111b21] px-3 py-2">
          {onBack ? (
            <button
              type="button"
              onClick={handleChromeBack}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[#8696a0] transition hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <WhatsAppLogo size={18} className="text-[#e9edef]" />
            <h1 className="text-base font-semibold text-[#e9edef]">Inbox</h1>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-[#2a3942] px-2 py-0.5 text-[11px] font-semibold text-[#e9edef]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat list — dark WhatsApp sidebar */}
        <aside
          className={cn(
            'relative flex min-h-0 w-full flex-col border-[#2a3942] bg-[#0b141a] md:w-[360px] md:shrink-0 md:border-r',
            showChat ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="shrink-0 border-b border-[#2a3942] bg-[#111b21] px-3 pb-3 pt-2.5 md:px-3.5 md:pt-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                {!hideHeader ? (
                  <h2 className="text-[20px] font-semibold tracking-tight text-[#e9edef] md:hidden">
                    Chats
                    {unreadCount > 0 ? (
                      <span className="ml-2 align-middle text-[12px] font-semibold text-[#8696a0]">
                        {unreadCount > 99 ? '99+' : unreadCount} new
                      </span>
                    ) : null}
                  </h2>
                ) : (
                  <h2 className="text-[15px] font-medium tracking-tight text-[#e9edef] md:hidden">
                    Chats
                    {unreadCount > 0 ? (
                      <span className="ml-2 align-middle text-[12px] font-semibold text-[#8696a0]">
                        {unreadCount > 99 ? '99+' : unreadCount} new
                      </span>
                    ) : null}
                  </h2>
                )}
                <h2 className="hidden text-[17px] font-semibold tracking-tight text-[#e9edef] md:block">
                  Chats
                </h2>
                <p className="mt-0.5 hidden text-[11px] text-[#667781] md:block">
                  {appliedSearch
                    ? `Search · ${filteredThreads.length}`
                    : unreadCount > 0
                      ? `${unreadCount > 99 ? '99+' : unreadCount} unread · ${listRangeSubtitle}`
                      : listRangeSubtitle}
                </p>
              </div>
              <div className="flex items-center gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#8696a0] transition hover:bg-[#202c33] hover:text-[#e9edef] disabled:opacity-50"
                      disabled={purging}
                      title="More"
                    >
                      {purging ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MoreVertical className="h-4 w-4" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 border-[#202c33] bg-[#202c33] text-[#e9edef]">
                    <DropdownMenuItem
                      className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                      onClick={() => setNewChatOpen(true)}
                    >
                      <MessageSquarePlus className="mr-2 h-4 w-4" />
                      New chat
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                      onClick={() => setWaterFilterOpen(true)}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      Water Filter Service
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-[#202c33]" />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]">
                        <Calendar className="mr-2 h-4 w-4" />
                        Show chats
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56 border-[#202c33] bg-[#202c33] text-[#e9edef]">
                        {rangeMenuItem("Today", 'today')}
                        {rangeMenuItem('Last 7 days', '7d')}
                        {rangeMenuItem('Last 30 days', '30d')}
                        {rangeMenuItem('All chats', 'all')}
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                          onClick={() => setCustomRangeOpen(true)}
                        >
                          <span className="flex-1">Custom date…</span>
                          {typeof listRange === 'object' ? (
                            <Check className="ml-2 h-4 w-4 shrink-0 text-[#8696a0]" />
                          ) : null}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]">
                        <Settings className="mr-2 h-4 w-4" />
                        Chat settings
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56 border-[#202c33] bg-[#202c33] text-[#e9edef]">
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                          onClick={() => void loadInbox({ force: true })}
                        >
                          Refresh chat list
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                          disabled={!selectedPhone}
                          onClick={() =>
                            selectedPhone
                              ? void loadThread(selectedPhone, { force: true })
                              : undefined
                          }
                        >
                          Refresh open chat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-[#2a3942]" />
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                          onClick={() => void runLocalBackupExport(false)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export chats (text)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                          onClick={() => void runLocalBackupExport(true)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export chats + media
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-[#202c33] focus:text-[#e9edef]"
                          onClick={() => backupImportInputRef.current?.click()}
                        >
                          Import local backup
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-red-400 focus:bg-[#202c33] focus:text-red-400"
                          onClick={() => void runClearLocalCache()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Clear on-device cache
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-[#2a3942]" />
                        <DropdownMenuItem
                          className="cursor-pointer text-red-400 focus:bg-[#202c33] focus:text-red-400"
                          disabled={!selectedPhone}
                          onClick={() =>
                            selectedPhone
                              ? void runPurge({ phoneE164: selectedPhone, keepMedia: true })
                              : undefined
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete chat (keep files)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-red-400 focus:bg-[#202c33] focus:text-red-400"
                          disabled={!selectedPhone}
                          onClick={() =>
                            selectedPhone ? void runPurge({ phoneE164: selectedPhone }) : undefined
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete chat and files
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667781]" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, phone, email…"
                  className="h-9 rounded-xl border-0 bg-[#202c33] pl-9 pr-8 text-[13px] text-[#e9edef] shadow-none placeholder:text-[#667781] focus-visible:ring-1 focus-visible:ring-[#8696a0]/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void runSearch();
                    }
                    if (e.key === 'Escape' && (query || appliedSearch)) {
                      e.preventDefault();
                      clearSearch();
                    }
                  }}
                />
                {query || appliedSearch ? (
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-[#667781] hover:bg-[#0b141a] hover:text-[#e9edef]"
                    title="Clear search"
                    onClick={clearSearch}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 cursor-pointer rounded-xl bg-[#2a3942] px-3.5 text-[12px] font-semibold text-[#e9edef] shadow-sm hover:bg-[#3b4a54]"
                disabled={searchLoading || query.trim().length < 2}
                onClick={() => void runSearch()}
              >
                {searchLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Go'
                )}
              </Button>
            </div>
            {appliedSearch ? (
              <p className="mt-2 truncate px-0.5 text-[11px] text-[#667781]">
                Results for “{appliedSearch}” ·{' '}
                <button
                  type="button"
                  className="cursor-pointer font-medium text-[#e9edef] underline-offset-2 hover:underline"
                  onClick={clearSearch}
                >
                  {listRangeSubtitle}
                </button>
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5 md:px-2">
            {listBusy ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-[#667781]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {searchLoading ? 'Searching…' : 'Loading…'}
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="space-y-3 p-8 text-center">
                <p className="text-sm text-[#667781]">
                  {appliedSearch.trim()
                    ? 'No matching customers or chats'
                    : listRange === 'today'
                      ? 'No chats today — search by name, phone, email, or ID'
                      : `No chats in ${listRangeSubtitle.toLowerCase()} — try a wider range or search`}
                </p>
                {!appliedSearch.trim() ? (
                  <Button
                    type="button"
                    className="cursor-pointer rounded-xl bg-[#2a3942] text-[#e9edef] hover:bg-[#3b4a54]"
                    onClick={() => setNewChatOpen(true)}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    Start a chat
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredThreads.map((t) => {
                  const active = t.phone_e164 === selectedPhone;
                  const open = isWithinCustomerServiceWindow(t.inbound_at);
                  const unread = isWhatsAppThreadUnread(t, readMap);
                  const needsHuman = threadNeedsHumanReply(t.last_body);
                  const failed =
                    t.has_failed ||
                    isFailedDeliveryStatus(t.last_status) ||
                    Boolean(t.last_error?.trim());
                  const title = t.customer_name || displayPhone(t.phone_e164);
                  return (
                    <li key={t.phone_e164}>
                      <button
                        type="button"
                        onClick={() => setSelectedPhone(t.phone_e164)}
                        className={cn(
                          'group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0',
                          active ? 'bg-[#202c33]' : 'hover:bg-[#202c33]'
                        )}
                      >
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-[#8696a0]"
                            aria-hidden
                          />
                        ) : null}
                        <WhatsAppAvatar
                          name={t.customer_name}
                          className="ring-2 ring-[#0b141a]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={cn(
                                'truncate text-[14.5px] tracking-tight text-[#e9edef]',
                                unread ? 'font-semibold' : 'font-medium'
                              )}
                            >
                              {title}
                            </p>
                            <span
                              className={cn(
                                'shrink-0 text-[11px] tabular-nums',
                                unread ? 'font-semibold text-[#e9edef]' : 'text-[#667781]'
                              )}
                            >
                              {formatThreadTime(t.last_at)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p
                              className={cn(
                                'min-w-0 flex-1 truncate text-[12.5px] leading-snug',
                                failed
                                  ? 'text-red-400'
                                  : unread
                                    ? 'font-medium text-[#8696a0]'
                                    : 'text-[#667781]'
                              )}
                            >
                              {failed ? 'Not delivered · ' : ''}
                              {t.last_direction === 'outbound' ? (
                                <span className="mr-0.5 inline-flex align-middle">
                                  <WhatsAppTicks status={t.last_status} failed={failed} />
                                </span>
                              ) : null}
                              {previewMessageBody({
                                body: t.last_body,
                                msg_type: t.last_msg_type,
                                filename: null,
                                media_url: null,
                                media_mime: null,
                              })}
                            </p>
                            {unread ? (
                              <WhatsAppUnreadBadge
                                count={unreadMessageCountForThread(t, readMap, unreadCounts)}
                              />
                            ) : null}
                            {needsHuman ? (
                              <span
                                className="shrink-0 rounded-md bg-[#3b2f1a] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#f0c27a]"
                                title="Customer asked for a human reply on this chat"
                              >
                                Needs reply
                              </span>
                            ) : null}
                            {!open && !failed ? (
                              <span
                                className="hidden shrink-0 rounded-md bg-[#3b2f1a] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#f0c27a] md:inline"
                                title="24h window closed"
                              >
                                Cold
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Mobile FAB — new chat */}
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[#2a3942] text-[#e9edef] shadow-lg transition hover:bg-[#3b4a54] active:scale-95 md:hidden"
            title="New chat"
            aria-label="New chat"
          >
            <MessageSquarePlus className="h-7 w-7" />
          </button>
        </aside>

        {/* Chat pane — sticky header + scroll messages + sticky composer */}
        <section
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0b141a]',
            showList && !showChat ? 'hidden md:flex' : 'flex'
          )}
          onDragEnter={(e) => {
            if (!windowOpen || !selectedPhone) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            if (!windowOpen || !selectedPhone) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget === e.target) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            if (!windowOpen || !selectedPhone || sending) return;
            pickAttachFile(e.dataTransfer.files?.[0]);
          }}
        >
          {dragOver && windowOpen ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
              <div className="rounded-2xl border-2 border-dashed border-[#00a884] bg-[#e9edef] px-8 py-10 text-center shadow-xl">
                <Paperclip className="mx-auto mb-2 h-8 w-8 text-[#00a884]" />
                <p className="text-sm font-semibold text-[#0b141a]">Drop photo or PDF</p>
                <p className="mt-1 text-xs text-[#6b7c86]">JPEG, PNG, WebP, PDF · max 4MB</p>
              </div>
            </div>
          ) : null}

          {!selectedPhone ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#0b141a] p-8 text-center">
              <WhatsAppLogo size={48} className="text-[#e9edef]" />
              <p className="text-[28px] font-light tracking-tight text-[#e9edef]">Messages</p>
              <p className="max-w-md text-sm text-[#667781]">
                Select a chat on the left, or start a new one.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  className="cursor-pointer bg-[#2a3942] text-[#e9edef] hover:bg-[#3b4a54]"
                  onClick={() => setNewChatOpen(true)}
                >
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  New chat
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-1 border-b border-[#2a3942] bg-[#111b21] px-1.5 py-2 sm:gap-2 sm:px-4">
                <button
                  type="button"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5 md:hidden"
                  onClick={() => setSelectedPhone(null)}
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <WhatsAppAvatar
                  name={activeThread?.customer_name}
                  size="sm"
                  className="bg-[#5c636a] text-white"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium text-[#e9edef]">
                    {activeThread?.customer_name || displayPhone(selectedPhone)}
                  </p>
                  <p className="truncate text-[12px] text-[#667781]">
                    {activeThread?.customer_name ? `${displayPhone(selectedPhone)} · ` : ''}
                    {getDocumentBrandLabel(threadBrand)}
                    {' · '}
                    {windowOpen
                      ? `online · ~${hoursLeft ?? '?'}h window`
                      : '24h window closed'}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5"
                  title="Copy number"
                  onClick={() => void copyPhone()}
                >
                  <Copy className="h-4 w-4" />
                </button>
                {cloudApiOn ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5 disabled:opacity-40"
                      title="Quick actions"
                      aria-label="Quick actions"
                      disabled={quickActionBusy}
                    >
                      {quickActionBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy || sending || !selectedPhone}
                      onClick={() => openTemplatePicker()}
                    >
                      Select template…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      Booking
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('book_service')}
                    >
                      Book service
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      Ask only
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setWaterFilterOpen(true)}
                    >
                      WFS · ask location
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('request_name')}
                    >
                      Ask name
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('request_location')}
                    >
                      Ask location
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('request_building_flat')}
                    >
                      Ask flat / building
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('request_photo')}
                    >
                      Ask photo
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      Messages
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('send_hello')}
                    >
                      Send hello
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('call_shortly')}
                    >
                      We’ll call you shortly
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('thanks_reply')}
                    >
                      Thanks — noted
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5 disabled:opacity-40 md:text-[#667781] md:hover:bg-white/5"
                      title="Customer"
                      disabled={!activeThread?.customer_id || reportLoading}
                    >
                      {reportLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserRound className="h-4 w-4" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={!activeThread?.customer_id || reportLoading}
                      onClick={() => void openCustomerReport()}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      See report
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={!activeThread?.customer_id}
                      onClick={openCustomerInCrm}
                    >
                      <UserRound className="mr-2 h-4 w-4" />
                      Open customer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5 md:text-[#667781] md:hover:bg-white/5"
                      title="More"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void copyPhone()}>
                      Copy number
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copyBookLink()}>
                      Copy book link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!activeThread?.customer_id || reportLoading}
                      onClick={() => void openCustomerReport()}
                    >
                      See report
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!activeThread?.customer_id}
                      onClick={openCustomerInCrm}
                    >
                      Open customer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer text-red-700 focus:text-red-700"
                      disabled={purging}
                      onClick={() => void runPurge({ phoneE164: selectedPhone, keepMedia: true })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete chat (keep files)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer text-red-700 focus:text-red-700"
                      disabled={purging}
                      onClick={() => void runPurge({ phoneE164: selectedPhone })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete chat and files
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="relative min-h-0 flex-1">
                {/* Mobile: WhatsApp dark wallpaper · Desktop: light wash */}
                <div
                  ref={messagesScrollRef}
                  onScroll={onMessagesScroll}
                  className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-8 md:px-12"
                  style={CHAT_THREAD_BG_DARK}
                >
                <div ref={threadContentRef} className="space-y-1.5">
                {threadLoading ? (
                  <div className="flex justify-center py-10 text-sm text-[#667781]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading chat…
                  </div>
                ) : threadMessages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-[#667781]">
                    No messages in this chat
                  </p>
                ) : (
                  <>
                    {(threadHasMoreOlder || threadLoadingOlder) ? (
                      <div
                        ref={loadOlderSentinelRef}
                        className="mb-1 flex min-h-8 items-center justify-center py-1"
                        aria-hidden={!threadLoadingOlder}
                      >
                        {threadLoadingOlder ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#667781]">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading older…
                          </span>
                        ) : (
                          <span className="h-1 w-1 rounded-full bg-transparent" />
                        )}
                      </div>
                    ) : null}
                  {threadMessages.map((m, i) => {
                    const outbound = m.direction === 'outbound';
                    const failed =
                      outbound &&
                      (isFailedDeliveryStatus(m.status) || Boolean(m.error_message?.trim()));
                    const prev = threadMessages[i - 1];
                    const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                    const botState = isBookingBotStateMessage(m.body);
                    const imageSrcRaw =
                      mediaUrlCache[m.id] ||
                      (!isR2MediaRef(m.media_url || '') &&
                      /^https:\/\//i.test(m.media_url || '')
                        ? m.media_url
                        : null);
                    const imageSrc =
                      imageSrcRaw &&
                      (imageSrcRaw.startsWith('blob:') ||
                        imageSrcRaw.startsWith('data:') ||
                        (!isR2MediaRef(m.media_url || '') &&
                          /^https:\/\//i.test(imageSrcRaw)))
                        ? imageSrcRaw
                        : null;
                    const showLocationCard = !m.media_url && isWhatsAppLocationMessage(m);

                    if (botState) {
                      return (
                        <div key={`m-${m.id}`}>
                          {showDay ? (
                            <div className="my-3 flex justify-center">
                              <span className="rounded-lg bg-[#0b141a] px-3 py-1 text-[12px] font-medium text-[#667781] shadow-sm">
                                {formatDaySeparator(m.created_at)}
                              </span>
                            </div>
                          ) : null}
                          <div className="my-2 flex justify-center px-2">
                            <div className="max-w-[90%] rounded-xl border border-amber-500/30 bg-[#2a2419] px-3 py-2 text-left shadow-sm">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#f59e0b]">
                                Booking bot (internal)
                              </p>
                              <p className="whitespace-pre-wrap break-words text-[13px] leading-[18px] text-[#e9edef]">
                                {formatAdminWhatsAppBody(m.body, { compact: false })}
                              </p>
                              <p className="mt-1 text-right text-[10px] text-[#667781]">
                                {formatBubbleTime(m.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={`m-${m.id}`}>
                        {showDay ? (
                          <div className="my-3.5 flex justify-center">
                            <span className="rounded-lg bg-[#0b141a] px-3 py-1 text-[12px] font-medium text-[#667781] shadow-sm">
                              {formatDaySeparator(m.created_at)}
                            </span>
                          </div>
                        ) : null}
                        <div
                          className={cn('mb-0.5 flex', outbound ? 'justify-end' : 'justify-start')}
                        >
                          <div
                            className={cn(
                              'relative max-w-[88%] rounded-lg px-2.5 pb-1 pt-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.35)]',
                              failed
                                ? 'rounded-br-sm border border-red-500/40 bg-[#3b1818] text-[#fecaca]'
                                : outbound
                                  ? 'rounded-br-sm bg-[#005c4b] text-[#e9edef]'
                                  : 'rounded-bl-sm bg-[#202c33] text-[#e9edef]'
                            )}
                          >
                            {failed ? (
                              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-red-400">
                                Not delivered
                              </p>
                            ) : null}
                            {m.media_url ? (
                              m.msg_type === 'image' || m.media_mime?.startsWith('image/') ? (
                                <div className="group relative mb-1 overflow-hidden rounded-md">
                                  <InboxChatPhoto
                                    row={m}
                                    cachedSrc={imageSrc}
                                    onOpen={() => void openImageViewer(m)}
                                    onResolve={resolveMediaHref}
                                  />
                                  <WhatsAppMessageBubbleMenu
                                    message={m}
                                    customerId={m.customer_id || activeThread?.customer_id}
                                    onDownload={() => void downloadMedia(m)}
                                  />
                                </div>
                              ) : m.media_mime?.includes('pdf') ||
                                /\.pdf$/i.test(m.filename || '') ||
                                m.msg_type === 'document' ||
                                m.msg_type === 'pdf' ? (
                                <WhatsAppPdfThumbnail
                                  messageId={m.id}
                                  mediaUrl={m.media_url}
                                  filename={m.filename}
                                  onOpen={() => void openMedia(m)}
                                  onDownload={() => void downloadMedia(m)}
                                />
                              ) : (
                                <div className="mb-1 flex min-w-[200px] max-w-[260px] items-center gap-2 rounded-md bg-black/20 px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => void openMedia(m)}
                                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                                  >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-500/20 text-red-300">
                                      <FileText className="h-5 w-5" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">
                                        {m.filename || 'Document'}
                                      </span>
                                      <span className="text-[11px] text-[#667781]">
                                        Tap to open
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void downloadMedia(m)}
                                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0]"
                                    title="Download"
                                    aria-label="Download file"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                </div>
                              )
                            ) : null}
                            {showLocationCard ? (
                              <WhatsAppInboxLocationCard body={m.body} />
                            ) : (
                            (() => {
                              const text = formatAdminWhatsAppBody(m.body, { compact: false });
                              const preview = previewMessageBody(m);
                              const file = (m.filename || '').trim();
                              if (
                                m.media_url &&
                                file &&
                                !m.body?.trim() &&
                                (preview === file ||
                                  preview === `📄 ${file}` ||
                                  preview === `📷 ${file}` ||
                                  preview === '📄 Document')
                              ) {
                                return null;
                              }
                              if (
                                m.media_url &&
                                !m.body?.trim() &&
                                (m.msg_type === 'document' ||
                                  m.msg_type === 'pdf' ||
                                  m.msg_type === 'image')
                              ) {
                                return null;
                              }
                              if (!text?.trim()) return null;
                              return (
                                <p className="whitespace-pre-wrap break-words px-1 text-[14.2px] leading-[19px] text-[#e9edef]">
                                  {text}
                                </p>
                              );
                            })()
                            )}
                            <div className="mt-0.5 flex items-center justify-end gap-1 px-1">
                              <span className="text-[11px] leading-none text-[#667781]">
                                {formatBubbleTime(m.created_at)}
                              </span>
                              {outbound ? (
                                <WhatsAppTicks status={m.status} failed={failed} className="text-[#667781]" />
                              ) : null}
                            </div>
                            {m.error_message ? (
                              <p className="mt-1 px-1 text-[11px] font-medium text-red-400">
                                {m.error_message}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </>
                )}
                <div ref={bottomRef} />
                </div>
                </div>
                {showJumpToLatest ? (
                  <button
                    type="button"
                    onClick={scrollChatToLatest}
                    className="absolute bottom-3 right-3 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#111b21] text-[#8696a0] shadow-md ring-1 ring-white/10 transition hover:bg-[#202c33] sm:right-6"
                    title="Jump to latest"
                    aria-label="Jump to latest messages"
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                ) : null}
              </div>

              {!cloudApiOn ? (
              <div className="shrink-0 border-t border-[#2a3942] bg-[#111b21] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-[#8696a0]">
                WhatsApp Cloud API is disabled in Settings. You can still read this thread.
              </div>
              ) : windowOpen ? (
              <div className="shrink-0 border-t border-[#2a3942] bg-[#111b21] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
                  <div className="space-y-2">
                    {attachFile ? (
                      <div className="flex items-center gap-2 rounded-xl bg-[#202c33] px-2 py-1.5 shadow-sm">
                        {attachPreviewUrl ? (
                          <img
                            src={attachPreviewUrl}
                            alt=""
                            className="h-11 w-11 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0b141a] text-[10px] font-semibold uppercase text-[#8696a0]">
                            PDF
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-[#e9edef]">
                            {attachFile.name}
                          </p>
                          <p className="text-[10px] text-[#667781]">
                            {(attachFile.size / 1024).toFixed(0)} KB · tap send
                          </p>
                        </div>
                        <button
                          type="button"
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5"
                          disabled={sending}
                          onClick={clearAttach}
                          aria-label="Remove attachment"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={WHATSAPP_ATTACH_ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                          pickAttachFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <input
                        ref={backupImportInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void runLocalBackupImport(f);
                        }}
                      />
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8696a0] transition hover:bg-white/5 disabled:opacity-50"
                        disabled={sending}
                        title="Attach image or PDF"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-5 w-5 rotate-45" />
                      </button>
                      <div className="relative flex min-h-[44px] flex-1 items-end rounded-[24px] border border-white/[0.04] bg-[#202c33] px-3 py-1.5 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-white/18 focus-within:bg-[#2a3942] focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                        <Textarea
                          ref={composerRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={attachFile ? 'Add a caption' : 'Message'}
                          disabled={sending}
                          rows={1}
                          className="max-h-[28vh] min-h-[28px] flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-[15px] text-[#e9edef] shadow-none outline-none ring-0 ring-offset-0 placeholder:text-[#667781] focus:border-0 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                            if (e.key !== 'Enter') return;
                            // Mobile / APK: Enter = new line (send via button).
                            if (isMobileWhatsAppComposer()) return;
                            // Desktop: Enter sends; Shift+Enter keeps newline.
                            if (e.shiftKey) return;
                            e.preventDefault();
                            void handleSend();
                          }}
                          onPaste={(e) => {
                            const item = Array.from(e.clipboardData?.items || []).find((i) =>
                              i.type.startsWith('image/')
                            );
                            if (!item) return;
                            const file = item.getAsFile();
                            if (file) {
                              e.preventDefault();
                              pickAttachFile(file);
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#00a884] text-white shadow transition hover:bg-[#008f72] disabled:opacity-40"
                        disabled={sending || (!draft.trim() && !attachFile)}
                        onClick={() => void handleSend()}
                        aria-label="Send"
                      >
                        {sending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
              </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      <Dialog open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Show chats since</DialogTitle>
            <DialogDescription>
              List conversations with activity on or after this date.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="date"
            value={customRangeDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setCustomRangeDate(e.target.value)}
            className="h-11"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomRangeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#00a884] text-white hover:bg-[#008f72]"
              onClick={() => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(customRangeDate)) {
                  toast.error('Pick a valid date');
                  return;
                }
                applyListRange({ custom: customRangeDate });
                setCustomRangeOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New chat</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter the customer mobile number. If they already messaged, that thread opens.
          </p>
          <Input
            value={newChatPhone}
            onChange={(e) => setNewChatPhone(e.target.value)}
            placeholder="9876543210 or 919876543210"
            className="h-11"
            inputMode="tel"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                openNewChat();
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewChatOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#00a884] text-white hover:bg-[#008f72]"
              onClick={openNewChat}
            >
              Open chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WaterFilterServiceStartDialog
        open={waterFilterOpen}
        onOpenChange={setWaterFilterOpen}
        defaultPhone={selectedPhone || ''}
        defaultName={activeThread?.customer_name || ''}
        brand={threadBrand}
        onStarted={(phoneE164) => {
          setSelectedPhone(phoneE164);
          void loadInbox({ soft: true });
          void loadThread(phoneE164, { soft: true });
        }}
      />

      <Dialog
        open={templatePickerOpen}
        onOpenChange={(open) => {
          if (sending) return;
          setTemplatePickerOpen(open);
          if (!open) {
            setSelectedTemplateKey('');
            setTemplateParams([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send cold template</DialogTitle>
            <DialogDescription>
              Pick an approved Meta template and fill each field with custom values before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {templatesLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates…
              </p>
            ) : null}
            {templatesError ? (
              <p className="text-sm text-red-600">{templatesError}</p>
            ) : null}
            {templatesHint ? (
              <p className="text-xs text-muted-foreground">{templatesHint}</p>
            ) : null}
            {templates.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Template</label>
                  <Select
                    value={selectedTemplateKey || undefined}
                    onValueChange={(v) => {
                      setSelectedTemplateKey(v);
                      setTemplateParams([]);
                    }}
                    disabled={sending}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Choose template" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {templates.map((t) => (
                        <SelectItem
                          key={`${t.name}::${t.language}`}
                          value={`${t.name}::${t.language}`}
                        >
                          {t.name} ({t.language})
                          {t.category ? ` · ${t.category}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTemplate?.bodyPreview ? (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[12px] leading-snug text-muted-foreground whitespace-pre-wrap">
                    {selectedTemplate.bodyPreview}
                  </div>
                ) : null}
                {(selectedTemplate?.bodyParamCount ?? 0) > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Custom fields — edit each value as needed
                    </p>
                    {templateParams.map((val, i) => (
                      <div key={i} className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Field {`{{${i + 1}}}`}
                          {i === 0 ? ' · usually name' : ''}
                        </label>
                        <Input
                          value={val}
                          onChange={(e) => {
                            const next = [...templateParams];
                            next[i] = e.target.value;
                            setTemplateParams(next);
                          }}
                          placeholder={`Enter value for {{${i + 1}}}`}
                          className="h-10"
                          disabled={sending}
                        />
                      </div>
                    ))}
                  </div>
                ) : selectedTemplate ? (
                  <p className="text-xs text-muted-foreground">
                    This template has no body variables.
                  </p>
                ) : null}
              </>
            ) : !templatesLoading ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => void loadTemplates(true)}
              >
                Refresh templates
              </Button>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={() => setTemplatePickerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#00a884] text-white hover:bg-[#008f72]"
              disabled={!selectedTemplate || sending}
              onClick={() => void handleSendTemplate()}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(quickActionConfirm)}
        onOpenChange={(open) => {
          if (!open && !quickActionBusy) setQuickActionConfirm(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {quickActionConfirm
                ? quickActionConfirm in QUICK_MESSAGE_LABELS
                  ? QUICK_MESSAGE_LABELS[quickActionConfirm as InboxQuickMessageAction]
                  : QUICK_ACTION_LABELS[quickActionConfirm as WhatsAppBookingQuickAction]
                : 'Quick action'}
            </DialogTitle>
            <DialogDescription>
              {quickActionConfirm && quickActionConfirm in QUICK_MESSAGE_LABELS
                ? windowOpen
                  ? 'Sends a short message in this chat. Does not start booking.'
                  : quickActionConfirm === 'send_hello'
                    ? '24h window closed — sends a Hello cold template only.'
                    : '24h window is closed — open with Hello / Book service first, or wait for a reply.'
                : quickActionConfirm
                  ? quickActionConfirmCopy(
                      quickActionConfirm as WhatsAppBookingQuickAction,
                      Boolean(windowOpen)
                    ).description
                  : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={quickActionBusy}
              onClick={() => setQuickActionConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#00a884] text-white hover:bg-[#008f72]"
              disabled={!quickActionConfirm || quickActionBusy}
              onClick={() =>
                quickActionConfirm ? void runQuickAction(quickActionConfirm) : undefined
              }
            >
              {quickActionBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : quickActionConfirm && quickActionConfirm in QUICK_MESSAGE_LABELS ? (
                'Send'
              ) : quickActionConfirm ? (
                quickActionConfirmCopy(
                  quickActionConfirm as WhatsAppBookingQuickAction,
                  Boolean(windowOpen)
                ).confirm
              ) : (
                'Send'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reportCustomer ? (
        <CustomerReportDialog
          open={reportOpen}
          customer={reportCustomer}
          technicians={reportTechnicians}
          onOpenChange={(open) => {
            setReportOpen(open);
            if (!open) setReportCustomer(null);
          }}
        />
      ) : null}

      <WhatsAppInboxPhotoViewer
        open={Boolean(inboxPhotoViewer)}
        slides={inboxPhotoViewer?.slides ?? []}
        startIndex={inboxPhotoViewer?.startIndex ?? 0}
        onClose={() => setInboxPhotoViewer(null)}
        onDownload={(photoIndex) => {
          const r = inboxPhotoViewer?.rows[photoIndex];
          if (r) void downloadMedia(r);
        }}
      />
    </div>
  );
}
