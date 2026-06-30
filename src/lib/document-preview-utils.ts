import { Bill } from '@/types';
import { generateBillHTML } from '@/lib/pdf-generator';
import { generateQuotationHTML } from '@/lib/quotation-pdf-generator';
import { generateTaxInvoiceHTML } from '@/lib/tax-invoice-pdf-generator';
import { withAbsoluteAssetUrls } from '@/lib/server-pdf-download';

function billToBillPdfData(bill: Bill) {
  return {
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
    hideGstInHeader: (bill as { hideGstInHeader?: boolean }).hideGstInHeader || false,
    documentBrand: (bill as { documentBrand?: 'hydrogenro' | 'elevenro' }).documentBrand,
    sealVariant: (bill as { sealVariant?: 'sign' | 'stamp' }).sealVariant,
  };
}

function billToQuotationPdfData(bill: Bill) {
  const customer = bill.customer;
  const customerAddress = typeof customer.address === 'object' ? customer.address : {};

  const pdfData = {
    billNumber: bill.billNumber,
    billDate: bill.billDate,
    validUntil: (bill as { validUntil?: string }).validUntil,
    company: bill.company,
    customer: {
      name: customer.fullName || customer.name || 'Customer Name',
      address: customerAddress.street || customer.address || '',
      city: customerAddress.city || customer.city || '',
      state: customerAddress.state || customer.state || '',
      pincode: customerAddress.pincode || customer.pincode || '',
      phone: customer.phone || '',
      email: customer.email || '',
      gstNumber: customer.gstNumber || '',
    },
    items: bill.items.map((item) => ({
      ...item,
      hsnCode: (item as { hsnCode?: string }).hsnCode || '',
      taxRate: item.taxRate ?? 0,
      taxAmount: item.taxAmount ?? 0,
    })),
    subtotal: bill.subtotal,
    totalTax: bill.totalTax,
    serviceCharge: bill.serviceCharge || 0,
    totalAmount: bill.totalAmount,
    paymentStatus: bill.paymentStatus,
    paymentMethod: bill.paymentMethod,
    notes: bill.notes,
    terms: bill.terms,
  } as Record<string, unknown>;

  const ext = bill as Record<string, unknown>;
  if (ext.gstOption !== undefined) pdfData.gstOption = ext.gstOption;
  if (ext.includeGST !== undefined) pdfData.includeGST = ext.includeGST;
  if (ext.gstData) pdfData.gstData = ext.gstData;
  if (ext.bankDetails) pdfData.bankDetails = ext.bankDetails;
  if (ext.documentBrand) pdfData.documentBrand = ext.documentBrand;
  if (ext.sealVariant) pdfData.sealVariant = ext.sealVariant;

  return pdfData;
}

function billToTaxInvoicePdfData(bill: Bill) {
  return {
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
    gstData: (bill as { gstData?: object }).gstData || {},
    invoiceDetails: (bill as { invoiceDetails?: object }).invoiceDetails || {},
    bankDetails: (bill as { bankDetails?: object }).bankDetails || undefined,
    pdfOptions: (bill as { pdfOptions?: object }).pdfOptions || {},
    dscData: (bill as { dscData?: object }).dscData || undefined,
  };
}

export function billToPreviewHtml(bill: Bill): string {
  return withAbsoluteAssetUrls(generateBillHTML(billToBillPdfData(bill)));
}

export function quotationToPreviewHtml(bill: Bill): string {
  return withAbsoluteAssetUrls(generateQuotationHTML(billToQuotationPdfData(bill) as Parameters<typeof generateQuotationHTML>[0]));
}

export function taxInvoiceToPreviewHtml(bill: Bill): string {
  return withAbsoluteAssetUrls(generateTaxInvoiceHTML(billToTaxInvoicePdfData(bill) as Parameters<typeof generateTaxInvoiceHTML>[0]));
}

/** Run an export action after a preview dialog has closed (avoids state races / nested dialogs). */
export function runAfterDialogClose(callback: () => void): void {
  window.setTimeout(callback, 0);
}
