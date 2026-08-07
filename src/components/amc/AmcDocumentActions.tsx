import React, { useMemo, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import AmcEmailSendDialog, { type AmcPersistResult } from '@/components/amc/AmcEmailSendDialog';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { downloadAmcAgreementPdf } from '@/lib/send-amc-agreement-email';
import { generateAmcPdfBase64ForWhatsApp } from '@/lib/send-amc-whatsapp';
import { sendAdminWhatsAppDocument, sendColdDocumentInvite } from '@/lib/sendAdminWhatsAppApi';
import type { AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { getDefaultDocumentMessage } from '@/lib/admin-email-templates';

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

  const defaultRecipients = useMemo(() => {
    const valid = getValidCustomerEmail(customerEmail);
    return valid ? [valid] : [];
  }, [customerEmail]);

  const customerPhone = String(bill?.customer?.phone || '').trim();
  const canAct = Boolean(bill && brand && !disabled);
  const canWhatsApp = canAct && Boolean(customerPhone);

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
    if (!bill || !brand || !customerPhone) {
      toast.error('Customer phone required for WhatsApp');
      return;
    }
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
      const pdf = await generateAmcPdfBase64ForWhatsApp(bill, pdfOptions);
      toast.loading('Sending on WhatsApp…', { id: toastId });
      const caption = getDefaultDocumentMessage('amc_document').slice(0, 1024);
      const result = await sendAdminWhatsAppDocument({
        to: customerPhone,
        pdfBase64: pdf.pdfBase64,
        filename: pdf.filename,
        caption,
      });
      if (!result.ok) {
        if (result.needsWindowOrTemplate) {
          toast.loading('24h window closed — sending invite template…', { id: toastId });
          const invite = await sendColdDocumentInvite({
            to: customerPhone,
            kind: 'amc',
            customerName: bill.customer?.name || 'Customer',
          });
          if (invite.ok) {
            toast.success(
              'Invite sent — when they reply YES, tap WhatsApp AMC PDF again to send the file',
              { id: toastId }
            );
            return;
          }
          toast.error(
            invite.error ||
              '24h window closed — ask the customer to message first, then resend',
            { id: toastId }
          );
          return;
        }
        toast.error(result.error || 'WhatsApp send failed', { id: toastId });
        return;
      }
      toast.success('AMC PDF sent on WhatsApp', { id: toastId });
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
      <div
        className={
          className ||
          (compact
            ? 'grid grid-cols-1 sm:grid-cols-2 gap-2'
            : 'flex flex-col sm:flex-row gap-2 w-full')
        }
      >
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-center"
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
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-center"
          disabled={!canWhatsApp || downloading || sendingWhatsApp}
          onClick={() => void handleWhatsApp()}
          title={!customerPhone ? 'Customer phone required' : undefined}
        >
          {sendingWhatsApp ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <WhatsAppIcon className="h-4 w-4 mr-2 shrink-0" />
          )}
          WhatsApp AMC PDF
        </Button>
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
      </div>

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
        onSent={onSent}
      />
    </>
  );
}
