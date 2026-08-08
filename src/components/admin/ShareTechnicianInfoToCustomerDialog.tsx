import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Job } from '@/types';
import { sendAdminWhatsAppTextWithOptionalTemplate } from '@/lib/sendAdminWhatsAppApi';
import { WA_COLD } from '@/lib/whatsappColdTemplates';

export interface ShareTechnicianInfoToCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  customer: {
    id?: string;
    phone?: string;
    alternate_phone?: string;
    alternatePhone?: string;
    full_name?: string;
    fullName?: string;
  } | null;
  technicians: Array<{
    id: string;
    fullName?: string;
    full_name?: string;
    phone?: string;
    currentLocation?: { latitude: number; longitude: number };
    current_location?: { latitude: number; longitude: number };
  }>;
  getEta?: (job: Job) => Promise<{ durationText?: string; estimatedArrival?: string } | null>;
}

const ShareTechnicianInfoToCustomerDialog: React.FC<ShareTechnicianInfoToCustomerDialogProps> = ({
  open,
  onOpenChange,
  job,
  customer,
  technicians,
  getEta,
}) => {
  const [etaResult, setEtaResult] = useState<{ durationText?: string; estimatedArrival?: string } | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const assignedTechnicianId = job ? (job as any).assigned_technician_id || (job as any).assignedTechnicianId : null;
  const assignedTechnician = assignedTechnicianId
    ? technicians.find((t) => t.id === assignedTechnicianId)
    : null;

  const techName = assignedTechnician?.fullName || (assignedTechnician as any)?.full_name || 'Technician';
  const techPhone = assignedTechnician?.phone || '';
  const techLocation = assignedTechnician?.currentLocation || (assignedTechnician as any)?.current_location;
  const hasLocation = techLocation?.latitude != null && techLocation?.longitude != null;
  const locationLink = hasLocation
    ? `https://www.google.com/maps?q=${techLocation!.latitude},${techLocation!.longitude}`
    : null;

  const idCardLink = assignedTechnicianId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/technician-id/${assignedTechnicianId}`
    : '';

  const etaLine =
    etaLoading
      ? '⏱️ *Estimated reaching time:* Calculating…'
      : etaResult?.estimatedArrival
        ? `⏱️ *Estimated reaching time:* ${etaResult.estimatedArrival}${etaResult.durationText ? ` (${etaResult.durationText} away)` : ''}`
        : '⏱️ *Estimated reaching time:* —';

  const locationLine = locationLink
    ? `📍 *Current location:* ${locationLink}`
    : '📍 *Current location:* Not shared yet';

  // Customer-facing contact only — admin WhatsApp number is never shared here.
  const whatsappMessage = `*Technician assigned for your service*

👤 *Name:* ${techName}
📞 *Phone:* ${techPhone}
${locationLine}
${etaLine}
🪪 *ID card:* ${idCardLink}

We'll reach you soon. For any queries, contact the technician directly.`;

  useEffect(() => {
    if (!open || !job || !getEta || !assignedTechnicianId) {
      setEtaResult(null);
      return;
    }
    setEtaLoading(true);
    setEtaResult(null);
    getEta(job)
      .then((result) => {
        setEtaResult(result || null);
      })
      .catch(() => setEtaResult(null))
      .finally(() => setEtaLoading(false));
  }, [open, job?.id, assignedTechnicianId, getEta]);

  if (!job || !customer) return null;

  const customerPhone = customer.phone || '';
  const alternatePhone = customer.alternate_phone || customer.alternatePhone || '';
  const hasAlternate = alternatePhone.trim() !== '' && alternatePhone.trim() !== customerPhone.trim();
  const customerName = customer.full_name || customer.fullName || 'Customer';
  const customerId =
    customer.id ||
    (job as any).customer_id ||
    (job as any).customerId ||
    undefined;

  const sendTo = async (phone: string) => {
    if (!phone?.trim()) {
      toast.error('Phone number not available');
      return;
    }
    setSending(true);
    const toastId = toast.loading('Sending WhatsApp…');
    try {
      const result = await sendAdminWhatsAppTextWithOptionalTemplate({
        to: phone,
        text: whatsappMessage,
        customerId,
        source: 'tech_assigned',
        fallbackWaMe: true,
        coldTemplate: {
          name: WA_COLD.tech_assigned.name,
          languageCode: WA_COLD.tech_assigned.language,
          bodyParams: WA_COLD.tech_assigned.bodyParams(customerName, techName),
        },
      });
      if (!result.ok) {
        toast.error(result.error || 'Send failed', { id: toastId });
        return;
      }
      if (result.via === 'api' && result.usedTemplate) {
        toast.success('Technician-assigned template sent', { id: toastId });
      } else if (result.via === 'api') {
        toast.success('WhatsApp sent via API', { id: toastId });
      } else {
        toast.success('Opened phone WhatsApp as backup', { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed', { id: toastId });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-h-[min(92dvh,720px)] w-[calc(100vw-1.25rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Share technician info to customer</DialogTitle>
          <DialogDescription>
            Sends via Cloud API when the 24h window is open; uses the tech-assigned template when
            approved and cold; wa.me as backup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 sm:py-4">
          <div className="rounded-lg bg-muted/40 p-3 sm:p-4">
            <div className="text-sm text-muted-foreground">
              Customer: <span className="font-medium text-foreground">{customerName}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Phone: <span className="font-medium text-foreground break-all">{customerPhone}</span>
            </div>
            {hasAlternate && (
              <div className="text-sm text-muted-foreground mt-1">
                Alternate:{' '}
                <span className="font-medium text-foreground break-all">{alternatePhone}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Message preview</Label>
            <div className="max-h-[28vh] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-foreground/90 sm:max-h-48">
              {whatsappMessage}
            </div>

            {hasAlternate ? (
              <div className="space-y-2">
                <Label>Send to which number?</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button
                    variant="default"
                    className="h-11 bg-green-600 text-white hover:bg-green-700"
                    disabled={sending || !customerPhone.trim()}
                    onClick={() => void sendTo(customerPhone)}
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="mr-2 h-4 w-4" />
                    )}
                    Primary
                  </Button>
                  <Button
                    variant="default"
                    className="h-11 bg-green-600 text-white hover:bg-green-700"
                    disabled={sending || !alternatePhone.trim()}
                    onClick={() => void sendTo(alternatePhone)}
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="mr-2 h-4 w-4" />
                    )}
                    Alternate
                  </Button>
                  <Button
                    variant="default"
                    className="h-11 bg-green-600 text-white hover:bg-green-700 sm:col-span-2"
                    disabled={sending}
                    onClick={() => {
                      void (async () => {
                        await sendTo(customerPhone);
                        await sendTo(alternatePhone);
                      })();
                    }}
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="mr-2 h-4 w-4" />
                    )}
                    Send to both
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="default"
                className="h-11 w-full bg-green-600 text-white hover:bg-green-700"
                disabled={sending || !customerPhone.trim()}
                onClick={() => void sendTo(customerPhone)}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <WhatsAppIcon className="mr-2 h-4 w-4" />
                )}
                Send WhatsApp message
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="h-11 w-full sm:h-10 sm:w-auto"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareTechnicianInfoToCustomerDialog;
