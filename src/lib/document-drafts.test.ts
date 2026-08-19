import { describe, expect, it } from 'vitest';
import { mergeEditableCustomer } from './document-drafts';

describe('mergeEditableCustomer', () => {
  const prev = {
    name: 'Ada',
    address: { street: '1 Main', area: 'Koramangala', city: 'Bengaluru', state: 'KA', pincode: '560034' },
  };

  it('does not set address to null when a draft patch has address: null', () => {
    const next = mergeEditableCustomer(prev, { name: 'Bob', address: null } as Partial<typeof prev>);
    expect(next.name).toBe('Bob');
    expect(next.address).toEqual(prev.address);
  });

  it('merges a partial address object', () => {
    const next = mergeEditableCustomer(prev, { address: { street: '2 Side' } });
    expect(next.address.street).toBe('2 Side');
    expect(next.address.area).toBe('Koramangala');
  });

  it('keeps an empty object when prev.address is missing', () => {
    const next = mergeEditableCustomer({ name: 'Ada' }, { address: null } as { name: string; address?: null });
    expect(next.address).toEqual({});
  });
});
