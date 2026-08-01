import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { Bill } from '@/types';
import { toast } from 'sonner';
import {
  taxInvoiceToCustomer,
  taxInvoiceToEditSnapshot,
  type TaxInvoiceRecord,
} from '@/lib/tax-invoice-edit-utils';

const TaxInvoiceGenerator = lazy(() => import('@/components/TaxInvoiceGenerator'));

type GSTInvoiceEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: TaxInvoiceRecord | null;
  onUpdated?: () => void;
};

export default function GSTInvoiceEditDialog({
  open,
  onOpenChange,
  invoice,
  onUpdated,
}: GSTInvoiceEditDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const customer = useMemo(
    () => (invoice ? taxInvoiceToCustomer(invoice) : null),
    [invoice]
  );
  const editSnapshot = useMemo(
    () => (invoice ? taxInvoiceToEditSnapshot(invoice) : null),
    [invoice]
  );

  const handlePrint = async (bill: Bill, action: 'print' | 'pdf' = 'pdf') => {
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
      notes: bill.notes,
      terms: bill.terms,
      gstData: (bill as any).gstData || {},
      invoiceDetails: (bill as any).invoiceDetails || {},
      bankDetails: (bill as any).bankDetails || undefined,
      pdfOptions: (bill as any).pdfOptions || {},
      dscData: (bill as any).dscData || undefined,
    };

    try {
      const { generateTaxInvoicePDF } = await import('@/lib/tax-invoice-pdf-generator');
      generateTaxInvoicePDF(pdfData, action);
    } catch {
      toast.error('Failed to generate tax invoice. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) onOpenChange(false);
  };

  const handleSaved = () => {
    onUpdated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent
        dismissible={false}
        hideCloseButton
        className="max-w-6xl w-[100vw] sm:w-[95vw] max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto p-0"
      >
        <DialogHeader className="sticky top-0 z-10 border-b bg-gradient-to-r from-blue-50/90 to-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <DialogTitle className="text-lg sm:text-xl font-bold text-blue-950 leading-tight">
                Edit invoice {invoice?.invoice_number}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Update customer, line items, GST, and totals — then save changes or export PDF.
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

        <div className="p-3 sm:p-6 pt-3 sm:pt-4">
          {invoice && customer && editSnapshot ? (
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-600">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <p className="text-sm">Loading invoice editor…</p>
                </div>
              }
            >
              <TaxInvoiceGenerator
                customer={customer}
                onPrint={handlePrint}
                onTaxInvoiceSaved={handleSaved}
                embedded
                editInvoiceId={invoice.id}
                editCustomerId={invoice.customer_id ?? null}
                initialEditSnapshot={editSnapshot}
                initialCompanyInfo={invoice.company_info}
              />
            </Suspense>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
