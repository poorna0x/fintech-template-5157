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
  onSent?: () => void;
}

function emptyRow(): string {
  return '';
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

  useEffect(() => {
    if (!open) return;
    const seeded = normalizeRecipientList(defaultRecipients);
    setRecipientRows(seeded.length ? seeded : [emptyRow()]);
    setWhatsappPhone(String(bill?.customer?.phone || '').trim());
    setMessage(getDefaultDocumentMessage(meta.templateType));
    setChannel('email');
    setWindowOpen(null);
    setWindowHoursLeft(null);
  }, [open, defaultRecipients, meta.templateType, bill?.customer?.phone]);

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

  const handleSendEmail = async () => {
    if (!bill || !brand) {
      toast.error('Document details are missing');
      return;
    }

    const recipients = normalizeRecipientList(recipientRows);
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

      const result = await sendGeneratorDocumentEmail({
        kind,
        bill,
        brand,
        recipientEmails: recipients,
        dueDateIso,
        customMessage: message.trim() || undefined,
      });

      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return;
      }

      toast.success(getGeneratorDocumentEmailSuccessMessage(kind, brand, recipients), {
        id: toastId,
      });
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error('Could not send email', { id: toastId, description: msg });
    } finally {
      setSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!bill || !brand) {
      toast.error('Document details are missing');
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
      const pdf = await generateGeneratorDocumentPdfBase64(kind, bill);
      toast.loading('Sending on WhatsApp…', { id: toastId });
      const caption = (
        message.trim() || getDefaultDocumentMessage(meta.templateType)
      ).slice(0, 1024);

      const result = await sendAdminWhatsAppDocument({
        to: phone,
        pdfBase64: pdf.pdfBase64,
        filename: pdf.filename,
        caption,
        customerId: bill.customer?.id,
        source: 'documents',
      });

      if (!result.ok) {
        if (result.needsWindowOrTemplate) {
          toast.loading('24h window closed — sending invite template…', { id: toastId });
          const invite = await sendColdDocumentInvite({
            to: phone,
            kind,
            customerName: bill.customer?.name || 'Customer',
            customerId: bill.customer?.id,
            amount: bill.totalAmount,
            ref: bill.billNumber,
            source: 'documents',
            documentLabel: meta.docLabel,
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
          description: result.error || 'API send failed',
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

  const canSendEmail = Boolean(bill && brand && normalizedRecipients.length);
  const canSendWhatsApp = Boolean(
    bill && brand && formatPhoneForWhatsApp(whatsappPhone).length >= 10
  );
  const canSend = channel === 'whatsapp' ? canSendWhatsApp : canSendEmail;

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
              ? `PDF · ${brandLabel} · Email or WhatsApp`
              : 'Send the PDF by email or WhatsApp'}
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
                  Window closed — PDF needs an open window; we&apos;ll send an invite template if
                  Meta blocks the file.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  PDF sends when the customer has messaged this business number in the last 24h.
                </p>
              )}
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
          )}

          <div className="space-y-2">
            <Label htmlFor="doc-email-message" className="text-sm font-medium">
              {channel === 'whatsapp' ? 'WhatsApp caption' : 'Email message'}
            </Label>
            <Textarea
              id="doc-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="min-h-[96px] resize-y text-sm"
              disabled={sending}
            />
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
              channel === 'whatsapp' ? 'bg-emerald-700 hover:bg-emerald-800' : meta.sendBtnClass
            )}
            onClick={() =>
              void (channel === 'whatsapp' ? handleSendWhatsApp() : handleSendEmail())
            }
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
