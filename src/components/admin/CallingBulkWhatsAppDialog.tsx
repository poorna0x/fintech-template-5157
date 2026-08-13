import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pause, Play, Send, Square } from 'lucide-react';
import { toast } from 'sonner';

import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  buildCallingBulkMessage,
  loadApprovedWhatsAppTemplateNameSet,
  resolveCallingBulkBrand,
  sendCallingWhatsAppOne,
  sleepMs,
  type CallingBulkBrandMode,
  type CallingBulkCustomer,
} from '@/lib/callingBulkWhatsApp';
import {
  buildCallingWhatsAppMessage,
  callingContextFromCustomer,
  CALLING_WA_TEMPLATE_META,
  CALLING_WA_TEMPLATE_ORDER,
  type CallingWhatsAppTemplate,
} from '@/lib/calling-whatsapp-templates';
import { getDocumentBrandLabel } from '@/lib/service-brands';

type BulkPhase = 'setup' | 'running' | 'paused' | 'done';

type RowResult = {
  id: string;
  name: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  detail?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CallingBulkCustomer[];
  onRecordSent: (customerId: string, phone: string, message: string) => Promise<void>;
};

const API_DELAY_MS = 1100;

export default function CallingBulkWhatsAppDialog({
  open,
  onOpenChange,
  customers,
  onRecordSent,
}: Props) {
  const [template, setTemplate] = useState<CallingWhatsAppTemplate>('service_due');
  const [brandMode, setBrandMode] = useState<CallingBulkBrandMode>('auto');
  const [draft, setDraft] = useState('');
  const [draftTouched, setDraftTouched] = useState(false);
  const [phase, setPhase] = useState<BulkPhase>('setup');
  const [rows, setRows] = useState<RowResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const pauseRef = useRef(false);
  const stopRef = useRef(false);
  const runTokenRef = useRef(0);

  const sample = customers[0] || null;
  const sampleName =
    String(sample?.fullName || sample?.name || 'Customer').trim() || 'Customer';

  const previewBrandLabel =
    brandMode === 'auto' ? 'Auto per customer' : getDocumentBrandLabel(brandMode);

  useEffect(() => {
    if (!open) {
      setPhase('setup');
      setRows([]);
      setCurrentIndex(0);
      setDraftTouched(false);
      setTemplate('service_due');
      setBrandMode('auto');
      pauseRef.current = false;
      stopRef.current = false;
      runTokenRef.current += 1;
      return;
    }
    if (!sample) return;
    if (draftTouched) return;
    const brand = brandMode === 'auto' ? 'hydrogenro' : brandMode;
    setDraft(
      buildCallingWhatsAppMessage(callingContextFromCustomer(sample as any), template, brand)
    );
  }, [open, sample, template, brandMode, draftTouched]);

  const selectableWithPhone = useMemo(
    () => customers.filter((c) => String(c.phone || '').replace(/\D/g, '').length >= 10),
    [customers]
  );

  const counts = useMemo(() => {
    const sent = rows.filter((r) => r.status === 'sent').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const skipped = rows.filter((r) => r.status === 'skipped').length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    return { sent, failed, skipped, pending, total: rows.length };
  }, [rows]);

  const patchRow = (id: string, patch: Partial<RowResult>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const resetToSetup = () => {
    runTokenRef.current += 1;
    pauseRef.current = false;
    stopRef.current = false;
    setPhase('setup');
    setRows([]);
    setCurrentIndex(0);
  };

  const processFrom = async (startIndex: number, token: number) => {
    setPhase('running');
    const approvedNames = await loadApprovedWhatsAppTemplateNameSet();
    if (token !== runTokenRef.current) return;

    for (let i = startIndex; i < customers.length; i++) {
      if (token !== runTokenRef.current) return;
      if (stopRef.current) {
        setPhase('done');
        toast.message('Bulk WhatsApp stopped');
        return;
      }
      while (pauseRef.current && !stopRef.current) {
        setPhase('paused');
        await sleepMs(200);
        if (token !== runTokenRef.current) return;
      }
      if (stopRef.current) {
        setPhase('done');
        return;
      }
      setPhase('running');
      setCurrentIndex(i);

      const customer = customers[i];

      const phoneDigits = String(customer.phone || '').replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        patchRow(customer.id, { status: 'skipped', detail: 'No phone' });
        continue;
      }

      let brand;
      try {
        brand = await resolveCallingBulkBrand(customer.id, brandMode);
      } catch {
        brand = 'hydrogenro' as const;
      }
      if (token !== runTokenRef.current) return;

      const message = buildCallingBulkMessage({
        customer,
        template,
        brand,
        draftTouched,
        draftText: draft,
        sampleName,
      });

      const result = await sendCallingWhatsAppOne({
        customer,
        message,
        template,
        brand,
        deliveryMode: 'api',
        approvedTemplateNames: approvedNames,
      });
      if (!result.ok) {
        patchRow(customer.id, {
          status: result.skipped ? 'skipped' : 'failed',
          detail: result.error,
        });
      } else {
        try {
          await onRecordSent(customer.id, String(customer.phone || ''), message);
          patchRow(customer.id, {
            status: 'sent',
            detail: result.usedTemplate ? 'API template' : 'WhatsApp API',
          });
        } catch {
          patchRow(customer.id, { status: 'failed', detail: 'API ok but history save failed' });
        }
      }

      if (i < customers.length - 1 && !stopRef.current) {
        await sleepMs(API_DELAY_MS);
      }
    }

    if (token === runTokenRef.current) {
      setPhase('done');
      setRows((latest) => {
        const sent = latest.filter((r) => r.status === 'sent').length;
        const failed = latest.filter((r) => r.status === 'failed').length;
        const skipped = latest.filter((r) => r.status === 'skipped').length;
        if (sent === 0 && failed + skipped > 0) {
          toast.error(
            `Bulk finished — none sent (${failed} failed, ${skipped} skipped). Often 24h window closed and cold template not APPROVED yet.`
          );
        } else if (failed > 0) {
          toast.message(`Bulk finished — ${sent} sent, ${failed} failed, ${skipped} skipped`);
        } else {
          toast.success(`Bulk finished — ${sent} sent via WhatsApp API`);
        }
        return latest;
      });
    }
  };

  const startBulk = () => {
    if (!customers.length) {
      toast.error('No customers selected');
      return;
    }
    if (!draft.trim() && draftTouched) {
      toast.error('Message is empty');
      return;
    }
    pauseRef.current = false;
    stopRef.current = false;
    const token = ++runTokenRef.current;
    setRows(
      customers.map((c) => ({
        id: c.id,
        name: String(c.fullName || c.name || 'Customer'),
        status: 'pending' as const,
      }))
    );
    setCurrentIndex(0);
    void processFrom(0, token);
  };

  const handlePause = () => {
    pauseRef.current = true;
    setPhase('paused');
  };

  const handleResume = () => {
    if (phase !== 'paused') return;
    pauseRef.current = false;
    setPhase('running');
  };

  const handleStop = () => {
    stopRef.current = true;
    pauseRef.current = false;
    setPhase('done');
  };

  const busy = phase === 'running' || phase === 'paused';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) {
          toast.message('Stop the bulk send before closing');
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="w-5 h-5 text-green-600" />
            Bulk WhatsApp API
          </DialogTitle>
          <DialogDescription>
            Sends via WhatsApp Cloud API one-by-one to {customers.length} selected customer
            {customers.length === 1 ? '' : 's'}
            {selectableWithPhone.length < customers.length
              ? ` (${customers.length - selectableWithPhone.length} missing phone)`
              : ''}
            . No wa.me.
          </DialogDescription>
        </DialogHeader>

        {phase === 'setup' ? (
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              Delivery is WhatsApp API only (business line · inbox log). Pause/stop anytime while
              sending.
            </p>

            <div className="space-y-2">
              <Label>Brand</Label>
              <Select
                value={brandMode}
                onValueChange={(v) => {
                  setBrandMode(v as CallingBulkBrandMode);
                  setDraftTouched(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto per customer (last service)</SelectItem>
                  <SelectItem value="hydrogenro">Force Hydrogen RO</SelectItem>
                  <SelectItem value="elevenro">Force Eleven RO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Preview uses {previewBrandLabel}
                {brandMode === 'auto' ? ' (sample: Hydrogen until each send resolves)' : ''}.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Message type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CALLING_WA_TEMPLATE_ORDER.map((key) => {
                  const meta = CALLING_WA_TEMPLATE_META[key];
                  const selected = template === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setTemplate(key);
                        setDraftTouched(false);
                      }}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-green-600 bg-green-50 ring-1 ring-green-600/30'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div className="text-sm font-medium text-foreground">{meta.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {meta.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="calling-bulk-wa-message">Message</Label>
                {draftTouched && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDraftTouched(false)}
                  >
                    Reset to template
                  </Button>
                )}
              </div>
              <Textarea
                id="calling-bulk-wa-message"
                value={draft}
                onChange={(e) => {
                  setDraftTouched(true);
                  setDraft(e.target.value);
                }}
                rows={10}
                className="text-sm font-mono leading-relaxed resize-y min-h-[180px]"
              />
              <p className="text-[11px] text-muted-foreground">
                {draftTouched
                  ? 'Edited draft: use {name} for the customer name (or the preview name will be swapped).'
                  : 'Each customer gets a fresh template with their name / service details and brand.'}
              </p>
              {sample && (
                <p className="text-xs text-muted-foreground">
                  Preview recipient: <span className="font-medium text-foreground">{sampleName}</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">
                {phase === 'done' ? 'Finished' : phase === 'paused' ? 'Paused' : 'Sending…'} ·{' '}
                {Math.min(currentIndex + 1, counts.total)}/{counts.total}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Sent {counts.sent} · Failed {counts.failed} · Skipped {counts.skipped} · Pending{' '}
                {counts.pending}
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border divide-y text-sm">
              {rows.map((r, idx) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-2 px-3 py-1.5 ${
                    idx === currentIndex && phase !== 'done' ? 'bg-emerald-50/80' : ''
                  }`}
                >
                  <span className="truncate font-medium">{r.name}</span>
                  <span
                    className={
                      r.status === 'sent'
                        ? 'text-emerald-700 text-xs shrink-0'
                        : r.status === 'failed'
                          ? 'text-red-600 text-xs shrink-0'
                          : r.status === 'skipped'
                            ? 'text-amber-700 text-xs shrink-0'
                            : 'text-muted-foreground text-xs shrink-0'
                    }
                  >
                    {r.status}
                    {r.detail ? ` · ${r.detail}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
          {phase === 'setup' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={startBulk}
                disabled={!customers.length}
              >
                <Send className="w-4 h-4 mr-2" />
                Start WhatsApp API bulk
              </Button>
            </>
          ) : (
            <>
              {phase === 'running' && (
                <Button type="button" variant="outline" onClick={handlePause}>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              )}
              {phase === 'paused' && (
                <Button type="button" variant="outline" onClick={handleResume}>
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </Button>
              )}
              {phase !== 'done' && (
                <Button type="button" variant="outline" onClick={handleStop}>
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              )}
              {phase === 'done' && (
                <>
                  <Button type="button" variant="outline" onClick={resetToSetup}>
                    Back to setup
                  </Button>
                  <Button type="button" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </>
              )}
              {phase === 'running' && (
                <span className="inline-flex items-center text-xs text-muted-foreground sm:ml-auto">
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending…
                </span>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
