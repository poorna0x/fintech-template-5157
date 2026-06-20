import type { BillItem, CompanyInfo, Customer } from '@/types';
import { getCompanyStateCode } from '@/lib/indian-state-codes';
import { generateTaxInvoiceHTML, generateTaxInvoicePDF } from '@/lib/tax-invoice-pdf-generator';
import type { PDFTaxInvoiceData } from '@/lib/tax-invoice-pdf-generator';
import { downloadDocumentPdf } from '@/lib/server-pdf-download';

export type TaxInvoiceRecord = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  invoice_type: 'B2B' | 'B2C';
  customer_id?: string | null;
  customer_name: string;
  customer_address?: {
    street?: string;
    area?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_gstin?: string | null;
  company_info: CompanyInfo;
  items: BillItem[];
  place_of_supply?: string | null;
  place_of_supply_code?: string | null;
  is_intra_state: boolean;
  reverse_charge?: boolean;
  e_way_bill_no?: string | null;
  transport_mode?: string | null;
  vehicle_no?: string | null;
  subtotal: number;
  total_discount?: number;
  service_charge?: number;
  total_tax: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  round_off?: number;
  total_amount: number;
  gst_breakup?: Record<string, unknown>;
  invoice_details?: Record<string, unknown> | null;
  bank_details?: Record<string, unknown> | null;
  notes?: string[] | null;
  terms?: string | null;
  validity_note?: string | null;
  service_type?: string | null;
  created_at?: string;
};

export type TaxInvoiceEditSnapshot = {
  v: 1;
  billNumber: string;
  billDate: string;
  signatureDate: string;
  items: BillItem[];
  notes: string[];
  validityNote: string;
  showValidityNote: boolean;
  terms: string;
  serviceCharge: number;
  placeOfSupply: string;
  placeOfSupplyCode: string;
  reverseCharge: boolean;
  eWayBillNo: string;
  transportMode: string;
  vehicleNo: string;
  roundOff: boolean;
  customerGstRequired: boolean;
  invoiceType: 'B2B' | 'B2C';
  bankDetails: Record<string, unknown>;
  showBankDetails: boolean;
  showComputerGeneratedText: boolean;
  showFooterText: boolean;
  showDigitallySignedText: boolean;
  sealVariant: 'sign' | 'stamp';
  useDSC: boolean;
  dscAuthorizedSignatory: string;
  dscNameDesignation: string;
  dscCompanyName: string;
  dscBoxWidth: number;
  dscBoxHeight: number;
  poNumber: string;
  showPONumber: boolean;
  poNumberRequired: boolean;
  paymentDueDate: string;
  deliveryAddress: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
  };
  showDeliveryAddress: boolean;
  editableCustomer: {
    name: string;
    phone: string;
    email: string;
    gst: string;
    address: {
      street: string;
      area: string;
      city: string;
      state: string;
      pincode: string;
    };
  };
};

function parseCustomerAddress(invoice: TaxInvoiceRecord) {
  const raw = invoice.customer_address;
  if (raw && typeof raw === 'object') {
    return {
      street: raw.street || '',
      area: raw.area || '',
      city: raw.city || '',
      state: raw.state || '',
      pincode: raw.pincode || '',
    };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { street: raw, area: '', city: '', state: '', pincode: '' };
  }
  return { street: '', area: '', city: '', state: '', pincode: '' };
}

export function taxInvoiceToCustomer(invoice: TaxInvoiceRecord): Customer {
  const addr = parseCustomerAddress(invoice);
  return {
    id: invoice.customer_id || 'invoice-edit-local',
    customerId: '',
    fullName: invoice.customer_name,
    phone: invoice.customer_phone || '',
    alternatePhone: '',
    email: invoice.customer_email || '',
    address: {
      ...addr,
      visible_address: '',
    },
    location: {
      latitude: 0,
      longitude: 0,
      formattedAddress: '',
    },
    serviceType: (invoice.service_type as Customer['serviceType']) || 'RO',
    brand: '',
    model: '',
    status: 'ACTIVE',
    createdAt: invoice.created_at || new Date().toISOString(),
    updatedAt: invoice.created_at || new Date().toISOString(),
  } as Customer;
}

export function taxInvoiceToEditSnapshot(invoice: TaxInvoiceRecord): TaxInvoiceEditSnapshot {
  const details = (invoice.invoice_details || {}) as Record<string, unknown>;
  const addr = parseCustomerAddress(invoice);
  const delivery = (details.deliveryAddress || {}) as TaxInvoiceEditSnapshot['deliveryAddress'];
  const bank = (invoice.bank_details || {}) as Record<string, unknown>;
  const sealVariant = details.sealVariant === 'stamp' ? 'stamp' : 'sign';

  return {
    v: 1,
    billNumber: invoice.invoice_number,
    billDate: invoice.invoice_date?.slice(0, 10) || invoice.invoice_date,
    signatureDate:
      (typeof details.signatureDate === 'string' && details.signatureDate) ||
      invoice.invoice_date?.slice(0, 10) ||
      '',
    items: Array.isArray(invoice.items) && invoice.items.length ? invoice.items : [],
    notes: Array.isArray(invoice.notes) ? invoice.notes : [],
    validityNote: invoice.validity_note || '',
    showValidityNote: Boolean(invoice.validity_note),
    terms: invoice.terms || '',
    serviceCharge: invoice.service_charge || 0,
    placeOfSupply: invoice.place_of_supply || '',
    placeOfSupplyCode: invoice.place_of_supply_code || '',
    reverseCharge: Boolean(invoice.reverse_charge),
    eWayBillNo: invoice.e_way_bill_no || '',
    transportMode: invoice.transport_mode || '',
    vehicleNo: invoice.vehicle_no || '',
    roundOff: invoice.round_off !== 0 && invoice.round_off != null,
    customerGstRequired: invoice.invoice_type === 'B2B',
    invoiceType: invoice.invoice_type,
    bankDetails: bank,
    showBankDetails: Boolean(bank && Object.keys(bank).length > 0),
    showComputerGeneratedText:
      typeof details.showComputerGeneratedText === 'boolean' ? details.showComputerGeneratedText : true,
    showFooterText: typeof details.showFooterText === 'boolean' ? details.showFooterText : true,
    showDigitallySignedText:
      typeof details.showDigitallySignedText === 'boolean' ? details.showDigitallySignedText : false,
    sealVariant,
    useDSC: Boolean(details.useDSC),
    dscAuthorizedSignatory:
      typeof details.dscAuthorizedSignatory === 'string' ? details.dscAuthorizedSignatory : 'Authorized Signatory',
    dscNameDesignation:
      typeof details.dscNameDesignation === 'string' ? details.dscNameDesignation : 'Srujan - Proprietor',
    dscCompanyName: typeof details.dscCompanyName === 'string' ? details.dscCompanyName : 'Hydrogen RO',
    dscBoxWidth: typeof details.dscBoxWidth === 'number' ? details.dscBoxWidth : 75,
    dscBoxHeight: typeof details.dscBoxHeight === 'number' ? details.dscBoxHeight : 22.5,
    poNumber: typeof details.poNumber === 'string' ? details.poNumber : '',
    showPONumber: Boolean(details.poNumber),
    poNumberRequired: Boolean(details.poNumberRequired),
    paymentDueDate: typeof details.paymentDueDate === 'string' ? details.paymentDueDate : '',
    deliveryAddress: {
      street: delivery.street || '',
      area: delivery.area || '',
      city: delivery.city || '',
      state: delivery.state || '',
      pincode: delivery.pincode || '',
    },
    showDeliveryAddress: Boolean(details.deliveryAddress),
    editableCustomer: {
      name: invoice.customer_name,
      phone: invoice.customer_phone || '',
      email: invoice.customer_email || '',
      gst: invoice.customer_gstin || '',
      address: addr,
    },
  };
}

/** Build PDF payload from a saved DB row (includes customer GSTIN, breakup, bank, etc.). */
export function taxInvoiceToPdfData(invoice: TaxInvoiceRecord): PDFTaxInvoiceData {
  const details = (invoice.invoice_details || {}) as Record<string, unknown>;
  const addr = parseCustomerAddress(invoice);
  const addressLine = [addr.street, addr.area].filter(Boolean).join(', ');
  const savedSealVariant = details.sealVariant === 'stamp' ? 'stamp' : 'sign';
  const notesText = Array.isArray(invoice.notes) ? invoice.notes.join('\n') : '';

  return {
    id: invoice.id,
    billNumber: invoice.invoice_number,
    billDate: invoice.invoice_date?.slice(0, 10) || invoice.invoice_date,
    company: invoice.company_info,
    customer: {
      id: invoice.customer_id || '',
      name: invoice.customer_name,
      address: addressLine,
      city: addr.city || '',
      state: addr.state || '',
      pincode: addr.pincode || '',
      phone: invoice.customer_phone || '',
      email: invoice.customer_email || '',
      gstNumber: invoice.customer_gstin || '',
    },
    items: invoice.items || [],
    subtotal: invoice.subtotal,
    totalTax: invoice.total_tax,
    serviceCharge: invoice.service_charge || 0,
    totalAmount: invoice.total_amount,
    paymentStatus: 'PENDING',
    notes: notesText,
    terms: invoice.terms || '',
    gstData: {
      placeOfSupply: invoice.place_of_supply || undefined,
      placeOfSupplyCode: invoice.place_of_supply_code || undefined,
      companyStateCode: getCompanyStateCode(invoice.company_info),
      isIntraState: invoice.is_intra_state,
      gstBreakup: invoice.gst_breakup,
      taxSplit: {
        cgst: invoice.cgst || 0,
        sgst: invoice.sgst || 0,
        igst: invoice.igst || 0,
      },
      reverseCharge: invoice.reverse_charge || false,
      eWayBillNo: invoice.e_way_bill_no || undefined,
      transportMode: invoice.transport_mode || undefined,
      vehicleNo: invoice.vehicle_no || undefined,
      roundOff: invoice.round_off || 0,
      customerGstRequired: invoice.invoice_type === 'B2B',
    },
    invoiceDetails: {
      invoiceType: invoice.invoice_type,
      ...(invoice.invoice_details as object),
    },
    bankDetails: invoice.bank_details || undefined,
    pdfOptions: {
      showComputerGeneratedText:
        typeof details.showComputerGeneratedText === 'boolean' ? details.showComputerGeneratedText : true,
      showFooterText: typeof details.showFooterText === 'boolean' ? details.showFooterText : true,
      showDigitallySignedText:
        typeof details.showDigitallySignedText === 'boolean' ? details.showDigitallySignedText : false,
      signatureDate:
        (typeof details.signatureDate === 'string' && details.signatureDate) ||
        invoice.invoice_date?.slice(0, 10),
      sealVariant: savedSealVariant,
    },
  } as PDFTaxInvoiceData;
}

export function exportTaxInvoicePdf(invoice: TaxInvoiceRecord, action: 'print' | 'pdf' = 'pdf') {
  const data = taxInvoiceToPdfData(invoice);
  if (action === 'pdf') {
    void downloadDocumentPdf({
      html: generateTaxInvoiceHTML(data),
      filename: `TaxInvoice_${data.billNumber.replace(/\s+/g, '_')}.pdf`,
    });
    return;
  }
  generateTaxInvoicePDF(data, action);
}
