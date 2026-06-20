import React, { useMemo, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import AmcEmailSendDialog, { type AmcPersistResult } from '@/components/amc/AmcEmailSendDialog';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { downloadAmcAgreementPdf } from '@/lib/send-amc-agreement-email';
import type { AMCPDFOptions } from '@/lib/amc-pdf-generator';

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

  const defaultRecipients = useMemo(() => {
    const valid = getValidCustomerEmail(customerEmail);
    return valid ? [valid] : [];
  }, [customerEmail]);

  const canAct = Boolean(bill && brand && !disabled);

  const handleDownload = async () => {
    if (!bill) return;
    setDownloading(true);
    const toastId = toast.loading('Saving AMC and generating PDF…');
    try {
      if (onPersistBeforeAction) {
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
          disabled={!canAct || downloading}
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
          variant="default"
          className="h-10 w-full justify-center bg-violet-700 hover:bg-violet-800"
          disabled={!canAct}
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
