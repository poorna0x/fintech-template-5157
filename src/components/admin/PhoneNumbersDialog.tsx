import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';

interface PhoneNumbersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

const PhoneNumbersDialog: React.FC<PhoneNumbersDialogProps> = ({ open, onOpenChange, customer }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            Contact Numbers
          </DialogTitle>
          <DialogDescription asChild>
            <span>
              Choose a phone number to call for{' '}
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
              <div className="font-semibold text-gray-900">{customer?.phone}</div>
              <div className="text-sm text-blue-600 font-medium">Primary Number</div>
            </div>
            <a 
              href={`tel:${customer?.phone}`}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Call
            </a>
          </div>
          
          {/* Secondary Phone */}
          {(customer as any)?.alternate_phone && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <div className="font-semibold text-gray-900">{(customer as any).alternate_phone}</div>
                <div className="text-sm text-gray-600 font-medium">Secondary Number</div>
              </div>
              <a 
                href={`tel:${(customer as any).alternate_phone}`}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Call
              </a>
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

