import { describe, expect, it } from 'vitest';
import { ongoingCountDeltaForDeletedStatus } from './adminDashboardCache';

describe('ongoingCountDeltaForDeletedStatus', () => {
  it('drops the Ongoing card for an open job', () => {
    expect(ongoingCountDeltaForDeletedStatus('PENDING')).toBe(1);
    expect(ongoingCountDeltaForDeletedStatus('ASSIGNED')).toBe(1);
    expect(ongoingCountDeltaForDeletedStatus('EN_ROUTE')).toBe(1);
    expect(ongoingCountDeltaForDeletedStatus('IN_PROGRESS')).toBe(1);
  });

  it('leaves the Ongoing card alone for follow-up, denied, and completed jobs', () => {
    expect(ongoingCountDeltaForDeletedStatus('FOLLOW_UP')).toBe(0);
    expect(ongoingCountDeltaForDeletedStatus('RESCHEDULED')).toBe(0);
    expect(ongoingCountDeltaForDeletedStatus('CANCELLED')).toBe(0);
    expect(ongoingCountDeltaForDeletedStatus('COMPLETED')).toBe(0);
  });
});
