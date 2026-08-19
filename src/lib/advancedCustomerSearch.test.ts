import { describe, expect, it } from 'vitest';
import {
  billAmountOrClause,
  clampNearRadiusKm,
  customerServiceTypeOrClause,
  formatNearRadiusLabel,
  jobServiceTypeOrClause,
  parseNearRadiusKm,
} from './advancedCustomerSearch';

describe('parseNearRadiusKm', () => {
  it('treats bare numbers as kilometres', () => {
    expect(parseNearRadiusKm('2')).toBe(2);
    expect(parseNearRadiusKm('0.05')).toBe(0.05);
  });

  it('parses metres including 50m', () => {
    expect(parseNearRadiusKm('50m')).toBe(0.05);
    expect(parseNearRadiusKm('50 m')).toBe(0.05);
    expect(parseNearRadiusKm('200 metres')).toBe(0.2);
    expect(parseNearRadiusKm('1km')).toBe(1);
  });

  it('does not treat maps as metres', () => {
    expect(parseNearRadiusKm('maps')).toBeNull();
    expect(parseNearRadiusKm('')).toBeNull();
  });
});

describe('formatNearRadiusLabel', () => {
  it('shows metres under 1 km', () => {
    expect(formatNearRadiusLabel(0.05)).toBe('50 m');
    expect(formatNearRadiusLabel(0.2)).toBe('200 m');
    expect(formatNearRadiusLabel(2)).toBe('2 km');
  });
});

describe('clampNearRadiusKm', () => {
  it('keeps 50 m and caps at 50 km', () => {
    expect(clampNearRadiusKm(0.05)).toBe(0.05);
    expect(clampNearRadiusKm(80)).toBe(50);
  });
});

describe('service type and bill clauses', () => {
  it('matches Softener including RO_SOFTENER', () => {
    expect(jobServiceTypeOrClause('SOFTENER')).toContain('SOFTENER');
    expect(jobServiceTypeOrClause('SOFTENER')).toContain('%SOFT%');
    expect(customerServiceTypeOrClause('SOFTENER')).toBe(jobServiceTypeOrClause('SOFTENER'));
  });

  it('ORs payment_amount and actual_cost', () => {
    expect(billAmountOrClause(30000, 40000)).toBe(
      'and(payment_amount.gte.30000,payment_amount.lte.40000),and(actual_cost.gte.30000,actual_cost.lte.40000)'
    );
  });
});
