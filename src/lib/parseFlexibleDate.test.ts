import { describe, expect, it } from 'vitest';
import {
  formatDateLabel,
  isOldCompletedJobRequest,
  parseFlexibleCompletedDate,
} from './parseFlexibleDate';

const now = new Date('2026-08-22T10:00:00+05:30');

describe('parseFlexibleCompletedDate', () => {
  it('parses today and yesterday in IST', () => {
    expect(parseFlexibleCompletedDate('today', now)?.iso).toBe('2026-08-22');
    expect(parseFlexibleCompletedDate('yesterday', now)?.iso).toBe('2026-08-21');
  });

  it('parses last September as the previous year when still before September', () => {
    const parsed = parseFlexibleCompletedDate('last sep', now);
    expect(parsed?.iso).toBe('2025-09-01');
    expect(parsed?.guessedDay).toBe(true);
  });

  it('parses last September as this year after September has passed', () => {
    const october = new Date('2026-10-05T10:00:00+05:30');
    expect(parseFlexibleCompletedDate('last sep', october)?.iso).toBe('2026-09-01');
  });

  it('parses typed dates and typos', () => {
    expect(parseFlexibleCompletedDate('24 september 2025', now)?.iso).toBe('2025-09-24');
    expect(parseFlexibleCompletedDate('september 24 2025', now)?.iso).toBe('2025-09-24');
    expect(parseFlexibleCompletedDate('septermebr 24 2025', now)?.iso).toBe('2025-09-24');
    expect(parseFlexibleCompletedDate('24 Sep 2025', now)?.iso).toBe('2025-09-24');
  });

  it('rejects impossible days', () => {
    expect(parseFlexibleCompletedDate('september 34 2025', now)).toBeNull();
  });

  it('does not pick a future date when the year is omitted', () => {
    expect(parseFlexibleCompletedDate('24 sep', now)?.iso).toBe('2025-09-24');
  });

  it('formats a readable label', () => {
    expect(formatDateLabel('2025-09-24')).toMatch(/24/);
    expect(formatDateLabel('2025-09-24')).toMatch(/2025/);
  });
});

describe('isOldCompletedJobRequest', () => {
  it('starts the chat flow from create/log phrasing', () => {
    expect(isOldCompletedJobRequest('create old completed job')).toBe(true);
    expect(isOldCompletedJobRequest('create a old completed job like this')).toBe(true);
    expect(isOldCompletedJobRequest('log old job')).toBe(true);
    expect(isOldCompletedJobRequest('add a past completed job')).toBe(true);
  });

  it('does not steal lookup questions', () => {
    expect(isOldCompletedJobRequest('show old completed jobs')).toBe(false);
    expect(isOldCompletedJobRequest('how many completed jobs last month')).toBe(false);
  });
});
