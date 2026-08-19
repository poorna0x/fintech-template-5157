import { describe, expect, it } from 'vitest';
import {
  formatPdfCustomerAddress,
  stringifyCustomerAddressForTemplate,
} from './customer-address';
import { sanitizeForTemplate } from './sanitize';
import { billToQuotationPdfData } from './document-preview-utils';
import type { Bill } from '@/types';

describe('stringifyCustomerAddressForTemplate', () => {
  it('returns empty for null, empty object, and [object Object]', () => {
    expect(stringifyCustomerAddressForTemplate(null)).toBe('');
    expect(stringifyCustomerAddressForTemplate({})).toBe('');
    expect(stringifyCustomerAddressForTemplate({ street: '', area: '', city: '', state: '', pincode: '' })).toBe('');
    expect(stringifyCustomerAddressForTemplate('[object Object]')).toBe('');
  });

  it('joins real address parts', () => {
    expect(
      stringifyCustomerAddressForTemplate({ street: '13 4th Main', area: 'Seshadripuram', city: 'Bengaluru' })
    ).toContain('13 4th Main');
  });
});

describe('sanitizeForTemplate address objects', () => {
  it('does not print [object Object]', () => {
    expect(sanitizeForTemplate({})).toBe('');
    expect(sanitizeForTemplate({ street: '', area: '' })).toBe('');
    expect(sanitizeForTemplate('[object Object]')).toBe('');
  });
});

describe('billToQuotationPdfData', () => {
  it('uses an empty string when the customer has no address', () => {
    const bill = {
      billNumber: 'Q1',
      billDate: '2026-08-19',
      company: {},
      customer: {
        fullName: 'Test',
        address: { street: '', area: '', city: '', state: '', pincode: '', country: 'India' },
      },
      items: [],
      subtotal: 0,
      totalTax: 0,
      totalAmount: 0,
    } as unknown as Bill;
    const data = billToQuotationPdfData(bill) as { customer: { address: string } };
    expect(data.customer.address).toBe('');
    expect(String(data.customer.address)).not.toBe('[object Object]');
  });
});

describe('formatPdfCustomerAddress', () => {
  it('does not fall back to the raw object', () => {
    const fields = formatPdfCustomerAddress({
      address: { street: '', area: '', city: '', state: '', pincode: '' },
    });
    expect(fields.address).toBe('');
    expect(typeof fields.address).toBe('string');
  });
});
