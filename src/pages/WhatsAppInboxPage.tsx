import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
  Zap,
  MapPin,
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
import type { Customer, Technician } from '@/types';
import {
  startWhatsAppBookingQuickAction,
  type WhatsAppBookingQuickAction,
} from '@/lib/whatsappBookingStart';
import {
  WHATSAPP_INBOX_COLUMNS,
  WHATSAPP_THREAD_LIMIT,
  countUnreadWhatsAppThreads,
  displayPhone,
  fetchWhatsAppInboxThreads,
  searchWhatsAppInboxThreads,
  formatBubbleTime,
  formatThreadTime,
  hoursLeftInWindow,
  invalidateInboundWindowCache,
  isFailedDeliveryStatus,
  isR2MediaRef,
  isWhatsAppThreadUnread,
  isWithinCustomerServiceWindow,
  loadWhatsAppReadMap,
  markWhatsAppThreadRead,
  patchThreadFromMessage,
  previewMessageBody,
  formatAdminWhatsAppBody,
  isBookingBotStateMessage,
  type WhatsAppMessageRow,
  type WhatsAppThread,
} from '@/lib/whatsappInbox';
import { WhatsAppPdfThumbnail } from '@/components/whatsapp/WhatsAppPdfThumbnail';
import { WhatsAppAvatar, WhatsAppTicks } from '@/components/whatsapp/WhatsAppTicks';
import {
  fetchApprovedWhatsAppTemplates,
  fetchWhatsAppR2MediaBytes,
  fetchWhatsAppR2SignedUrl,
  purgeWhatsAppMessages,
  readFileAsBase64,
  sendAdminWhatsAppMedia,
  sendAdminWhatsAppTemplate,
  sendAdminWhatsAppText,
  validateWhatsAppAttachFile,
  WHATSAPP_ATTACH_ACCEPT,
  type WhatsAppTemplateListItem,
} from '@/lib/sendAdminWhatsAppApi';
import { WhatsAppQuickRepliesBar, WhatsAppQuickContextFields } from '@/components/whatsapp/WhatsAppQuickRepliesBar';
import {
  approvedTemplateNameSet,
  isAskLocationTemplateName,
  quickReplyBookingUrl,
  type WhatsAppQuickTemplateSend,
} from '@/lib/whatsappQuickMessages';

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

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
  request_location: 'Request location',
  request_photo: 'Request photo',
  water_filter_service: 'Water Filter Service',
  book_location_photo: 'Book · location + photo',
};

export default function WhatsAppInboxPage({ hideHeader, onBack, initialPhone }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [threads, setThreads] = useState<WhatsAppThread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(
    initialPhone ? String(initialPhone).replace(/\D/g, '') : null
  );
  const [threadMessages, setThreadMessages] = useState<WhatsAppMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickWhen, setQuickWhen] = useState('');
  const [quickTech, setQuickTech] = useState('');
  const [quickSkipBrand, setQuickSkipBrand] = useState(false);
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
  const [readMap, setReadMap] = useState<Record<string, string>>(() => loadWhatsAppReadMap());
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreviewUrl, setAttachPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mediaUrlCache, setMediaUrlCache] = useState<Record<string, string>>({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [waterFilterOpen, setWaterFilterOpen] = useState(false);
  const [quickActionConfirm, setQuickActionConfirm] =
    useState<WhatsAppBookingQuickAction | null>(null);
  const [quickActionBusy, setQuickActionBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedPhoneRef = useRef(selectedPhone);
  selectedPhoneRef.current = selectedPhone;

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
    setAttachFile(file);
  };

  const clearAttach = () => {
    setAttachFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!initialPhone) return;
    const digits = String(initialPhone).replace(/\D/g, '');
    if (digits) setSelectedPhone(digits);
  }, [initialPhone]);

  const loadInbox = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    try {
      // Default list: only today's chats (server filter when RPC supports p_since).
      const result = await fetchWhatsAppInboxThreads(supabase, { todayOnly: true });
      if (result.error) {
        toast.error(result.error || 'Failed to load WhatsApp threads');
        return;
      }
      setThreads(result.threads);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const loadThread = useCallback(async (phone: string, opts?: { soft?: boolean }) => {
    if (!opts?.soft) setThreadLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(WHATSAPP_INBOX_COLUMNS)
        .eq('phone_e164', phone)
        .order('created_at', { ascending: false })
        .limit(WHATSAPP_THREAD_LIMIT);
      if (error) {
        toast.error(error.message || 'Failed to load chat');
        return;
      }
      const rows = ((data || []) as WhatsAppMessageRow[]).slice().reverse();
      setThreadMessages(rows);
    } finally {
      if (!opts?.soft) setThreadLoading(false);
    }
  }, []);

  const resolveMediaHref = useCallback(
    async (row: WhatsAppMessageRow): Promise<string | null> => {
      const ref = row.media_url;
      if (!ref) return null;
      if (!isR2MediaRef(ref) && /^https:\/\//i.test(ref)) return ref;
      const cached = mediaUrlCache[row.id];
      if (cached) return cached;
      const signed = await fetchWhatsAppR2SignedUrl({
        mediaUrl: ref,
        messageId: row.id,
      });
      if (!signed.ok || !signed.url) return null;
      setMediaUrlCache((prev) => ({ ...prev, [row.id]: signed.url! }));
      return signed.url;
    },
    [mediaUrlCache]
  );

  const openMedia = useCallback(
    async (row: WhatsAppMessageRow) => {
      if (!row.media_url) return;
      const toastId = toast.loading('Opening…');
      const href = await resolveMediaHref(row);
      if (!href) {
        toast.error('Could not open attachment', { id: toastId });
        return;
      }
      toast.dismiss(toastId);
      window.open(href, '_blank', 'noopener,noreferrer');
    },
    [resolveMediaHref]
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
          const fetched = await fetchWhatsAppR2MediaBytes({
            mediaUrl: ref,
            messageId: row.id,
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

  // Prefetch only a few recent image signed URLs (faster open, less egress)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let fetched = 0;
      for (let i = threadMessages.length - 1; i >= 0 && fetched < 4; i--) {
        const m = threadMessages[i];
        if (cancelled || !m.media_url) continue;
        const isImage = m.msg_type === 'image' || m.media_mime?.startsWith('image/');
        if (!isImage || !isR2MediaRef(m.media_url)) continue;
        let already = false;
        setMediaUrlCache((prev) => {
          already = Boolean(prev[m.id]);
          return prev;
        });
        if (already) continue;
        const signed = await fetchWhatsAppR2SignedUrl({
          mediaUrl: m.media_url,
          messageId: m.id,
        });
        if (cancelled) return;
        if (signed.ok && signed.url) {
          fetched += 1;
          setMediaUrlCache((prev) =>
            prev[m.id] ? prev : { ...prev, [m.id]: signed.url! }
          );
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [threadMessages]);

  const runPurge = useCallback(
    async (opts: { olderThanDays?: number; phoneE164?: string }) => {
      const label = opts.phoneE164
        ? `Delete entire chat with ${displayPhone(opts.phoneE164)}?\n\nThis removes all messages plus photos/PDFs from storage (frees space).`
        : `Delete messages older than ${opts.olderThanDays} days?\n\nThis removes text plus photos/PDFs from storage (frees space).`;
      if (!window.confirm(label)) return;
      setPurging(true);
      const toastId = toast.loading('Deleting messages and files…');
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
            `Permanently delete ${n} message(s)` +
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
        toast.success(
          `Deleted ${result.deletedRows ?? 0} messages` +
            (files > 0 ? ` · ${files} files removed from storage` : ' · no media files'),
          { id: toastId }
        );
        if (opts.phoneE164 && opts.phoneE164 === selectedPhoneRef.current) {
          setSelectedPhone(null);
          setThreadMessages([]);
        }
        await loadInbox({ soft: true });
      } finally {
        setPurging(false);
      }
    },
    [loadInbox]
  );

  const upsertMessageLocal = useCallback((row: WhatsAppMessageRow) => {
    setThreads((prev) => patchThreadFromMessage(prev, row));
    if (row.phone_e164 === selectedPhoneRef.current) {
      setThreadMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === row.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...row };
          return next;
        }
        return [...prev, row].slice(-WHATSAPP_THREAD_LIMIT);
      });
      if (row.direction === 'inbound') {
        invalidateInboundWindowCache(row.phone_e164);
      }
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedPhone) {
      setThreadMessages([]);
      return;
    }
    void loadThread(selectedPhone);
  }, [selectedPhone, loadThread]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [threadMessages.length, selectedPhone]);

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
            setThreadMessages((prev) => prev.filter((m) => m.id !== row.id));
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
    () => countUnreadWhatsAppThreads(threads, readMap),
    [threads, readMap]
  );

  useEffect(() => {
    try {
      localStorage.setItem('wa_inbox_unread_count', String(unreadCount));
    } catch {
      /* ignore */
    }
  }, [unreadCount]);

  useEffect(() => {
    if (!selectedPhone || !activeThread) return;
    if (activeThread.last_direction !== 'inbound') return;
    markWhatsAppThreadRead(selectedPhone, activeThread.last_at);
    setReadMap(loadWhatsAppReadMap());
  }, [selectedPhone, activeThread?.last_at, activeThread?.last_direction]);

  const filteredThreads = useMemo(() => {
    if (appliedSearch.trim()) return searchThreads;
    return threads;
  }, [threads, searchThreads, appliedSearch]);

  const listBusy = loading || searchLoading;

  const windowOpen = isWithinCustomerServiceWindow(activeThread?.inbound_at);
  const hoursLeft = hoursLeftInWindow(activeThread?.inbound_at);

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateKey) return null;
    return templates.find((t) => `${t.name}::${t.language}` === selectedTemplateKey) || null;
  }, [templates, selectedTemplateKey]);

  const approvedTemplateNames = useMemo(
    () => approvedTemplateNameSet(templates),
    [templates]
  );

  const quickReplyContext = useMemo(
    () => ({
      customerName: activeThread?.customer_name || undefined,
      brand: threadBrand,
      skipBrandLabel: quickSkipBrand,
      amount: quickAmount,
      whenLabel: quickWhen || undefined,
      technicianName: quickTech || undefined,
    }),
    [
      activeThread?.customer_name,
      threadBrand,
      quickSkipBrand,
      quickAmount,
      quickWhen,
      quickTech,
    ]
  );

  useEffect(() => {
    setQuickAmount('');
    setQuickWhen('');
    setQuickTech('');
    setQuickSkipBrand(false);
  }, [selectedPhone]);

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

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const result = await fetchApprovedWhatsAppTemplates();
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
  }, []);

  useEffect(() => {
    if (selectedPhone) {
      void loadTemplates();
    }
  }, [selectedPhone, loadTemplates]);

  useEffect(() => {
    const count = selectedTemplate?.bodyParamCount ?? 0;
    setTemplateParams((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) => prev[i] || '');
    });
  }, [selectedTemplate?.bodyParamCount, selectedTemplateKey]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!selectedPhone || sending) return;
    if (!windowOpen) {
      toast.error('24-hour window closed — use an approved template below');
      return;
    }
    if (!attachFile && !text) return;

    setSending(true);
    try {
      if (attachFile) {
        const parsed = await readFileAsBase64(attachFile);
        const result = await sendAdminWhatsAppMedia({
          to: selectedPhone,
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
        void loadInbox({ soft: true });
        void loadThread(selectedPhone, { soft: true });
        return;
      }

      const result = await sendAdminWhatsAppText({
        to: selectedPhone,
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
      void loadInbox({ soft: true });
    } finally {
      setSending(false);
    }
  };

  const handleSendText = useCallback(
    async (text: string) => {
      const trimmed = String(text || '').trim();
      if (!selectedPhone || !trimmed || sending) return;
      if (!windowOpen) {
        toast.error('24-hour window closed — use a template below');
        return;
      }
      setSending(true);
      try {
        const result = await sendAdminWhatsAppText({
          to: selectedPhone,
          text: trimmed,
          customerId: activeThread?.customer_id,
          source: 'inbox',
          fallbackWaMe: false,
        });
        if (!result.ok) {
          toast.error(result.error || 'Send failed');
          return;
        }
        toast.success('Sent');
        void loadInbox({ soft: true });
        void loadThread(selectedPhone, { soft: true });
      } finally {
        setSending(false);
      }
    },
    [selectedPhone, sending, windowOpen, activeThread?.customer_id, loadInbox, loadThread]
  );

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
      toast.error('Fill all template variables');
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
      void loadInbox({ soft: true });
      void loadThread(selectedPhone, { soft: true });
    } finally {
      setSending(false);
    }
  };

  const pickQuickTemplate = useCallback(
    (payload: WhatsAppQuickTemplateSend) => {
      const match =
        templates.find(
          (t) => t.name === payload.templateName && t.language === payload.language
        ) || templates.find((t) => t.name === payload.templateName);
      const lang = match?.language || payload.language || 'en';
      setSelectedTemplateKey(`${payload.templateName}::${lang}`);
      const count = match?.bodyParamCount ?? payload.bodyParams.length;
      setTemplateParams(
        payload.bodyParams.slice(0, count).concat(
          Array(Math.max(0, count - payload.bodyParams.length)).fill('')
        )
      );
      toast.message('Template selected — check variables below');
    },
    [templates]
  );

  const handleQuickTemplateSend = useCallback(
    async (payload: WhatsAppQuickTemplateSend) => {
      if (!selectedPhone || sending) return;
      if (windowOpen && isAskLocationTemplateName(payload.templateName)) {
        await runQuickAction('request_location');
        return;
      }
      if (windowOpen && payload.templateName === 'svc_ask_photo') {
        await runQuickAction('request_photo');
        return;
      }
      if (windowOpen && /^svc_wfs_collect/i.test(payload.templateName)) {
        await runQuickAction('water_filter_service');
        return;
      }
      setSending(true);
      try {
        const seedPendingAction =
          isAskLocationTemplateName(payload.templateName)
            ? 'request_location'
            : payload.templateName === 'svc_ask_photo'
              ? 'request_photo'
              : /^svc_wfs_collect/i.test(payload.templateName)
                ? 'water_filter_service'
                : /^svc_wfs_hello/i.test(payload.templateName)
                  ? 'show_menu'
                  : /^svc_wfs_hi/i.test(payload.templateName)
                    ? 'show_menu'
                    : undefined;
        const result = await sendAdminWhatsAppTemplate({
          to: selectedPhone,
          templateName: payload.templateName,
          languageCode: payload.language,
          bodyParams: payload.bodyParams,
          customerId: activeThread?.customer_id,
          source: 'inbox',
          seedPendingAction,
        });
        if (!result.ok) {
          toast.error(result.error || 'Template send failed');
          return;
        }
        toast.success('Quick template sent');
        void loadInbox({ soft: true });
        void loadThread(selectedPhone, { soft: true });
      } finally {
        setSending(false);
      }
    },
    [selectedPhone, sending, activeThread?.customer_id, loadInbox, loadThread, windowOpen, quickActionBusy]
  );

  const runQuickAction = async (action: WhatsAppBookingQuickAction) => {
    if (!selectedPhone || quickActionBusy) return;
    setQuickActionBusy(true);
    try {
      const result = await startWhatsAppBookingQuickAction({
        phone: selectedPhone,
        action,
        customerId: activeThread?.customer_id,
        customerName: activeThread?.customer_name,
      });
      if (!result.ok) {
        toast.error(result.error || 'Quick action failed');
        return;
      }
      if (result.via === 'template') {
        toast.success(
          `Cold template sent${result.templateName ? ` (${result.templateName})` : ''}. Bot continues when they reply.`
        );
      } else {
        toast.success(`${QUICK_ACTION_LABELS[action]} started on WhatsApp`);
      }
      setQuickActionConfirm(null);
      void loadInbox({ soft: true });
      void loadThread(selectedPhone, { soft: true });
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
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f0f2f5]">
      {!hideHeader ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#d1d7db] bg-[#f0f2f5] px-3 py-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[#54656f] transition hover:bg-black/5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : null}
          <h1 className="text-base font-semibold text-[#111b21]">WhatsApp</h1>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-[#25d366] px-2 py-0.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat list — mobile: WA Business; desktop: WA Web */}
        <aside
          className={cn(
            'relative flex min-h-0 w-full flex-col border-[#d1d7db] bg-white md:w-[380px] md:border-r',
            showChat ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="shrink-0 bg-white px-3 pb-2 pt-2 md:border-b md:border-[#e9edef] md:px-4 md:pt-3">
            <div className="mb-2 flex items-center justify-between gap-2 md:mb-3">
              <h2 className="text-[22px] font-bold tracking-tight text-[#111b21] md:hidden">
                WhatsApp
                {unreadCount > 0 ? (
                  <span className="ml-2 align-middle text-[13px] font-semibold text-[#25d366]">
                    ({unreadCount > 99 ? '99+' : unreadCount})
                  </span>
                ) : null}
              </h2>
              <h2 className="hidden text-[22px] font-bold tracking-tight text-[#111b21] md:block">
                Chats
              </h2>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-[#f0f2f5] disabled:opacity-50"
                  onClick={() => void loadInbox({ soft: true })}
                  disabled={refreshing}
                  title="Refresh"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-[#f0f2f5] disabled:opacity-50"
                      disabled={purging}
                      title="More"
                    >
                      {purging ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreVertical className="h-5 w-5" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setNewChatOpen(true)}
                    >
                      <MessageSquarePlus className="mr-2 h-4 w-4" />
                      New chat
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setWaterFilterOpen(true)}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      Water Filter Service
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="font-normal text-muted-foreground">
                      Delete older than — also removes photos &amp; PDFs from storage
                    </DropdownMenuLabel>
                    {[30, 90, 180, 365].map((days) => (
                      <DropdownMenuItem
                        key={days}
                        className="cursor-pointer"
                        onClick={() => void runPurge({ olderThanDays: days })}
                      >
                        {days} days
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer text-red-700 focus:text-red-700"
                      disabled={!selectedPhone}
                      onClick={() =>
                        selectedPhone ? void runPurge({ phoneE164: selectedPhone }) : undefined
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete this chat (+ files)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667781]" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, phone, email, ID…"
                  className="h-10 rounded-full border-0 bg-[#f0f2f5] pl-10 pr-9 text-[15px] text-[#111b21] placeholder:text-[#667781] focus-visible:ring-0 md:h-9 md:rounded-lg md:focus-visible:ring-1 md:focus-visible:ring-[#25d366]"
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
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[#667781] hover:bg-black/5"
                    title="Clear search"
                    onClick={clearSearch}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                className="h-10 shrink-0 cursor-pointer rounded-full bg-[#008069] px-4 text-white hover:bg-[#006e5a] md:h-9 md:rounded-lg"
                disabled={searchLoading || query.trim().length < 2}
                onClick={() => void runSearch()}
              >
                {searchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>
            {appliedSearch ? (
              <p className="mt-1.5 truncate px-1 text-[11px] text-[#667781]">
                Results for “{appliedSearch}” ·{' '}
                <button
                  type="button"
                  className="cursor-pointer font-medium text-[#008069] underline-offset-2 hover:underline"
                  onClick={clearSearch}
                >
                  Show today’s chats
                </button>
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 md:pb-0">
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
                    : 'No chats today — search by name, phone, email, or ID'}
                </p>
                {!appliedSearch.trim() ? (
                  <Button
                    type="button"
                    className="cursor-pointer bg-[#25d366] text-white hover:bg-[#1da851]"
                    onClick={() => setNewChatOpen(true)}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    Start a chat
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul>
                {filteredThreads.map((t) => {
                  const active = t.phone_e164 === selectedPhone;
                  const open = isWithinCustomerServiceWindow(t.inbound_at);
                  const unread = isWhatsAppThreadUnread(t, readMap);
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
                          'flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors md:py-3',
                          active ? 'bg-[#f0f2f5]' : 'active:bg-[#f5f6f6] hover:bg-[#f5f6f6]'
                        )}
                      >
                        <WhatsAppAvatar name={t.customer_name} />
                        <div className="min-w-0 flex-1 border-b border-[#e9edef] pb-2.5 md:pb-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={cn(
                                'truncate text-[16px] text-[#111b21]',
                                unread ? 'font-semibold' : 'font-normal'
                              )}
                            >
                              {title}
                            </p>
                            <span
                              className={cn(
                                'shrink-0 text-[12px]',
                                unread ? 'font-medium text-[#25d366]' : 'text-[#667781]'
                              )}
                            >
                              {formatThreadTime(t.last_at)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p
                              className={cn(
                                'min-w-0 flex-1 truncate text-[14px]',
                                failed
                                  ? 'text-red-600'
                                  : unread
                                    ? 'font-medium text-[#111b21]'
                                    : 'text-[#667781]'
                              )}
                            >
                              {failed ? 'Not delivered · ' : ''}
                              {t.last_direction === 'outbound' ? (
                                <span className="mr-0.5 inline-flex align-middle">
                                  <WhatsAppTicks status={t.last_status} failed={failed} />
                                </span>
                              ) : null}
                              {t.last_body}
                            </p>
                            {unread ? (
                              <span className="flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">
                                1
                              </span>
                            ) : null}
                            {!open && !failed ? (
                              <span
                                className="hidden shrink-0 rounded bg-[#fff3e0] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#ef6c00] md:inline"
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
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-[#1a1a1a] text-white shadow-lg transition active:scale-95 md:hidden"
            title="New chat"
            aria-label="New chat"
          >
            <MessageSquarePlus className="h-7 w-7" />
          </button>
        </aside>

        {/* Chat pane — sticky header + scroll messages + sticky composer */}
        <section
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#efeae2]',
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
              <div className="rounded-2xl border-2 border-dashed border-[#25d366] bg-white px-8 py-10 text-center shadow-xl">
                <Paperclip className="mx-auto mb-2 h-8 w-8 text-[#25d366]" />
                <p className="text-sm font-semibold text-[#111b21]">Drop photo or PDF</p>
                <p className="mt-1 text-xs text-[#667781]">JPEG, PNG, WebP, PDF · max 4MB</p>
              </div>
            </div>
          ) : null}

          {!selectedPhone ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#f0f2f5] p-8 text-center">
              <img
                src="/whatsapp.png"
                alt=""
                className="h-20 w-20 object-contain opacity-90"
                width={80}
                height={80}
              />
              <p className="text-[28px] font-light text-[#41525d]">WhatsApp CRM</p>
              <p className="max-w-md text-sm text-[#667781]">
                Select a chat on the left, or start a new one. Only the chat list and messages
                scroll — headers stay fixed.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  className="cursor-pointer bg-[#25d366] text-white hover:bg-[#1da851]"
                  onClick={() => setNewChatOpen(true)}
                >
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  New chat
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-1 border-b border-[#d1d7db] bg-[#f0f2f5] px-2 py-2 sm:gap-2 sm:px-4">
                <button
                  type="button"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 md:hidden"
                  onClick={() => setSelectedPhone(null)}
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <WhatsAppAvatar name={activeThread?.customer_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium text-[#111b21]">
                    {activeThread?.customer_name || displayPhone(selectedPhone)}
                  </p>
                  <p className="truncate text-[12px] text-[#667781]">
                    {activeThread?.customer_name ? `${displayPhone(selectedPhone)} · ` : ''}
                    {getDocumentBrandLabel(threadBrand)}
                    {' · '}
                    {windowOpen
                      ? `Window open · ~${hoursLeft ?? '?'}h left`
                      : '24h window closed'}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
                  title="Copy number"
                  onClick={() => void copyPhone()}
                >
                  <Copy className="h-4 w-4" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 disabled:opacity-40"
                      title="Quick actions"
                      disabled={quickActionBusy}
                    >
                      {quickActionBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setWaterFilterOpen(true)}
                    >
                      Water Filter Service
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('book_service')}
                    >
                      Book service
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('request_location')}
                    >
                      Request location
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={quickActionBusy}
                      onClick={() => setQuickActionConfirm('request_photo')}
                    >
                      Request photo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 disabled:opacity-40"
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
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
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
                      onClick={() => void runPurge({ phoneE164: selectedPhone })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete chat (+ files)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-12"
                style={{
                  backgroundColor: '#efeae2',
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M10 10h4v4h-4zm20 8h3v3h-3zm30-4h2v2h-2zM14 40h5v5h-5zm40 10h4v4h-4zM50 20h3v3h-3z\' fill=\'%23d1d7db\' fill-opacity=\'0.35\'/%3E%3C/svg%3E")',
                }}
              >
                {threadLoading ? (
                  <div className="flex justify-center py-10 text-sm text-[#667781]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading chat…
                  </div>
                ) : threadMessages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-[#667781]">
                    No messages yet — say hello or send a template
                  </p>
                ) : (
                  threadMessages.map((m, i) => {
                    const outbound = m.direction === 'outbound';
                    const failed =
                      outbound &&
                      (isFailedDeliveryStatus(m.status) || Boolean(m.error_message?.trim()));
                    const prev = threadMessages[i - 1];
                    const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                    const botState = isBookingBotStateMessage(m.body);
                    const imageSrc =
                      mediaUrlCache[m.id] ||
                      (!isR2MediaRef(m.media_url || '') &&
                      /^https:\/\//i.test(m.media_url || '')
                        ? m.media_url
                        : null);

                    if (botState) {
                      return (
                        <div key={m.id}>
                          {showDay ? (
                            <div className="my-3 flex justify-center">
                              <span className="rounded-lg bg-[#e1f2fa] px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-sm">
                                {formatDaySeparator(m.created_at)}
                              </span>
                            </div>
                          ) : null}
                          <div className="my-2 flex justify-center px-2">
                            <div className="max-w-[90%] rounded-lg border border-[#d1d7db] bg-[#fffef5] px-3 py-2 text-left shadow-sm sm:max-w-[70%]">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8696a0]">
                                Booking bot (internal)
                              </p>
                              <p className="whitespace-pre-wrap break-words text-[13px] leading-[18px] text-[#3b4a54]">
                                {formatAdminWhatsAppBody(m.body, { compact: false })}
                              </p>
                              <p className="mt-1 text-right text-[10px] text-[#8696a0]">
                                {formatBubbleTime(m.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id}>
                        {showDay ? (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-lg bg-[#e1f2fa] px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-sm">
                              {formatDaySeparator(m.created_at)}
                            </span>
                          </div>
                        ) : null}
                        <div
                          className={cn('mb-1 flex', outbound ? 'justify-end' : 'justify-start')}
                        >
                          <div
                            className={cn(
                              'relative max-w-[85%] rounded-lg px-2 pb-1 pt-1.5 shadow-sm sm:max-w-[65%]',
                              failed
                                ? 'rounded-br-none border border-red-300 bg-[#ffebee] text-[#111b21]'
                                : outbound
                                  ? 'rounded-br-none bg-[#d9fdd3] text-[#111b21]'
                                  : 'rounded-bl-none bg-white text-[#111b21]'
                            )}
                          >
                            {failed ? (
                              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
                                Not delivered
                              </p>
                            ) : null}
                            {m.media_url ? (
                              m.msg_type === 'image' || m.media_mime?.startsWith('image/') ? (
                                <div className="group relative mb-1 overflow-hidden rounded-md">
                                  <button
                                    type="button"
                                    className="block w-full cursor-pointer text-left"
                                    onClick={() => void openMedia(m)}
                                  >
                                    {imageSrc ? (
                                      <img
                                        src={imageSrc}
                                        alt={m.filename || 'Photo'}
                                        className="max-h-64 w-full min-w-[180px] rounded-md object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span className="flex h-32 w-48 items-center justify-center rounded-md bg-black/5 text-xs text-[#667781]">
                                        Loading photo…
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void downloadMedia(m)}
                                    className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white opacity-90 shadow transition hover:bg-black/70 sm:opacity-0 sm:group-hover:opacity-100"
                                    title="Download"
                                    aria-label="Download photo"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
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
                                <div className="mb-1 flex min-w-[200px] max-w-[260px] items-center gap-2 rounded-md bg-black/5 px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => void openMedia(m)}
                                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                                  >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
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
                                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
                                    title="Download"
                                    aria-label="Download file"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                </div>
                              )
                            ) : null}
                            {(() => {
                              const text = formatAdminWhatsAppBody(m.body, { compact: false });
                              const preview = previewMessageBody(m);
                              const file = (m.filename || '').trim();
                              if (
                                m.media_url &&
                                file &&
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
                                <p className="whitespace-pre-wrap break-words px-1 text-[14.2px] leading-[19px]">
                                  {text}
                                </p>
                              );
                            })()}
                            <div
                              className={cn(
                                'mt-0.5 flex items-center justify-end gap-1 px-1',
                                failed ? 'text-red-600' : 'text-[#667781]'
                              )}
                            >
                              <span className="text-[11px] leading-none">
                                {formatBubbleTime(m.created_at)}
                              </span>
                              {outbound ? (
                                <WhatsAppTicks status={m.status} failed={failed} />
                              ) : null}
                            </div>
                            {m.error_message ? (
                              <p className="mt-1 px-1 text-[11px] font-medium text-red-600">
                                {m.error_message}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="shrink-0 bg-[#f0f2f5] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
                {!windowOpen ? (
                  <div className="mb-2 max-h-[36vh] space-y-2 overflow-y-auto overscroll-contain rounded-xl bg-white p-3 shadow-sm sm:max-h-none">
                    <p className="text-xs text-[#ef6c00]">
                      Free-form reply needs an open 24h window. Send an approved template to reopen.
                    </p>
                    <WhatsAppQuickContextFields
                      amount={quickAmount}
                      whenLabel={quickWhen}
                      technicianName={quickTech}
                      skipBrandLabel={quickSkipBrand}
                      onAmountChange={setQuickAmount}
                      onWhenChange={setQuickWhen}
                      onTechnicianChange={setQuickTech}
                      onSkipBrandLabelChange={setQuickSkipBrand}
                    />
                    <WhatsAppQuickRepliesBar
                      context={quickReplyContext}
                      windowOpen={false}
                      showTemplates
                      approvedTemplateNames={approvedTemplateNames}
                      disabled={sending || templatesLoading || quickActionBusy}
                      onSendTemplate={handleQuickTemplateSend}
                      onPickTemplate={pickQuickTemplate}
                      onStartBookLocationPhoto={() => void runQuickAction('book_location_photo')}
                      onRequestLocation={() => runQuickAction('request_location')}
                      onRequestPhoto={() => runQuickAction('request_photo')}
                      onStartWaterFilterService={() => runQuickAction('water_filter_service')}
                    />
                    {templatesLoading ? (
                      <p className="flex items-center gap-2 text-xs text-[#667781]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading templates…
                      </p>
                    ) : null}
                    {templatesError ? (
                      <p className="text-xs text-red-600">{templatesError}</p>
                    ) : null}
                    {templatesHint ? (
                      <p className="text-xs text-[#667781]">{templatesHint}</p>
                    ) : null}
                    {templates.length > 0 ? (
                      <>
                        <Select
                          value={selectedTemplateKey || undefined}
                          onValueChange={(v) => setSelectedTemplateKey(v)}
                          disabled={sending}
                        >
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="Choose template" />
                          </SelectTrigger>
                          <SelectContent>
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
                        {selectedTemplate?.bodyPreview ? (
                          <p className="rounded-md bg-[#f0f2f5] px-2 py-1.5 text-[11px] text-[#667781] whitespace-pre-wrap">
                            {selectedTemplate.bodyPreview}
                          </p>
                        ) : null}
                        {(selectedTemplate?.bodyParamCount ?? 0) > 0
                          ? templateParams.map((val, i) => (
                              <Input
                                key={i}
                                value={val}
                                onChange={(e) => {
                                  const next = [...templateParams];
                                  next[i] = e.target.value;
                                  setTemplateParams(next);
                                }}
                                placeholder={`Variable {{${i + 1}}}`}
                                className="h-9"
                                disabled={sending}
                              />
                            ))
                          : null}
                        <Button
                          type="button"
                          className="h-10 w-full cursor-pointer bg-[#25d366] text-white hover:bg-[#1da851]"
                          disabled={!selectedTemplate || sending}
                          onClick={() => void handleSendTemplate()}
                        >
                          {sending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Send template
                        </Button>
                      </>
                    ) : !templatesLoading && !templatesError ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => void loadTemplates()}
                      >
                        Refresh templates
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {windowOpen ? (
                  <div className="space-y-2">
                    <WhatsAppQuickContextFields
                      amount={quickAmount}
                      whenLabel={quickWhen}
                      technicianName={quickTech}
                      skipBrandLabel={quickSkipBrand}
                      onAmountChange={setQuickAmount}
                      onWhenChange={setQuickWhen}
                      onTechnicianChange={setQuickTech}
                      onSkipBrandLabelChange={setQuickSkipBrand}
                    />
                    <WhatsAppQuickRepliesBar
                      context={quickReplyContext}
                      windowOpen
                      showTemplates
                      approvedTemplateNames={approvedTemplateNames}
                      disabled={sending || quickActionBusy}
                      onInsertText={(text) => setDraft(text)}
                      onSendText={handleSendText}
                      onSendTemplate={handleQuickTemplateSend}
                      onPickTemplate={pickQuickTemplate}
                      onStartBookLocationPhoto={() => void runQuickAction('book_location_photo')}
                      onRequestLocation={() => runQuickAction('request_location')}
                      onRequestPhoto={() => runQuickAction('request_photo')}
                      onStartWaterFilterService={() => runQuickAction('water_filter_service')}
                    />
                    {attachFile ? (
                      <div className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 shadow-sm">
                        {attachPreviewUrl ? (
                          <img
                            src={attachPreviewUrl}
                            alt=""
                            className="h-11 w-11 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#f0f2f5] text-[10px] font-semibold uppercase text-[#54656f]">
                            PDF
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-[#111b21]">
                            {attachFile.name}
                          </p>
                          <p className="text-[10px] text-[#667781]">
                            {(attachFile.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
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
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 disabled:opacity-50"
                        disabled={sending}
                        title="Attach image or PDF"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-5 w-5 rotate-45" />
                      </button>
                      <div className="relative flex min-h-[44px] flex-1 items-end rounded-[24px] bg-white px-3 py-1.5 shadow-sm">
                        <Textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={attachFile ? 'Add a caption' : 'Type a message'}
                          disabled={sending}
                          rows={1}
                          className="max-h-[28vh] min-h-[28px] flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-[15px] text-[#111b21] shadow-none placeholder:text-[#667781] focus-visible:ring-0"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleSend();
                            }
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
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#25d366] text-white shadow transition hover:bg-[#1da851] disabled:opacity-40"
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
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

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
              className="bg-[#25d366] text-white hover:bg-[#1da851]"
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
        onStarted={(phoneE164) => {
          setSelectedPhone(phoneE164);
          void loadInbox({ soft: true });
          void loadThread(phoneE164, { soft: true });
        }}
      />

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
                ? QUICK_ACTION_LABELS[quickActionConfirm]
                : 'Quick action'}
            </DialogTitle>
            <DialogDescription>
              {windowOpen
                ? 'Starts the booking bot on WhatsApp (step-by-step). Customer replies in this chat.'
                : '24h window is closed — sends an approved cold template and resumes the bot when they reply.'}
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
              className="bg-[#25d366] text-white hover:bg-[#1da851]"
              disabled={!quickActionConfirm || quickActionBusy}
              onClick={() =>
                quickActionConfirm ? void runQuickAction(quickActionConfirm) : undefined
              }
            >
              {quickActionBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : windowOpen ? (
                'Start on WhatsApp'
              ) : (
                'Send template & wait'
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
    </div>
  );
}
