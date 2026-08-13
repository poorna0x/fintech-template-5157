import React, { Suspense, lazy, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { Customer, Bill } from '@/types';
import { generateBillPDF } from '@/lib/pdf-generator';
import { toast } from 'sonner';

const BillGenerator = lazy(() => import('@/components/BillGenerator'));

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export default function BillModal({ isOpen, onClose, customer }: BillModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintBill = (bill: Bill, action: 'print' | 'pdf' = 'pdf') => {
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
    amountPaid: bill.amountPaid,
    paymentDueDate: bill.dueDate || (bill as { paymentDueDate?: string }).paymentDueDate,
    notes: bill.notes,
    notesHeading: (bill as { notesHeading?: string }).notesHeading,
    terms: bill.terms,
    hideGstInHeader: (bill as any).hideGstInHeader || false,
    documentBrand: (bill as any).documentBrand,
    serviceChargeLabel: (bill as { serviceChargeLabel?: string }).serviceChargeLabel,
  };

    try {
      generateBillPDF(pdfData, action);
    } catch (error) {
      toast.error('Failed to generate bill. Please try again.');
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 border-b bg-gradient-to-r from-emerald-50/90 to-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <DialogTitle className="text-lg sm:text-xl font-bold text-emerald-950 leading-tight">
                {customer ? `Bill for ${customer.fullName}` : 'Generate Bill'}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Fill in details below, then generate a preview or download PDF.
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
            <Suspense
              fallback={
                <div className="flex items-center justify-center gap-3 h-64 text-sm text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                  Loading bill form…
                </div>
              }
            >
              <BillGenerator
                customer={customer}
                onPrint={handlePrintBill}
                embedded
              />
            </Suspense>
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
