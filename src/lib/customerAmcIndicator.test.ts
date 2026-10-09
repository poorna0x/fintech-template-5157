import { describe, expect, it } from 'vitest';
import { buildCustomerAmcIndicatorMaps } from './customerAmcIndicator';

describe('buildCustomerAmcIndicatorMaps', () => {
  const today = '2026-10-09';

  it('treats an end date of today as still in force', () => {
    const maps = buildCustomerAmcIndicatorMaps(
      [{ customer_id: 'a', status: 'ACTIVE', end_date: today }],
      today
    );
    expect(maps.active.a).toBe(true);
    expect(maps.expired.a).toBeUndefined();
  });

  it('keeps a contract green only while the end date is still ahead', () => {
    const maps = buildCustomerAmcIndicatorMaps(
      [{ customer_id: 'a', status: 'ACTIVE', end_date: '2026-12-01' }],
      today
    );
    expect(maps.active.a).toBe(true);
    expect(maps.expired.a).toBeUndefined();
  });

  it('marks a still-Active row as expired once the end date has passed', () => {
    const maps = buildCustomerAmcIndicatorMaps(
      [{ customer_id: 'a', status: 'ACTIVE', end_date: '2026-10-01' }],
      today
    );
    expect(maps.active.a).toBeUndefined();
    expect(maps.expired.a).toBe(true);
  });

  it('keeps green when a newer contract is still in force', () => {
    const maps = buildCustomerAmcIndicatorMaps(
      [
        { customer_id: 'a', status: 'RENEWED', end_date: '2026-06-01' },
        { customer_id: 'a', status: 'ACTIVE', end_date: '2027-06-01' },
      ],
      today
    );
    expect(maps.active.a).toBe(true);
    expect(maps.expired.a).toBeUndefined();
  });

  it('does not treat a cancelled contract as an expired AMC', () => {
    const maps = buildCustomerAmcIndicatorMaps(
      [{ customer_id: 'a', status: 'CANCELLED', end_date: '2026-01-01' }],
      today
    );
    expect(maps.active.a).toBeUndefined();
    expect(maps.expired.a).toBeUndefined();
  });
});
