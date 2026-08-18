import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  requestAiDocumentDraft,
  type AiDocumentChatTurn,
  type AiDocumentKind,
} from '@/lib/aiDocumentDraft';
import { useAdminRole } from '@/lib/useAdminRole';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';

type VisibleTurn = AiDocumentChatTurn & {
  id: string;
  error?: boolean;
};

type PendingChange<TSnapshot> = {
  proposed: TSnapshot;
  previous: TSnapshot;
  answer: string;
  changes: Array<{ field: string; explanation: string }>;
  warnings: string[];
};

interface AiDocumentDraftAssistantProps<TSnapshot extends Record<string, unknown>> {
  kind: AiDocumentKind;
  documentNoun: string;
  getSnapshot: () => TSnapshot;
  onApply: (snapshot: TSnapshot) => void;
  disabled?: boolean;
  className?: string;
  initialInstruction?: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  billNumber: 'Document number',
  quotationNumber: 'Quotation number',
  billDate: 'Document date',
  quotationDate: 'Quotation date',
  signatureDate: 'Signature date',
  items: 'Line items',
  notes: 'Notes',
  termItems: 'Terms & conditions',
  validityNote: 'Validity',
  validUntilDate: 'Valid until',
  gstOption: 'GST option',
  serviceCharge: 'Service charge',
  paymentStatus: 'Payment status',
  amountReceived: 'Amount received',
  paymentDueDate: 'Payment due date',
  addressChoice: 'Customer site',
  editableCustomer: 'Customer details',
  amcCost: 'AMC cost',
  servicePeriodKind: 'Service frequency',
  customFromDate: 'AMC start date',
  customToDate: 'AMC end date',
  startDate: 'Warranty start date',
  defaultValue: 'Warranty duration',
  defaultUnit: 'Warranty duration unit',
  customNotes: 'Warranty notes',
  documentBrand: 'Document brand',
  documentNumber: 'Document number',
  documentType: 'Document type',
  brand: 'Brand',
  title: 'Document title',
  titleAlignment: 'Title alignment',
  titleSize: 'Title size',
  titleCase: 'Title capitalization',
  date: 'Document date',
  subject: 'Subject',
  referenceNumber: 'Reference number',
  cc: 'CC',
  customerName: 'Customer name',
  customerCompany: 'Customer company',
  siteLocation: 'Site location',
  customerPhone: 'Customer phone',
  customerEmail: 'Customer email',
  blocks: 'Body content & layout',
  leftSignatory: 'Authorized signatory',
  rightSignatory: 'Customer signatory',
  useBrandSealAsStamp: 'Brand seal',
  brandSealVariant: 'Seal style',
  hideLeftSignatory: 'Authorized signatory visibility',
  hideRightSignatory: 'Customer signatory visibility',
  hideBrandFooter: 'Brand footer visibility',
  showPageBorder: 'Page border',
};

function cloneSnapshot<T>(snapshot: T): T {
  return JSON.parse(JSON.stringify(snapshot)) as T;
}

function compactValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (value && typeof value === 'object') return 'Updated details';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value == null || value === '') return 'Empty';
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export default function AiDocumentDraftAssistant<
  TSnapshot extends Record<string, unknown>,
>({
  kind,
  documentNoun,
  getSnapshot,
  onApply,
  disabled = false,
  className = '',
  initialInstruction,
}: AiDocumentDraftAssistantProps<TSnapshot>) {
  const { isAdminRole, isLoading: roleLoading } = useAdminRole();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<VisibleTurn[]>([]);
  const [pending, setPending] = useState<PendingChange<TSnapshot> | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<TSnapshot | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { ref: inputRef } = useAutoGrowTextarea(input, 140);
  const initialInstructionStartedRef = useRef<string | null>(null);

  const history = useMemo<AiDocumentChatTurn[]>(
    () => turns.filter((turn) => !turn.error).map(({ role, text }) => ({ role, text })),
    [turns]
  );

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [expanded, loading, pending, turns]);

  const send = async (messageOverride?: string) => {
    const message = String(messageOverride ?? input).trim();
    if (message.length < 2 || loading || pending || disabled) return;
    const current = cloneSnapshot(getSnapshot());
    const userTurn: VisibleTurn = {
      id: `doc-ai-user-${Date.now()}`,
      role: 'user',
      text: message,
    };
    setTurns((previous) => [...previous, userTurn]);
    setInput('');
    setLoading(true);
    const result = await requestAiDocumentDraft({
      kind,
      message,
      currentDraft: current,
      history,
    });
    setLoading(false);
    if ('error' in result) {
      setTurns((previous) => [
        ...previous,
        {
          id: `doc-ai-error-${Date.now()}`,
          role: 'assistant',
          text: result.error,
          error: true,
        },
      ]);
      return;
    }

    const proposed = { ...current, ...result.patch } as TSnapshot;
    setTurns((previous) => [
      ...previous,
      {
        id: `doc-ai-assistant-${Date.now()}`,
        role: 'assistant',
        text: result.answer,
      },
    ]);
    if (result.changes.length) {
      setPending({
        proposed,
        previous: current,
        answer: result.answer,
        changes: result.changes,
        warnings: result.warnings,
      });
    }
  };

  useEffect(() => {
    const instruction = String(initialInstruction || '').trim();
    if (!instruction || initialInstructionStartedRef.current === instruction) return;
    initialInstructionStartedRef.current = instruction;
    setExpanded(true);
    void send(instruction);
    // The instruction is intentionally consumed once per mounted document form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInstruction]);

  const applyPending = () => {
    if (!pending) return;
    onApply(pending.proposed);
    setUndoSnapshot(pending.previous);
    setPending(null);
    toast.success(`AI changes applied to this ${documentNoun}`);
  };

  const discardPending = () => {
    setPending(null);
    setTurns((previous) => [
      ...previous,
      {
        id: `doc-ai-discard-${Date.now()}`,
        role: 'assistant',
        text: 'Changes discarded. Tell me what to adjust instead.',
      },
    ]);
  };

  const undo = () => {
    if (!undoSnapshot) return;
    onApply(undoSnapshot);
    setUndoSnapshot(null);
    toast.success('Last AI edit undone');
  };

  const clearSession = () => {
    setTurns([]);
    setPending(null);
    setUndoSnapshot(null);
    setInput('');
  };

  if (roleLoading || !isAdminRole) return null;

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-card ${className}`}
      aria-label={`AI ${documentNoun} editor`}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:px-4"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            AI editor
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Edit this {documentNoun} · review before apply
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded ? (
        <div className="border-t">
          <div className="max-h-[42vh] min-h-[120px] space-y-2 overflow-y-auto px-3 py-3 sm:max-h-[360px] sm:px-4">
            {!turns.length ? (
              <div className="flex min-h-24 items-center justify-center text-center">
                <p className="text-sm text-muted-foreground">Describe what you want to change.</p>
              </div>
            ) : null}

            {turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === 'user'
                    ? 'ml-8 rounded-xl bg-foreground px-3 py-2 text-sm text-background'
                    : `mr-5 rounded-xl border px-3 py-2 text-sm ${
                        turn.error
                          ? 'border-destructive/30 bg-destructive/5 text-destructive'
                          : 'bg-muted/30 text-foreground'
                      }`
                }
              >
                {turn.text}
              </div>
            ))}

            {loading ? (
              <div className="mr-5 flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            ) : null}

            {pending ? (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Review changes</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Nothing changes until you tap Apply.
                  </p>
                </div>
                <div className="space-y-1.5">
                  {pending.changes.map((change) => (
                    <div
                      key={change.field}
                      className="rounded-lg border bg-background px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs font-semibold text-foreground">
                          {FIELD_LABELS[change.field] || change.field}
                        </span>
                        <span className="max-w-[45%] truncate text-right text-xs text-foreground">
                          {compactValue(pending.proposed[change.field])}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{change.explanation}</p>
                    </div>
                  ))}
                </div>
                {pending.warnings.length ? (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                    {pending.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={discardPending}>
                    <X className="mr-1.5 h-4 w-4" />
                    Discard
                  </Button>
                  <Button
                    type="button"
                    onClick={applyPending}
                  >
                    <Check className="mr-1.5 h-4 w-4" />
                    Apply changes
                  </Button>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="border-t bg-background p-3 sm:px-4">
            <div className="rounded-2xl border bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  pending ? 'Apply or discard the preview first' : `What should I change?`
                }
                rows={1}
                maxLength={4000}
                disabled={loading || Boolean(pending) || disabled}
                className="min-h-0 resize-none overflow-hidden border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
              />
              <div className="mt-1 flex justify-end">
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void send()}
                  disabled={loading || Boolean(pending) || input.trim().length < 2 || disabled}
                  className="h-8 w-8 shrink-0 rounded-full"
                  aria-label="Send document edit request"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Memory clears when you leave.</p>
              <div className="flex items-center gap-1">
                {undoSnapshot ? (
                  <Button type="button" variant="ghost" size="sm" onClick={undo} className="h-7 px-2 text-xs">
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Undo
                  </Button>
                ) : null}
                {turns.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearSession}
                    className="h-7 px-2 text-xs text-muted-foreground"
                  >
                    New chat
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

