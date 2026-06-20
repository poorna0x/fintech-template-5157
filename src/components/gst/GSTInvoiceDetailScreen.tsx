import React, { lazy, Suspense, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Edit, Loader2, Printer } from 'lucide-react';
import { Bill } from '@/types';
import { toast } from 'sonner';
import {
  taxInvoiceToCustomer,
  taxInvoiceToEditSnapshot,
  exportTaxInvoicePdf,
  type TaxInvoiceRecord,
} from '@/lib/tax-invoice-edit-utils';
import {
  documentGenerateBtnClass,
  documentOutlineBtnClass,
} from '@/components/DocumentGeneratorPageHeader';
import TaxInvoiceDocumentPreview from '@/components/gst/TaxInvoiceDocumentPreview';
import { cn } from '@/lib/utils';

const TaxInvoiceGenerator = lazy(() => import('@/components/TaxInvoiceGenerator'));

type GSTInvoiceDetailScreenProps = {
  invoice: TaxInvoiceRecord;
  mode: 'view' | 'edit';
  onBack: () => void;
  onEdit: () => void;
  onUpdated?: () => void;
};

export default function GSTInvoiceDetailScreen({
  invoice,
  mode,
  onBack,
  onEdit,
  onUpdated,
}: GSTInvoiceDetailScreenProps) {
  const customer = useMemo(() => taxInvoiceToCustomer(invoice), [invoice]);
  const editSnapshot = useMemo(() => taxInvoiceToEditSnapshot(invoice), [invoice]);
  const isView = mode === 'view';

  const handleExport = (action: 'print' | 'pdf') => {
    try {
      exportTaxInvoicePdf(invoice, action);
    } catch {
      toast.error('Failed to generate tax invoice. Please try again.');
    }
  };

  const handlePrint = async (bill: Bill, action: 'print' | 'pdf' = 'pdf') => {
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
      dscData: (bill as any).dscData || undefined,
    };

    try {
      const { generateTaxInvoicePDF } = await import('@/lib/tax-invoice-pdf-generator');
      generateTaxInvoicePDF(pdfData, action);
    } catch {
      toast.error('Failed to generate tax invoice. Please try again.');
    }
  };

  return (
    <div className="min-h-full bg-slate-50/80">
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 shrink-0 gap-1 px-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to list</span>
          </Button>

          <div className="hidden h-5 w-px bg-slate-200 sm:block" />

          <div className="min-w-0 flex-1 basis-[180px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'h-5 border px-1.5 text-[10px] font-semibold uppercase tracking-wide',
                  isView
                    ? 'border-slate-300 bg-slate-50 text-slate-700'
                    : 'border-blue-200 bg-blue-50 text-blue-800'
                )}
              >
                {isView ? 'View' : 'Edit'}
              </Badge>
              <h1 className="truncate font-mono text-sm font-bold text-slate-900 sm:text-base">
                {invoice.invoice_number}
              </h1>
            </div>
            <p className="truncate text-xs text-slate-500 sm:text-sm">{invoice.customer_name}</p>
          </div>

          {isView ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <Button type="button" size="sm" variant="outline" onClick={onEdit} className="h-9 gap-1.5">
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleExport('print')}
                className={cn(documentGenerateBtnClass, 'h-9 !shadow-none')}
              >
                <Printer className="h-4 w-4 shrink-0" />
                Generate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleExport('pdf')}
                className={cn(documentOutlineBtnClass, 'h-9 !shadow-none')}
              >
                <Download className="h-4 w-4 shrink-0" />
                Download
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-4">
        {isView ? (
          <TaxInvoiceDocumentPreview invoice={invoice} />
        ) : (
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-600">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm">Loading invoice…</p>
              </div>
            }
          >
            <TaxInvoiceGenerator
              customer={customer}
              onPrint={handlePrint}
              onTaxInvoiceSaved={onUpdated}
              embedded
              editInvoiceId={invoice.id}
              editCustomerId={invoice.customer_id ?? null}
              initialEditSnapshot={editSnapshot}
              initialCompanyInfo={invoice.company_info}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export { exportTaxInvoicePdf };
