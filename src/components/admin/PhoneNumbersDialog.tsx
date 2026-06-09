import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { toast } from 'sonner';

type ContactMode = 'call' | 'whatsapp';

interface PhoneNumbersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  /** 'call' shows tel: links, 'whatsapp' opens wa.me. Defaults to 'call'. */
  mode?: ContactMode;
}

const openWhatsApp = (phone?: string | null) => {
  const raw = (phone || '').trim();
  if (!raw) {
    toast.error('Phone number not available');
    return;
  }
  const formatted = formatPhoneForWhatsApp(raw);
  window.open(`https://wa.me/${formatted}`, '_blank', 'noopener,noreferrer');
};

const PhoneNumbersDialog: React.FC<PhoneNumbersDialogProps> = ({ open, onOpenChange, customer, mode = 'call' }) => {
  const isWhatsApp = mode === 'whatsapp';
  const alternatePhone = (customer as any)?.alternate_phone || (customer as any)?.alternatePhone;

  const renderAction = (phone?: string | null, variant: 'primary' | 'secondary' = 'primary') => {
    const primaryClasses = '';
    const secondaryClasses = 'bg-gray-600 hover:bg-gray-700';
    const waClasses = 'bg-green-600 hover:bg-green-700';
    const colorClasses = isWhatsApp ? waClasses : variant === 'primary' ? primaryClasses : secondaryClasses;

    if (isWhatsApp) {
      return (
        <button
          onClick={() => {
            openWhatsApp(phone);
            onOpenChange(false);
          }}
          className={`${colorClasses} text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center gap-2`}
        >
          <WhatsAppIcon className="w-4 h-4" />
          Message
        </button>
      );
    }

    return (
      <a
        href={`tel:${phone}`}
        className={`${colorClasses} text-white px-4 py-2 rounded-lg font-medium transition-colors`}
      >
        Call
      </a>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isWhatsApp ? (
              <WhatsAppIcon className="w-5 h-5 text-green-600" />
            ) : (
              <Phone className="w-5 h-5 text-blue-600" />
            )}
            {isWhatsApp ? 'Send WhatsApp Message' : 'Contact Numbers'}
          </DialogTitle>
          <DialogDescription asChild>
            <span>
              {isWhatsApp ? 'Choose a number to message ' : 'Choose a phone number to call for '}
              <span className={customerNameClassName(customer)}>
                {(customer as any)?.full_name || customer?.fullName || 'customer'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Primary Phone */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <div className="font-semibold text-foreground">{customer?.phone}</div>
              <div className="text-sm text-blue-600 font-medium">Primary Number</div>
            </div>
            {renderAction(customer?.phone, 'primary')}
          </div>

          {/* Secondary Phone */}
          {alternatePhone && (
            <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border border-border">
              <div>
                <div className="font-semibold text-foreground">{alternatePhone}</div>
                <div className="text-sm text-muted-foreground font-medium">Secondary Number</div>
              </div>
              {renderAction(alternatePhone, 'secondary')}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PhoneNumbersDialog;
