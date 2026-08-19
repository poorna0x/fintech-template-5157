import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Share2 } from 'lucide-react';
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
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { isValidEmailFormat } from '@/lib/email-recipients';
import { buildDocumentPdfWhatsAppCaption } from '@/lib/document-pdf-whatsapp-caption';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { forceLightThemeClass } from '@/lib/force-light-theme';
import {
  generateLetterheadPdfBase64,
  letterheadShareLabel,
  type LetterheadDocumentData,
} from '@/lib/letterhead-pdf-generator';
import {
  defaultLetterheadShareMessage,
  getLetterheadEmailSuccessMessage,
  sendLetterheadDocumentEmail,
} from '@/lib/send-letterhead-document';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  openWhatsAppMeDeepLink,
  sendAdminWhatsAppDocumentWithColdFallback,
} from '@/lib/sendAdminWhatsAppApi';
import { formatPhoneForWhatsApp, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchLastInboundAt,
  hoursLeftInWindow,
  isWithinCustomerServiceWindow,
} from '@/lib/whatsappInbox';
import { customerIdForWhatsAppDest, resolveWhatsAppDestinations } from '@/lib/whatsappPhoneTarget';
import {
  sendWhatsAppToMany,
} from '@/lib/whatsappMultiDestSend';

type SendChannel = 'email' | 'whatsapp' | 'both';

function pickDefaultChannel(opts: {
  allowWhatsApp: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}): SendChannel {
  if (!opts.allowWhatsApp) return 'email';
  if (opts.hasEmail && opts.hasPhone) return 'both';
  if (opts.hasPhone && !opts.hasEmail) return 'whatsapp';
  return 'email';
}

export default function LetterheadShareDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: LetterheadDocumentData;
}) {
  const { cloudApiOn } = useWhatsAppCloudApiGate('documents');
  const [channel, setChannel] = useState<SendChannel>('email');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [extraWhatsappPhone, setExtraWhatsappPhone] = useState('');
  const [message, setMessage] = useState(() => defaultLetterheadShareMessage(data));
  const [sending, setSending] = useState(false);
  const [windowChecking, setWindowChecking] = useState(false);
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);
  const [windowHoursLeft, setWindowHoursLeft] = useState<number | null>(null);

  const brand = data.brand;
  const brandLabel = getDocumentBrandLabel(brand);
  const docLabel = letterheadShareLabel(data);

  useEffect(() => {
    if (!open) return;
    const seeded = getValidCustomerEmail(data.customerEmail);
    setRecipientEmail(seeded || '');
    const phone = String(data.customerPhone || '').trim();
    setWhatsappPhone(phone);
    setExtraWhatsappPhone('');
    setMessage(defaultLetterheadShareMessage(data));
    setChannel(
      pickDefaultChannel({
        allowWhatsApp: cloudApiOn,
        hasEmail: Boolean(seeded),
        hasPhone: formatPhoneForWhatsApp(phone).length >= 10,
      })
    );
    setWindowOpen(null);
    setWindowHoursLeft(null);
    // Seed once when the dialog opens; don't reset while the parent draft autosaves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cloudApiOn]);

  useEffect(() => {
    if (!open || !cloudApiOn) return;
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
  }, [open, channel, cloudApiOn, whatsappPhone]);

  const recipientValid = useMemo(() => {
    const trimmed = recipientEmail.trim();
    return trimmed.length > 0 && isValidEmailFormat(trimmed);
  }, [recipientEmail]);

  const canSendEmail = recipientValid;
  const canSendWhatsApp = formatPhoneForWhatsApp(whatsappPhone).length >= 10;
  const waDestinations = useMemo(
    () => resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone).destinations,
    [whatsappPhone, extraWhatsappPhone]
  );
  const canSend =
    channel === 'whatsapp' ? canSendWhatsApp : channel === 'both' ? canSendEmail && canSendWhatsApp : canSendEmail;
  const showEmailFields = channel === 'email' || channel === 'both' || !cloudApiOn;
  const showWhatsAppFields = (channel === 'whatsapp' || channel === 'both') && cloudApiOn;

  const customerName = data.customerName?.trim() || 'there';
  const customerIdFor = (to: string) =>
    customerIdForWhatsAppDest(to, data.customerPhone, data.customerId || null);

  const captionForWhatsApp = () =>
    (
      message.trim() ||
      buildDocumentPdfWhatsAppCaption({
        kind: 'generic',
        brand,
        customerName,
        documentRef: data.documentNumber,
      })
    ).slice(0, 1024);

  const sendWhatsAppPdfs = async (
    toastId: string | number,
    destinations: string[]
  ) => {
    toast.loading('Generating PDF…', { id: toastId });
    const pdf = await generateLetterheadPdfBase64(data);
    const caption = captionForWhatsApp();
    toast.loading('Sending WhatsApp…', { id: toastId });
    return sendWhatsAppToMany(destinations, (to, windowClosed) =>
      sendAdminWhatsAppDocumentWithColdFallback({
        to,
        pdfBase64: pdf.pdfBase64,
        filename: pdf.filename,
        caption,
        customerId: customerIdFor(to),
        source: 'documents',
        preferColdTemplate: windowClosed,
        cold: {
          kind: 'generic',
          brand,
          customerName,
          documentLabel: docLabel,
          ref: data.documentNumber || undefined,
        },
      })
    );
  };

  const handleSendEmail = async () => {
    const trimmed = recipientEmail.trim();
    if (!trimmed || !isValidEmailFormat(trimmed)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSending(true);
    const toastId = toast.loading('Generating PDF and sending email…');
    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again.', { id: toastId });
        return;
      }
      const result = await sendLetterheadDocumentEmail({
        data,
        brand,
        recipientEmails: [trimmed],
        customMessage: message.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return;
      }
      toast.success(getLetterheadEmailSuccessMessage(brand, [trimmed]), { id: toastId });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send email', { id: toastId });
    } finally {
      setSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    const resolved = resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone);
    if (resolved.error || resolved.destinations.length === 0) {
      toast.error(resolved.error || 'Enter a valid customer phone number');
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
      const fanout = await sendWhatsAppPdfs(toastId, resolved.destinations);
      if (fanout.sent === 0) {
        if (resolved.destinations.length === 1) {
          openWhatsAppMeDeepLink(resolved.destinations[0], captionForWhatsApp());
          toast.success('WhatsApp opened on phone as backup', { id: toastId });
          onOpenChange(false);
          return;
        }
        toast.error(fanout.lastError || 'Could not send on WhatsApp', { id: toastId });
        return;
      }
      toast.success(
        fanout.sent > 1
          ? `WhatsApp PDF sent to ${fanout.sent} numbers`
          : fanout.usedTemplate
            ? 'WhatsApp PDF sent via template'
            : 'WhatsApp PDF sent',
        { id: toastId }
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send on WhatsApp', {
        id: toastId,
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendBoth = async () => {
    if (!canSendEmail) {
      toast.error('Enter a valid email address');
      return;
    }
    if (!canSendWhatsApp) {
      toast.error('Enter a valid customer phone number');
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
      toast.loading('Sending email…', { id: toastId });
      const emailResult = await sendLetterheadDocumentEmail({
        data,
        brand,
        recipientEmails: [recipientEmail.trim()],
        customMessage: message.trim() || undefined,
      });
      if (!emailResult.ok) {
        toast.error(emailResult.error || 'Could not send email', { id: toastId });
        return;
      }
      const resolved = resolveWhatsAppDestinations(whatsappPhone, extraWhatsappPhone);
      if (resolved.error || resolved.destinations.length === 0) {
        toast.warning('Email sent, but WhatsApp needs a valid phone', { id: toastId });
        onOpenChange(false);
        return;
      }
      const fanout = await sendWhatsAppPdfs(toastId, resolved.destinations);
      let waNote =
        fanout.sent > 1
          ? `WhatsApp PDF sent to ${fanout.sent} numbers`
          : fanout.usedTemplate
            ? 'WhatsApp PDF sent via template'
            : 'WhatsApp PDF sent';
      if (fanout.sent === 0) {
        if (resolved.destinations.length === 1) {
          openWhatsAppMeDeepLink(resolved.destinations[0], captionForWhatsApp());
          waNote = 'WhatsApp opened on phone as backup';
        } else {
          toast.warning('Email sent, but WhatsApp failed', {
            id: toastId,
            description: fanout.lastError,
          });
          onOpenChange(false);
          return;
        }
      }
      toast.success(`Email + ${waNote}`, { id: toastId });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send both', { id: toastId });
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
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b bg-slate-50">
          <DialogTitle className="text-base sm:text-lg pr-8 flex items-center gap-2">
            <Share2 className="w-4 h-4" aria-hidden />
            Share document
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {docLabel} · {brandLabel} · Email or WhatsApp PDF
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          {data.customerName ? (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <span className="font-medium">{data.customerName}</span>
              {data.documentNumber ? (
                <p className="text-xs text-muted-foreground mt-0.5">{data.documentNumber}</p>
              ) : null}
            </div>
          ) : null}

          {cloudApiOn ? (
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
                <ToggleGroupItem value="email" className="h-10 gap-1.5 px-1 cursor-pointer">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">Email</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="whatsapp" className="h-10 gap-1.5 px-1 cursor-pointer">
                  <WhatsAppIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">WhatsApp</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="both"
                  className="h-10 gap-1.5 px-1 cursor-pointer"
                  disabled={!canSendEmail}
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
              <Label htmlFor="letterhead-wa-phone">Customer WhatsApp</Label>
              <Input
                id="letterhead-wa-phone"
                type="tel"
                inputMode="tel"
                placeholder="Phone with country code"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="h-11 text-base sm:h-10 sm:text-sm"
                disabled={sending}
              />
              <Label htmlFor="letterhead-wa-phone-extra">Also send to (optional)</Label>
              <Input
                id="letterhead-wa-phone-extra"
                type="tel"
                inputMode="tel"
                placeholder="Another number"
                value={extraWhatsappPhone}
                onChange={(e) => setExtraWhatsappPhone(e.target.value)}
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
                  Window closed — PDF will send via the approved document template.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Open window: free-form send. Closed window: cold document template.
                </p>
              )}
            </div>
          ) : null}

          {showEmailFields ? (
            <div className="space-y-1.5">
              <Label htmlFor="letterhead-email-to">Customer email</Label>
              <Input
                id="letterhead-email-to"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
                disabled={sending}
                className="h-11 text-base sm:h-10 sm:text-sm"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="letterhead-share-message">
              {channel === 'whatsapp' && cloudApiOn
                ? 'WhatsApp caption'
                : channel === 'both' && cloudApiOn
                  ? 'Message (email body + WhatsApp caption)'
                  : 'Email message'}
            </Label>
            <Textarea
              id="letterhead-share-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-muted/30 flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto cursor-pointer"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(
              'w-full sm:w-auto cursor-pointer',
              channel === 'whatsapp' && cloudApiOn
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : channel === 'both' && cloudApiOn
                  ? 'bg-sky-700 hover:bg-sky-800'
                  : ''
            )}
            disabled={!canSend || sending}
            onClick={() => {
              if (cloudApiOn && channel === 'whatsapp') void handleSendWhatsApp();
              else if (cloudApiOn && channel === 'both') void handleSendBoth();
              else void handleSendEmail();
            }}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : cloudApiOn && channel === 'whatsapp' ? (
              <>
                <WhatsAppIcon className="h-4 w-4 mr-2" />
                {waDestinations.length > 1
                  ? `Send WhatsApp (${waDestinations.length})`
                  : 'Send WhatsApp'}
              </>
            ) : cloudApiOn && channel === 'both' ? (
              <>
                <Mail className="h-4 w-4 mr-2" />
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
