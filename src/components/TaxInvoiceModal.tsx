import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import TaxInvoiceGenerator from '@/components/TaxInvoiceGenerator';
import { Customer, Bill } from '@/types';
import { generateTaxInvoicePDF } from '@/lib/tax-invoice-pdf-generator';
import { toast } from 'sonner';

interface TaxInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export default function TaxInvoiceModal({ isOpen, onClose, customer }: TaxInvoiceModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintTaxInvoice = (bill: Bill, action: 'print' | 'pdf' = 'print') => {
    setIsGenerating(true);
    
    const pdfData = {
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      company: bill.company,
      customer: bill.customer,
      items: bill.items,
      subtotal: bill.subtotal,
      totalTax: bill.totalTax,
      serviceCharge: bill.serviceCharge || 0,
      totalAmount: bill.totalAmount,
      paymentStatus: bill.paymentStatus,
      paymentMethod: bill.paymentMethod,
      notes: bill.notes,
      terms: bill.terms,
      gstData: (bill as any).gstData || {},
      invoiceDetails: (bill as any).invoiceDetails || {},
      bankDetails: (bill as any).bankDetails || undefined,
      pdfOptions: (bill as any).pdfOptions || {}
    };
    
    try {
      generateTaxInvoicePDF(pdfData, action);
    } catch (error) {
      toast.error('Failed to generate tax invoice. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 bg-white z-10 border-b p-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Generate Tax Invoice {customer ? `for ${customer.fullName}` : ''}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isGenerating}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="p-6 pt-0">
          {customer ? (
            <TaxInvoiceGenerator
              customer={customer}
              onPrint={handlePrintTaxInvoice}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-gray-500">
                <p>No customer selected</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

