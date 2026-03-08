import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';

interface WhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicianName: string;
  technicianPhone: string;
  serviceSubType: string;
  customerName: string;
  location?: string;
}

const WhatsAppDialog: React.FC<WhatsAppDialogProps> = ({
  open,
  onOpenChange,
  technicianName,
  technicianPhone,
  serviceSubType,
  customerName,
  location
}) => {
  const locationWord = location?.trim() ? location.trim().split(/\s+/)[0] : '';
  const message = `New ${serviceSubType.toLowerCase()} assigned - ${customerName}${locationWord ? ` - ${locationWord}` : ''}`;
  
  // Format phone number for WhatsApp (remove any non-digit characters except +)
  const formatPhoneForWhatsApp = (phone: string): string => {
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    // If it doesn't start with +, assume it's an Indian number and add country code
    if (!cleaned.startsWith('+')) {
      // If it starts with 0, remove it
      const withoutZero = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
      // Add +91 for India if it's a 10-digit number
      if (withoutZero.length === 10) {
        return `+91${withoutZero}`;
      }
      return `+91${withoutZero}`;
    }
    return cleaned;
  };

  const handleOpenWhatsApp = () => {
    const formattedPhone = formatPhoneForWhatsApp(technicianPhone);
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="w-5 h-5 text-green-600" />
            Send WhatsApp Message
          </DialogTitle>
          <DialogDescription>
            Send a notification to {technicianName} about the new job assignment.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-3">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="text-sm text-gray-600">
              <strong>To:</strong> {technicianName}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Phone:</strong> {technicianPhone}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Message:</strong>
            </div>
            <div className="bg-white border border-gray-200 rounded p-3 text-sm">
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
            onClick={handleOpenWhatsApp}
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
