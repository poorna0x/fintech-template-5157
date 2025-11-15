import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, Customer } from '@/types';
import { generateQuotationPDF } from '@/lib/quotation-pdf-generator';
import QuotationGenerator from './QuotationGenerator';

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export default function QuotationModal({ isOpen, onClose, customer }: QuotationModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintQuotation = (quotation: Bill, action: 'print' | 'pdf' = 'print') => {
    setIsGenerating(true);
    
    // Transform customer object from Bill format (fullName) to PDF format (name)
    const customer = quotation.customer;
    const customerAddress = typeof customer.address === 'object' ? customer.address : {};
    
    const pdfData = {
      billNumber: quotation.billNumber,
      billDate: quotation.billDate,
      company: quotation.company,
      customer: {
        name: customer.fullName || customer.name || 'Customer Name',
        address: customerAddress.street || customer.address || '',
        city: customerAddress.city || customer.city || '',
        state: customerAddress.state || customer.state || '',
        pincode: customerAddress.pincode || customer.pincode || '',
        phone: customer.phone || '',
        email: customer.email || '',
        gstNumber: customer.gstNumber || ''
      },
      items: quotation.items,
      subtotal: quotation.subtotal,
      totalTax: quotation.totalTax,
      serviceCharge: quotation.serviceCharge || 0,
      totalAmount: quotation.totalAmount,
      paymentStatus: quotation.paymentStatus,
      paymentMethod: quotation.paymentMethod,
      notes: quotation.notes,
      terms: quotation.terms
    } as any;

    // Pass GST option and GST data if available
    if ((quotation as any).gstOption !== undefined) {
      (pdfData as any).gstOption = (quotation as any).gstOption;
    }
    // Backward compatibility
    if ((quotation as any).includeGST !== undefined) {
      (pdfData as any).includeGST = (quotation as any).includeGST;
    }
    if ((quotation as any).gstData) {
      (pdfData as any).gstData = (quotation as any).gstData;
    }
    if ((quotation as any).bankDetails) {
      (pdfData as any).bankDetails = (quotation as any).bankDetails;
    }
    
    try {
      generateQuotationPDF(pdfData, action);
    } catch (error) {
      toast.error('Failed to generate quotation. Please try again.');
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
              Generate Quotation {customer ? `for ${customer.fullName}` : ''}
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
            <QuotationGenerator
              customer={customer}
              onPrint={handlePrintQuotation}
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
