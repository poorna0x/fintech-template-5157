import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Search, Briefcase, Bell, CalendarClock } from 'lucide-react';
import {
  requestAiCrmChat,
  type AiCrmChatResult,
  type AiCrmCreateJobDraft,
  type AiCrmFollowUpDraft,
  type AiCrmProposedAction,
  type AiCrmReminderDraft,
} from '@/lib/aiCrmAssistant';

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
  onConfirmCreateJob: (draft: AiCrmCreateJobDraft) => void;
  onConfirmFollowUp: (draft: AiCrmFollowUpDraft) => void;
  onConfirmReminder: (draft: AiCrmReminderDraft) => void;
};

function formatInr(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function AdminCrmAiDialog({
  open,
  onOpenChange,
  onSearchCustomer,
  onConfirmCreateJob,
  onConfirmFollowUp,
  onConfirmReminder,
}: AdminCrmAiDialogProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
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
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, turns, loading]);

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
    });

    if (!result.ok) {
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

  const handleAction = (action: AiCrmProposedAction) => {
    if (action.type === 'open_customer') {
      const customerId = (action.payload as { customerId?: string }).customerId;
      if (customerId) onSearchCustomer('', customerId);
      return;
    }
    if (action.type === 'create_job') {
      onConfirmCreateJob(action.payload as AiCrmCreateJobDraft);
      return;
    }
    if (action.type === 'schedule_follow_up') {
      onConfirmFollowUp(action.payload as AiCrmFollowUpDraft);
      return;
    }
    if (action.type === 'create_reminder') {
      onConfirmReminder(action.payload as AiCrmReminderDraft);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-violet-100 bg-violet-50/70 px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-violet-950">
            <Sparkles className="h-5 w-5" />
            CRM AI assistant
          </DialogTitle>
          <DialogDescription className="text-violet-800">
            Search customers, jobs, reminders, payments and documents. New job / follow-up /
            reminder drafts open the normal CRM forms for you to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {turns.length === 0 && (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/40 p-3 text-sm text-violet-900">
              Try: “today's jobs”, “pending payments”, “AMC expiring soon”, “find 98765…”, “job
              RO12345678”, or “create service job for Ramesh”.
            </div>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={
                turn.role === 'user'
                  ? 'ml-8 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white'
                  : 'mr-4 rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm'
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

                  {turn.result?.entities.customers?.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Customers
                      </p>
                      {turn.result.entities.customers.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSearchCustomer(c.phone || c.name, c.id)}
                          className="flex w-full items-start justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-slate-100"
                        >
                          <span>
                            <span className="font-medium">{c.name}</span>
                            {c.customerCode ? ` · ${c.customerCode}` : ''}
                            <span className="block text-slate-600">
                              {c.phone || 'No phone'}
                              {c.lastServiceDate ? ` · last ${c.lastServiceDate}` : ''}
                            </span>
                          </span>
                          <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {turn.result?.entities.jobs?.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Jobs
                      </p>
                      {turn.result.entities.jobs.slice(0, 6).map((j) => (
                        <div
                          key={j.id}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                        >
                          <span className="font-medium">{j.jobNumber || j.id.slice(0, 8)}</span>
                          {j.status ? ` · ${j.status}` : ''}
                          {j.serviceSubType ? ` · ${j.serviceSubType}` : ''}
                          {j.paymentAmount != null ? ` · ${formatInr(j.paymentAmount)}` : ''}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {turn.result?.entities.payments?.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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

                  {turn.result?.entities.reminders?.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Reminders
                      </p>
                      {turn.result.entities.reminders.slice(0, 5).map((r) => (
                        <div
                          key={r.id}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                        >
                          {r.title}
                          {r.reminderAt ? ` · ${r.reminderAt}` : ''}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {turn.result?.entities.documents?.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Documents
                      </p>
                      {turn.result.entities.documents.slice(0, 6).map((d) => (
                        <div
                          key={`${d.kind}-${d.id}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                        >
                          {d.label}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {turn.result?.proposedActions?.length ? (
                    <div className="space-y-2 border-t border-violet-100 pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        Review & confirm
                      </p>
                      {turn.result.proposedActions.map((action, index) => (
                        <div
                          key={`${action.type}-${index}`}
                          className="flex flex-col gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="text-xs text-violet-950">
                            <p className="font-medium">{action.label || action.type}</p>
                            <p className="text-violet-700">
                              Opens the normal CRM form. Nothing is saved until you confirm there.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0 bg-violet-700 hover:bg-violet-800"
                            onClick={() => handleAction(action)}
                          >
                            {action.type === 'create_job' ? (
                              <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'schedule_follow_up' ? (
                              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                            ) : action.type === 'create_reminder' ? (
                              <Bell className="mr-1.5 h-3.5 w-3.5" />
                            ) : (
                              <Search className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Open form
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {turn.result?.meta?.model ? (
                    <p className="text-[11px] text-slate-400">
                      {turn.result.meta.model}
                      {turn.result.meta.latencyMs != null
                        ? ` · ${turn.result.meta.latencyMs}ms`
                        : ''}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-violet-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching CRM and drafting a reply…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search anyone, ask about a job, or draft a new job / follow-up / reminder…"
              rows={2}
              maxLength={1500}
              disabled={loading}
              className="min-h-[64px] flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              type="button"
              onClick={() => void send()}
              disabled={loading || input.trim().length < 2}
              className="shrink-0 bg-violet-700 hover:bg-violet-800"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Ask
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
