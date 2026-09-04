import { describe, expect, it } from 'vitest';
import { draftHasData } from '@/lib/addCustomerDraft';

describe('draftHasData', () => {
  it('ignores empty draft', () => {
    expect(draftHasData(null)).toBe(false);
    expect(draftHasData({ addFormData: {} })).toBe(false);
  });

  it('ignores default RO-only', () => {
    expect(
      draftHasData({
        addFormData: {
          service_types: ['RO'],
          equipment: { RO: { brand: '', model: '' } },
          photos: { RO: [] },
        },
      })
    ).toBe(false);
  });

  it('detects phone or name', () => {
    expect(draftHasData({ addFormData: { phone: '9876543210' } })).toBe(true);
    expect(draftHasData({ addFormData: { full_name: 'Ramesh' } })).toBe(true);
  });

  it('ignores whitespace-only fields', () => {
    expect(draftHasData({ addFormData: { full_name: '   ', phone: '' } })).toBe(false);
  });

  it('detects RO brand or photo', () => {
    expect(
      draftHasData({
        addFormData: { service_types: ['RO'], equipment: { RO: { brand: 'Kent', model: '' } } },
      })
    ).toBe(true);
    expect(
      draftHasData({
        addFormData: { service_types: ['RO'], photos: { RO: ['https://x'] } },
      })
    ).toBe(true);
  });

  it('detects non-RO service type alone', () => {
    expect(draftHasData({ addFormData: { service_types: ['SOFTENER'] } })).toBe(true);
  });
});
