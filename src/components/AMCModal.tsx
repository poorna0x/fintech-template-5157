import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Customer, Bill } from '@/types';
import AMCGenerator from '@/components/AMCGenerator';
import { generateAMCPDF } from '@/lib/amc-pdf-generator';
import { toast } from 'sonner';

interface AMCModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export default function AMCModal({ isOpen, onClose, customer }: AMCModalProps) {
  const handlePrintAMC = (bill: Bill, action?: 'print' | 'pdf') => {
    try {
      generateAMCPDF(bill);
      toast.success('AMC Agreement generated successfully!');
    } catch (error) {
      console.error('Error generating AMC:', error);
      toast.error('Failed to generate AMC Agreement');
    }
  };

  if (!customer) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate AMC Agreement for {customer.fullName}</DialogTitle>
        </DialogHeader>
        <AMCGenerator
          customer={customer}
          onPrint={handlePrintAMC}
        />
      </DialogContent>
    </Dialog>
  );
}
