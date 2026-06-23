import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import PhoneSwapButton from '@/components/admin/PhoneSwapButton';

type ContactMode = 'call' | 'whatsapp';

interface PhoneNumbersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  /** 'call' shows tel: links, 'whatsapp' opens wa.me. Defaults to 'call'. */
  mode?: ContactMode;
  onPhonesSwapped?: (customer: Customer) => void;
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
  onPhonesSwapped,
}) => {
  const isWhatsApp = mode === 'whatsapp';
  const [displayCustomer, setDisplayCustomer] = useState<Customer | null>(customer);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    setDisplayCustomer(customer);
  }, [customer, open]);

  const primaryPhone = String(displayCustomer?.phone || '').trim();
  const alternatePhone = getAlternatePhone(displayCustomer);
  const canSwap = Boolean(primaryPhone && alternatePhone && displayCustomer?.id);

  const handleSwap = async () => {
    if (!displayCustomer?.id || !canSwap) return;
    setSwapping(true);
    try {
      const { error } = await db.customers.update(displayCustomer.id, {
        phone: alternatePhone,
        alternate_phone: primaryPhone,
      });
      if (error) throw new Error(error.message);

      const updated = {
        ...displayCustomer,
        phone: alternatePhone,
        alternatePhone: primaryPhone,
        alternate_phone: primaryPhone,
      } as Customer;
      setDisplayCustomer(updated);
      onPhonesSwapped?.(updated);
      toast.success('Primary and alternate numbers swapped');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to swap numbers');
    } finally {
      setSwapping(false);
    }
  };

  const renderAction = (phone?: string | null, variant: 'primary' | 'secondary' = 'primary') => {
    const primaryClasses = '';
    const secondaryClasses = 'bg-gray-600 hover:bg-gray-700';
    const waClasses = 'bg-black hover:bg-gray-800';
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
              <WhatsAppIcon className="w-5 h-5 text-gray-600" />
            ) : (
              <Phone className="w-5 h-5 text-blue-600" />
            )}
            {isWhatsApp ? 'Send WhatsApp Message' : 'Contact Numbers'}
          </DialogTitle>
          <DialogDescription asChild>
            <span>
              {isWhatsApp ? 'Choose a number to message ' : 'Choose a phone number to call for '}
              <span className={customerNameClassName(displayCustomer)}>
                {(displayCustomer as any)?.full_name || displayCustomer?.fullName || 'customer'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Primary Phone */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <div className="font-semibold text-foreground">{primaryPhone}</div>
              <div className="text-sm text-blue-600 font-medium">Primary Number</div>
            </div>
            {renderAction(primaryPhone, 'primary')}
          </div>

          {canSwap && (
            <div className="flex justify-center py-0.5">
              <PhoneSwapButton onSwap={handleSwap} saving={swapping} />
            </div>
          )}

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
