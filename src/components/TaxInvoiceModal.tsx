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

  const handlePrintTaxInvoice = (bill: Bill, action: 'print' | 'pdf' = 'pdf') => {
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
      pdfOptions: (bill as any).pdfOptions || {},
      dscData: (bill as any).dscData || undefined
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
        <DialogHeader className="sticky top-0 z-10 border-b bg-gradient-to-r from-blue-50/90 to-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <DialogTitle className="text-lg sm:text-xl font-bold text-blue-950 leading-tight">
                {customer ? `Tax Invoice for ${customer.fullName}` : 'Generate Tax Invoice'}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Fill in GST details below, then save or export the invoice.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isGenerating}
              className="h-8 w-8 shrink-0 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 pt-3 sm:pt-4">
          {customer ? (
            <TaxInvoiceGenerator
              customer={customer}
              onPrint={handlePrintTaxInvoice}
              embedded
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

