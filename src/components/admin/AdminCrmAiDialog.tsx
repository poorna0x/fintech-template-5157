import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowUp,
  Bell,
  Briefcase,
  CalendarClock,
  ImagePlus,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Search,
  Settings,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import {
  requestAiCrmChat,
  type AiCrmChatResult,
  type AiCrmCreateCustomerAndJobDraft,
  type AiCrmCreateJobDraft,
  type AiCrmCustomerDraft,
  type AiCrmEditCustomerDraft,
  type AiCrmFollowUpDraft,
  type AiCrmProposedAction,
  type AiCrmReminderDraft,
  type AiCrmAppTarget,
  type AiCrmOpenDocumentDraft,
  type AiCrmOpenJobDraft,
  type AiCrmOpenCustomerComposer,
} from '@/lib/aiCrmAssistant';
import { cloudinaryService, compressImage, validateImageFile } from '@/lib/cloudinary';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';
import { toast } from 'sonner';

type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  result?: Extract<AiCrmChatResult, { ok: true }>;
  error?: string;
};

type AdminCrmAiDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchCustomer: (query: string, customerId?: string) => void;
  onConfirmCreateCustomer: (draft: AiCrmCustomerDraft) => void;
  onConfirmCreateCustomerAndJob: (draft: AiCrmCreateCustomerAndJobDraft) => void;
  onConfirmEditCustomer: (draft: AiCrmEditCustomerDraft) => void;
  onConfirmCreateJob: (draft: AiCrmCreateJobDraft) => void;
  onConfirmFollowUp: (draft: AiCrmFollowUpDraft) => void;
  onConfirmReminder: (draft: AiCrmReminderDraft) => void;
  onOpenApp: (target: AiCrmAppTarget) => void;
  onOpenDocumentDraft: (draft: AiCrmOpenDocumentDraft) => void;
  onOpenJob: (draft: AiCrmOpenJobDraft) => void;
  onOpenCustomerComposer: (draft: AiCrmOpenCustomerComposer) => void;
};

function formatInr(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

function entityCount(result: Extract<AiCrmChatResult, { ok: true }> | undefined) {
  if (!result) return 0;
  return Object.values(result.entities).reduce((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0);
}

export default function AdminCrmAiDialog({
  open,
  onOpenChange,
  onSearchCustomer,
  onConfirmCreateCustomer,
  onConfirmCreateCustomerAndJob,
  onConfirmEditCustomer,
  onConfirmCreateJob,
  onConfirmFollowUp,
  onConfirmReminder,
  onOpenApp,
  onOpenDocumentDraft,
  onOpenJob,
  onOpenCustomerComposer,
}: AdminCrmAiDialogProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set());
  const [attachments, setAttachments] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { ref: inputRef } = useAutoGrowTextarea(input);
  const conversationId = useMemo(
    () => `crm-ai-${Date.now().toString(36)}`,
    // Reset conversation id when dialog closes/reopens via key on parent if needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  useEffect(() => {
    if (!open) {
      setInput('');
      setLoading(false);
      setActionBusy(false);
      setExpandedDetails(new Set());
      setAttachments((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Keep the composer ready for the next question once a reply lands. Skipped
    // on touch-only devices so the on-screen keyboard does not cover the answer.
    if (loading) return;
    if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [open, turns, loading, inputRef]);

  const send = async () => {
    const message = input.trim();
    if (message.length < 2 || loading) return;

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: message,
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setLoading(true);

    const result = await requestAiCrmChat({
      message,
      conversationId,
      history: turns
        .filter((turn) => !turn.error)
        .slice(-8)
        .map(({ role, text }) => ({ role, text })),
    });

    if ('error' in result) {
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: '',
          error: result.error,
        },
      ]);
      setLoading(false);
      return;
    }

    setTurns((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: result.answer,
        result,
      },
    ]);
    setLoading(false);
  };

  const addImages = (files: File[]) => {
    const remaining = Math.max(0, 5 - attachments.length);
    const accepted: Array<{ file: File; previewUrl: string }> = [];
    for (const file of files.slice(0, remaining)) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error || 'Invalid image');
        continue;
      }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    if (files.length > remaining) toast.error('You can attach up to 5 images');
    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => {
      const item = current[index];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const uploadAttachedImages = async (): Promise<string[]> => {
    if (!attachments.length) return [];
    const urls: string[] = [];
    for (const item of attachments) {
      const compressed = await compressImage(item.file, 1280, 0.65, true);
      const uploaded = await cloudinaryService.uploadImage(compressed, 'ai-crm-drafts');
      if (uploaded?.secure_url) urls.push(uploaded.secure_url);
    }
    return urls;
  };

  const handleAction = async (action: AiCrmProposedAction) => {
    if (actionBusy) return;
    if (action.type === 'open_customer') {
      const customerId = (action.payload as { customerId?: string }).customerId;
      if (customerId) onSearchCustomer('', customerId);
      return;
    }
    if (action.type === 'open_app') {
      const target = (action.payload as { target?: AiCrmAppTarget }).target;
      if (target) onOpenApp(target);
      return;
    }
    if (action.type === 'open_document_draft') {
      onOpenDocumentDraft(action.payload as AiCrmOpenDocumentDraft);
      return;
    }
    if (action.type === 'open_job') {
      onOpenJob(action.payload as AiCrmOpenJobDraft);
      return;
    }
    if (action.type === 'open_customer_composer') {
      onOpenCustomerComposer(action.payload as AiCrmOpenCustomerComposer);
      return;
    }
    setActionBusy(true);
    let photoUrls: string[] = [];
    try {
      if (
        attachments.length &&
        (action.type === 'create_customer' || action.type === 'create_customer_and_job' || action.type === 'create_job')
      ) {
        photoUrls = await uploadAttachedImages();
      }
      if (action.type === 'create_customer') {
        onConfirmCreateCustomer({
          ...(action.payload as AiCrmCustomerDraft),
          photoUrls,
        });
        return;
      }
      if (action.type === 'create_customer_and_job') {
        onConfirmCreateCustomerAndJob({
          ...(action.payload as AiCrmCreateCustomerAndJobDraft),
          photoUrls,
        });
        return;
      }
      if (action.type === 'edit_customer') {
        onConfirmEditCustomer(action.payload as AiCrmEditCustomerDraft);
        return;
      }
      if (action.type === 'create_job') {
        onConfirmCreateJob({
          ...(action.payload as AiCrmCreateJobDraft),
          photoUrls,
        });
        return;
      }
      if (action.type === 'schedule_follow_up') {
        onConfirmFollowUp(action.payload as AiCrmFollowUpDraft);
        return;
      }
      if (action.type === 'create_reminder') {
        onConfirmReminder(action.payload as AiCrmReminderDraft);
      }
    } catch (error) {
      console.error('[CRM AI] action preparation failed', error);
      toast.error('Could not prepare the CRM form');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[92vh] w-[min(96vw,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          addImages(Array.from(event.dataTransfer.files));
        }}
      >
        <DialogHeader className="border-b px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-violet-600" />
              CRM AI
            </DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="-mr-1 h-8 w-8 shrink-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            Ask about customers, jobs, reminders, payments and documents.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {turns.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="mt-3 text-sm font-medium">How can I help?</p>
              <p className="mt-1 text-xs text-muted-foreground">Ask in your own words.</p>
            </div>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={
                turn.role === 'user'
                  ? 'ml-8 rounded-xl bg-foreground px-3 py-2 text-sm text-background'
                  : 'mr-4 rounded-xl border bg-card px-3 py-2 text-sm text-card-foreground'
              }
            >
              {turn.role === 'user' ? (
                turn.text
              ) : turn.error ? (
                <p className="text-red-700">{turn.error}</p>
              ) : (
                <div className="space-y-3">
                  <p className="whitespace-pre-wrap">{turn.text}</p>

                  {turn.result?.warnings?.length ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                      {turn.result.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}

                  {entityCount(turn.result) > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() =>
                        setExpandedDetails((current) => {
                          const next = new Set(current);
                          if (next.has(turn.id)) next.delete(turn.id);
                          else next.add(turn.id);
                          return next;
                        })
                      }
                    >
                      {expandedDetails.has(turn.id) ? 'Hide details' : 'Show details'}
                    </Button>
                  ) : null}

                  {expandedDetails.has(turn.id) && turn.result ? (
                    <>
                      {turn.result.entities.technicians?.length ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Technician billing
                          </p>
                          {turn.result.entities.technicians.slice(0, 6).map((technician, index) => (
                            <div
                              key={technician.technicianId}
                              className="flex items-center justify-between rounded-lg border bg-muted/30 px-2.5 py-2 text-xs"
                            >
                              <span>
                                <span className="font-medium">
                                  {index + 1}. {technician.name}
                                </span>
                                {technician.employeeId ? ` · ${technician.employeeId}` : ''}
                                <span className="block text-muted-foreground">
                                  {technician.completedJobs} completed {technician.completedJobs === 1 ? 'job' : 'jobs'}
                                </span>
                              </span>
                              <span className="font-semibold">{formatInr(technician.billedTotal)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {turn.result.entities.customers?.length ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {turn.result.entities.customers.some((customer) => customer.confirmedPaidTotal != null)
                              ? 'Top customers'
                              : 'Customers'}
                          </p>
                          {turn.result.entities.customers.slice(0, 6).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => onSearchCustomer(c.phone || c.name, c.id)}
                              className="flex w-full items-start justify-between rounded-lg border bg-muted/30 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted"
                            >
                              <span>
                                <span className="font-medium">{c.name}</span>
                                {c.customerCode ? ` · ${c.customerCode}` : ''}
                                <span className="block text-muted-foreground">
                                  {c.phone || 'No phone'}
                                  {c.lastServiceDate ? ` · last ${c.lastServiceDate}` : ''}
                                </span>
                                {c.confirmedPaidTotal != null ? (
                                  <span className="mt-0.5 block font-medium text-emerald-700">
                                    Confirmed paid {formatInr(c.confirmedPaidTotal)}
                                    {c.billedTotal != null ? ` · billed ${formatInr(c.billedTotal)}` : ''}
                                  </span>
                                ) : null}
                              </span>
                              <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {turn.result.entities.jobs?.length ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jobs</p>
                          {turn.result.entities.jobs.slice(0, 6).map((j) => (
                            <div key={j.id} className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs">
                              <span className="font-medium">{j.jobNumber || j.id.slice(0, 8)}</span>
                              {j.status ? ` · ${j.status}` : ''}
                              {j.serviceSubType ? ` · ${j.serviceSubType}` : ''}
                              {j.paymentAmount != null ? ` · ${formatInr(j.paymentAmount)}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {turn.result.entities.payments?.length ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Pending payments
                          </p>
                          {turn.result.entities.payments.slice(0, 5).map((p) => (
                            <div
                              key={p.reminderId}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950"
                            >
                              {formatInr(p.amountPending)}
                              {p.jobNumber ? ` · ${p.jobNumber}` : ''}
                              {p.dueAt ? ` · due ${p.dueAt}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {turn.result.entities.reminders?.length ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Reminders
                          </p>
                          {turn.result.entities.reminders.slice(0, 5).map((r) => (
                            <div key={r.id} className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs">
                              {r.title}
                              {r.reminderAt ? ` · ${r.reminderAt}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {turn.result.entities.documents?.length ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Documents
                          </p>
                          {turn.result.entities.documents.slice(0, 6).map((d) => (
                            <div
                              key={`${d.kind}-${d.id}`}
                              className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs"
                            >
                              {d.label}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {turn.result?.proposedActions?.length ? (
                    <div className="space-y-2 border-t pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Ready actions
                      </p>
                      {turn.result.proposedActions.map((action, index) => (
                        <div
                          key={`${action.type}-${index}`}
                          className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="text-xs">
                            <p className="font-medium">{action.label || action.type}</p>
                            <p className="text-muted-foreground">
                              {action.type === 'open_app'
                                ? 'Opens this CRM screen — no setting changes automatically.'
                                : action.type === 'open_document_draft'
                                  ? 'Opens the customer document with its AI context — review before generating.'
                                  : action.type === 'open_customer_composer'
                                    ? 'Opens a customer composer — review before sending.'
                                  : 'Opens the CRM form — nothing saves until you confirm.'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 shrink-0"
                            disabled={actionBusy}
                            onClick={() => void handleAction(action)}
                          >
                            {actionBusy ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : action.type === 'create_customer' || action.type === 'create_customer_and_job' ? (
                              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'edit_customer' ? (
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'create_job' ? (
                              <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'schedule_follow_up' ? (
                              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'create_reminder' ? (
                              <Bell className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'open_document_draft' ? (
                              <FileText className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'open_app' ? (
                              <Settings className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'open_customer_composer' ? (
                              (action.payload as AiCrmOpenCustomerComposer).channel === 'email' ? (
                                <Mail className="mr-1.5 h-3.5 w-3.5" />
                              ) : (
                                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                              )
                            ) : (
                              <Search className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {action.type === 'open_app' ? 'Open screen' : 'Open form'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {turn.result?.meta?.model ? (
                    <p className="text-[11px] text-muted-foreground/70">
                      {turn.result.meta.model}
                      {turn.result.meta.latencyMs != null ? ` · ${turn.result.meta.latencyMs}ms` : ''}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t bg-background px-4 py-3">
          {attachments.length ? (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {attachments.map((item, index) => (
                <div key={`${item.file.name}-${index}`} className="relative shrink-0">
                  <img src={item.previewUrl} alt="" className="h-14 w-14 rounded-lg border object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="absolute -right-1 -top-1 rounded-full bg-foreground p-0.5 text-background"
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="rounded-2xl border bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your CRM…"
              rows={1}
              maxLength={1500}
              className="min-h-0 resize-none overflow-hidden border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="mt-1 flex items-center justify-between">
              <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ImagePlus className="h-4 w-4" />
                <span className="sr-only">Attach images</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={loading || actionBusy}
                  onChange={(event) => {
                    addImages(Array.from(event.target.files || []));
                    event.target.value = '';
                  }}
                />
              </label>
              <Button
                type="button"
                size="icon"
                onClick={() => void send()}
                disabled={loading || input.trim().length < 2}
                aria-label="Ask CRM AI"
                className="h-8 w-8 shrink-0 rounded-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
