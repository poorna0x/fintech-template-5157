import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Job } from '@/types';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { buildJobCompletionMessageFromJob } from '@/lib/job-completion-message';
import {
  jobHasCompletionMessageSent,
  jobHasDontSendCompletionMessage,
  sendJobCompletionWhatsApp,
} from '@/lib/jobCompletionWhatsApp';
import {
  sendAdminWhatsAppText,
} from '@/lib/sendAdminWhatsAppApi';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { parseRequirements } from '@/lib/followUpToOngoing';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';

type DeliveryMode = 'api' | 'wa_me';

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onMessageSent: (jobId: string) => Promise<void>;
}

function formatSentAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const SendMessageDialog: React.FC<SendMessageDialogProps> = ({
  open,
  onOpenChange,
  job,
  onMessageSent,
}) => {
  const [brandConfirmed, setBrandConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('wa_me');
  /** Cloud API only when Settings allow + auto-send completion are ON. */
  const [cloudApiAllowed, setCloudApiAllowed] = useState(false);

  useEffect(() => {
    if (!open) {
      setBrandConfirmed(false);
      setSending(false);
      setDeliveryMode('wa_me');
      setCloudApiAllowed(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { settings } = await fetchWhatsAppCrmSettings();
        const allowCloud =
          settings.enabled !== false &&
          settings.allow_job_completion_whatsapp !== false &&
          settings.auto_send_job_completion_whatsapp === true;
        if (cancelled) return;
        setCloudApiAllowed(allowCloud);
        setDeliveryMode(allowCloud ? 'api' : 'wa_me');
      } catch {
        if (!cancelled) {
          setCloudApiAllowed(false);
          setDeliveryMode('wa_me');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!job) return null;

  const jobRec = job as Record<string, unknown>;
  const customer = (job as any).customer || job.customer;
  const customerName = customer?.full_name || customer?.fullName || 'Customer';
  const customerPhone = customer?.phone || '';
  const alternatePhone = customer?.alternate_phone || (customer as any)?.alternatePhone || '';
  const hasAlternate = alternatePhone?.trim() && alternatePhone.trim() !== customerPhone?.trim();
  const customerId =
    customer?.id || (job as any).customer_id || (job as any).customerId || null;

  const alreadySent = jobHasCompletionMessageSent(jobRec);
  const dontSend = jobHasDontSendCompletionMessage(jobRec);
  const requirements = parseRequirements((job as any).requirements || job.requirements);
  const messageSentAt = requirements.find((r: any) => r?.message_sent_at)?.message_sent_at as
    | string
    | undefined;

  const completion = buildJobCompletionMessageFromJob(jobRec);
  const whatsappMessage = completion.whatsappMessage;
  const brandLabel = getDocumentBrandLabel(completion.documentBrand);
  const brandContact =
    completion.documentBrand === 'elevenro'
      ? {
          label: 'ElevenRO',
          phone: '9880693311',
          email: 'mail@elevenro.com',
        }
      : {
          label: 'HydrogenRO',
          phone: '8884944288',
          email: 'info@hydrogenro.com',
        };

  const sendToPhone = async (rawPhone: string) => {
    const to = formatPhoneForWhatsApp(rawPhone);
    if (!to || to.length < 10) {
      toast.error('Invalid phone number');
      return;
    }
    const mode: DeliveryMode = cloudApiAllowed ? deliveryMode : 'wa_me';
    setSending(true);
    try {
      if (mode === 'wa_me') {
        const result = await sendAdminWhatsAppText({
          to,
          text: whatsappMessage,
          customerId: customerId ? String(customerId) : null,
          source: 'job_completion',
          forceWaMe: true,
          fallbackWaMe: false,
        });
        if (!result.ok) {
          toast.error(result.error || 'Could not open WhatsApp');
          return;
        }
        toast.message(`Opened phone WhatsApp for ${to}`);
        await onMessageSent(job.id);
        onOpenChange(false);
        return;
      }

      const result = await sendJobCompletionWhatsApp({
        to,
        text: whatsappMessage,
        customerId: customerId ? String(customerId) : null,
        customerName: completion.customerName,
        amountCollected: completion.amountCollected,
        documentBrand: completion.documentBrand,
        serviceType: completion.serviceType,
        serviceSubType: completion.serviceSubType,
        amountPending: completion.amountPendingValue,
        pendingDueDate: completion.pendingDueDate || null,
        jobRef: completion.jobNumber || null,
        fallbackWaMe: false,
      });

      if (result.ok && result.via === 'api') {
        toast.success(
          result.usedTemplate
            ? result.usedRichColdTemplate
              ? `${brandLabel} completion sent (full cold template)`
              : `${brandLabel} completion template sent`
            : `${brandLabel} completion WhatsApp sent`
        );
        await onMessageSent(job.id);
        onOpenChange(false);
        return;
      }

      if (result.featureDisabled) {
        toast.error(result.error || 'WhatsApp completion send is disabled in Settings');
        return;
      }

      toast.error(
        result.needsWindowOrTemplate
          ? 'Cloud API could not send (24h window / template). Switch to Phone WhatsApp or try again later.'
          : result.error || 'Cloud API send failed'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const sendPrimaryLabel =
    deliveryMode === 'wa_me' || !cloudApiAllowed
      ? alreadySent
        ? 'Open phone WhatsApp again'
        : 'Open phone WhatsApp'
      : alreadySent
        ? 'Send again via Cloud API'
        : 'Send via Cloud API';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          'flex max-h-[min(92dvh,920px)] w-[calc(100vw-1.25rem)] max-w-xl flex-col gap-0 ' +
          'overflow-hidden p-0 sm:w-full'
        }
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-4 pb-3 pt-5 pr-12 text-left sm:px-6">
          <DialogTitle className="text-base leading-snug sm:text-lg">
            Send Completion Confirmation Message
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Send confirmation message to customer for completed job
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          {!brandConfirmed ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-center sm:p-4">
                <div className="mb-1.5 text-xs text-muted-foreground sm:text-sm">
                  You are about to send this message as
                </div>
                <div className="text-xl font-bold text-foreground sm:text-2xl">
                  {brandContact.label}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground break-words">
                  Phone: {brandContact.phone} | Email: {brandContact.email}
                </div>
              </div>

              {alreadySent ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-medium">Already marked Message Sent</p>
                    <p className="mt-0.5 text-xs text-emerald-800">
                      {messageSentAt
                        ? `Last sent ${formatSentAt(String(messageSentAt))}. You can send again — status will update.`
                        : 'You can send again — status will update.'}
                    </p>
                  </div>
                </div>
              ) : null}

              {dontSend ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Technician marked “Don’t send” on this job. Sending manually will still message the
                  customer and mark Message Sent.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 sm:p-4">
                <div className="mb-2 text-sm text-muted-foreground">
                  Sending as: <span className="font-medium text-foreground">{brandContact.label}</span>
                </div>
                <div className="mb-2 text-sm text-muted-foreground">
                  Customer: <span className="font-medium text-foreground break-words">{customerName}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Phone: <span className="font-medium text-foreground">{customerPhone}</span>
                </div>
                {hasAlternate && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Alternate: <span className="font-medium text-foreground">{alternatePhone}</span>
                  </div>
                )}
                {alreadySent && (
                  <div className="mt-2 text-sm font-medium text-emerald-700">
                    ✓ Already sent
                    {messageSentAt ? ` · ${formatSentAt(String(messageSentAt))}` : ''}
                  </div>
                )}
              </div>

              {cloudApiAllowed ? (
                <div className="space-y-1.5">
                  <Label>How to send</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className={
                        deliveryMode === 'api'
                          ? 'rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2.5 text-left text-sm font-medium text-emerald-950'
                          : 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50'
                      }
                      onClick={() => setDeliveryMode('api')}
                    >
                      <span className="block">Cloud API</span>
                      <span className="block text-[11px] font-normal opacity-80">
                        Business line · inbox log
                      </span>
                    </button>
                    <button
                      type="button"
                      className={
                        deliveryMode === 'wa_me'
                          ? 'rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2.5 text-left text-sm font-medium text-emerald-950'
                          : 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50'
                      }
                      onClick={() => setDeliveryMode('wa_me')}
                    >
                      <span className="block">Phone WhatsApp</span>
                      <span className="block text-[11px] font-normal opacity-80">
                        Opens wa.me on this device
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Cloud API is off for completion (Settings → WhatsApp → Auto-send
                  completion message). This will open Phone WhatsApp (wa.me).
                </p>
              )}

              <div>
                <Label>Message preview</Label>
                <div className="mt-2 max-h-52 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm text-foreground/90 sm:max-h-60">
                  {whatsappMessage}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
          {!brandConfirmed ? (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={sending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="w-full bg-black text-white hover:bg-gray-800 sm:w-auto"
                onClick={() => setBrandConfirmed(true)}
              >
                Confirm and Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={sending}
                onClick={() => setBrandConfirmed(false)}
              >
                Back
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={sending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {hasAlternate ? (
                <>
                  <Button
                    variant="default"
                    className="w-full bg-black text-white hover:bg-gray-800 sm:w-auto"
                    disabled={sending}
                    onClick={() => void sendToPhone(customerPhone)}
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="mr-2 h-4 w-4" />
                    )}
                    {deliveryMode === 'wa_me' || !cloudApiAllowed ? 'Open' : 'API'} · Primary
                  </Button>
                  <Button
                    variant="default"
                    className="w-full bg-black text-white hover:bg-gray-800 sm:w-auto"
                    disabled={sending}
                    onClick={() => void sendToPhone(alternatePhone)}
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="mr-2 h-4 w-4" />
                    )}
                    {deliveryMode === 'wa_me' || !cloudApiAllowed ? 'Open' : 'API'} · Alt
                  </Button>
                </>
              ) : (
                <Button
                  variant="default"
                  className="w-full bg-black text-white hover:bg-gray-800 sm:w-auto"
                  disabled={sending}
                  onClick={() => void sendToPhone(customerPhone)}
                >
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                  )}
                  {sendPrimaryLabel}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendMessageDialog;
