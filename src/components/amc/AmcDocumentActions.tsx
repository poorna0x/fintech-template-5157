import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import AmcEmailSendDialog, { type AmcPersistResult } from '@/components/amc/AmcEmailSendDialog';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { downloadAmcAgreementPdf } from '@/lib/send-amc-agreement-email';
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
import type { AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { buildDocumentPdfWhatsAppCaption } from '@/lib/document-pdf-whatsapp-caption';
import { toastIfAborted, toastIfCancelledBeforeSend } from '@/lib/abortSend';
import {
  sendWhatsAppToMany,
} from '@/lib/whatsappMultiDestSend';
import {
  customerAlternatePhone,
  customerIdForWhatsAppDest,
  extraWhatsAppPhoneFromCustomer,
  resolveWhatsAppDestinations,
  uniqueWhatsAppPhones,
} from '@/lib/whatsappPhoneTarget';
import {
  clearWhatsAppDeliveryBanner,
  reportWhatsAppPdfNotDelivered,
  reportWhatsAppPdfPartialDelivery,
  WhatsAppDeliveryInlineBanner,
} from '@/components/whatsapp/WhatsAppDeliveryBanner';

export interface AmcDocumentActionsProps {
  bill: Bill | null;
  brand: DocumentBrand | null;
  endDateIso: string;
  customerEmail?: string | null;
  pdfOptions?: AMCPDFOptions;
  /** Compact row for technician complete-job wizard */
  compact?: boolean;
  disabled?: boolean;
  /** Save a new/changed customer email before AMC email send */
  onSaveCustomerEmail?: (email: string) => Promise<AmcPersistResult>;
  /** Save AMC contract to DB before download */
  onPersistBeforeAction?: () => Promise<AmcPersistResult>;
  /** Save AMC contract to DB before email send (technician reliability) */
  onPersistBeforeEmail?: (recipients: string[]) => Promise<AmcPersistResult>;
  /** Save AMC contract to DB after email sends successfully */
  onPersistAfterEmail?: (recipients: string[]) => Promise<AmcPersistResult>;
  onSent?: () => void;
  className?: string;
}

export default function AmcDocumentActions({
  bill,
  brand,
  endDateIso,
  customerEmail,
  pdfOptions,
  compact = false,
  disabled = false,
  onSaveCustomerEmail,
  onPersistBeforeAction,
  onPersistBeforeEmail,
  onPersistAfterEmail,
  onSent,
  className,
}: AmcDocumentActionsProps) {
  const { cloudApiOn } = useWhatsAppCloudApiGate('documents');
  const [emailOpen, setEmailOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [requireAccept, setRequireAccept] = useState(false);
  const sendAbortRef = useRef<AbortController | null>(null);
  const [waPhone, setWaPhone] = useState(() => String(bill?.customer?.phone || '').trim());
  const [extraWaPhone, setExtraWaPhone] = useState(() =>
    extraWhatsAppPhoneFromCustomer(
      String(bill?.customer?.phone || '').trim(),
      customerAlternatePhone(bill?.customer)
    )
  );
  const [waDeliveryError, setWaDeliveryError] = useState<string | null>(null);

  useEffect(() => {
    const phone = String(bill?.customer?.phone || '').trim();
    setWaPhone(phone);
    setExtraWaPhone(
      extraWhatsAppPhoneFromCustomer(phone, customerAlternatePhone(bill?.customer))
    );
  }, [
    bill?.customer?.phone,
    bill?.customer?.alternate_phone,
    bill?.customer?.alternatePhone,
  ]);

  const defaultRecipients = useMemo(() => {
    const valid = getValidCustomerEmail(customerEmail);
    return valid ? [valid] : [];
  }, [customerEmail]);

  const customerPhone = String(bill?.customer?.phone || '').trim();
  const canAct = Boolean(bill && brand && !disabled);
  const compactPhones = useMemo(
    () => uniqueWhatsAppPhones([compact ? waPhone : customerPhone, extraWaPhone]),
    [compact, waPhone, customerPhone, extraWaPhone]
  );
  const canWhatsApp = canAct && compactPhones.length > 0;

  const handleDownload = async () => {
    if (!bill) return;
    setDownloading(true);
    const toastId = toast.loading('Saving AMC and generating PDF…');
    try {
      if (onPersistBeforeAction) {
        const sessionReady = await ensureSupabaseSessionForWrite();
        if (!sessionReady.ok) {
          toast.error('Could not refresh your session. Please try again in a moment.', {
            id: toastId,
          });
          return;
        }
        const saved = await onPersistBeforeAction();
        if (!saved.ok) {
          toast.error(saved.error || 'Could not save AMC to database', { id: toastId });
          return;
        }
      }
      toast.loading('Generating PDF…', { id: toastId });
      await downloadAmcAgreementPdf(bill, pdfOptions);
      toast.success('AMC PDF downloaded', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Could not download AMC PDF', { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!bill || !brand) {
      toast.error('AMC details required');
      return;
    }
    const resolved = resolveWhatsAppDestinations(
      compact ? waPhone : customerPhone,
      extraWaPhone
    );
    if (resolved.error || resolved.destinations.length === 0) {
      toast.error(resolved.error || 'Enter a valid WhatsApp number');
      return;
    }
    const destinations = resolved.destinations;
    if (!cloudApiOn) {
      if (requireAccept && !compact) {
        toast.error('Require Accept needs WhatsApp Cloud API (Settings → WhatsApp)');
        return;
      }
      const customerName = resolveBillCustomerDisplayName(bill.customer);
      const caption = buildDocumentPdfWhatsAppCaption({
        kind: 'amc',
        brand,
        customerName,
      }).slice(0, 1024);
      for (const to of destinations) openWhatsAppMeDeepLink(to, caption);
      toast.success(
        destinations.length > 1
          ? 'Opened phone WhatsApp for each number — attach the PDF manually if needed'
          : 'Opened phone WhatsApp — attach the PDF manually if needed'
      );
      onSent?.();
      return;
    }
    setSendingWhatsApp(true);
    const ac = new AbortController();
    sendAbortRef.current = ac;
    const signal = ac.signal;
    const toastId = toast.loading('Preparing AMC for WhatsApp…');
    try {
      if (onPersistBeforeAction) {
        const sessionReady = await ensureSupabaseSessionForWrite();
        if (!sessionReady.ok) {
          toast.error('Could not refresh your session. Please try again.', { id: toastId });
          return;
        }
        const saved = await onPersistBeforeAction();
        if (!saved.ok) {
          toast.error(saved.error || 'Could not save AMC', { id: toastId });
          return;
        }
      }
      toast.loading('Generating PDF…', { id: toastId });
      const customerName = resolveBillCustomerDisplayName(bill.customer);
      const customerIdFor = (to: string) =>
        customerIdForWhatsAppDest(
          to,
          customerPhone,
          bill.customer?.id || null,
          customerAlternatePhone(bill.customer)
        );

      if (requireAccept && !compact) {
        toast.loading('Generating preview + original…', { id: toastId });
        const pair = await generateAmcAcceptPdfPair(bill, pdfOptions, signal);
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
              signal,
            }),
          (to, windowClosed) => {
            toast.loading(
              windowClosed
                ? `Sending Accept preview to ${to} (cold template)…`
                : `Sending Accept preview to ${to}…`,
              { id: toastId }
            );
          },
          signal
        );
        if (toastIfCancelledBeforeSend(fanout.cancelled, fanout.sent, toastId)) {
          return;
        }
        if (fanout.sent === 0) {
          const err = fanout.lastError || 'Could not send Accept preview';
          setWaDeliveryError(err);
          reportWhatsAppPdfNotDelivered(err, toastId);
          return;
        }
        showAcceptPreviewSentToast(toastId, fanout.lastVia);
        onSent?.();
        return;
      }

      const pdf = await generateAmcPdfBase64ForWhatsApp(bill, pdfOptions, signal);
      const caption = buildDocumentPdfWhatsAppCaption({
        kind: 'amc',
        brand,
        customerName,
      }).slice(0, 1024);
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
            signal,
            cold: {
              kind: 'amc',
              brand,
              customerName,
            },
          }),
        (to, windowClosed) => {
          toast.loading(
            destinations.length > 1
              ? `Sending AMC PDF to ${to}…`
              : windowClosed
                ? '24h window closed — sending PDF via template…'
                : 'Sending on WhatsApp…',
            { id: toastId }
          );
        },
        signal
      );
      if (toastIfCancelledBeforeSend(fanout.cancelled, fanout.sent, toastId)) {
        return;
      }
      if (fanout.sent === 0) {
        const err = fanout.lastError || 'Could not send AMC on WhatsApp';
        setWaDeliveryError(err);
        reportWhatsAppPdfNotDelivered(err, toastId);
        return;
      }
      if (fanout.sent < destinations.length && fanout.lastError) {
        setWaDeliveryError(fanout.lastError);
        reportWhatsAppPdfPartialDelivery({
          sent: fanout.sent,
          total: destinations.length,
          lastError: fanout.lastError,
        });
      } else {
        setWaDeliveryError(null);
        clearWhatsAppDeliveryBanner();
      }
      const extra =
        fanout.sent < destinations.length && fanout.lastError ? `. ${fanout.lastError}` : '';
      toast.success(
        fanout.sent > 1
          ? `AMC PDF sent on WhatsApp to ${fanout.sent} numbers${extra}`
          : fanout.usedTemplate
            ? `AMC PDF sent via WhatsApp template${extra}`
            : `AMC PDF sent on WhatsApp${extra}`,
        { id: toastId }
      );
      onSent?.();
    } catch (error) {
      if (toastIfAborted(error, toastId)) return;
      console.error(error);
      const err = error instanceof Error ? error.message : 'Could not send AMC on WhatsApp';
      setWaDeliveryError(err);
      reportWhatsAppPdfNotDelivered(err, toastId);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  return (
    <>
      {waDeliveryError ? (
        <div className="mb-2.5">
          <WhatsAppDeliveryInlineBanner
            message={waDeliveryError}
            onDismiss={() => {
              setWaDeliveryError(null);
              clearWhatsAppDeliveryBanner();
            }}
          />
        </div>
      ) : null}
      {canWhatsApp && !compact ? (
        <div className="mb-2 space-y-2">
          {cloudApiOn ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-emerald-700"
              checked={requireAccept}
              onChange={(e) => setRequireAccept(e.target.checked)}
              disabled={sendingWhatsApp || downloading}
            />
            <span className="text-xs leading-snug text-foreground">
              <span className="font-semibold">Require Accept</span> — preview on WhatsApp, then I Accept
              for original AMC (cold template when 24h window is closed)
            </span>
          </label>
          ) : null}
          <div>
            <Label htmlFor="amc-wa-phone-extra-admin" className="text-sm">
              Also send WhatsApp to (optional)
            </Label>
            <Input
              id="amc-wa-phone-extra-admin"
              className="mt-1 h-10"
              value={extraWaPhone}
              onChange={(e) => setExtraWaPhone(e.target.value)}
              placeholder="Another 10-digit mobile"
              inputMode="tel"
              autoComplete="tel"
              disabled={sendingWhatsApp}
            />
          </div>
        </div>
      ) : null}
      {compact ? (
        <div className="space-y-2.5">
          <div>
            <Label htmlFor="amc-wa-phone" className="text-sm">
              WhatsApp number *
            </Label>
            <Input
              id="amc-wa-phone"
              className="mt-1 h-11 rounded-xl bg-white"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="tel"
              autoComplete="tel"
              disabled={sendingWhatsApp}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-violet-900/70">
              Prefills from the customer — edit to send to another number.
            </p>
          </div>
          <div>
            <Label htmlFor="amc-wa-phone-extra" className="text-sm">
              Also send to (optional)
            </Label>
            <Input
              id="amc-wa-phone-extra"
              className="mt-1 h-11 rounded-xl bg-white"
              value={extraWaPhone}
              onChange={(e) => setExtraWaPhone(e.target.value)}
              placeholder="Another 10-digit mobile"
              inputMode="tel"
              autoComplete="tel"
              disabled={sendingWhatsApp}
            />
          </div>
        </div>
      ) : null}
      <div
        className={
          className ||
          (compact
            ? 'grid grid-cols-1 gap-2'
            : 'flex flex-col sm:flex-row gap-2 w-full')
        }
      >
        {compact ? null : (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-center rounded-xl"
            disabled={!canAct || downloading || sendingWhatsApp}
            onClick={() => void handleDownload()}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2 shrink-0" />
            )}
            Download AMC PDF
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className={
            compact
              ? 'h-11 w-full justify-center rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 border-emerald-700'
              : 'h-10 w-full justify-center'
          }
          disabled={!canWhatsApp || downloading || sendingWhatsApp}
          onClick={() => void handleWhatsApp()}
          title={
            compact
              ? compactPhones.length === 0
                ? 'Enter a WhatsApp number'
                : undefined
              : !customerPhone
                ? 'Customer phone required'
                : undefined
          }
        >
          {sendingWhatsApp ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <WhatsAppIcon className="h-4 w-4 mr-2 shrink-0" />
          )}
          {compactPhones.length > 1
            ? `WhatsApp AMC PDF (${compactPhones.length})`
            : 'WhatsApp AMC PDF'}
        </Button>
        {sendingWhatsApp ? (
          <Button
            type="button"
            variant="outline"
            className={compact ? 'h-11 w-full justify-center rounded-xl' : 'h-10 w-full justify-center'}
            onClick={() => sendAbortRef.current?.abort()}
          >
            Cancel send
          </Button>
        ) : null}
        {compact ? null : (
          <Button
            type="button"
            variant="default"
            className="h-10 w-full justify-center bg-sky-700 hover:bg-sky-800"
            disabled={!canAct || sendingWhatsApp}
            onClick={() => setEmailOpen(true)}
          >
            <Mail className="h-4 w-4 mr-2 shrink-0" />
            Email AMC PDF
          </Button>
        )}
      </div>

      {compact ? null : (
      <AmcEmailSendDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        bill={bill}
        brand={brand}
        endDateIso={endDateIso}
        defaultRecipients={defaultRecipients}
        pdfOptions={pdfOptions}
        singleRecipient
        customerEmailOnFile={customerEmail}
        onSaveCustomerEmail={onSaveCustomerEmail}
        onPersistBeforeEmail={
          onPersistBeforeEmail ??
          (onPersistBeforeAction
            ? async (_recipients) => onPersistBeforeAction()
            : undefined)
        }
        onPersistAfterEmail={onPersistAfterEmail}
        onPersistAfterWhatsApp={
          onPersistBeforeAction
            ? async () => onPersistBeforeAction()
            : undefined
        }
        allowWhatsApp
        onSent={onSent}
      />
      )}
    </>
  );
}
