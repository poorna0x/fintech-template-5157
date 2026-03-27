import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Job } from '@/types';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!open) {
      setBrandConfirmed(false);
    }
  }, [open]);

  if (!job) return null;

  type ServiceBrand = 'elevenro' | 'hydrogenro';
  const normalizeServiceBrand = (value: unknown): ServiceBrand | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'elevenro' || normalized === 'hydrogenro') return normalized;
    return null;
  };

  const customer = (job as any).customer || job.customer;
  const customerName = customer?.full_name || customer?.fullName || 'Customer';
  const customerPhone = customer?.phone || '';
  const alternatePhone = customer?.alternate_phone || (customer as any)?.alternatePhone || '';
  const hasAlternate = alternatePhone?.trim() && alternatePhone.trim() !== customerPhone?.trim();
  
  const actualCost = (job as any).actual_cost || job.actual_cost || null;
  const paymentAmount = (job as any).payment_amount || job.payment_amount || null;
  const amount = actualCost || paymentAmount || 0;

  const serviceType = ((job as any).service_type || job.serviceType || '').toUpperCase();
  const serviceSubType = (job as any).service_sub_type || job.serviceSubType || '';
  const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
  const rawSubtypeText = serviceSubType ? capitalize(serviceSubType) : '';
  // For completion message, "New Purifier Installation" should display as "installation"
  const subtypeText = (serviceSubType || '').trim() === 'New Purifier Installation' ? 'installation' : rawSubtypeText;

  let completionLine: string;
  if (serviceType && serviceType.includes('RO') && subtypeText) {
    completionLine = `Your Water Purifier ${subtypeText} is completed.`;
  } else if (serviceType && serviceType.includes('SOFTENER') && subtypeText) {
    completionLine = `Your Softener ${subtypeText} is completed.`;
  } else if (subtypeText) {
    completionLine = `Your ${subtypeText} is completed.`;
  } else {
    completionLine = 'Your service has been completed successfully.';
  }
  
  const amountLine = amount > 0 ? `💰 Amount of ₹${amount} has been collected.\n\n` : '';
  const serviceBrand = normalizeServiceBrand((job as any).service_brand) || 'hydrogenro';
  const brandContact =
    serviceBrand === 'elevenro'
      ? {
          label: 'ElevenRO',
          phone: '9880693311',
          email: 'mail@elevenro.com',
          website: 'https://elevenro.com',
          bookingUrl: 'https://elevenro.com/book',
        }
      : {
          label: 'HydrogenRO',
          phone: '8884944288',
          email: 'info@hydrogenro.com',
          website: 'https://hydrogenro.com',
          bookingUrl: 'https://hydrogenro.com/book',
        };

  const whatsappMessage = `Dear ${customerName},

✅ ${completionLine}
${amountLine}For any queries or support, please contact us:
📞 Phone: ${brandContact.phone}
📧 Email: ${brandContact.email}
🌐 Website: ${brandContact.website}

📱 For future bookings, you can book directly on ${brandContact.bookingUrl} for ease and convenience.`;

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
            <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-center">
              <div className="text-xs sm:text-sm text-gray-600 mb-1.5">You are about to send this message as</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">{brandContact.label}</div>
              <div className="text-xs text-gray-500 mt-1.5">
                Phone: {brandContact.phone} | Email: {brandContact.email}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setBrandConfirmed(true)}
              >
                Confirm and Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-2">
                Sending as:{' '}
                <span className="font-medium">{brandContact.label}</span>
              </div>
              <div className="text-sm text-gray-600 mb-2">Customer: <span className="font-medium">{customerName}</span></div>
              <div className="text-sm text-gray-600">Phone: <span className="font-medium">{customerPhone}</span></div>
              {hasAlternate && (
                <div className="text-sm text-gray-600 mt-1">Alternate: <span className="font-medium">{alternatePhone}</span></div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label>Message Preview</Label>
                <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {whatsappMessage}
                </div>
              </div>

              {hasAlternate ? (
                <div className="space-y-2">
                  <Label>Send to which number?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      variant="default"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        const formattedPhone = formatPhoneForWhatsApp(customerPhone);
                        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
                        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                        await onMessageSent(job.id);
                      }}
                    >
                      <WhatsAppIcon className="w-4 h-4 mr-2" />
                      Primary: {customerPhone}
                    </Button>
                    <Button
                      variant="default"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        const formattedPhone = formatPhoneForWhatsApp(alternatePhone);
                        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
                        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                        await onMessageSent(job.id);
                      }}
                    >
                      <WhatsAppIcon className="w-4 h-4 mr-2" />
                      Alternate: {alternatePhone}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="default"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={async () => {
                    const formattedPhone = formatPhoneForWhatsApp(customerPhone);
                    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
                    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                    await onMessageSent(job.id);
                  }}
                >
                  <WhatsAppIcon className="w-4 h-4 mr-2" />
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
              onClick={() => setBrandConfirmed(false)}
            >
              Back
            </Button>
          )}
          {brandConfirmed && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
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

