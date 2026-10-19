import { describe, expect, it } from 'vitest';
import { defaultTaxInvoiceType } from './customerGst';

describe('default tax invoice type', () => {
  it('uses B2B when the customer has a GSTIN', () => {
    expect(defaultTaxInvoiceType('29ABCDE1234F1Z5')).toBe('B2B');
    expect(defaultTaxInvoiceType(' 29abcde1234f1z5 ')).toBe('B2B');
  });

  it('uses B2C when there is no GSTIN', () => {
    expect(defaultTaxInvoiceType('')).toBe('B2C');
    expect(defaultTaxInvoiceType(null)).toBe('B2C');
    expect(defaultTaxInvoiceType('   ')).toBe('B2C');
  });
});
