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
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { getDefaultDocumentMessage } from '@/lib/admin-email-templates';
import { buildDocumentPdfWhatsAppCaption } from '@/lib/document-pdf-whatsapp-caption';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import {
  customerEmailNeedsSave,
  getValidCustomerEmail,
} from '@/lib/customer-email';
import {
  isValidEmailFormat,
  normalizeRecipientList,
} from '@/lib/email-recipients';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  getAmcEmailSuccessMessage,
  sendAmcAgreementEmail,
} from '@/lib/send-amc-agreement-email';
import { forceLightThemeClass } from '@/lib/force-light-theme';
import type { AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { generateAmcPdfBase64ForWhatsApp } from '@/lib/send-amc-whatsapp';
import {
  generateAmcAcceptPdfPair,
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

export type AmcPersistResult = { ok: boolean; error?: string };
export type AmcSendChannel = 'email' | 'whatsapp' | 'both';

function pickDefaultAmcChannel(opts: {
  allowWhatsApp: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}): AmcSendChannel {
  if (!opts.allowWhatsApp) return 'email';
  if (opts.hasEmail && opts.hasPhone) return 'both';
  if (opts.hasPhone && !opts.hasEmail) return 'whatsapp';
  return 'email';
}

export interface AmcEmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: Bill | null;
  brand: DocumentBrand | null;
  endDateIso: string;
  /** Pre-filled recipient(s), e.g. customer email */
  defaultRecipients?: string[];
  pdfOptions?: AMCPDFOptions;
  /** Technician flow: one editable email field (no multi-recipient UI) */
  singleRecipient?: boolean;
  /** Customer email currently on file (for save-if-missing flow) */
  customerEmailOnFile?: string | null;
  /** Persist a new/changed customer email before sending AMC */
  onSaveCustomerEmail?: (email: string) => Promise<AmcPersistResult>;
  /** Save AMC before generating PDF / sending (technician reliability) */
  onPersistBeforeEmail?: (recipients: string[]) => Promise<AmcPersistResult>;
  /** Save AMC to DB after email sends successfully */
  onPersistAfterEmail?: (recipients: string[]) => Promise<AmcPersistResult>;
  /** Save AMC to DB after WhatsApp PDF / invite sends successfully */
  onPersistAfterWhatsApp?: () => Promise<AmcPersistResult>;
  /** Allow Email | WhatsApp channel picker (AMC generator). Default true. */
  allowWhatsApp?: boolean;
  onSent?: () => void;
}

function emptyRow(): string {
  return '';
}

export default function AmcEmailSendDialog({
  open,
  onOpenChange,
  bill,
  brand,
  endDateIso,
  defaultRecipients = [],
  pdfOptions,
  singleRecipient = false,
  customerEmailOnFile,
  onSaveCustomerEmail,
  onPersistBeforeEmail,
  onPersistAfterEmail,
  onPersistAfterWhatsApp,
  allowWhatsApp = true,
  onSent,
}: AmcEmailSendDialogProps) {
  const { cloudApiOn } = useWhatsAppCloudApiGate('documents');
  const waEnabled = allowWhatsApp && cloudApiOn;
  const [channel, setChannel] = useState<AmcSendChannel>('email');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientRows, setRecipientRows] = useState<string[]>([emptyRow()]);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [extraWhatsappPhone, setExtraWhatsappPhone] = useState('');
  const [message, setMessage] = useState(() => getDefaultDocumentMessage('amc_document'));
  const [sending, setSending] = useState(false);
  const [windowChecking, setWindowChecking] = useState(false);
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);
  const [windowHoursLeft, setWindowHoursLeft] = useState<number | null>(null);
  const [requireAccept, setRequireAccept] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seeded = normalizeRecipientList(defaultRecipients);
    if (singleRecipient) {
      setRecipientEmail(seeded[0] || '');
    } else {
      setRecipientRows(seeded.length ? seeded : [emptyRow()]);
    }
    setWhatsappPhone(String(bill?.customer?.phone || '').trim());
    setExtraWhatsappPhone('');
    setRequireAccept(false);
    setMessage(getDefaultDocumentMessage('amc_document'));
    const phone = String(bill?.customer?.phone || '').trim();
    setChannel(
      pickDefaultAmcChannel({
        allowWhatsApp: waEnabled,
        hasEmail: seeded.length > 0,
        hasPhone: formatPhoneForWhatsApp(phone).length >= 10,
      })
    );
    setWindowOpen(null);
    setWindowHoursLeft(null);
  }, [open, defaultRecipients, singleRecipient, bill?.customer?.phone, waEnabled]);

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

  const normalizedRecipients = useMemo(() => {
    if (singleRecipient) {
      const trimmed = recipientEmail.trim();
      return isValidEmailFormat(trimmed) ? [trimmed] : [];
    }
    return normalizeRecipientList(recipientRows);
  }, [singleRecipient, recipientEmail, recipientRows]);

  const brandLabel = brand ? getDocumentBrandLabel(brand) : '';
  const hasCustomerEmailOnFile = Boolean(getValidCustomerEmail(customerEmailOnFile));

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

  const handleSendEmail = async () => {
    if (!bill || !brand) {
      toast.error('Agreement details are missing');
      return;
    }

    let recipients: string[];

    if (singleRecipient) {
      const trimmed = recipientEmail.trim();
      if (!trimmed) {
        toast.error('Enter a customer email address');
        return;
      }
      if (!isValidEmailFormat(trimmed)) {
        toast.error('Enter a valid email address');
        return;
      }
      recipients = [trimmed];
    } else {
      recipients = normalizeRecipientList(recipientRows);
      if (!recipients.length) {
        toast.error('Add at least one valid email address');
        return;
      }

      const invalid = recipientRows
        .map((r) => r.trim())
        .filter((r) => r && !isValidEmailFormat(r));
      if (invalid.length) {
        toast.error(`Invalid email: ${invalid[0]}`);
        return;
      }
    }

    setSending(true);
    const toastId = toast.loading('Generating PDF and sending email…');

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again in a moment.', {
          id: toastId,
        });
        return;
      }

      if (
        singleRecipient &&
        onSaveCustomerEmail &&
        customerEmailNeedsSave(customerEmailOnFile, recipients[0])
      ) {
        toast.loading('Saving customer email…', { id: toastId });
        const emailSaved = await onSaveCustomerEmail(recipients[0]);
        if (!emailSaved.ok) {
          toast.error(emailSaved.error || 'Could not save customer email', { id: toastId });
          return;
        }
      }

      if (onPersistBeforeEmail) {
        toast.loading('Saving AMC to database…', { id: toastId });
        const preSaved = await onPersistBeforeEmail(recipients);
        if (!preSaved.ok) {
          toast.error(preSaved.error || 'Could not save AMC to database', { id: toastId });
          return;
        }
      }

      toast.loading('Generating PDF and sending email…', { id: toastId });

      const billForSend =
        singleRecipient && bill.customer.email !== recipients[0]
          ? { ...bill, customer: { ...bill.customer, email: recipients[0] } }
          : bill;

      const result = await sendAmcAgreementEmail({
        bill: billForSend,
        brand,
        recipientEmails: recipients,
        endDateIso,
        pdfOptions,
        customMessage: message.trim() || undefined,
      });

      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return;
      }

      if (onPersistAfterEmail) {
        toast.loading('Saving AMC to database…', { id: toastId });
        const saved = await onPersistAfterEmail(recipients);
        if (!saved.ok) {
          toast.warning('Email sent, but AMC could not be saved', {
            id: toastId,
            description: saved.error || 'Try downloading AMC to save again',
          });
          onSent?.();
          onOpenChange(false);
          return;
        }
      }

      toast.success(
        onPersistAfterEmail
          ? `${getAmcEmailSuccessMessage(brand, recipients)} — saved to database`
          : getAmcEmailSuccessMessage(brand, recipients),
        { id: toastId }
      );
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error('Could not send AMC email', { id: toastId, description: msg });
    } finally {
      setSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!bill || !brand) {
      toast.error('Agreement details are missing');
      return;
    }
    const resolved = resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone);
    if (resolved.error || resolved.destinations.length === 0) {
      toast.error(resolved.error || 'Enter a valid customer phone number');
      return;
    }
    const destinations = resolved.destinations;
    const customerName = resolveBillCustomerDisplayName(bill.customer);
    const customerIdFor = (to: string) =>
      customerIdForWhatsAppDest(to, bill.customer?.phone, bill.customer?.id || null);

    setSending(true);
    const toastId = toast.loading('Preparing AMC for WhatsApp…');
    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again.', { id: toastId });
        return;
      }

      if (onPersistBeforeEmail) {
        toast.loading('Saving AMC to database…', { id: toastId });
        const preSaved = await onPersistBeforeEmail([]);
        if (!preSaved.ok) {
          toast.error(preSaved.error || 'Could not save AMC to database', { id: toastId });
          return;
        }
      }

      toast.loading('Generating PDF…', { id: toastId });

      if (requireAccept) {
        toast.loading('Generating preview + original…', { id: toastId });
        const pair = await generateAmcAcceptPdfPair(bill, pdfOptions);
        const fanout = await sendWhatsAppToMany(
          destinations,
          (to, windowClosed) =>
            sendDocumentAcceptInvite({
              to,
              brand,
              docType: 'amc',
              documentLabel: 'AMC agreement',
              documentRef: bill.billNumber,
              sourceKey: bill.billNumber,
              customerId: customerIdFor(to),
              customerName,
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
          return;
        }
        if (onPersistAfterWhatsApp) {
          toast.loading('Saving AMC to database…', { id: toastId });
          const saved = await onPersistAfterWhatsApp();
          if (!saved.ok) {
            toast.warning('Accept preview sent, but AMC could not be saved', {
              id: toastId,
              description: saved.error,
            });
            onSent?.();
            onOpenChange(false);
            return;
          }
        }
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
        return;
      }

      const pdf = await generateAmcPdfBase64ForWhatsApp(bill, pdfOptions);
      const caption = (
        message.trim() ||
        buildDocumentPdfWhatsAppCaption({
          kind: 'amc',
          brand,
          customerName,
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
              kind: 'amc',
              brand,
              customerName,
            },
          }),
        (to, windowClosed, _i, total) => {
          toast.loading(
            total > 1
              ? `Sending AMC PDF to ${to}…`
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
          toast.success(
            'Opened phone WhatsApp (template PDF failed) — attach the PDF manually if needed',
            { id: toastId, description: fanout.lastError }
          );
          onSent?.();
          onOpenChange(false);
          return;
        }
        toast.error(fanout.lastError || 'Could not send AMC on WhatsApp', { id: toastId });
        return;
      }

      if (onPersistAfterWhatsApp) {
        toast.loading('Saving AMC to database…', { id: toastId });
        const saved = await onPersistAfterWhatsApp();
        if (!saved.ok) {
          toast.warning('WhatsApp sent, but AMC could not be saved', {
            id: toastId,
            description: saved.error,
          });
          onSent?.();
          onOpenChange(false);
          return;
        }
      }

      toast.success(
        whatsappMultiSendOkMessage({
          sent: fanout.sent,
          total: destinations.length,
          usedTemplate: fanout.usedTemplate,
          lastError: fanout.lastError,
          one: 'AMC PDF sent on WhatsApp',
          oneTemplate: 'AMC PDF sent via WhatsApp template',
          many: 'AMC PDF sent on WhatsApp',
        }),
        { id: toastId }
      );
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not send AMC on WhatsApp', {
        id: toastId,
      });
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    if (channel === 'whatsapp') void handleSendWhatsApp();
    else if (channel === 'both') void handleSendBoth();
    else void handleSendEmail();
  };

  const canSendEmail = Boolean(bill && brand && normalizedRecipients.length);
  const canSendWhatsApp = Boolean(bill && brand && formatPhoneForWhatsApp(whatsappPhone).length >= 10);
  const waDestinations = useMemo(
    () => resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone).destinations,
    [whatsappPhone, extraWhatsappPhone]
  );
  const canSendBoth = canSendEmail && canSendWhatsApp;
  const canSend =
    channel === 'whatsapp' ? canSendWhatsApp : channel === 'both' ? canSendBoth : canSendEmail;
  const showEmailFields = channel === 'email' || channel === 'both';
  const showWhatsAppFields = (channel === 'whatsapp' || channel === 'both') && waEnabled;

  const handleSendBoth = async () => {
    if (!canSendEmail) {
      toast.error('Add at least one valid email address');
      return;
    }
    if (!canSendWhatsApp) {
      toast.error('Enter a valid customer phone number');
      return;
    }
    if (!bill || !brand) {
      toast.error('Agreement details are missing');
      return;
    }

    setSending(true);
    const toastId = toast.loading('Sending email and WhatsApp…');
    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again.', { id: toastId });
        return;
      }

      const recipients = normalizedRecipients;

      if (
        singleRecipient &&
        onSaveCustomerEmail &&
        customerEmailNeedsSave(customerEmailOnFile, recipients[0])
      ) {
        toast.loading('Saving customer email…', { id: toastId });
        const emailSaved = await onSaveCustomerEmail(recipients[0]);
        if (!emailSaved.ok) {
          toast.error(emailSaved.error || 'Could not save customer email', { id: toastId });
          return;
        }
      }

      if (onPersistBeforeEmail) {
        toast.loading('Saving AMC to database…', { id: toastId });
        const preSaved = await onPersistBeforeEmail(recipients);
        if (!preSaved.ok) {
          toast.error(preSaved.error || 'Could not save AMC to database', { id: toastId });
          return;
        }
      }

      toast.loading('Sending email…', { id: toastId });
      const billForSend =
        singleRecipient && bill.customer.email !== recipients[0]
          ? { ...bill, customer: { ...bill.customer, email: recipients[0] } }
          : bill;

      const emailResult = await sendAmcAgreementEmail({
        bill: billForSend,
        brand,
        recipientEmails: recipients,
        endDateIso,
        pdfOptions,
        customMessage: message.trim() || undefined,
      });
      if (!emailResult.ok) {
        toast.error(emailResult.error || 'Could not send email', { id: toastId });
        return;
      }

      if (onPersistAfterEmail) {
        const saved = await onPersistAfterEmail(recipients);
        if (!saved.ok) {
          toast.warning('Email sent, but AMC could not be saved — continuing WhatsApp…', {
            id: toastId,
            description: saved.error,
          });
        }
      }

      const resolved = resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone);
      if (resolved.error || resolved.destinations.length === 0) {
        toast.error(resolved.error || 'Enter a valid customer phone number');
        return;
      }
      const destinations = resolved.destinations;
      const customerName = resolveBillCustomerDisplayName(bill.customer);
      const customerIdFor = (to: string) =>
        customerIdForWhatsAppDest(to, bill.customer?.phone, bill.customer?.id || null);

      toast.loading('Sending WhatsApp…', { id: toastId });
      if (requireAccept) {
        const pair = await generateAmcAcceptPdfPair(bill, pdfOptions);
        const fanout = await sendWhatsAppToMany(destinations, (to, windowClosed) =>
          sendDocumentAcceptInvite({
            to,
            brand,
            docType: 'amc',
            documentLabel: 'AMC agreement',
            documentRef: bill.billNumber,
            sourceKey: bill.billNumber,
            customerId: customerIdFor(to),
            customerName,
            filename: pair.filename,
            verifyCode: pair.verifyCode,
            previewVerifyCode: pair.previewVerifyCode,
            originalPdfBase64: pair.originalPdfBase64,
            previewPdfBase64: pair.previewPdfBase64,
            preferColdTemplate: windowClosed,
          })
        );
        if (fanout.sent === 0) {
          toast.error(fanout.lastError || 'Email sent, but Accept WhatsApp failed', { id: toastId });
          return;
        }
        if (onPersistAfterWhatsApp) {
          await onPersistAfterWhatsApp();
        }
        if (fanout.sent > 1) {
          toast.success(`Email + Accept preview sent on WhatsApp to ${fanout.sent} numbers`, {
            id: toastId,
          });
        } else {
          showAcceptPreviewSentToast(toastId, fanout.lastVia);
        }
        onSent?.();
        onOpenChange(false);
        return;
      }
      const pdf = await generateAmcPdfBase64ForWhatsApp(bill, pdfOptions);
      const caption = (
        message.trim() ||
        buildDocumentPdfWhatsAppCaption({
          kind: 'amc',
          brand,
          customerName,
        })
      ).slice(0, 1024);
      const fanout = await sendWhatsAppToMany(destinations, (to, windowClosed) =>
        sendAdminWhatsAppDocumentWithColdFallback({
          to,
          pdfBase64: pdf.pdfBase64,
          filename: pdf.filename,
          caption,
          customerId: customerIdFor(to),
          source: 'documents',
          preferColdTemplate: windowClosed,
          cold: {
            kind: 'amc',
            brand,
            customerName,
          },
        })
      );

      let waNote =
        fanout.sent > 1
          ? `WhatsApp PDF sent to ${fanout.sent} numbers`
          : fanout.usedTemplate
            ? 'WhatsApp PDF sent via template'
            : 'WhatsApp PDF sent';
      if (fanout.sent === 0) {
        if (destinations.length === 1) {
          openWhatsAppMeDeepLink(destinations[0], caption);
          waNote = 'WhatsApp opened on phone as backup';
        } else {
          toast.warning('Email sent, but WhatsApp failed', {
            id: toastId,
            description: fanout.lastError,
          });
          onSent?.();
          onOpenChange(false);
          return;
        }
      }

      if (onPersistAfterWhatsApp) {
        await onPersistAfterWhatsApp();
      }

      toast.success(`Email + ${waNote}`, { id: toastId });
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not send both', {
        id: toastId,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent
        dismissible={false}
        className={forceLightThemeClass(
          'max-w-lg w-[calc(100vw-1.25rem)] sm:w-full max-h-[min(92dvh,720px)] overflow-y-auto p-0 gap-0'
        )}
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b bg-violet-50/80">
          <DialogTitle className="text-base sm:text-lg text-violet-950 pr-8">
            Send AMC agreement
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-violet-900/80">
            {brandLabel
              ? `PDF · ${brandLabel} · Email, WhatsApp, or both`
              : 'Send the AMC PDF by email, WhatsApp, or both'}
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
                {endDateIso ? ` · valid until ${endDateIso}` : null}
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
                  if (v === 'email' || v === 'whatsapp' || v === 'both') setChannel(v);
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
                  disabled={!canSendEmail && normalizedRecipients.length === 0}
                  title="Send email and WhatsApp"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Both</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}

          {showWhatsAppFields ? (
            <div className="space-y-2">
              <Label htmlFor="amc-recipient-phone" className="text-sm font-medium">
                Customer WhatsApp
              </Label>
              <Input
                id="amc-recipient-phone"
                type="tel"
                inputMode="tel"
                placeholder="Phone with country code"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="h-10"
                disabled={sending}
              />
              <div className="space-y-1">
                <Label htmlFor="amc-recipient-phone-extra" className="text-sm font-medium">
                  Also send to (optional)
                </Label>
                <Input
                  id="amc-recipient-phone-extra"
                  type="tel"
                  inputMode="tel"
                  placeholder="Another number"
                  value={extraWhatsappPhone}
                  onChange={(e) => setExtraWhatsappPhone(e.target.value)}
                  className="h-10"
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
                  Window closed — AMC PDF / Accept preview will send via approved WhatsApp template.
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
                  <span className="font-semibold">Require Accept</span> — preview on WhatsApp, then{' '}
                  <span className="font-semibold">I Accept</span> for the original AMC (works inside
                  24h and via cold template when closed).
                </span>
              </label>
            </div>
          ) : null}

          {showEmailFields ? (
            singleRecipient ? (
            <div className="space-y-2">
              <Label htmlFor="amc-recipient-email" className="text-sm font-medium">
                Customer email
              </Label>
              <Input
                id="amc-recipient-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={
                  hasCustomerEmailOnFile ? 'name@example.com' : 'Enter customer email address'
                }
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="h-10"
                disabled={sending}
              />
              <p className="text-xs text-muted-foreground">
                {hasCustomerEmailOnFile
                  ? 'Pre-filled from customer record — edit if needed. Changes are saved to the customer.'
                  : 'No email on file — enter one here. It will be saved to the customer when you send.'}
              </p>
            </div>
          ) : (
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
                      className="h-10 min-w-0 flex-1"
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

              <div className="flex flex-col sm:flex-row gap-2">
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
            </div>
          )
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="amc-email-message" className="text-sm font-medium">
              {channel === 'whatsapp'
                ? 'WhatsApp caption'
                : channel === 'both'
                  ? 'Message (email body + WhatsApp caption)'
                  : 'Email message'}
            </Label>
            <Textarea
              id="amc-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="min-h-[96px] resize-y text-sm"
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              {channel === 'whatsapp'
                ? 'Shown with the PDF on WhatsApp (max ~1024 characters).'
                : 'Uses the standard AMC email template. Edit the message above if needed.'}
            </p>
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
                  : 'bg-violet-700 hover:bg-violet-800'
            )}
            onClick={handleSend}
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
                Send email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
