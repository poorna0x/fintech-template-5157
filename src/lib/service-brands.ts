import { CompanyInfo } from '@/types';

export type DocumentBrand = 'hydrogenro' | 'elevenro';

export function normalizeDocumentBrand(value: unknown): DocumentBrand | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'elevenro' || normalized === 'hydrogenro') return normalized;
  return null;
}

export function getDocumentBrandLabel(brand: DocumentBrand): string {
  return brand === 'elevenro' ? 'Eleven RO' : 'Hydrogen RO';
}

export const BRAND_SEAL_SRC: Record<DocumentBrand, string> = {
  hydrogenro: '/HydrogenROSeal.webp',
  elevenro: '/elevenroseal.webp',
};

export function brandHasGst(brand: DocumentBrand): boolean {
  return brand === 'hydrogenro';
}

const HYDROGEN_COMPANY: CompanyInfo = {
  name: 'Authorised Service Franchise',
  address:
    'Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560020',
  phone: '9886944288 & 8884944288',
  email: 'mail@hydrogenro.com',
  gstNumber: '29LIJPS5140P1Z6',
  panNumber: 'LIJPS5140P',
  website: 'hydrogenro.com',
};

const ELEVEN_COMPANY: CompanyInfo = {
  name: 'ELEVEN RO',
  address: '170, 2nd Cross Rd, Anjanapura 5th Block, Anjanapura Township',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560108',
  phone: '9880693311 / 8792467611',
  email: 'mail@elevenro.com',
  gstNumber: '',
  panNumber: '',
  website: 'elevenro.com',
};

export function getCompanyInfoForBrand(brand: DocumentBrand): CompanyInfo {
  return brand === 'elevenro' ? { ...ELEVEN_COMPANY } : { ...HYDROGEN_COMPANY };
}

export function getDefaultAgreementIntro(brand: DocumentBrand): string {
  const label = getDocumentBrandLabel(brand);
  return `We <strong>${label}</strong> will maintain your <strong>RO Water Purifier</strong> on the terms set out below:`;
}

export const HYDROGEN_BANK_DETAILS = {
  accountHolderName: 'HYDROGEN RO',
  bankName: 'HDFC Bank',
  branchName: 'BOMMANAHALLY',
  accountNumber: '50200095252857',
  ifscCode: 'HDFC0001048',
  accountType: 'Current Account',
  upiId: '',
  note: 'Account Type: Current Account. Please share the payment confirmation once the transfer is complete.',
};

export function resolveDocumentBrandFromData(data: {
  documentBrand?: unknown;
  serviceBrand?: unknown;
}): DocumentBrand {
  return (
    normalizeDocumentBrand(data.documentBrand) ||
    normalizeDocumentBrand(data.serviceBrand) ||
    'hydrogenro'
  );
}
