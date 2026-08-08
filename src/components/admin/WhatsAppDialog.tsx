import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { openWhatsAppMeDeepLink } from '@/lib/sendAdminWhatsAppApi';
import { buildJobTechnicianWhatsAppMessage } from '@/lib/jobTechnicianWhatsApp';

interface WhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicianName: string;
  technicianPhone: string;
  serviceSubType: string;
  customerName: string;
  location?: string;
  leadSource?: string;
  customTime?: string;
  description?: string;
  agreedCost?: string;
}

const WhatsAppDialog: React.FC<WhatsAppDialogProps> = ({
  open,
  onOpenChange,
  technicianName,
  technicianPhone,
  serviceSubType,
  customerName,
  location,
  leadSource,
  customTime,
  description,
  agreedCost,
}) => {
  const isUnassign = /^unassign/i.test(leadSource?.trim() || '');
  const message = buildJobTechnicianWhatsAppMessage({
    mode: isUnassign ? 'unassign' : 'assign',
    serviceSubType,
    customerName,
    location,
    leadSource,
    customTime,
    description,
    agreedCost,
  });

  const handleSend = () => {
    if (!technicianPhone?.trim()) {
      toast.error('Technician phone missing');
      return;
    }
    // Manual path: phone WhatsApp only (wa.me). Auto-send uses Cloud API from WhatsApp Settings.
    openWhatsAppMeDeepLink(technicianPhone, message);
    toast.success('Opened phone WhatsApp');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] duration-100 ease-out data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="w-5 h-5 text-green-600" />
            Send WhatsApp Message
          </DialogTitle>
          <DialogDescription>
            {isUnassign
              ? `Tell ${technicianName} this job was unassigned from them. Opens WhatsApp on your phone.`
              : `Notify ${technicianName} about the new job. Opens WhatsApp on your phone (wa.me).`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="bg-muted/40 rounded-lg p-4 space-y-2">
            <div className="text-sm text-muted-foreground">
              <strong>To:</strong> {technicianName}
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Phone:</strong> {technicianPhone}
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Message:</strong>
            </div>
            <div className="bg-card border border-border rounded p-3 text-sm whitespace-pre-wrap">
              {message}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
          <Button
            onClick={handleSend}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
          >
            <WhatsAppIcon className="w-4 h-4 mr-2" />
            Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppDialog;
