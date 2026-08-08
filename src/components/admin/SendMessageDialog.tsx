import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Job } from '@/types';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { buildJobCompletionMessageFromJob } from '@/lib/job-completion-message';
import { sendAdminWhatsAppText, openWhatsAppMeDeepLink } from '@/lib/sendAdminWhatsAppApi';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import { getDocumentBrandLabel } from '@/lib/service-brands';

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onMessageSent: (jobId: string) => Promise<void>;
}

const SendMessageDialog: React.FC<SendMessageDialogProps> = ({
  open,
  onOpenChange,
  job,
  onMessageSent
}) => {
  const [brandConfirmed, setBrandConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);

  useEffect(() => {
    if (!open) {
      setBrandConfirmed(false);
      setSending(false);
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

  const customer = (job as any).customer || job.customer;
  const customerName = customer?.full_name || customer?.fullName || 'Customer';
  const customerPhone = customer?.phone || '';
  const alternatePhone = customer?.alternate_phone || (customer as any)?.alternatePhone || '';
  const hasAlternate = alternatePhone?.trim() && alternatePhone.trim() !== customerPhone?.trim();
  const customerId =
    customer?.id || (job as any).customer_id || (job as any).customerId || null;

  const completion = buildJobCompletionMessageFromJob(job as Record<string, unknown>);
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
    setSending(true);
    try {
      const result = await sendAdminWhatsAppText({
        to,
        text: whatsappMessage,
        customerId: customerId ? String(customerId) : null,
        source: 'job_completion',
        fallbackWaMe: false,
      });
      if (result.ok && result.via === 'api') {
        toast.success(`${brandLabel} completion WhatsApp sent`);
        await onMessageSent(job.id);
        onOpenChange(false);
        return;
      }
      if (result.featureDisabled) {
        toast.error(result.error || 'WhatsApp completion send is disabled in Settings');
        return;
      }
      // Window closed or API failed — open phone WhatsApp as backup
      openWhatsAppMeDeepLink(to, whatsappMessage);
      toast.message(
        result.needsWindowOrTemplate
          ? '24h window closed — opened WhatsApp on phone. Attach/send there, then confirm below.'
          : 'Opened WhatsApp on phone as backup'
      );
      await onMessageSent(job.id);
      onOpenChange(false);
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
              <div className="text-xs sm:text-sm text-muted-foreground mb-1.5">You are about to send this message as</div>
              <div className="text-xl sm:text-2xl font-bold text-foreground">{brandContact.label}</div>
              <div className="text-xs text-muted-foreground mt-1.5">
                Phone: {brandContact.phone} | Email: {brandContact.email}
              </div>
            </div>
            {autoSendEnabled ? (
              <p className="text-xs text-muted-foreground text-center leading-snug">
                Auto-send is ON in Settings — new completions try Cloud API automatically (24h window).
                This dialog is for manual send / retry.
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
                Sending as:{' '}
                <span className="font-medium">{brandContact.label}</span>
              </div>
              <div className="text-sm text-muted-foreground mb-2">Customer: <span className="font-medium">{customerName}</span></div>
              <div className="text-sm text-muted-foreground">Phone: <span className="font-medium">{customerPhone}</span></div>
              {hasAlternate && (
                <div className="text-sm text-muted-foreground mt-1">Alternate: <span className="font-medium">{alternatePhone}</span></div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label>Message Preview</Label>
                <div className="mt-2 p-3 bg-muted/40 rounded-md text-sm text-foreground/90 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {whatsappMessage}
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
                      Primary: {customerPhone}
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
                      Alternate: {alternatePhone}
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
                  Send WhatsApp Message
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
