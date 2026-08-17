import type { EmailAttachmentPayload } from '@/lib/admin-email-attachments';
import type { AdminEmailTemplateType } from '@/lib/admin-email-templates';
import { generateBillHTML, type PDFBillData } from '@/lib/pdf-generator';
import { generateTaxInvoiceHTML } from '@/lib/tax-invoice-pdf-generator';
import { taxInvoiceToPdfData, type TaxInvoiceRecord } from '@/lib/tax-invoice-edit-utils';
import {
  brandHasGst,
  getCompanyInfoForBrand,
  type DocumentBrand,
} from '@/lib/service-brands';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { db } from '@/lib/supabase';
import { supabase } from '@/lib/supabaseClient';
import {
  generateDocumentPdfVerifyCode,
  recordDocumentPdfAuthenticity,
} from '@/lib/documentPdfAuthenticity';

function toDateOnly(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0];
  return String(value).split('T')[0].split(' ')[0];
}

function parseAddress(address: unknown) {
  if (!address) {
    return { street: '', area: '', city: '', state: '', pincode: '' };
  }
  if (typeof address === 'string' && address.trim()) {
    return { street: address.trim(), area: '', city: '', state: '', pincode: '' };
  }
  if (typeof address === 'object') {
    const a = address as Record<string, unknown>;
    return {
      street: String(a.street || ''),
      area: String(a.area || ''),
      city: String(a.city || ''),
      state: String(a.state || ''),
      pincode: String(a.pincode || ''),
    };
  }
  return { street: '', area: '', city: '', state: '', pincode: '' };
}

export function completedJobToBillPdfData(
  job: Record<string, unknown>,
  brand: DocumentBrand
): PDFBillData {
  const customer = job.customer as Record<string, unknown> | undefined;
  const company = getCompanyInfoForBrand(brand);
  const amount =
    typeof job.actual_cost === 'number'
      ? job.actual_cost
      : parseFloat(String(job.actual_cost ?? job.payment_amount ?? '').replace(/[^\d.-]/g, '')) || 0;
  const serviceType = String(job.service_type || 'Service');
  const serviceSubType = String(job.service_sub_type || '').trim();
  const description = serviceSubType ? `${serviceType} — ${serviceSubType}` : serviceType;
  // A completed job snapshots the chosen service site. Never replace it with
  // the customer's current primary address on a job-linked bill.
  const addr = parseAddress(job.service_address || customer?.address);
  const addressLine = [addr.street, addr.area].filter(Boolean).join(', ');
  const billNumber = String(job.job_number || `BILL-${String(job.id || '').slice(0, 8)}`);

  return {
    billNumber,
    billDate: toDateOnly(job.completed_at),
    company: {
      name: company.name,
      address: company.address,
      city: company.city,
      state: company.state,
      pincode: company.pincode,
      phone: company.phone,
      email: company.email,
      gstNumber: company.gstNumber,
      panNumber: company.panNumber,
      website: company.website,
    },
    customer: {
      name: String(customer?.full_name || ''),
      address: addressLine,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      phone: String(customer?.phone || ''),
      email: String(customer?.email || ''),
    },
    items: [
      {
        description,
        quantity: 1,
        unitPrice: amount,
        total: amount,
        taxRate: 0,
        taxAmount: 0,
      },
    ],
    subtotal: amount,
    totalAmount: amount,
    paymentStatus: 'PAID',
    paymentMethod: String(job.payment_method || 'CASH'),
    hideGstInHeader: !brandHasGst(brand),
    documentBrand: brand,
    sealVariant: 'sign',
  };
}

export function getPredictedAutoAttachmentNames(
  templateType: AdminEmailTemplateType,
  documentRef: string
): string[] {
  const ref = documentRef.trim();
  if (!ref) return [];
  if (templateType === 'invoice') {
    return [`Tax_Invoice_${ref.replace(/\s+/g, '_')}.pdf`];
  }
  if (templateType === 'service_bill') {
    return [`Bill_${ref.replace(/\s+/g, '_')}.pdf`];
  }
  return [];
}

export async function buildComposerAutoAttachments(params: {
  templateType: AdminEmailTemplateType;
  sourceRecordId: string | null;
  documentBrand: DocumentBrand;
}): Promise<EmailAttachmentPayload[]> {
  const { templateType, sourceRecordId, documentBrand } = params;
  if (!sourceRecordId) return [];

  if (templateType === 'invoice') {
    const { data: inv, error } = await supabase
      .from('tax_invoices')
      .select('*')
      .eq('id', sourceRecordId)
      .single();
    if (error || !inv) {
      throw new Error('Could not load tax invoice for PDF');
    }
    const pdfData = taxInvoiceToPdfData(inv as TaxInvoiceRecord);
    const verifyCode = generateDocumentPdfVerifyCode();
    const html = generateTaxInvoiceHTML({
      ...pdfData,
      pdfOptions: {
        ...((pdfData as { pdfOptions?: Record<string, unknown> }).pdfOptions || {}),
        authenticityVerifyCode: verifyCode,
      },
    } as Parameters<typeof generateTaxInvoiceHTML>[0]);
    const filename = `Tax_Invoice_${pdfData.billNumber.replace(/\s+/g, '_')}.pdf`;
    const pdf = await generateDocumentPdfBase64({ html, filename });
    await recordDocumentPdfAuthenticity({
      docType: 'invoice',
      sourceKey: pdfData.billNumber,
      verifyCode,
      pdfBase64: pdf.pdfBase64,
      filename: pdf.filename,
      customerId: (inv as { customer_id?: string }).customer_id || null,
      documentRef: pdfData.billNumber,
    });
    return [
      {
        filename: pdf.filename,
        contentType: 'application/pdf',
        content: pdf.pdfBase64,
        size: pdf.size,
      },
    ];
  }

  if (templateType === 'service_bill') {
    const { data, error } = await db.jobs.getByIdFull(sourceRecordId);
    if (error || !data) {
      throw new Error('Could not load completed job for bill PDF');
    }
    const job = data as Record<string, unknown>;
    if (String(job.status || '').toUpperCase() !== 'COMPLETED') {
      throw new Error('Selected job is not completed');
    }
    const billData = completedJobToBillPdfData(job, documentBrand);
    const verifyCode = generateDocumentPdfVerifyCode();
    const html = generateBillHTML({
      ...billData,
      authenticityVerifyCode: verifyCode,
    });
    const filename = `Bill_${billData.billNumber.replace(/\s+/g, '_')}.pdf`;
    const pdf = await generateDocumentPdfBase64({ html, filename });
    await recordDocumentPdfAuthenticity({
      docType: 'service_bill',
      sourceKey: billData.billNumber,
      verifyCode,
      pdfBase64: pdf.pdfBase64,
      filename: pdf.filename,
      customerId: (job.customer_id as string) || null,
      documentRef: billData.billNumber,
    });
    return [
      {
        filename: pdf.filename,
        contentType: 'application/pdf',
        content: pdf.pdfBase64,
        size: pdf.size,
      },
    ];
  }

  return [];
}
