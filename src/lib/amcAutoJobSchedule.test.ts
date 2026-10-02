import { describe, expect, it } from 'vitest';
import { listAmcContractSlots, nextAmcYearServiceDate, planAmcNextVisit } from './amcAutoJobSchedule';

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

describe('nextAmcYearServiceDate', () => {
  it('uses this contract year on a 3-year AMC, not the final end date', () => {
    expect(nextAmcYearServiceDate('2026-01-01', '2028-12-31', '2026-10-02')).toBe('2026-12-31');
  });

  it('moves to the next anniversary after this year’s date has passed', () => {
    expect(nextAmcYearServiceDate('2026-01-01', '2028-12-31', '2027-01-15')).toBe('2027-12-31');
  });

  it('matches a 1-year contract end', () => {
    expect(nextAmcYearServiceDate('2026-01-01', '2026-12-31', '2026-06-01')).toBe('2026-12-31');
  });
});

describe('planAmcNextVisit', () => {
  it('starts the next visit from the completed date when the service was done late', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-06-01',
      today: '2026-06-02',
    });
    expect(plan.nextDue).toBe('2026-10-01');
    expect(plan.reminderStart).toBe('2026-09-21');
    expect(plan.visitKind).toBe('slot');
    expect(plan.shouldCreate).toBe(false);
  });

  it('creates the last job 10 days before the AMC end when the next period is past the end', () => {
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

  it('creates the first visit from the start date when nothing has been completed', () => {
    const plan = planAmcNextVisit({
      startDate: '2025-09-24',
      endDate: '2027-09-23',
      periodMonths: 6,
      referenceDate: '2025-09-24',
      today: '2026-10-02',
    });
    expect(plan.nextDue).toBe('2026-03-24');
    expect(plan.shouldCreate).toBe(true);
    expect(plan.createReason).toBe('regular');
  });

  it('waits until 10 days before a future slot', () => {
    const waiting = planAmcNextVisit({
      startDate: '2026-09-26',
      endDate: '2028-09-25',
      periodMonths: 6,
      referenceDate: '2026-09-26',
      today: '2026-10-02',
    });
    expect(waiting.nextDue).toBe('2027-03-26');
    expect(waiting.reminderStart).toBe('2027-03-16');
    expect(waiting.shouldCreate).toBe(false);

    const open = planAmcNextVisit({
      startDate: '2026-09-26',
      endDate: '2028-09-25',
      periodMonths: 6,
      referenceDate: '2026-09-26',
      today: '2027-03-16',
    });
    expect(open.shouldCreate).toBe(true);
    expect(open.createReason).toBe('regular');
  });

  it('counts the next visit from the day the service was completed', () => {
    const plan = planAmcNextVisit({
      startDate: '2025-09-24',
      endDate: '2027-09-23',
      periodMonths: 6,
      referenceDate: '2026-09-10',
      today: '2026-10-02',
    });
    expect(plan.nextDue).toBe('2027-03-10');
    expect(plan.reminderStart).toBe('2027-02-28');
    expect(plan.shouldCreate).toBe(false);
  });

  it('creates a pushed visit that is already past', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-09-26',
      endDate: '2028-09-25',
      periodMonths: 6,
      referenceDate: '2026-09-26',
      pushedDate: '2026-09-30',
      today: '2026-10-02',
    });
    expect(plan.visitKind).toBe('pushed');
    expect(plan.shouldCreate).toBe(true);
    expect(plan.nextDue).toBe('2026-09-30');
  });

  it('keeps a 3-year contract on this year’s anniversary', () => {
    expect(nextAmcYearServiceDate('2026-02-04', '2029-02-03', '2026-10-02')).toBe('2027-02-03');
    expect(listAmcContractSlots('2026-02-04', 6, '2029-02-03')).toEqual([
      '2026-08-04',
      '2027-02-04',
      '2027-08-04',
      '2028-02-04',
      '2028-08-04',
    ]);
  });

  it('does not roll a month-end start into the following month', () => {
    expect(listAmcContractSlots('2026-01-31', 1, '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('ignores a service completed before the AMC started', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2025-06-01',
      today: '2026-01-02',
    });
    expect(plan.nextDue).toBe('2026-05-01');
    expect(plan.shouldCreate).toBe(false);
  });

  it('does not create a second job after the final visit is done', () => {
    const plan = planAmcNextVisit({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      periodMonths: 4,
      referenceDate: '2026-12-25',
      today: '2026-12-25',
    });
    expect(plan.visitKind).toBe('pre_expiry');
    expect(plan.shouldCreate).toBe(false);
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
