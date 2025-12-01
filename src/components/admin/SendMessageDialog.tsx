import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Job } from '@/types';

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
  if (!job) return null;

  const customer = (job as any).customer || job.customer;
  const customerName = customer?.full_name || customer?.fullName || 'Customer';
  const customerPhone = customer?.phone || '';
  
  const actualCost = (job as any).actual_cost || job.actual_cost || null;
  const paymentAmount = (job as any).payment_amount || job.payment_amount || null;
  const amount = actualCost || paymentAmount || 0;
  
  const whatsappMessage = `Dear ${customerName},

✅ Your service has been completed successfully.
💰 Amount of ₹${amount} has been collected.

For any queries or support, please contact us:
📞 Phone: 8884944288
📧 Email: info@hydrogenro.com
🌐 Website: https://hydrogenro.com

📱 For future bookings, you can book directly on https://hydrogenro.com/book for ease and convenience.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Completion Confirmation Message</DialogTitle>
          <DialogDescription>
            Send confirmation message to customer for completed job
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">Customer: <span className="font-medium">{customerName}</span></div>
            <div className="text-sm text-gray-600">Phone: <span className="font-medium">{customerPhone}</span></div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Message Preview</Label>
              <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {whatsappMessage}
              </div>
            </div>

            <Button
              variant="default"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={async () => {
                const whatsappUrl = `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
                window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                await onMessageSent(job.id);
              }}
            >
              <WhatsAppIcon className="w-4 h-4 mr-2" />
              Send WhatsApp Message
            </Button>
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

export default SendMessageDialog;

