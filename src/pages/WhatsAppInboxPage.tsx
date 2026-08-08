import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Paperclip, RefreshCw, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { supabase } from '@/lib/supabaseClient';
import {
  WHATSAPP_INBOX_COLUMNS,
  WHATSAPP_THREAD_LIMIT,
  countUnreadWhatsAppThreads,
  displayPhone,
  fetchWhatsAppInboxThreads,
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
  type WhatsAppMessageRow,
  type WhatsAppThread,
} from '@/lib/whatsappInbox';
import { WhatsAppPdfThumbnail } from '@/components/whatsapp/WhatsAppPdfThumbnail';
import {
  fetchApprovedWhatsAppTemplates,
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

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
  /** Optional: open a phone thread immediately (digits). */
  initialPhone?: string | null;
};

export default function WhatsAppInboxPage({ hideHeader, onBack, initialPhone }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [threads, setThreads] = useState<WhatsAppThread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(
    initialPhone ? String(initialPhone).replace(/\D/g, '') : null
  );
  const [threadMessages, setThreadMessages] = useState<WhatsAppMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [purging, setPurging] = useState(false);
  const [query, setQuery] = useState('');
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
  const bottomRef = useRef<HTMLDivElement | null>(null);
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
      const result = await fetchWhatsAppInboxThreads(supabase);
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

  const openMedia = useCallback(
    async (row: WhatsAppMessageRow) => {
      const ref = row.media_url;
      if (!ref) return;
      if (!isR2MediaRef(ref) && /^https:\/\//i.test(ref)) {
        window.open(ref, '_blank', 'noopener,noreferrer');
        return;
      }
      const cached = mediaUrlCache[row.id];
      if (cached) {
        window.open(cached, '_blank', 'noopener,noreferrer');
        return;
      }
      const toastId = toast.loading('Opening attachment…');
      const signed = await fetchWhatsAppR2SignedUrl({
        mediaUrl: ref,
        messageId: row.id,
      });
      if (!signed.ok || !signed.url) {
        toast.error(signed.error || 'Could not open attachment', { id: toastId });
        return;
      }
      setMediaUrlCache((prev) => ({ ...prev, [row.id]: signed.url! }));
      toast.dismiss(toastId);
      window.open(signed.url, '_blank', 'noopener,noreferrer');
    },
    [mediaUrlCache]
  );

  // Prefetch signed URLs for image bubbles in the open thread
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const m of threadMessages) {
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
        ? `Delete chat for ${displayPhone(opts.phoneE164)}?`
        : `Delete messages older than ${opts.olderThanDays} days (text + R2 media)?`;
      if (!window.confirm(label)) return;
      setPurging(true);
      const toastId = toast.loading('Cleaning up…');
      try {
        const dry = await purgeWhatsAppMessages({ ...opts, dryRun: true });
        if (!dry.ok) {
          toast.error(dry.error || 'Cleanup failed', { id: toastId });
          return;
        }
        const n = dry.wouldDeleteRows ?? 0;
        if (n === 0) {
          toast.message('Nothing to delete', { id: toastId });
          return;
        }
        if (!window.confirm(`This will permanently delete ${n} message(s). Continue?`)) {
          toast.dismiss(toastId);
          return;
        }
        const result = await purgeWhatsAppMessages(opts);
        if (!result.ok) {
          toast.error(result.error || 'Cleanup failed', { id: toastId });
          return;
        }
        toast.success(
          `Deleted ${result.deletedRows ?? 0} messages` +
            (result.deletedMedia ? ` · ${result.deletedMedia} files` : ''),
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length, selectedPhone]);

  // Realtime: patch thread list + open chat; soft-reload people list at most every 12s
  useEffect(() => {
    let softReloadTimer: number | null = null;
    let lastSoftReload = 0;

    const scheduleSoftReload = () => {
      const now = Date.now();
      if (now - lastSoftReload < 12_000) return;
      if (softReloadTimer != null) return;
      softReloadTimer = window.setTimeout(() => {
        softReloadTimer = null;
        lastSoftReload = Date.now();
        void loadInbox({ soft: true });
      }, 1500);
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
    return threads.find((t) => t.phone_e164 === selectedPhone) || null;
  }, [threads, selectedPhone]);

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
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name = (t.customer_name || '').toLowerCase();
      const phone = t.phone_e164;
      const preview = (t.last_body || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || preview.includes(q);
    });
  }, [threads, query]);

  const windowOpen = isWithinCustomerServiceWindow(activeThread?.inbound_at);
  const hoursLeft = hoursLeftInWindow(activeThread?.inbound_at);

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateKey) return null;
    return templates.find((t) => `${t.name}::${t.language}` === selectedTemplateKey) || null;
  }, [templates, selectedTemplateKey]);

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
    if (!windowOpen && selectedPhone) {
      void loadTemplates();
    }
  }, [windowOpen, selectedPhone, loadTemplates]);

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

  const showList = !selectedPhone;
  const showChat = Boolean(selectedPhone);

  return (
    <div className="flex h-[min(100dvh,900px)] min-h-[min(70vh,100dvh)] flex-col overflow-hidden border-border bg-card shadow-sm md:rounded-lg md:border">
      {!hideHeader ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          ) : null}
          <img
            src="/whatsapp.png"
            alt=""
            className="h-7 w-7 rounded-md object-contain"
            width={28}
            height={28}
          />
          <h1 className="text-base font-semibold text-foreground sm:text-lg">WhatsApp</h1>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Thread list */}
        <aside
          className={cn(
            'flex w-full flex-col border-border bg-background md:w-[340px] md:border-r',
            showChat ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or phone"
                className="h-10 pl-8"
              />
            </div>
            {unreadCount > 0 ? (
              <span
                className="shrink-0 rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                title="Unread chats"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => void loadInbox({ soft: true })}
              disabled={refreshing}
              title="Refresh"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={purging}
                  title="Cleanup"
                >
                  {purging ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Delete older than</DropdownMenuLabel>
                {[30, 90, 180, 365].map((days) => (
                  <DropdownMenuItem
                    key={days}
                    onClick={() => void runPurge({ olderThanDays: days })}
                  >
                    {days} days
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-700"
                  disabled={!selectedPhone}
                  onClick={() =>
                    selectedPhone ? void runPurge({ phoneE164: selectedPhone }) : undefined
                  }
                >
                  Delete this chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filteredThreads.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No WhatsApp conversations yet.
              </p>
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
                  return (
                    <li key={t.phone_e164}>
                      <button
                        type="button"
                        onClick={() => setSelectedPhone(t.phone_e164)}
                        className={cn(
                          'flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors',
                          active ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-muted/50'
                        )}
                      >
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50">
                          <img
                            src="/whatsapp.png"
                            alt=""
                            className="h-6 w-6 object-contain"
                            width={24}
                            height={24}
                          />
                          {unread ? (
                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-600 ring-2 ring-background" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={cn(
                                'truncate text-sm text-foreground',
                                unread ? 'font-semibold' : 'font-medium'
                              )}
                            >
                              {t.customer_name || displayPhone(t.phone_e164)}
                            </p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatThreadTime(t.last_at)}
                            </span>
                          </div>
                          {t.customer_name ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {displayPhone(t.phone_e164)}
                            </p>
                          ) : null}
                          <p
                            className={cn(
                              'mt-0.5 truncate text-xs',
                              failed
                                ? 'font-medium text-red-700'
                                : unread
                                  ? 'font-medium text-foreground'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {failed ? 'Failed · ' : ''}
                            {t.last_direction === 'outbound' ? 'You: ' : ''}
                            {t.last_body}
                          </p>
                          <p
                            className={cn(
                              'mt-1 text-[10px] font-medium uppercase tracking-wide',
                              failed
                                ? 'text-red-700'
                                : open
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                            )}
                          >
                            {failed ? 'Delivery failed' : open ? 'Window open' : 'Window closed'}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Chat pane */}
        <section
          className={cn(
            'relative flex min-w-0 flex-1 flex-col bg-[#eef6fb]',
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
            const file = e.dataTransfer.files?.[0];
            pickAttachFile(file);
          }}
        >
          {dragOver && windowOpen ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-sky-900/40 px-4">
              <div className="rounded-xl border-2 border-dashed border-white bg-white/95 px-6 py-8 text-center shadow-lg">
                <Paperclip className="mx-auto mb-2 h-8 w-8 text-sky-700" />
                <p className="text-sm font-semibold text-slate-900">Drop image or PDF</p>
                <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP, PDF · max 4MB</p>
              </div>
            </div>
          ) : null}
          {!selectedPhone ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <img
                src="/whatsapp.png"
                alt=""
                className="h-14 w-14 object-contain opacity-90"
                width={56}
                height={56}
              />
              <p className="text-sm">Select a chat to reply</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border bg-card px-2 py-2 sm:px-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedPhone(null)}
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50">
                  <img
                    src="/whatsapp.png"
                    alt=""
                    className="h-5 w-5 object-contain"
                    width={20}
                    height={20}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {activeThread?.customer_name || displayPhone(selectedPhone)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {activeThread?.customer_name ? displayPhone(selectedPhone) : null}
                    {windowOpen
                      ? ` · ~${hoursLeft ?? '?'}h left to reply`
                      : ' · 24h window closed'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-red-700"
                  title="Delete this chat"
                  disabled={purging}
                  onClick={() => void runPurge({ phoneE164: selectedPhone })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
                {threadLoading ? (
                  <div className="flex justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading chat…
                  </div>
                ) : threadMessages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No messages</p>
                ) : (
                  threadMessages.map((m) => {
                    const outbound = m.direction === 'outbound';
                    const failed =
                      outbound &&
                      (isFailedDeliveryStatus(m.status) || Boolean(m.error_message?.trim()));
                    return (
                      <div
                        key={m.id}
                        className={cn('flex', outbound ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[70%]',
                            failed
                              ? 'rounded-br-sm border border-red-300 bg-red-50 text-slate-900'
                              : outbound
                                ? 'rounded-br-sm bg-sky-100 text-slate-900'
                                : 'rounded-bl-sm bg-white text-slate-900'
                          )}
                        >
                          {failed ? (
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-700">
                              Not delivered
                            </p>
                          ) : null}
                          {m.media_url ? (
                            m.msg_type === 'image' || m.media_mime?.startsWith('image/') ? (
                              <button
                                type="button"
                                className="mb-1 block max-w-full overflow-hidden rounded-md text-left"
                                onClick={() => void openMedia(m)}
                              >
                                {mediaUrlCache[m.id] ||
                                (!isR2MediaRef(m.media_url) &&
                                  /^https:\/\//i.test(m.media_url)) ? (
                                  <img
                                    src={
                                      mediaUrlCache[m.id] ||
                                      (!isR2MediaRef(m.media_url) ? m.media_url : '') ||
                                      ''
                                    }
                                    alt={m.filename || 'Photo'}
                                    className="max-h-52 w-full rounded-md object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className="flex h-28 w-44 items-center justify-center rounded-md bg-slate-200/80 text-xs text-sky-800">
                                    Tap to load photo
                                  </span>
                                )}
                              </button>
                            ) : m.media_mime?.includes('pdf') ||
                              /\.pdf$/i.test(m.filename || '') ||
                              m.msg_type === 'document' ||
                              m.msg_type === 'pdf' ? (
                              <WhatsAppPdfThumbnail
                                messageId={m.id}
                                mediaUrl={m.media_url}
                                filename={m.filename}
                                onOpen={() => void openMedia(m)}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => void openMedia(m)}
                                className="mb-1 flex w-full min-w-[200px] max-w-[260px] items-center gap-3 rounded-md border border-slate-200/80 bg-white/90 px-3 py-2.5 text-left shadow-sm transition hover:bg-white"
                              >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
                                  <FileText className="h-6 w-6" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-slate-900">
                                    {m.filename || 'Document'}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-slate-500">
                                    File · Tap to open
                                  </span>
                                </span>
                              </button>
                            )
                          ) : null}
                          {(() => {
                            const text = previewMessageBody(m);
                            const file = (m.filename || '').trim();
                            // Avoid repeating filename under the document card
                            if (
                              m.media_url &&
                              file &&
                              (text === file || text === `📄 ${file}` || text === '📄 Document')
                            ) {
                              return null;
                            }
                            if (m.media_url && !m.body?.trim() && (m.msg_type === 'document' || m.msg_type === 'pdf' || m.msg_type === 'image')) {
                              return null;
                            }
                            if (!text?.trim()) return null;
                            return (
                              <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
                            );
                          })()}
                          <div
                            className={cn(
                              'mt-1 flex items-center justify-end gap-2 text-[10px]',
                              failed ? 'text-red-700' : 'text-slate-500'
                            )}
                          >
                            <span>{formatBubbleTime(m.created_at)}</span>
                            {outbound && m.status ? (
                              <span className="uppercase">{m.status}</span>
                            ) : null}
                          </div>
                          {m.error_message ? (
                            <p className="mt-1 text-[11px] font-medium text-red-700">
                              {m.error_message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border bg-card p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-3">
                {!windowOpen ? (
                  <div className="mb-3 max-h-[40vh] space-y-2 overflow-y-auto sm:max-h-none">
                    <p className="text-xs text-amber-800">
                      Free-form text needs an open 24h window. Send an approved template to reopen
                      the conversation.
                    </p>
                    {templatesLoading ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading templates…
                      </p>
                    ) : null}
                    {templatesError ? (
                      <p className="text-xs text-red-600">{templatesError}</p>
                    ) : null}
                    {templatesHint ? (
                      <p className="text-xs text-muted-foreground">{templatesHint}</p>
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
                              <SelectItem key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                                {t.name} ({t.language})
                                {t.category ? ` · ${t.category}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedTemplate?.bodyPreview ? (
                          <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap">
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
                          className="h-10 w-full bg-sky-700 hover:bg-sky-800"
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
                        onClick={() => void loadTemplates()}
                      >
                        Refresh templates
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {windowOpen ? (
                  <div className="space-y-2">
                    {attachFile ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                        {attachPreviewUrl ? (
                          <img
                            src={attachPreviewUrl}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-200 text-[10px] font-semibold uppercase text-slate-700">
                            PDF
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {attachFile.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {(attachFile.size / 1024).toFixed(0)} KB · sent via Cloud API
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          disabled={sending}
                          onClick={clearAttach}
                          aria-label="Remove attachment"
                        >
                          <X className="h-4 w-4" />
                        </Button>
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
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        disabled={sending}
                        title="Attach image or PDF"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={attachFile ? 'Caption (optional)' : 'Type a message or drop a file'}
                        disabled={sending}
                        rows={2}
                        className="min-h-[44px] max-h-[30vh] flex-1 resize-none text-base sm:text-sm"
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
                      <Button
                        type="button"
                        className="h-11 w-11 shrink-0 bg-sky-700 hover:bg-sky-800 sm:w-auto sm:px-4"
                        disabled={sending || (!draft.trim() && !attachFile)}
                        onClick={() => void handleSend()}
                        aria-label="Send"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Send</span>
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Attach or drag &amp; drop JPEG / PNG / WebP / PDF (max 4MB). Needs open 24h
                      window.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
