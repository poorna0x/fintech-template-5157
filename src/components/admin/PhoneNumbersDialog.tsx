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

const getAlternatePhone = (customer: Customer | null | undefined): string =>
  String((customer as any)?.alternate_phone || (customer as any)?.alternatePhone || '').trim();

const openWhatsApp = (phone?: string | null) => {
  const raw = (phone || '').trim();
  if (!raw) {
    toast.error('Phone number not available');
    return;
  }
  const formatted = formatPhoneForWhatsApp(raw);
  window.open(`https://wa.me/${formatted}`, '_blank', 'noopener,noreferrer');
};

const PhoneNumbersDialog: React.FC<PhoneNumbersDialogProps> = ({
  open,
  onOpenChange,
  customer,
  mode = 'call',
}) => {
  const isWhatsApp = mode === 'whatsapp';
  const primaryPhone = String(customer?.phone || '').trim();
  const alternatePhone = getAlternatePhone(customer);

  const renderCallAction = (phone: string, variant: 'primary' | 'secondary') => {
    const isPrimary = variant === 'primary';
    return (
      <a
        href={`tel:${phone}`}
        className={
          isPrimary
            ? 'inline-flex items-center gap-1.5 rounded-lg border-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-600 hover:text-white'
            : 'inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-500 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-600 hover:text-white'
        }
      >
        <Phone className="h-4 w-4" />
        Call
      </a>
    );
  };

  const renderWhatsAppAction = (phone: string, variant: 'primary' | 'secondary') => {
    const isPrimary = variant === 'primary';
    return (
      <button
        type="button"
        onClick={() => {
          openWhatsApp(phone);
          onOpenChange(false);
        }}
        className={
          isPrimary
            ? 'inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-900 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-900 hover:text-white'
            : 'inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-500 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-600 hover:text-white'
        }
      >
        <WhatsAppIcon className="h-4 w-4" />
        Message
      </button>
    );
  };

  const renderAction = (phone: string, variant: 'primary' | 'secondary') =>
    isWhatsApp ? renderWhatsAppAction(phone, variant) : renderCallAction(phone, variant);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isWhatsApp ? (
              <WhatsAppIcon className="w-5 h-5 text-gray-600" />
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
        <div className="space-y-3">
          {primaryPhone && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/80 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50">
              <div className="min-w-0">
                <div className="font-semibold text-foreground">{primaryPhone}</div>
                <div className="text-sm font-medium text-blue-600">Primary Number</div>
              </div>
              {renderAction(primaryPhone, 'primary')}
            </div>
          )}

          {alternatePhone && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:border-gray-300 hover:bg-muted/50">
              <div className="min-w-0">
                <div className="font-semibold text-foreground">{alternatePhone}</div>
                <div className="text-sm font-medium text-muted-foreground">Alternate Number</div>
              </div>
              {renderAction(alternatePhone, 'secondary')}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PhoneNumbersDialog;
