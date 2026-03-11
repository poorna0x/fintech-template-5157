import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Job } from '@/types';
import { formatPhoneForWhatsApp } from '@/lib/utils';

export interface ShareTechnicianInfoToCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  customer: { phone?: string; alternate_phone?: string; alternatePhone?: string; full_name?: string; fullName?: string } | null;
  technicians: Array<{ id: string; fullName?: string; full_name?: string; phone?: string; currentLocation?: { latitude: number; longitude: number }; current_location?: { latitude: number; longitude: number } }>;
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

  const sendTo = (phone: string) => {
    const formatted = formatPhoneForWhatsApp(phone);
    const url = `https://wa.me/${formatted}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const customerName = customer.full_name || customer.fullName || 'Customer';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share technician info to customer</DialogTitle>
          <DialogDescription>
            Send technician name, phone, location, estimated time and ID card link via WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-sm text-gray-600">
              Customer: <span className="font-medium">{customerName}</span>
            </div>
            <div className="text-sm text-gray-600">
              Phone: <span className="font-medium">{customerPhone}</span>
            </div>
            {hasAlternate && (
              <div className="text-sm text-gray-600 mt-1">
                Alternate: <span className="font-medium">{alternatePhone}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Message preview</Label>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">
              {whatsappMessage}
            </div>

            {hasAlternate ? (
              <div className="space-y-2">
                <Label>Send to which number?</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button
                    variant="default"
                    className="bg-green-600 text-white hover:bg-green-700"
                    onClick={() => sendTo(customerPhone)}
                  >
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                    Primary
                  </Button>
                  <Button
                    variant="default"
                    className="bg-green-600 text-white hover:bg-green-700"
                    onClick={() => sendTo(alternatePhone)}
                  >
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                    Alternate
                  </Button>
                  <Button
                    variant="default"
                    className="bg-green-600 text-white hover:bg-green-700 sm:col-span-2"
                    onClick={() => {
                      sendTo(customerPhone);
                      setTimeout(() => sendTo(alternatePhone), 300);
                    }}
                  >
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                    Send to both
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="default"
                className="w-full bg-green-600 text-white hover:bg-green-700"
                onClick={() => sendTo(customerPhone)}
              >
                <WhatsAppIcon className="mr-2 h-4 w-4" />
                Send WhatsApp message
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareTechnicianInfoToCustomerDialog;
