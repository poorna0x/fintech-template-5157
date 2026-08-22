import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import {
  loadApprovedWhatsAppTemplateNameSet,
  sendCallingWhatsAppOne,
  type CallingDeliveryMode,
} from '@/lib/callingBulkWhatsApp';
import {
  buildCallingWhatsAppMessage,
  CALLING_WA_TEMPLATE_META,
  CALLING_WA_TEMPLATE_ORDER,
  callingColdTemplateFor,
  callingContextFromCustomer,
  type CallingMessageContext,
  type CallingWhatsAppTemplate,
} from '@/lib/calling-whatsapp-templates';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  normalizePhoneDigits,
  resolveWhatsAppPhone,
  type WhatsAppPhoneTarget,
} from '@/lib/whatsappPhoneTarget';
import type { WhatsAppSendSource } from '@/lib/whatsappCrmSettings';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { WhatsAppQuickRepliesBar } from '@/components/whatsapp/WhatsAppQuickRepliesBar';

export type WhatsAppCustomizeSendDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  customerName: string;
  customerId?: string | null;
  primaryPhone?: string | null;
  alternatePhone?: string | null;
  defaultBrand?: DocumentBrand;
  source: WhatsAppSendSource;
  defaultTemplate?: CallingWhatsAppTemplate;
  templateOptions?: CallingWhatsAppTemplate[];
  messageContext?: CallingMessageContext;
  /** Pre-built message (skips auto template until reset) */
  initialMessage?: string;
  /** Meta cold template var {{2}} for service reminders */
  serviceWhenLabel?: string;
  /** Show editable when-label field (service reminders) */
  showWhenLabelField?: boolean;
  onSent?: (payload: { phone: string; message: string; via: string }) => void | Promise<void>;
};

export function WhatsAppCustomizeSendDialog({
  open,
  onOpenChange,
  title = 'Send WhatsApp',
  description,
  customerName,
  customerId,
  primaryPhone,
  alternatePhone,
  defaultBrand = 'hydrogenro',
  source,
  defaultTemplate = 'service_due',
  templateOptions = CALLING_WA_TEMPLATE_ORDER,
  messageContext,
  initialMessage,
  serviceWhenLabel: initialWhenLabel,
  showWhenLabelField = false,
  onSent,
}: WhatsAppCustomizeSendDialogProps) {
  const { cloudApiOn } = useWhatsAppCloudApiGate(source);
  const [brand, setBrand] = useState<DocumentBrand>(defaultBrand);
  const [lastServiceBrand, setLastServiceBrand] = useState<DocumentBrand | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [phoneTarget, setPhoneTarget] = useState<WhatsAppPhoneTarget>('primary');
  const [customPhone, setCustomPhone] = useState('');
  const [template, setTemplate] = useState<CallingWhatsAppTemplate>(defaultTemplate);
  const [message, setMessage] = useState('');
  const [messageTouched, setMessageTouched] = useState(false);
  const [whenLabel, setWhenLabel] = useState(initialWhenLabel || 'your upcoming service visit');
  const [deliveryMode, setDeliveryMode] = useState<CallingDeliveryMode>('api');
  const [sending, setSending] = useState(false);

  const ctx = useMemo(
    () =>
      messageContext || {
        fullName: customerName,
      },
    [messageContext, customerName]
  );

  const primaryDigits = normalizePhoneDigits(primaryPhone || '');
  const alternateDigits = normalizePhoneDigits(alternatePhone || '');

  useEffect(() => {
    if (!open) return;
    setTemplate(defaultTemplate);
    setMessageTouched(Boolean(initialMessage?.trim()));
    setMessage(initialMessage?.trim() || '');
    setWhenLabel(initialWhenLabel || 'your upcoming service visit');
    setPhoneTarget(primaryDigits.length >= 10 ? 'primary' : alternateDigits.length >= 10 ? 'alternate' : 'custom');
    setCustomPhone('');
    // Cloud API master off → phone WhatsApp only (same as pre-Cloud CRM).
    setDeliveryMode(cloudApiOn ? 'api' : 'wa_me');
    setBrand(defaultBrand);
  }, [open, defaultTemplate, initialMessage, initialWhenLabel, defaultBrand, primaryDigits, alternateDigits, cloudApiOn]);

  useEffect(() => {
    if (!cloudApiOn && deliveryMode !== 'wa_me') {
      setDeliveryMode('wa_me');
    }
  }, [cloudApiOn, deliveryMode]);

  useEffect(() => {
    if (!open || !customerId) {
      setBrand(defaultBrand);
      setLastServiceBrand(null);
      return;
    }
    let cancelled = false;
    setBrandLoading(true);
    resolveCustomerSendBrand(customerId)
      .then(({ sendBrand, lastServiceBrand: last }) => {
        if (cancelled) return;
        setBrand(sendBrand);
        setLastServiceBrand(last);
      })
      .catch(() => {
        if (!cancelled) setBrand(defaultBrand);
      })
      .finally(() => {
        if (!cancelled) setBrandLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerId, defaultBrand]);

  useEffect(() => {
    if (!open || messageTouched) return;
    setMessage(buildCallingWhatsAppMessage(ctx, template, brand));
  }, [open, ctx, template, brand, messageTouched]);

  const brandHint = useMemo(() => {
    if (brandLoading) return 'Loading last service brand…';
    if (lastServiceBrand) {
      const lastLabel = getDocumentBrandLabel(lastServiceBrand);
      if (brand === lastServiceBrand) {
        return `Using last service brand (${lastLabel}). Change below if needed.`;
      }
      return `Last served: ${lastLabel}. Currently ${getDocumentBrandLabel(brand)}.`;
    }
    return `Sending as ${getDocumentBrandLabel(brand)}. Change brand below.`;
  }, [brandLoading, lastServiceBrand, brand]);

  const coldPreview = useMemo(() => {
    const cold = callingColdTemplateFor(template, customerName, message, brand, whenLabel);
    if (!cold.bodyParams.length) return cold.name;
    return `${cold.name}: ${cold.bodyParams.join(' · ')}`;
  }, [template, customerName, message, brand, whenLabel]);

  const handleSend = async () => {
    const resolved = resolveWhatsAppPhone({
      primaryPhone,
      alternatePhone,
      target: phoneTarget,
      customPhone,
    });
    if (!resolved.phone) {
      toast.error(resolved.error || 'Invalid phone');
      return;
    }
    const text = message.trim();
    if (!text) {
      toast.error('Message is empty');
      return;
    }

    setSending(true);
    try {
      const approved = await loadApprovedWhatsAppTemplateNameSet();
      const result = await sendCallingWhatsAppOne({
        customer: {
          id: customerId || '',
          fullName: customerName,
          phone: resolved.phone,
        },
        toPhone: resolved.phone,
        message: text,
        template,
        brand,
        deliveryMode,
        source,
        serviceWhenLabel: whenLabel,
        approvedTemplateNames: approved.size ? approved : undefined,
      });

      if (!result.ok) {
        toast.error(result.error || 'Send failed');
        return;
      }

      await onSent?.({
        phone: resolved.phone,
        message: text,
        via: result.via,
      });

      onOpenChange(false);
      if (result.via === 'wa_me') {
        toast.success('Opened phone WhatsApp');
      } else if (result.usedTemplate) {
        toast.success('Sent via cold template');
      } else {
        toast.success('Sent via WhatsApp API');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <span>
              {description || (
                <>
                  To <span className="font-medium text-foreground">{customerName}</span>
                  {!cloudApiOn ? (
                    <span className="block mt-1 text-xs text-muted-foreground">
                      Cloud API is off — opens phone WhatsApp (wa.me).
                    </span>
                  ) : null}
                </>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Send to phone</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={primaryDigits.length < 10}
                className={`rounded-lg border px-2 py-2 text-left text-xs ${
                  phoneTarget === 'primary'
                    ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30'
                    : 'border-border hover:bg-muted/40 disabled:opacity-40'
                }`}
                onClick={() => setPhoneTarget('primary')}
              >
                <div className="font-medium">Primary</div>
                <div className="text-muted-foreground truncate">{primaryPhone || '—'}</div>
              </button>
              <button
                type="button"
                disabled={alternateDigits.length < 10}
                className={`rounded-lg border px-2 py-2 text-left text-xs ${
                  phoneTarget === 'alternate'
                    ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30'
                    : 'border-border hover:bg-muted/40 disabled:opacity-40'
                }`}
                onClick={() => setPhoneTarget('alternate')}
              >
                <div className="font-medium">Alternate</div>
                <div className="text-muted-foreground truncate">{alternatePhone || '—'}</div>
              </button>
              <button
                type="button"
                className={`rounded-lg border px-2 py-2 text-left text-xs ${
                  phoneTarget === 'custom'
                    ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30'
                    : 'border-border hover:bg-muted/40'
                }`}
                onClick={() => setPhoneTarget('custom')}
              >
                <div className="font-medium">Other</div>
                <div className="text-muted-foreground">Type number</div>
              </button>
            </div>
            {phoneTarget === 'custom' && (
              <Input
                type="tel"
                placeholder="9876543210"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Send as brand</Label>
            <Select value={brand} onValueChange={(v) => setBrand(v as DocumentBrand)} disabled={brandLoading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
                <SelectItem value="elevenro">Eleven RO</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{brandHint}</p>
          </div>

          <div className="space-y-1.5">
            <Label>How to send</Label>
            {cloudApiOn ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={
                    deliveryMode === 'api'
                      ? 'rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm font-medium'
                      : 'rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40'
                  }
                  onClick={() => setDeliveryMode('api')}
                >
                  Cloud API
                </button>
                <button
                  type="button"
                  className={
                    deliveryMode === 'wa_me'
                      ? 'rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm font-medium'
                      : 'rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40'
                  }
                  onClick={() => setDeliveryMode('wa_me')}
                >
                  Phone wa.me
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Phone WhatsApp (wa.me) — Cloud API is off in Settings
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message type</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {templateOptions.map((key) => {
                const meta = CALLING_WA_TEMPLATE_META[key];
                const selected = template === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTemplate(key);
                      setMessageTouched(false);
                    }}
                    className={`rounded-lg border px-2 py-2 text-left text-xs ${
                      selected
                        ? 'border-green-600 bg-green-50 ring-1 ring-green-600/30'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="font-medium">{meta.label}</div>
                    <div className="text-muted-foreground mt-0.5 leading-snug">{meta.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {showWhenLabelField && (
            <div className="space-y-2">
              <Label>Cold template — visit / due date (Meta var {'{{2}}'})</Label>
              <Input
                value={whenLabel}
                onChange={(e) => setWhenLabel(e.target.value)}
                placeholder="e.g. Mon 12 Aug 2026, Morning"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Message</Label>
              {messageTouched && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMessageTouched(false)}
                >
                  Reset to template
                </Button>
              )}
            </div>
            <WhatsAppQuickRepliesBar
              context={{
                customerName,
                brand,
                whenLabel: whenLabel || undefined,
              }}
              windowOpen
              showTemplates={false}
              disabled={sending || brandLoading}
              onInsertText={(text) => {
                setMessageTouched(true);
                setMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
              }}
            />
            <Textarea
              value={message}
              onChange={(e) => {
                setMessageTouched(true);
                setMessage(e.target.value);
              }}
              rows={10}
              className="text-sm font-mono leading-relaxed resize-y min-h-[160px]"
            />
          </div>

          {deliveryMode === 'api' && (
            <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
              If 24h window is closed, cold send: <span className="font-medium">{coldPreview}</span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={sending || brandLoading || !message.trim()}
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {deliveryMode === 'wa_me' ? 'Open wa.me' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
