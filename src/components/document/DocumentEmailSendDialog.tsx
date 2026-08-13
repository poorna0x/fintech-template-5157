import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { getDefaultDocumentMessage, type AdminEmailTemplateType } from '@/lib/admin-email-templates';
import { buildDocumentPdfWhatsAppCaption } from '@/lib/document-pdf-whatsapp-caption';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { isValidEmailFormat, normalizeRecipientList } from '@/lib/email-recipients';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  generateGeneratorDocumentPdfBase64,
  getGeneratorDocumentEmailSuccessMessage,
  sendGeneratorDocumentEmail,
  type GeneratorDocumentEmailKind,
} from '@/lib/send-generator-document-email';
import { forceLightThemeClass } from '@/lib/force-light-theme';
import {
  generateDocumentAcceptPdfPair,
  sendDocumentAcceptInvite,
  showAcceptPreviewSentToast,
} from '@/lib/documentAcceptPreview';
import {
  openWhatsAppMeDeepLink,
  resolveBillCustomerDisplayName,
  sendAdminWhatsAppDocumentWithColdFallback,
} from '@/lib/sendAdminWhatsAppApi';
import { formatPhoneForWhatsApp, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchLastInboundAt,
  hoursLeftInWindow,
  invalidateInboundWindowCache,
  isWithinCustomerServiceWindow,
} from '@/lib/whatsappInbox';

type SendChannel = 'email' | 'whatsapp' | 'both';

function pickDefaultChannel(opts: {
  allowWhatsApp: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}): SendChannel {
  if (!opts.allowWhatsApp) return 'email';
  // Prefer both when email is on file; otherwise WhatsApp if phone exists.
  if (opts.hasEmail && opts.hasPhone) return 'both';
  if (opts.hasPhone && !opts.hasEmail) return 'whatsapp';
  return 'email';
}

const KIND_META: Record<
  GeneratorDocumentEmailKind,
  {
    title: string;
    templateType: AdminEmailTemplateType;
    sendBtnClass: string;
    headerClass: string;
    titleClass: string;
    descClass: string;
    docLabel: string;
  }
> = {
  service_bill: {
    title: 'Send service bill',
    templateType: 'service_bill',
    sendBtnClass: 'bg-emerald-700 hover:bg-emerald-800',
    headerClass: 'border-b bg-emerald-50/80',
    titleClass: 'text-emerald-950',
    descClass: 'text-emerald-900/80',
    docLabel: 'service bill',
  },
  quotation: {
    title: 'Send quotation',
    templateType: 'quotation',
    sendBtnClass: 'bg-emerald-700 hover:bg-emerald-800',
    headerClass: 'border-b bg-emerald-50/80',
    titleClass: 'text-emerald-950',
    descClass: 'text-emerald-900/80',
    docLabel: 'quotation',
  },
  invoice: {
    title: 'Send tax invoice',
    templateType: 'invoice',
    sendBtnClass: 'bg-blue-700 hover:bg-blue-800',
    headerClass: 'border-b bg-blue-50/80',
    titleClass: 'text-blue-950',
    descClass: 'text-blue-900/80',
    docLabel: 'tax invoice',
  },
};

export interface DocumentEmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: GeneratorDocumentEmailKind;
  bill: Bill | null;
  brand: DocumentBrand | null;
  defaultRecipients?: string[];
  dueDateIso?: string;
  allowWhatsApp?: boolean;
  /** Appended to the default WhatsApp caption (e.g. office-sale UPI pay link). */
  whatsappExtraLines?: string;
  onSent?: () => void;
}

function emptyRow(): string {
  return '';
}

function defaultMessageForChannel(opts: {
  channel: SendChannel;
  kind: GeneratorDocumentEmailKind;
  templateType: AdminEmailTemplateType;
  bill: Bill | null;
  brand: DocumentBrand | null;
  dueDateIso?: string;
}): string {
  if (
    (opts.channel === 'whatsapp' || opts.channel === 'both') &&
    opts.bill &&
    opts.brand
  ) {
    return buildDocumentPdfWhatsAppCaption({
      kind: opts.kind,
      brand: opts.brand,
      customerName: resolveBillCustomerDisplayName(opts.bill.customer),
      documentRef: opts.bill.billNumber,
      amount: opts.bill.totalAmount,
      dateIso: opts.dueDateIso || opts.bill.billDate,
      paymentStatus: opts.bill.paymentStatus,
    });
  }
  return getDefaultDocumentMessage(opts.templateType);
}

export default function DocumentEmailSendDialog({
  open,
  onOpenChange,
  kind,
  bill,
  brand,
  defaultRecipients = [],
  dueDateIso,
  allowWhatsApp = true,
  whatsappExtraLines = '',
  onSent,
}: DocumentEmailSendDialogProps) {
  const meta = KIND_META[kind];
  const [channel, setChannel] = useState<SendChannel>('email');
  const [recipientRows, setRecipientRows] = useState<string[]>([emptyRow()]);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [message, setMessage] = useState(() => getDefaultDocumentMessage(meta.templateType));
  const [sending, setSending] = useState(false);
  const [windowChecking, setWindowChecking] = useState(false);
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);
  const [windowHoursLeft, setWindowHoursLeft] = useState<number | null>(null);
  /** Preview PDF + WhatsApp I Accept button → original PDF. */
  const [requireAccept, setRequireAccept] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seeded = normalizeRecipientList(defaultRecipients);
    setRecipientRows(seeded.length ? seeded : [emptyRow()]);
    const phone = String(bill?.customer?.phone || '').trim();
    setWhatsappPhone(phone);
    setRequireAccept(false);
    const nextChannel = pickDefaultChannel({
      allowWhatsApp,
      hasEmail: seeded.length > 0,
      hasPhone: formatPhoneForWhatsApp(phone).length >= 10,
    });
    setChannel(nextChannel);
    const base = defaultMessageForChannel({
      channel: nextChannel,
      kind,
      templateType: meta.templateType,
      bill,
      brand,
      dueDateIso,
    });
    const extra = String(whatsappExtraLines || '').trim();
    setMessage(
      extra && (nextChannel === 'whatsapp' || nextChannel === 'both')
        ? `${base.trim()}\n\n${extra}`
        : base
    );
    setWindowOpen(null);
    setWindowHoursLeft(null);
  }, [
    open,
    defaultRecipients,
    meta.templateType,
    bill,
    brand,
    dueDateIso,
    kind,
    allowWhatsApp,
    whatsappExtraLines,
  ]);

  useEffect(() => {
    if (!open || !allowWhatsApp) return;
    if (channel !== 'whatsapp' && channel !== 'both') return;
    const phone = formatPhoneForWhatsApp(whatsappPhone);
    if (!phone || phone.length < 10) {
      setWindowOpen(null);
      setWindowHoursLeft(null);
      return;
    }
    let cancelled = false;
    setWindowChecking(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const inboundAt = await fetchLastInboundAt(phone, supabase);
          if (cancelled) return;
          setWindowOpen(isWithinCustomerServiceWindow(inboundAt));
          setWindowHoursLeft(hoursLeftInWindow(inboundAt));
        } catch {
          if (!cancelled) {
            setWindowOpen(null);
            setWindowHoursLeft(null);
          }
        } finally {
          if (!cancelled) setWindowChecking(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, channel, allowWhatsApp, whatsappPhone]);

  const normalizedRecipients = useMemo(
    () => normalizeRecipientList(recipientRows),
    [recipientRows]
  );

  const brandLabel = brand ? getDocumentBrandLabel(brand) : '';

  const updateRow = (index: number, value: string) => {
    setRecipientRows((prev) => prev.map((row, i) => (i === index ? value : row)));
  };

  const removeRow = (index: number) => {
    setRecipientRows((prev) => {
      if (prev.length <= 1) return [emptyRow()];
      return prev.filter((_, i) => i !== index);
    });
  };

  const addRow = () => {
    setRecipientRows((prev) => [...prev, emptyRow()]);
  };

  const handleSendEmail = async (opts?: { keepOpen?: boolean; toastId?: string | number }) => {
    if (!bill || !brand) {
      toast.error('Document details are missing');
      return { ok: false as const };
    }

    const recipients = normalizeRecipientList(recipientRows);
    if (!recipients.length) {
      toast.error('Add at least one valid email address');
      return { ok: false as const };
    }

    const invalid = recipientRows
      .map((r) => r.trim())
      .filter((r) => r && !isValidEmailFormat(r));
    if (invalid.length) {
      toast.error(`Invalid email: ${invalid[0]}`);
      return { ok: false as const };
    }

    const toastId = opts?.toastId ?? toast.loading('Generating PDF and sending email…');
    if (opts?.toastId == null) setSending(true);

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again in a moment.', {
          id: toastId,
        });
        return { ok: false as const };
      }

      const emailBody =
        channel === 'both'
          ? getDefaultDocumentMessage(meta.templateType)
          : message.trim() || undefined;

      const result = await sendGeneratorDocumentEmail({
        kind,
        bill,
        brand,
        recipientEmails: recipients,
        dueDateIso,
        customMessage: emailBody,
      });

      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return { ok: false as const };
      }

      if (!opts?.keepOpen) {
        toast.success(getGeneratorDocumentEmailSuccessMessage(kind, brand, recipients), {
          id: toastId,
        });
        onSent?.();
        onOpenChange(false);
      }
      return { ok: true as const, toastId, recipients };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error('Could not send email', { id: toastId, description: msg });
      return { ok: false as const };
    } finally {
      if (opts?.toastId == null && !opts?.keepOpen) setSending(false);
    }
  };

  const handleSendWhatsApp = async (opts?: { keepOpen?: boolean; toastId?: string | number }) => {
    if (!bill || !brand) {
      toast.error('Document details are missing');
      return { ok: false as const };
    }
    const phone = formatPhoneForWhatsApp(whatsappPhone);
    if (!phone || phone.length < 10) {
      toast.error('Enter a valid customer phone number');
      return { ok: false as const };
    }

    const toastId = opts?.toastId ?? toast.loading('Preparing PDF for WhatsApp…');
    if (opts?.toastId == null) setSending(true);

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again.', { id: toastId });
        return { ok: false as const };
      }

      toast.loading('Generating PDF…', { id: toastId });

      if (requireAccept) {
        toast.loading('Generating preview + original…', { id: toastId });
        const pair = await generateDocumentAcceptPdfPair(kind, bill);
        toast.loading(
          windowOpen === false
            ? 'Sending Accept preview (cold template)…'
            : 'Sending Accept preview on WhatsApp…',
          { id: toastId }
        );
        const invite = await sendDocumentAcceptInvite({
          to: phone,
          brand,
          docType: kind,
          documentLabel: meta.docLabel,
          documentRef: bill.billNumber,
          sourceKey: bill.billNumber,
          customerId: bill.customer?.id,
          customerName: resolveBillCustomerDisplayName(bill.customer),
          amountDisplay: bill.totalAmount,
          filename: pair.filename,
          verifyCode: pair.verifyCode,
          previewVerifyCode: pair.previewVerifyCode,
          originalPdfBase64: pair.originalPdfBase64,
          previewPdfBase64: pair.previewPdfBase64,
          preferColdTemplate: windowOpen === false,
        });
        if (!invite.ok) {
          toast.error(invite.error || 'Could not send Accept preview', { id: toastId });
          return { ok: false as const };
        }
        invalidateInboundWindowCache(phone);
        if (!opts?.keepOpen) {
          showAcceptPreviewSentToast(toastId, invite.via);
          onSent?.();
          onOpenChange(false);
        }
        return { ok: true as const, toastId, via: 'accept_preview' as const };
      }

      const pdf = await generateGeneratorDocumentPdfBase64(kind, bill);
      toast.loading('Sending on WhatsApp…', { id: toastId });
      const caption = (
        message.trim() ||
        defaultMessageForChannel({
          channel: 'whatsapp',
          kind,
          templateType: meta.templateType,
          bill,
          brand,
          dueDateIso,
        })
      ).slice(0, 1024);

      const result = await sendAdminWhatsAppDocumentWithColdFallback({
        to: phone,
        pdfBase64: pdf.pdfBase64,
        filename: pdf.filename,
        caption,
        customerId: bill.customer?.id,
        source: 'documents',
        preferColdTemplate: windowOpen === false,
        cold: {
          kind,
          customerName: resolveBillCustomerDisplayName(bill.customer),
          brand,
          amount: bill.totalAmount,
          ref: bill.billNumber,
          documentLabel: meta.docLabel,
        },
      });

      if (!result.ok) {
        if (result.needsWindowOrTemplate || windowOpen === false) {
          openWhatsAppMeDeepLink(phone, caption);
          if (!opts?.keepOpen) {
            toast.success(
              'Opened phone WhatsApp (template PDF failed) — attach the PDF manually if needed',
              { id: toastId, description: result.error }
            );
            onSent?.();
            onOpenChange(false);
          }
          return { ok: true as const, toastId, via: 'wa_me' as const };
        }
        openWhatsAppMeDeepLink(phone, caption);
        if (!opts?.keepOpen) {
          toast.success('Opened phone WhatsApp as backup', {
            id: toastId,
            description: result.error || 'API send failed',
          });
          onSent?.();
          onOpenChange(false);
        }
        return { ok: true as const, toastId, via: 'wa_me' as const };
      }

      invalidateInboundWindowCache(phone);
      if (!opts?.keepOpen) {
        toast.success(
          result.viaColdTemplate ? 'PDF sent via WhatsApp template' : 'PDF sent on WhatsApp',
          { id: toastId }
        );
        onSent?.();
        onOpenChange(false);
      }
      return {
        ok: true as const,
        toastId,
        via: result.viaColdTemplate ? ('invite' as const) : ('api' as const),
      };
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not send on WhatsApp', {
        id: toastId,
      });
      return { ok: false as const };
    } finally {
      if (opts?.toastId == null && !opts?.keepOpen) setSending(false);
    }
  };

  const handleSendBoth = async () => {
    if (!canSendEmail) {
      toast.error('Add at least one valid email address');
      return;
    }
    if (!canSendWhatsApp) {
      toast.error('Enter a valid customer phone number');
      return;
    }

    setSending(true);
    const toastId = toast.loading('Sending email and WhatsApp…');
    try {
      toast.loading('Sending email…', { id: toastId });
      const emailResult = await handleSendEmail({ keepOpen: true, toastId });
      if (!emailResult.ok) return;

      toast.loading('Sending WhatsApp…', { id: toastId });
      const waResult = await handleSendWhatsApp({ keepOpen: true, toastId });
      if (!waResult.ok) {
        toast.warning('Email sent, but WhatsApp failed', { id: toastId });
        onSent?.();
        onOpenChange(false);
        return;
      }

      const waNote =
        waResult.via === 'invite'
          ? 'WhatsApp PDF sent via template'
          : waResult.via === 'wa_me'
            ? 'WhatsApp opened on phone as backup'
            : 'WhatsApp PDF sent';
      toast.success(`Email + ${waNote}`, { id: toastId });
      onSent?.();
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  const canSendEmail = Boolean(bill && brand && normalizedRecipients.length);
  const canSendWhatsApp = Boolean(
    bill && brand && formatPhoneForWhatsApp(whatsappPhone).length >= 10
  );
  const canSendBoth = canSendEmail && canSendWhatsApp;
  const canSend =
    channel === 'whatsapp'
      ? canSendWhatsApp
      : channel === 'both'
        ? canSendBoth
        : canSendEmail;
  const hasEmailOnFile = normalizedRecipients.length > 0;
  const showEmailFields = channel === 'email' || channel === 'both';
  const showWhatsAppFields = channel === 'whatsapp' || channel === 'both';

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent
        dismissible={false}
        className={forceLightThemeClass(
          'max-w-lg w-[calc(100vw-1.25rem)] sm:w-full max-h-[min(92dvh,720px)] overflow-y-auto p-0 gap-0'
        )}
      >
        <DialogHeader className={`px-4 sm:px-6 pt-5 pb-3 ${meta.headerClass}`}>
          <DialogTitle className={`text-base sm:text-lg pr-8 ${meta.titleClass}`}>
            {meta.title}
          </DialogTitle>
          <DialogDescription className={`text-xs sm:text-sm ${meta.descClass}`}>
            {brandLabel
              ? `PDF · ${brandLabel} · Email, WhatsApp, or both`
              : 'Send the PDF by email, WhatsApp, or both'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          {bill ? (
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{bill.customer.name}</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {bill.billNumber}
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                ₹{bill.totalAmount.toLocaleString('en-IN')}
                {dueDateIso ? ` · ${dueDateIso}` : null}
              </p>
            </div>
          ) : null}

          {allowWhatsApp ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Send via</Label>
              <ToggleGroup
                type="single"
                value={channel}
                onValueChange={(v) => {
                  if (v !== 'email' && v !== 'whatsapp' && v !== 'both') return;
                  setChannel(v);
                  setMessage(
                    defaultMessageForChannel({
                      channel: v,
                      kind,
                      templateType: meta.templateType,
                      bill,
                      brand,
                      dueDateIso,
                    })
                  );
                }}
                variant="outline"
                className="grid w-full grid-cols-3 gap-0"
                disabled={sending}
              >
                <ToggleGroupItem value="email" className="h-10 gap-1.5 px-1 data-[state=on]:bg-violet-100">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">Email</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="whatsapp"
                  className="h-10 gap-1.5 px-1 data-[state=on]:bg-emerald-50"
                >
                  <WhatsAppIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">WhatsApp</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="both"
                  className="h-10 gap-1.5 px-1 data-[state=on]:bg-sky-50"
                  disabled={!hasEmailOnFile && !canSendEmail}
                  title={
                    hasEmailOnFile || canSendEmail
                      ? 'Send email and WhatsApp'
                      : 'Add an email to enable Both'
                  }
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Both</span>
                </ToggleGroupItem>
              </ToggleGroup>
              {channel === 'both' && !canSendEmail ? (
                <p className="text-xs text-amber-800">Add a valid email to send both.</p>
              ) : null}
            </div>
          ) : null}

          {showWhatsAppFields && allowWhatsApp ? (
            <div className="space-y-2">
              <Label htmlFor="doc-wa-phone" className="text-sm font-medium">
                Customer WhatsApp
              </Label>
              <Input
                id="doc-wa-phone"
                type="tel"
                inputMode="tel"
                placeholder="Phone with country code"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="h-11 text-base sm:h-10 sm:text-sm"
                disabled={sending}
              />
              {windowChecking ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking 24h window…
                </p>
              ) : windowOpen === true ? (
                <p className="text-xs text-emerald-700">
                  Window open
                  {windowHoursLeft != null ? ` · ~${windowHoursLeft}h left to send PDF` : ''}
                </p>
              ) : windowOpen === false ? (
                <p className="text-xs text-amber-800">
                  Window closed — PDF / Accept preview will send via approved WhatsApp template.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Open window: free-form send. Closed window: cold document / Accept templates.
                </p>
              )}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-emerald-700"
                  checked={requireAccept}
                  onChange={(e) => setRequireAccept(e.target.checked)}
                  disabled={sending}
                />
                <span className="text-xs leading-snug text-foreground">
                  <span className="font-semibold">Require Accept</span> — preview PDF on WhatsApp,
                  then <span className="font-semibold">I Accept</span> for the original (works
                  inside 24h and via cold template when closed).
                </span>
              </label>
            </div>
          ) : null}

          {showEmailFields ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Recipients</Label>
                <span className="text-xs text-muted-foreground">
                  {normalizedRecipients.length} valid
                </span>
              </div>

              <div className="space-y-2">
                {recipientRows.map((row, index) => (
                  <div key={`recipient-${index}`} className="flex gap-2">
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={row}
                      onChange={(e) => updateRow(index, e.target.value)}
                      className="h-11 min-w-0 flex-1 text-base sm:h-10 sm:text-sm"
                      disabled={sending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => removeRow(index)}
                      disabled={sending || recipientRows.length <= 1}
                      aria-label="Remove recipient"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 justify-center"
                onClick={addRow}
                disabled={sending}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add email
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="doc-email-message" className="text-sm font-medium">
              {channel === 'whatsapp'
                ? 'WhatsApp caption'
                : channel === 'both'
                  ? 'WhatsApp caption (email uses a plain professional message)'
                  : 'Email message'}
            </Label>
            <Textarea
              id="doc-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={channel === 'whatsapp' || channel === 'both' ? 12 : 4}
              className="min-h-[96px] resize-y text-sm font-sans whitespace-pre-wrap"
              disabled={sending}
            />
            {(channel === 'whatsapp' || channel === 'both') && (
              <p className="text-xs text-muted-foreground">
                Sent with the PDF on WhatsApp — includes quote/bill details and our phone numbers
                (max ~1024 characters).
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-slate-50/80 flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(
              'w-full sm:w-auto',
              channel === 'whatsapp'
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : channel === 'both'
                  ? 'bg-sky-700 hover:bg-sky-800'
                  : meta.sendBtnClass
            )}
            onClick={() => {
              if (channel === 'whatsapp') void handleSendWhatsApp();
              else if (channel === 'both') void handleSendBoth();
              else void handleSendEmail();
            }}
            disabled={sending || !canSend}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : channel === 'whatsapp' ? (
              <>
                <WhatsAppIcon className="h-4 w-4 mr-2" />
                Send WhatsApp
              </>
            ) : channel === 'both' ? (
              <>
                <Mail className="h-4 w-4 mr-1.5" />
                <WhatsAppIcon className="h-4 w-4 mr-2" />
                Send both
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
