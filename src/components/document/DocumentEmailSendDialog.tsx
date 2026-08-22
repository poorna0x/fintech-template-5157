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
  sendDocumentEmailAcceptInvite,
  showAcceptPreviewSentToast,
  type DocumentAcceptPdfPair,
} from '@/lib/documentAcceptPreview';
import {
  openWhatsAppMeDeepLink,
  resolveBillCustomerDisplayName,
  sendAdminWhatsAppDocumentWithColdFallback,
} from '@/lib/sendAdminWhatsAppApi';
import { formatPhoneForWhatsApp, cn } from '@/lib/utils';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchLastInboundAt,
  hoursLeftInWindow,
  isWithinCustomerServiceWindow,
} from '@/lib/whatsappInbox';
import {
  customerIdForWhatsAppDest,
  resolveWhatsAppDestinations,
} from '@/lib/whatsappPhoneTarget';
import {
  sendWhatsAppToMany,
  whatsappMultiSendOkMessage,
} from '@/lib/whatsappMultiDestSend';

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
  const { cloudApiOn } = useWhatsAppCloudApiGate('documents');
  const waEnabled = allowWhatsApp;
  const meta = KIND_META[kind];
  const [channel, setChannel] = useState<SendChannel>('email');
  const [recipientRows, setRecipientRows] = useState<string[]>([emptyRow()]);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [extraWhatsappPhone, setExtraWhatsappPhone] = useState('');
  const [message, setMessage] = useState(() => getDefaultDocumentMessage(meta.templateType));
  const [sending, setSending] = useState(false);
  const [windowChecking, setWindowChecking] = useState(false);
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);
  const [windowHoursLeft, setWindowHoursLeft] = useState<number | null>(null);
  /** Preview PDF first; original released per channel after the customer accepts. */
  const [requireAccept, setRequireAccept] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seeded = normalizeRecipientList(defaultRecipients);
    setRecipientRows(seeded.length ? seeded : [emptyRow()]);
    const phone = String(bill?.customer?.phone || '').trim();
    setWhatsappPhone(phone);
    setExtraWhatsappPhone('');
    setRequireAccept(false);
    const nextChannel = pickDefaultChannel({
      allowWhatsApp: waEnabled,
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
    waEnabled,
    whatsappExtraLines,
  ]);

  useEffect(() => {
    if (!open || !waEnabled) return;
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
  }, [open, channel, waEnabled, whatsappPhone]);

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

  const handleSendEmail = async (opts?: {
    keepOpen?: boolean;
    toastId?: string | number;
    /** Reuse an already generated preview/original pair (Both + Require Accept). */
    acceptPair?: DocumentAcceptPdfPair;
  }) => {
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

    const toastId =
      opts?.toastId ??
      toast.loading(
        requireAccept
          ? 'Generating preview + original…'
          : 'Generating PDF and sending email…'
      );
    if (opts?.toastId == null) setSending(true);

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again in a moment.', {
          id: toastId,
        });
        return { ok: false as const };
      }

      if (requireAccept) {
        if (!opts?.acceptPair) {
          toast.loading('Generating preview + original…', { id: toastId });
        }
        const pair = opts?.acceptPair ?? (await generateDocumentAcceptPdfPair(kind, bill));
        const customerName = resolveBillCustomerDisplayName(bill.customer);

        let sent = 0;
        let lastError = '';
        for (let i = 0; i < recipients.length; i += 1) {
          const to = recipients[i];
          toast.loading(
            recipients.length > 1
              ? `Sending Accept email to ${to}…`
              : 'Sending Accept email…',
            { id: toastId }
          );
          const invite = await sendDocumentEmailAcceptInvite({
            to,
            brand,
            docType: kind,
            documentLabel: meta.docLabel,
            documentRef: bill.billNumber,
            sourceKey: bill.billNumber,
            customerId: bill.customer?.id || null,
            customerName,
            amountDisplay: bill.totalAmount,
            filename: pair.filename,
            verifyCode: pair.verifyCode,
            previewVerifyCode: pair.previewVerifyCode,
            originalPdfBase64: pair.originalPdfBase64,
            previewPdfBase64: pair.previewPdfBase64,
          });
          if (!invite.ok) {
            lastError = invite.error || 'Could not send the Accept email';
            continue;
          }
          sent += 1;
        }

        const failed = recipients.length - sent;
        if (sent === 0) {
          toast.error(lastError || 'Could not send the Accept email', { id: toastId });
          return { ok: false as const };
        }
        if (!opts?.keepOpen) {
          const okMessage =
            sent > 1
              ? `Accept email sent to ${sent} recipients`
              : 'Accept email sent — customer gets the original PDF after accepting';
          if (failed > 0) {
            toast.warning(`${okMessage} · ${failed} failed`, {
              id: toastId,
              description: lastError,
            });
          } else {
            toast.success(okMessage, { id: toastId });
          }
          onSent?.();
          onOpenChange(false);
        }
        return {
          ok: true as const,
          toastId,
          recipients,
          via: 'accept_email' as const,
          sent,
          failed,
          lastError,
        };
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
      return {
        ok: true as const,
        toastId,
        recipients,
        via: 'email' as const,
        sent: recipients.length,
        failed: 0,
        lastError: '',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error(requireAccept ? 'Could not send the Accept email' : 'Could not send email', {
        id: toastId,
        description: msg,
      });
      return { ok: false as const };
    } finally {
      if (opts?.toastId == null && !opts?.keepOpen) setSending(false);
    }
  };

  const waDestinations = useMemo(
    () => resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone).destinations,
    [whatsappPhone, extraWhatsappPhone]
  );

  const handleSendWhatsApp = async (opts?: {
    keepOpen?: boolean;
    toastId?: string | number;
    /** Reuse an already generated preview/original pair (Both + Require Accept). */
    acceptPair?: DocumentAcceptPdfPair;
  }) => {
    if (!bill || !brand) {
      toast.error('Document details are missing');
      return { ok: false as const };
    }
    const resolved = resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone);
    if (resolved.error || resolved.destinations.length === 0) {
      toast.error(resolved.error || 'Enter a valid customer phone number');
      return { ok: false as const };
    }
    const destinations = resolved.destinations;
    const customerName = resolveBillCustomerDisplayName(bill.customer);
    const customerIdFor = (to: string) =>
      customerIdForWhatsAppDest(to, bill.customer?.phone, bill.customer?.id || null);

    if (!cloudApiOn) {
      if (requireAccept) {
        toast.error('Require Accept needs WhatsApp Cloud API (Settings → WhatsApp)');
        return { ok: false as const };
      }
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
      for (const to of destinations) {
        openWhatsAppMeDeepLink(to, caption);
      }
      toast.success(
        destinations.length > 1
          ? 'Opened phone WhatsApp for each number — attach the PDF manually if needed'
          : 'Opened phone WhatsApp — attach the PDF manually if needed'
      );
      onSent?.();
      onOpenChange(false);
      return { ok: true as const, toastId: undefined, via: 'wa_me' as const, sent: 0 };
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
        if (!opts?.acceptPair) {
          toast.loading('Generating preview + original…', { id: toastId });
        }
        const pair = opts?.acceptPair ?? (await generateDocumentAcceptPdfPair(kind, bill));
        const fanout = await sendWhatsAppToMany(
          destinations,
          (to, windowClosed) =>
            sendDocumentAcceptInvite({
              to,
              brand,
              docType: kind,
              documentLabel: meta.docLabel,
              documentRef: bill.billNumber,
              sourceKey: bill.billNumber,
              customerId: customerIdFor(to),
              customerName,
              amountDisplay: bill.totalAmount,
              filename: pair.filename,
              verifyCode: pair.verifyCode,
              previewVerifyCode: pair.previewVerifyCode,
              originalPdfBase64: pair.originalPdfBase64,
              previewPdfBase64: pair.previewPdfBase64,
              preferColdTemplate: windowClosed,
            }),
          (to, windowClosed, _i, total) => {
            toast.loading(
              total > 1
                ? `Sending Accept preview to ${to}…`
                : windowClosed
                  ? 'Sending Accept preview (cold template)…'
                  : 'Sending Accept preview on WhatsApp…',
              { id: toastId }
            );
          }
        );
        if (fanout.sent === 0) {
          toast.error(fanout.lastError || 'Could not send Accept preview', { id: toastId });
          return { ok: false as const };
        }
        if (!opts?.keepOpen) {
          if (fanout.sent > 1) {
            toast.success(
              whatsappMultiSendOkMessage({
                sent: fanout.sent,
                total: destinations.length,
                usedTemplate: fanout.usedTemplate,
                lastError: fanout.lastError,
                one: 'Preview sent — customer taps I Accept on WhatsApp for the original PDF',
                oneTemplate:
                  'Preview sent (cold template) — customer taps I Accept for the original PDF',
                many: 'Accept preview sent on WhatsApp',
              }),
              { id: toastId }
            );
          } else {
            showAcceptPreviewSentToast(toastId, fanout.lastVia);
          }
          onSent?.();
          onOpenChange(false);
        }
        return { ok: true as const, toastId, via: 'accept_preview' as const, sent: fanout.sent };
      }

      const pdf = await generateGeneratorDocumentPdfBase64(kind, bill);
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

      const fanout = await sendWhatsAppToMany(
        destinations,
        (to, windowClosed) =>
          sendAdminWhatsAppDocumentWithColdFallback({
            to,
            pdfBase64: pdf.pdfBase64,
            filename: pdf.filename,
            caption,
            customerId: customerIdFor(to),
            source: 'documents',
            preferColdTemplate: windowClosed,
            cold: {
              kind,
              customerName,
              brand,
              amount: bill.totalAmount,
              ref: bill.billNumber,
              documentLabel: meta.docLabel,
            },
          }),
        (to, windowClosed, _i, total) => {
          toast.loading(
            total > 1
              ? `Sending PDF to ${to}…`
              : windowClosed
                ? '24h window closed — sending PDF via template…'
                : 'Sending on WhatsApp…',
            { id: toastId }
          );
        }
      );

      if (fanout.sent === 0) {
        if (destinations.length === 1) {
          openWhatsAppMeDeepLink(destinations[0], caption);
          if (!opts?.keepOpen) {
            toast.success(
              'Opened phone WhatsApp (template PDF failed) — attach the PDF manually if needed',
              { id: toastId, description: fanout.lastError }
            );
            onSent?.();
            onOpenChange(false);
          }
          return { ok: true as const, toastId, via: 'wa_me' as const, sent: 0 };
        }
        toast.error(fanout.lastError || 'Could not send on WhatsApp', { id: toastId });
        return { ok: false as const };
      }

      if (!opts?.keepOpen) {
        toast.success(
          whatsappMultiSendOkMessage({
            sent: fanout.sent,
            total: destinations.length,
            usedTemplate: fanout.usedTemplate,
            lastError: fanout.lastError,
            one: 'PDF sent on WhatsApp',
            oneTemplate: 'PDF sent via WhatsApp template',
            many: 'PDF sent on WhatsApp',
          }),
          { id: toastId }
        );
        onSent?.();
        onOpenChange(false);
      }
      return {
        ok: true as const,
        toastId,
        via: fanout.usedTemplate ? ('invite' as const) : ('api' as const),
        sent: fanout.sent,
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
    const toastId = toast.loading(
      requireAccept ? 'Sending Accept invites…' : 'Sending email and WhatsApp…'
    );
    try {
      // One preview/original pair serves both Accept invites (one PDF render, one fingerprint).
      let acceptPair: DocumentAcceptPdfPair | undefined;
      if (requireAccept) {
        if (!bill || !brand) {
          toast.error('Document details are missing', { id: toastId });
          return;
        }
        toast.loading('Generating preview + original…', { id: toastId });
        try {
          acceptPair = await generateDocumentAcceptPdfPair(kind, bill);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : 'Could not prepare the Accept PDFs',
            { id: toastId }
          );
          return;
        }
      }

      toast.loading(requireAccept ? 'Sending Accept email…' : 'Sending email…', { id: toastId });
      const emailResult = await handleSendEmail({ keepOpen: true, toastId, acceptPair });

      toast.loading(
        requireAccept ? 'Sending Accept preview on WhatsApp…' : 'Sending WhatsApp…',
        { id: toastId }
      );
      const waResult = await handleSendWhatsApp({ keepOpen: true, toastId, acceptPair });
      if (!emailResult.ok && !waResult.ok) {
        toast.error(
          requireAccept
            ? 'Could not send either Accept invite'
            : 'Could not send email or WhatsApp',
          { id: toastId }
        );
        return;
      }
      if (!emailResult.ok && waResult.ok) {
        toast.warning(
          requireAccept
            ? 'WhatsApp Accept preview sent, but the Accept email failed'
            : 'WhatsApp sent, but email failed',
          { id: toastId }
        );
        onSent?.();
        onOpenChange(false);
        return;
      }
      if (!waResult.ok) {
        toast.warning(
          requireAccept
            ? 'Accept email sent, but the WhatsApp Accept preview failed'
            : 'Email sent, but WhatsApp failed',
          { id: toastId }
        );
        onSent?.();
        onOpenChange(false);
        return;
      }

      if (!emailResult.ok) return;
      const emailTarget =
        emailResult.recipients?.[0] || normalizedRecipients[0] || 'inbox';
      const emailNote = requireAccept
        ? emailResult.sent > 1
          ? `Accept email sent to ${emailResult.sent} recipients`
          : `Accept email sent to ${emailTarget}`
        : `Email sent to ${emailTarget}`;
      const emailFailNote =
        emailResult.failed > 0 ? ` (${emailResult.failed} email failed)` : '';
      const waNote =
        (waResult.sent ?? 0) > 1
          ? requireAccept
            ? `WhatsApp Accept preview sent to ${waResult.sent} numbers`
            : `WhatsApp PDF sent to ${waResult.sent} numbers`
          : waResult.via === 'invite'
            ? 'WhatsApp PDF sent via template'
            : waResult.via === 'wa_me'
              ? 'WhatsApp opened on phone as backup'
              : waResult.via === 'accept_preview'
                ? 'WhatsApp Accept preview sent'
                : 'WhatsApp PDF sent';
      const summary = `${emailNote} + ${waNote}${emailFailNote}`;
      if (emailResult.failed > 0) {
        toast.warning(summary, { id: toastId, description: emailResult.lastError || undefined });
      } else {
        toast.success(summary, { id: toastId });
      }
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
  const acceptHelpText =
    channel === 'email'
      ? 'email a watermarked preview + secure Accept link. The original PDF is emailed only after the customer accepts.'
      : channel === 'both'
        ? 'send the watermarked preview on both channels. Each channel releases the original separately — email after the secure Accept link, WhatsApp after I Accept.'
        : 'preview PDF on WhatsApp, then I Accept for the original (works inside 24h and via cold template when closed).';

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
            {requireAccept
              ? brandLabel
                ? `Preview PDF · ${brandLabel} · original released after the customer accepts`
                : 'Send the preview PDF — the original is released after the customer accepts'
              : brandLabel
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

          {waEnabled ? (
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

          {showWhatsAppFields && waEnabled ? (
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
              <div className="space-y-1">
                <Label htmlFor="doc-wa-phone-extra" className="text-sm font-medium">
                  Also send to (optional)
                </Label>
                <Input
                  id="doc-wa-phone-extra"
                  type="tel"
                  inputMode="tel"
                  placeholder="Another number"
                  value={extraWhatsappPhone}
                  onChange={(e) => setExtraWhatsappPhone(e.target.value)}
                  className="h-11 text-base sm:h-10 sm:text-sm"
                  disabled={sending}
                />
              </div>
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

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-emerald-700"
              checked={requireAccept}
              onChange={(e) => setRequireAccept(e.target.checked)}
              disabled={sending}
            />
            <span className="text-xs leading-snug text-foreground">
              <span className="font-semibold">Require Accept</span> — {acceptHelpText}
            </span>
          </label>

          {requireAccept ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-900">
              Accept invites use our secure Accept wording, so the message below is not used. The
              customer first receives the watermarked{' '}
              <span className="font-semibold">PREVIEW – NOT VALID</span> PDF and gets the original
              only after accepting on that channel.
            </p>
          ) : (
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
                  Sent with the PDF on WhatsApp — includes quote/bill details and our phone
                  numbers (max ~1024 characters).
                </p>
              )}
            </div>
          )}
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
                {waDestinations.length > 1
                  ? `Send WhatsApp (${waDestinations.length})`
                  : 'Send WhatsApp'}
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
                {requireAccept ? 'Send Accept email' : 'Send email'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
