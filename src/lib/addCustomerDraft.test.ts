import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_CUSTOMER_DRAFT_KEY,
  draftHasData,
  loadAddCustomerDraft,
  persistAddCustomerDraft,
} from '@/lib/addCustomerDraft';

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

describe('persistAddCustomerDraft', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  it('saves when form has phone', () => {
    persistAddCustomerDraft({ addFormData: { phone: '9876543210' } });
    expect(loadAddCustomerDraft()?.addFormData?.phone).toBe('9876543210');
  });

  it('removes draft when cleared to empty', () => {
    persistAddCustomerDraft({ addFormData: { phone: '9876543210' } });
    persistAddCustomerDraft({
      addFormData: {
        phone: '',
        email: '',
        address: '',
        visible_address: '',
        google_location: '',
        service_types: ['RO'],
      },
    });
    expect(store.has(ADD_CUSTOMER_DRAFT_KEY)).toBe(false);
    expect(loadAddCustomerDraft()).toBeNull();
  });
});
