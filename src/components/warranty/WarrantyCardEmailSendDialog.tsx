import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
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
import { getDefaultDocumentMessage } from '@/lib/admin-email-templates';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import {
  customerEmailNeedsSave,
  getValidCustomerEmail,
} from '@/lib/customer-email';
import { isValidEmailFormat } from '@/lib/email-recipients';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  getWarrantyCardEmailSuccessMessage,
  sendWarrantyCardEmail,
} from '@/lib/send-warranty-card-email';
import type { WarrantyCardPDFData } from '@/lib/warranty-card-pdf-generator';
import { forceLightThemeClass } from '@/lib/force-light-theme';

export type WarrantyEmailPersistResult = { ok: boolean; error?: string };

export interface WarrantyCardEmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfData: WarrantyCardPDFData | null;
  brand: DocumentBrand | null;
  customerEmailOnFile?: string | null;
  customerId?: string;
  onSaveCustomerEmail?: (email: string) => Promise<WarrantyEmailPersistResult>;
  onSent?: () => void;
}

export default function WarrantyCardEmailSendDialog({
  open,
  onOpenChange,
  pdfData,
  brand,
  customerEmailOnFile,
  customerId,
  onSaveCustomerEmail,
  onSent,
}: WarrantyCardEmailSendDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState(() => getDefaultDocumentMessage('warranty_document'));
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setRecipientEmail('');
      return;
    }
    const seeded = getValidCustomerEmail(customerEmailOnFile);
    setRecipientEmail(seeded || '');
    setMessage(getDefaultDocumentMessage('warranty_document'));
  }, [open, customerEmailOnFile]);

  const brandLabel = brand ? getDocumentBrandLabel(brand) : '';
  const canSend = Boolean(pdfData && brand);
  const customerEmailOnRecord = getValidCustomerEmail(customerEmailOnFile);

  const recipientValid = useMemo(() => {
    const trimmed = recipientEmail.trim();
    return trimmed.length > 0 && isValidEmailFormat(trimmed);
  }, [recipientEmail]);

  const handleSend = async () => {
    if (!pdfData || !brand) {
      toast.error('Warranty details are missing');
      return;
    }

    const trimmed = recipientEmail.trim();
    if (!trimmed) {
      toast.error('Enter a customer email address');
      return;
    }
    if (!isValidEmailFormat(trimmed)) {
      toast.error('Enter a valid email address');
      return;
    }

    setSending(true);
    const toastId = toast.loading('Generating PDF and sending email…');

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again in a moment.', { id: toastId });
        return;
      }

      if (onSaveCustomerEmail && customerEmailNeedsSave(customerEmailOnFile, trimmed)) {
        toast.loading('Saving customer email…', { id: toastId });
        const emailSaved = await onSaveCustomerEmail(trimmed);
        if (!emailSaved.ok) {
          toast.error(emailSaved.error || 'Could not save customer email', { id: toastId });
          return;
        }
      }

      toast.loading('Generating PDF and sending email…', { id: toastId });

      const result = await sendWarrantyCardEmail({
        data: pdfData,
        brand,
        recipientEmails: [trimmed],
        customMessage: message.trim() || undefined,
        customerId,
      });

      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return;
      }

      toast.success(getWarrantyCardEmailSuccessMessage(brand, [trimmed]), { id: toastId });
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error('Could not send warranty card email', { id: toastId, description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={forceLightThemeClass('sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>Email warranty card</DialogTitle>
          <DialogDescription>
            {brandLabel
              ? `Send the warranty card PDF from ${brandLabel} to the customer.`
              : 'Send the warranty card PDF to the customer.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="warranty-email-to">Customer email</Label>
            <Input
              id="warranty-email-to"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="customer@example.com"
              autoComplete="email"
            />
            {customerEmailOnRecord && recipientEmail.trim().toLowerCase() !== customerEmailOnRecord.toLowerCase() && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Sending to a different address for this email only — the customer record stays{' '}
                {customerEmailOnRecord}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="warranty-email-message">Message</Label>
            <Textarea
              id="warranty-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSend || !recipientValid || sending} onClick={() => void handleSend()}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
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
