import { describe, expect, it } from 'vitest';
import { listAmcContractSlots, planAmcNextVisit } from './amcAutoJobSchedule';

describe('listAmcContractSlots', () => {
  it('places 4-month visits on the contract calendar and stops at the end date', () => {
    expect(listAmcContractSlots('2026-01-01', 4, '2026-12-31')).toEqual([
      '2026-05-01',
      '2026-09-01',
    ]);
  });

  it('places a 6-month visit once inside a 1-year contract', () => {
    expect(listAmcContractSlots('2026-01-01', 6, '2026-12-31')).toEqual(['2026-07-01']);
  });
});

describe('planAmcNextVisit', () => {
  it('does not slide the next visit when the previous one was done a month late', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-06-01',
      today: '2026-06-02',
    });
    expect(plan.nextDue).toBe('2026-09-01');
    expect(plan.visitKind).toBe('slot');
    expect(plan.shouldCreate).toBe(false);
  });

  it('keeps the year-end visit when no calendar slot is left', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-09-01',
      today: '2026-12-25',
    });
    expect(plan.visitKind).toBe('pre_expiry');
    expect(plan.nextDue).toBe('2026-12-31');
    expect(plan.createReason).toBe('pre_expiry');
  });

  it('uses a pushed date instead of the next interval', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-06-01',
      pushedDate: '2026-12-31',
      today: '2026-06-02',
    });
    expect(plan.visitKind).toBe('pushed');
    expect(plan.nextDue).toBe('2026-12-31');
    expect(plan.shouldCreate).toBe(false);
    expect(plan.reminderStart).toBe('2026-12-21');
  });

  it('creates the pushed visit once the 10-day window opens', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-06-01',
      pushedDate: '2026-12-31',
      today: '2026-12-21',
    });
    expect(plan.createReason).toBe('pushed');
    expect(plan.shouldCreate).toBe(true);
  });

  it('clears the pin after a visit near the pushed date', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-12-20',
      pushedDate: '2026-12-31',
      today: '2026-12-20',
    });
    expect(plan.pushedConsumed).toBe(true);
    expect(plan.visitKind).not.toBe('pushed');
  });
});
