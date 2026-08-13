import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import AmcEmailSendDialog, { type AmcPersistResult } from '@/components/amc/AmcEmailSendDialog';
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
  resolveBillCustomerDisplayName,
  sendAdminWhatsAppDocumentWithColdFallback,
} from '@/lib/sendAdminWhatsAppApi';
import type { AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { buildDocumentPdfWhatsAppCaption } from '@/lib/document-pdf-whatsapp-caption';
import {
  fetchLastInboundAt,
  invalidateInboundWindowCache,
  isCustomerServiceWindowClosed,
} from '@/lib/whatsappInbox';
import { supabase } from '@/lib/supabaseClient';
import {
  customerIdForWhatsAppDest,
  resolveWhatsAppDestinations,
  uniqueWhatsAppPhones,
} from '@/lib/whatsappPhoneTarget';

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
  const [emailOpen, setEmailOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [requireAccept, setRequireAccept] = useState(false);
  const [waPhone, setWaPhone] = useState(() => String(bill?.customer?.phone || '').trim());
  const [extraWaPhone, setExtraWaPhone] = useState('');

  useEffect(() => {
    setWaPhone(String(bill?.customer?.phone || '').trim());
  }, [bill?.customer?.phone]);

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
    setSendingWhatsApp(true);
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
        customerIdForWhatsAppDest(to, customerPhone, bill.customer?.id || null);

      if (requireAccept && !compact) {
        toast.loading('Generating preview + original…', { id: toastId });
        const pair = await generateAmcAcceptPdfPair(bill, pdfOptions);
        let sent = 0;
        let lastError = '';
        for (const to of destinations) {
          const inboundAt = await fetchLastInboundAt(to, supabase);
          const windowClosed = isCustomerServiceWindowClosed(inboundAt);
          toast.loading(
            windowClosed
              ? `Sending Accept preview to ${to} (cold template)…`
              : `Sending Accept preview to ${to}…`,
            { id: toastId }
          );
          const invite = await sendDocumentAcceptInvite({
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
          });
          if (!invite.ok) {
            lastError = invite.error || 'Could not send Accept preview';
            continue;
          }
          sent += 1;
          invalidateInboundWindowCache(to);
        }
        if (sent === 0) {
          toast.error(lastError || 'Could not send Accept preview', { id: toastId });
          return;
        }
        showAcceptPreviewSentToast(toastId, 'api');
        onSent?.();
        return;
      }

      const pdf = await generateAmcPdfBase64ForWhatsApp(bill, pdfOptions);
      const caption = buildDocumentPdfWhatsAppCaption({
        kind: 'amc',
        brand,
        customerName,
      }).slice(0, 1024);
      let sent = 0;
      let usedTemplate = false;
      let lastError = '';
      for (const to of destinations) {
        const inboundAt = await fetchLastInboundAt(to, supabase);
        const windowClosed = isCustomerServiceWindowClosed(inboundAt);
        toast.loading(
          destinations.length > 1
            ? `Sending AMC PDF to ${to}…`
            : windowClosed
              ? '24h window closed — sending PDF via template…'
              : 'Sending on WhatsApp…',
          { id: toastId }
        );
        const result = await sendAdminWhatsAppDocumentWithColdFallback({
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
        });
        if (!result.ok) {
          lastError =
            result.error ||
            '24h window closed — cold PDF template not approved yet (svc_doc_amc_*_v2)';
          continue;
        }
        sent += 1;
        if (result.viaColdTemplate) usedTemplate = true;
        invalidateInboundWindowCache(to);
      }
      if (sent === 0) {
        toast.error(lastError || 'Could not send AMC on WhatsApp', { id: toastId });
        return;
      }
      const extra =
        sent < destinations.length && lastError ? ` (${destinations.length - sent} failed)` : '';
      toast.success(
        sent > 1
          ? `AMC PDF sent on WhatsApp to ${sent} numbers${extra}`
          : usedTemplate
            ? 'AMC PDF sent via WhatsApp template'
            : 'AMC PDF sent on WhatsApp',
        { id: toastId }
      );
      onSent?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not send AMC on WhatsApp', {
        id: toastId,
      });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  return (
    <>
      {canWhatsApp && !compact ? (
        <div className="mb-2 space-y-2">
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
