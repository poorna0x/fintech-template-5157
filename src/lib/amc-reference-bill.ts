import { generateAmcTerms } from '@/lib/amc-terms-generator';
import {
  formatCustomerAddressForBill,
  normalizeCustomerAddress,
} from '@/lib/customer-address';
import type { DocumentBrand } from '@/lib/service-brands';
import {
  getCompanyInfoForBrand,
  getDefaultAgreementIntro,
  normalizeDocumentBrand,
} from '@/lib/service-brands';
import type { Bill, BillItem, Customer } from '@/types';

export interface TechnicianReferenceAmcInput {
  customer: Customer;
  documentBrand: DocumentBrand;
  billNumber: string;
  startDate: string;
  endDate: string;
  years: number;
  amount: number;
  includesPrefilter: boolean;
  servicePeriodKind: '4' | '6' | 'custom' | 'no_auto';
  servicePeriodCustomMonths: number;
  roModel?: string;
}

function formatValidityRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  return `${fmt(startDate)} to ${fmt(endDate)}`;
}

export function buildTechnicianReferenceAmcBill(input: TechnicianReferenceAmcInput): Bill {
  const brand = normalizeDocumentBrand(input.documentBrand) || 'hydrogenro';
  const addr = normalizeCustomerAddress(input.customer.address, {
    visible_address: input.customer.address?.visible_address,
    formattedAddress: input.customer.location?.formattedAddress,
  });
  const billCustomerAddress = formatCustomerAddressForBill(addr);
  const roModel =
    input.roModel?.trim() ||
    [input.customer.brand, input.customer.model].filter(Boolean).join(' ').trim() ||
    'RO Water Purifier';

  const amcItem: BillItem = {
    id: '1',
    description: `AMC Agreement - ${input.years} Year Service Contract`,
    quantity: 1,
    unitPrice: input.amount,
    total: input.amount,
    taxRate: 0,
    taxAmount: 0,
  };

  const bill: Bill = {
    id: `ref-${Date.now()}`,
    billNumber: input.billNumber,
    billDate: input.startDate,
    company: getCompanyInfoForBrand(brand),
    customer: {
      id: input.customer.id,
      name: input.customer.fullName || 'Customer',
      address: billCustomerAddress.address,
      city: billCustomerAddress.city,
      state: billCustomerAddress.state,
      pincode: billCustomerAddress.pincode,
      phone: input.customer.phone || '',
      email: input.customer.email || '',
      gstNumber: (input.customer as Customer & { gstNumber?: string }).gstNumber || '',
      roModel,
    } as Bill['customer'] & { roModel: string },
    items: [amcItem],
    subtotal: input.amount,
    totalTax: 0,
    serviceCharge: 0,
    totalAmount: input.amount,
    paymentStatus: 'PAID',
    amountPaid: input.amount,
    // Admin-reference notes are persisted via save-amc-contract metadata, not on customer PDF.
    notes: '',
    terms: generateAmcTerms(
      input.includesPrefilter,
      input.servicePeriodKind,
      input.servicePeriodCustomMonths
    ),
    validity: formatValidityRange(input.startDate, input.endDate),
    agreementIntro: getDefaultAgreementIntro(brand),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  (bill as Bill & { documentBrand: DocumentBrand; sealVariant: 'sign' }).documentBrand = brand;
  (bill as Bill & { sealVariant: 'sign' }).sealVariant = 'sign';

  return bill;
}

export function suggestReferenceAmcBillNumber(jobNumber?: string | null): string {
  const year = new Date().getFullYear();
  if (jobNumber?.trim()) {
    return `AMC-REF-${jobNumber.trim().replace(/\s+/g, '-')}`;
  }
  return `AMC-REF-${year}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}
