import { describe, expect, it } from 'vitest';
import type { Customer } from '@/types';
import {
  documentAddressForChoice,
  formatDocumentAddress,
} from './DocumentAddressSelector';

const customer = {
  id: 'c1',
  address: {
    street:
      'Flat No : 711, Abhee Pride, Karnataka Housing Board, 408, NPS road, Phase 1, Iggalur, Andapura, Karnataka 560081, India, Bangalore, Karnataka',
    area: 'Iggalur',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560081',
  },
  alternate_address: {
    street: '12 MG Road',
    area: 'Ashok Nagar',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
  },
  alternate_visible_address: '12 MG Road, Ashok Nagar, Bangalore 560001',
} as unknown as Customer;

describe('documentAddressForChoice', () => {
  it('returns an empty address when omit is selected', () => {
    expect(documentAddressForChoice(customer, 'omit')).toEqual({
      street: '',
      area: '',
      city: '',
      state: '',
      pincode: '',
    });
  });

  it('uses the secondary site when selected', () => {
    const address = documentAddressForChoice(customer, 'secondary');
    expect(address.street).toContain('MG Road');
    expect(address.pincode).toBe('560001');
  });
});

describe('formatDocumentAddress', () => {
  it('does not duplicate city/state already present in the street line', () => {
    const line = formatDocumentAddress(documentAddressForChoice(customer, 'primary'));
    expect(line).toContain('Iggalur');
    expect(line.match(/Bangalore/gi)?.length).toBe(1);
  });
});
