import React, { Suspense, lazy, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, Customer } from '@/types';
import { getCustomerGstNumber } from '@/lib/customerGst';
import { formatPdfCustomerAddress } from '@/lib/customer-address';
import { generateQuotationPDF } from '@/lib/quotation-pdf-generator';
import {
  normalizeQuotationImageBlocks,
  quotationImageBlocksForPdf,
} from '@/lib/quotation-custom-images';

const QuotationGenerator = lazy(() => import('./QuotationGenerator'));

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  initialAiInstruction?: string | null;
}

export default function QuotationModal({
  isOpen,
  onClose,
  customer,
  initialAiInstruction,
}: QuotationModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintQuotation = (quotation: Bill, action: 'print' | 'pdf' = 'pdf') => {
    setIsGenerating(true);

    // Transform customer object from Bill format (fullName) to PDF format (name)
    const customer = quotation.customer;
    const addr = formatPdfCustomerAddress(customer);

    const pdfData = {
      billNumber: quotation.billNumber,
      billDate: quotation.billDate,
      validUntil: (quotation as any).validUntil,
      company: quotation.company,
      customer: {
        name: customer.fullName || customer.name || 'Customer Name',
        ...addr,
        phone: customer.phone || '',
        email: customer.email || '',
        gstNumber: getCustomerGstNumber(customer),
      },
      items: quotation.items.map((item) => ({
        ...item,
        hsnCode: (item as { hsnCode?: string }).hsnCode || '',
        taxRate: item.taxRate ?? 0,
        taxAmount: item.taxAmount ?? 0,
      })),
      subtotal: quotation.subtotal,
      totalTax: quotation.totalTax,
      serviceCharge: quotation.serviceCharge || 0,
      totalAmount: quotation.totalAmount,
      paymentStatus: quotation.paymentStatus,
      paymentMethod: quotation.paymentMethod,
      notes: quotation.notes,
      terms: quotation.terms,
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
    if ((quotation as any).documentBrand) {
      (pdfData as any).documentBrand = (quotation as any).documentBrand;
    }
    if ((quotation as any).sealVariant) {
      (pdfData as any).sealVariant = (quotation as any).sealVariant;
    }
    if ((quotation as any).notesHeading) {
      (pdfData as any).notesHeading = (quotation as any).notesHeading;
    }
    const blocks = normalizeQuotationImageBlocks(
      (quotation as any).customImageBlocks,
      {
        heading: (quotation as any).customImagesHeading,
        images: (quotation as any).customImages,
      }
    );
    if (blocks.length > 0) {
      (pdfData as any).customImageBlocks = quotationImageBlocksForPdf(blocks);
    }
    if (quotation.customer?.id) {
      (pdfData as any).authenticityCustomerId = quotation.customer.id;
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
        <DialogHeader className="sticky top-0 z-10 border-b bg-gradient-to-r from-emerald-50/90 to-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <DialogTitle className="text-lg sm:text-xl font-bold text-emerald-950 leading-tight">
                {customer ? `Quotation for ${customer.fullName}` : 'Generate Quotation'}
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
                  Loading quotation form…
                </div>
              }
            >
              <QuotationGenerator
                customer={customer}
                onPrint={handlePrintQuotation}
                embedded
                initialAiInstruction={initialAiInstruction}
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
