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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
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
  generateWarrantyCardPdfBase64,
  getWarrantyCardEmailSuccessMessage,
  sendWarrantyCardEmail,
} from '@/lib/send-warranty-card-email';
import type { WarrantyCardPDFData } from '@/lib/warranty-card-pdf-generator';
import { forceLightThemeClass } from '@/lib/force-light-theme';
import {
  openWhatsAppMeDeepLink,
  sendAdminWhatsAppDocument,
  sendColdDocumentInvite,
} from '@/lib/sendAdminWhatsAppApi';
import { formatPhoneForWhatsApp, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchLastInboundAt,
  hoursLeftInWindow,
  invalidateInboundWindowCache,
  isWithinCustomerServiceWindow,
} from '@/lib/whatsappInbox';

type SendChannel = 'email' | 'whatsapp';

export type WarrantyEmailPersistResult = { ok: boolean; error?: string };

export interface WarrantyCardEmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfData: WarrantyCardPDFData | null;
  brand: DocumentBrand | null;
  customerEmailOnFile?: string | null;
  customerId?: string;
  defaultPhone?: string | null;
  allowWhatsApp?: boolean;
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
  defaultPhone,
  allowWhatsApp = true,
  onSaveCustomerEmail,
  onSent,
}: WarrantyCardEmailSendDialogProps) {
  const [channel, setChannel] = useState<SendChannel>('email');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [message, setMessage] = useState(() => getDefaultDocumentMessage('warranty_document'));
  const [sending, setSending] = useState(false);
  const [windowChecking, setWindowChecking] = useState(false);
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);
  const [windowHoursLeft, setWindowHoursLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setRecipientEmail('');
      return;
    }
    const seeded = getValidCustomerEmail(customerEmailOnFile);
    setRecipientEmail(seeded || '');
    setWhatsappPhone(String(defaultPhone || pdfData?.customer?.phone || '').trim());
    setMessage(getDefaultDocumentMessage('warranty_document'));
    setChannel('email');
    setWindowOpen(null);
    setWindowHoursLeft(null);
  }, [open, customerEmailOnFile, defaultPhone, pdfData?.customer?.phone]);

  useEffect(() => {
    if (!open || channel !== 'whatsapp' || !allowWhatsApp) return;
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

  const brandLabel = brand ? getDocumentBrandLabel(brand) : '';
  const customerEmailOnRecord = getValidCustomerEmail(customerEmailOnFile);

  const recipientValid = useMemo(() => {
    const trimmed = recipientEmail.trim();
    return trimmed.length > 0 && isValidEmailFormat(trimmed);
  }, [recipientEmail]);

  const canSendEmail = Boolean(pdfData && brand && recipientValid);
  const canSendWhatsApp = Boolean(
    pdfData && brand && formatPhoneForWhatsApp(whatsappPhone).length >= 10
  );
  const canSend = channel === 'whatsapp' ? canSendWhatsApp : canSendEmail;

  const handleSendEmail = async () => {
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
        toast.error('Could not refresh your session. Please try again in a moment.', {
          id: toastId,
        });
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

  const handleSendWhatsApp = async () => {
    if (!pdfData || !brand) {
      toast.error('Warranty details are missing');
      return;
    }
    const phone = formatPhoneForWhatsApp(whatsappPhone);
    if (!phone || phone.length < 10) {
      toast.error('Enter a valid customer phone number');
      return;
    }

    setSending(true);
    const toastId = toast.loading('Preparing PDF for WhatsApp…');
    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again.', { id: toastId });
        return;
      }

      toast.loading('Generating PDF…', { id: toastId });
      const pdf = await generateWarrantyCardPdfBase64(pdfData);
      toast.loading('Sending on WhatsApp…', { id: toastId });
      const caption = (
        message.trim() || getDefaultDocumentMessage('warranty_document')
      ).slice(0, 1024);

      const result = await sendAdminWhatsAppDocument({
        to: phone,
        pdfBase64: pdf.pdfBase64,
        filename: pdf.filename,
        caption,
        customerId,
        source: 'documents',
      });

      if (!result.ok) {
        if (result.needsWindowOrTemplate) {
          toast.loading('24h window closed — sending invite template…', { id: toastId });
          const invite = await sendColdDocumentInvite({
            to: phone,
            kind: 'warranty',
            customerName: pdfData.customer?.name || 'Customer',
            customerId,
            documentLabel: 'warranty card',
            source: 'documents',
          });
          if (invite.ok) {
            toast.success(
              'Invite sent — when they reply YES, send again to deliver the PDF',
              { id: toastId }
            );
            onSent?.();
            onOpenChange(false);
            return;
          }
          openWhatsAppMeDeepLink(phone, caption);
          toast.success(
            'Opened phone WhatsApp (invite failed) — attach the PDF manually if needed',
            { id: toastId }
          );
          onSent?.();
          onOpenChange(false);
          return;
        }
        openWhatsAppMeDeepLink(phone, caption);
        toast.success('Opened phone WhatsApp as backup', {
          id: toastId,
          description: result.error,
        });
        onSent?.();
        onOpenChange(false);
        return;
      }

      toast.success('PDF sent on WhatsApp', { id: toastId });
      invalidateInboundWindowCache(phone);
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not send on WhatsApp', {
        id: toastId,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent
        className={forceLightThemeClass(
          'max-w-lg w-[calc(100vw-1.25rem)] sm:w-full max-h-[min(92dvh,720px)] overflow-y-auto p-0 gap-0'
        )}
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b bg-violet-50/80">
          <DialogTitle className="text-base sm:text-lg pr-8 text-violet-950">
            Send warranty card
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-violet-900/80">
            {brandLabel
              ? `PDF · ${brandLabel} · Email or WhatsApp`
              : 'Send the warranty card PDF by email or WhatsApp'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          {pdfData ? (
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm">
              <span className="font-medium text-slate-900">{pdfData.customer.name}</span>
              <p className="text-xs text-slate-600 mt-0.5">{pdfData.customer.customer_id}</p>
            </div>
          ) : null}

          {allowWhatsApp ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Send via</Label>
              <ToggleGroup
                type="single"
                value={channel}
                onValueChange={(v) => {
                  if (v === 'email' || v === 'whatsapp') setChannel(v);
                }}
                variant="outline"
                className="grid w-full grid-cols-2 gap-0"
                disabled={sending}
              >
                <ToggleGroupItem value="email" className="h-10 gap-2 data-[state=on]:bg-violet-100">
                  <Mail className="h-4 w-4" />
                  Email
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="whatsapp"
                  className="h-10 gap-2 data-[state=on]:bg-emerald-50"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  WhatsApp
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}

          {channel === 'whatsapp' && allowWhatsApp ? (
            <div className="space-y-2">
              <Label htmlFor="warranty-wa-phone" className="text-sm font-medium">
                Customer WhatsApp
              </Label>
              <Input
                id="warranty-wa-phone"
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
                  Window closed — we&apos;ll send an invite template if Meta blocks the PDF, then
                  wa.me as backup.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  PDF sends when the customer has messaged this business number in the last 24h.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="warranty-email-to">Customer email</Label>
              <Input
                id="warranty-email-to"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
                disabled={sending}
                className="h-11 text-base sm:h-10 sm:text-sm"
              />
              {customerEmailOnRecord &&
                recipientEmail.trim().toLowerCase() !== customerEmailOnRecord.toLowerCase() && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Sending to a different address for this email only — the customer record stays{' '}
                    {customerEmailOnRecord}.
                  </p>
                )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="warranty-email-message">
              {channel === 'whatsapp' ? 'WhatsApp caption' : 'Email message'}
            </Label>
            <Textarea
              id="warranty-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-slate-50/80 flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(
              'w-full sm:w-auto',
              channel === 'whatsapp'
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : 'bg-violet-700 hover:bg-violet-800'
            )}
            disabled={!canSend || sending}
            onClick={() =>
              void (channel === 'whatsapp' ? handleSendWhatsApp() : handleSendEmail())
            }
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
