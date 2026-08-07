import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Search, Send } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import {
  WHATSAPP_INBOX_COLUMNS,
  WHATSAPP_INBOX_LIST_LIMIT,
  WHATSAPP_THREAD_LIMIT,
  buildThreadsFromMessages,
  countUnreadWhatsAppThreads,
  displayPhone,
  formatBubbleTime,
  formatThreadTime,
  hoursLeftInWindow,
  invalidateInboundWindowCache,
  isFailedDeliveryStatus,
  isWhatsAppThreadUnread,
  isWithinCustomerServiceWindow,
  loadWhatsAppReadMap,
  markWhatsAppThreadRead,
  previewMessageBody,
  type WhatsAppMessageRow,
  type WhatsAppThread,
} from '@/lib/whatsappInbox';
import {
  fetchApprovedWhatsAppTemplates,
  sendAdminWhatsAppTemplate,
  sendAdminWhatsAppText,
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
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [nameByCustomerId, setNameByCustomerId] = useState<Map<string, string>>(new Map());
  const [selectedPhone, setSelectedPhone] = useState<string | null>(
    initialPhone ? String(initialPhone).replace(/\D/g, '') : null
  );
  const [threadMessages, setThreadMessages] = useState<WhatsAppMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState<WhatsAppTemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesHint, setTemplatesHint] = useState<string | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [readMap, setReadMap] = useState<Record<string, string>>(() => loadWhatsAppReadMap());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const selectedPhoneRef = useRef(selectedPhone);
  selectedPhoneRef.current = selectedPhone;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!initialPhone) return;
    const digits = String(initialPhone).replace(/\D/g, '');
    if (digits) setSelectedPhone(digits);
  }, [initialPhone]);

  const loadInbox = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(WHATSAPP_INBOX_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(WHATSAPP_INBOX_LIST_LIMIT);

      if (error) {
        toast.error(error.message || 'Failed to load WhatsApp messages');
        return;
      }

      const rows = (data || []) as WhatsAppMessageRow[];
      setMessages(rows);

      const customerIds = [
        ...new Set(rows.map((r) => r.customer_id).filter(Boolean) as string[]),
      ].slice(0, 80);

      if (customerIds.length) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds);
        const map = new Map<string, string>();
        for (const c of customers || []) {
          if (c?.id) map.set(c.id, c.name || 'Customer');
        }
        setNameByCustomerId(map);
      } else {
        setNameByCustomerId(new Map());
      }
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
        .order('created_at', { ascending: true })
        .limit(WHATSAPP_THREAD_LIMIT);
      if (error) {
        toast.error(error.message || 'Failed to load chat');
        return;
      }
      setThreadMessages((data || []) as WhatsAppMessageRow[]);
    } finally {
      if (!opts?.soft) setThreadLoading(false);
    }
  }, []);

  const upsertMessageLocal = useCallback((row: WhatsAppMessageRow) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === row.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...row };
        return next;
      }
      return [row, ...prev].slice(0, WHATSAPP_INBOX_LIST_LIMIT);
    });
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
    const cached = messagesRef.current
      .filter((m) => m.phone_e164 === selectedPhone)
      .slice()
      .sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    if (cached.length) setThreadMessages(cached);
    void loadThread(selectedPhone);
  }, [selectedPhone, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length, selectedPhone]);

  // Realtime: patch locally; soft-reload list at most every 12s (no 3s polling)
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
            setMessages((prev) => prev.filter((m) => m.id !== row.id));
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

  const threads = useMemo(
    () => buildThreadsFromMessages(messages, nameByCustomerId),
    [messages, nameByCustomerId]
  );

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
    if (!selectedPhone || !text || sending) return;
    if (!windowOpen) {
      toast.error('24-hour window closed — use an approved template below');
      return;
    }
    setSending(true);
    try {
      const result = await sendAdminWhatsAppText({
        to: selectedPhone,
        text,
        customerId: activeThread?.customer_id,
        fallbackWaMe: false,
      });
      if (!result.ok) {
        toast.error(result.error || 'Send failed');
        return;
      }
      setDraft('');
      toast.success('Sent');
      // Realtime patches the thread; one soft list refresh is enough
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
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filteredThreads.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No WhatsApp threads in the last 7 days.
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
            'flex min-w-0 flex-1 flex-col bg-[#eef6fb]',
            showList && !showChat ? 'hidden md:flex' : 'flex'
          )}
        >
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
                              <a href={m.media_url} target="_blank" rel="noreferrer">
                                <img
                                  src={m.media_url}
                                  alt=""
                                  className="mb-1 max-h-48 rounded-md object-cover"
                                  loading="lazy"
                                />
                              </a>
                            ) : (
                              <a
                                href={m.media_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-1 block text-xs text-sky-700 underline"
                              >
                                {m.filename || 'Open attachment'}
                              </a>
                            )
                          ) : null}
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {previewMessageBody(m)}
                          </p>
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
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a message"
                      disabled={sending}
                      rows={2}
                      className="min-h-[44px] max-h-[30vh] flex-1 resize-none text-base sm:text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-11 w-11 shrink-0 bg-sky-700 hover:bg-sky-800 sm:w-auto sm:px-4"
                      disabled={!draft.trim() || sending}
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
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
