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
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { formatJobCompletionColdTemplatePreview } from '@/lib/job-completion-message';
import { parseRequirements } from '@/lib/followUpToOngoing';

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
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('api');

  useEffect(() => {
    if (!open) {
      setBrandConfirmed(false);
      setSending(false);
      setDeliveryMode('api');
      return;
    }
    void fetchWhatsAppCrmSettings().then(({ settings }) => {
      setAutoSendEnabled(
        settings.enabled &&
          settings.allow_job_completion_whatsapp !== false &&
          settings.auto_send_job_completion_whatsapp === true
      );
    });
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
  const coldTemplatePreview = formatJobCompletionColdTemplatePreview({
    customerName: completion.customerName,
    serviceType: completion.serviceType,
    serviceSubType: completion.serviceSubType,
    amountCollected: completion.amountCollected,
    amountPending: completion.amountPendingValue,
    pendingDueDate: completion.pendingDueDate || null,
    documentBrand: completion.documentBrand,
  });
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
    setSending(true);
    try {
      if (deliveryMode === 'wa_me') {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send Completion Confirmation Message</DialogTitle>
          <DialogDescription>
            Send confirmation message to customer for completed job
          </DialogDescription>
        </DialogHeader>

        {!brandConfirmed ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1.5">
                You are about to send this message as
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground">
                {brandContact.label}
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">
                Phone: {brandContact.phone} | Email: {brandContact.email}
              </div>
            </div>

            {alreadySent ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium">Already marked Message Sent</p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    {messageSentAt
                      ? `Last sent ${formatSentAt(String(messageSentAt))}. You can send again — status will update.`
                      : 'You can send again — status will update.'}
                  </p>
                </div>
              </div>
            ) : null}

            {dontSend ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Technician marked “Don’t send” on this job. Sending manually will still message the
                customer and mark Message Sent.
              </p>
            ) : null}

            {autoSendEnabled ? (
              <p className="text-xs text-muted-foreground text-center leading-snug">
                Auto-send is ON — new completions try Cloud API automatically (admin or technician
                complete). This dialog is for manual send / retry — pick Cloud API or phone WhatsApp
                next.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center leading-snug">
                Tip: turn on <span className="font-medium">Auto-send completion message</span> in
                Settings → WhatsApp to send after each job (skips tech AMC info &amp; “don’t send”).
              </p>
            )}
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button
                className="w-full bg-black hover:bg-gray-800 text-white"
                onClick={() => setBrandConfirmed(true)}
              >
                Confirm and Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="bg-muted/40 p-4 rounded-lg">
              <div className="text-sm text-muted-foreground mb-2">
                Sending as: <span className="font-medium">{brandContact.label}</span>
              </div>
              <div className="text-sm text-muted-foreground mb-2">
                Customer: <span className="font-medium">{customerName}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Phone: <span className="font-medium">{customerPhone}</span>
              </div>
              {hasAlternate && (
                <div className="text-sm text-muted-foreground mt-1">
                  Alternate: <span className="font-medium">{alternatePhone}</span>
                </div>
              )}
              {alreadySent && (
                <div className="text-sm text-emerald-700 mt-2 font-medium">
                  ✓ Already sent
                  {messageSentAt ? ` · ${formatSentAt(String(messageSentAt))}` : ''}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>How to send</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={
                    deliveryMode === 'api'
                      ? 'rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm font-medium text-emerald-950'
                      : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50'
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
                      ? 'rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm font-medium text-emerald-950'
                      : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50'
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

            <div className="space-y-3">
              <div>
                <Label>Message preview (24h window open)</Label>
                <div className="mt-2 p-3 bg-muted/40 rounded-md text-sm text-foreground/90 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {whatsappMessage}
                </div>
              </div>
              <div>
                <Label>Cold send preview (window closed)</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                  Uses <span className="font-medium">svc_job_done_{completion.documentBrand === 'elevenro' ? 'ero' : 'hro'}_v2</span>{' '}
                  when Meta approves — else short <span className="font-medium">svc_job_done</span>.
                </p>
                <div className="p-3 rounded-md border border-amber-200/80 bg-amber-50/60 text-sm text-amber-950 whitespace-pre-wrap">
                  {coldTemplatePreview}
                  {'\n\n'}📞 Call us · 🌐 Book online
                </div>
              </div>

              {hasAlternate ? (
                <div className="space-y-2">
                  <Label>Send to which number?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      variant="default"
                      className="bg-black hover:bg-gray-800 text-white"
                      disabled={sending}
                      onClick={() => void sendToPhone(customerPhone)}
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <WhatsAppIcon className="w-4 h-4 mr-2" />
                      )}
                      {deliveryMode === 'wa_me' ? 'Open' : 'API'} · Primary
                    </Button>
                    <Button
                      variant="default"
                      className="bg-black hover:bg-gray-800 text-white"
                      disabled={sending}
                      onClick={() => void sendToPhone(alternatePhone)}
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <WhatsAppIcon className="w-4 h-4 mr-2" />
                      )}
                      {deliveryMode === 'wa_me' ? 'Open' : 'API'} · Alt
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="default"
                  className="w-full bg-black hover:bg-gray-800 text-white"
                  disabled={sending}
                  onClick={() => void sendToPhone(customerPhone)}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <WhatsAppIcon className="w-4 h-4 mr-2" />
                  )}
                  {deliveryMode === 'wa_me'
                    ? alreadySent
                      ? 'Open phone WhatsApp again'
                      : 'Open phone WhatsApp'
                    : alreadySent
                      ? 'Send again via Cloud API'
                      : 'Send via Cloud API'}
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {brandConfirmed && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={sending}
              onClick={() => setBrandConfirmed(false)}
            >
              Back
            </Button>
          )}
          {brandConfirmed && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendMessageDialog;
