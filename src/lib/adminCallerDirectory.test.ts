import { describe, expect, it } from 'vitest';
import {
  callerChangesSince,
  callerDirectoryIsStale,
  callerDirectoryNeedsFullSync,
  callerDirectoryToday,
  callerPhoneKey,
} from '@/lib/adminCallerDirectory';

describe('caller phone key', () => {
  it('keeps the last 10 digits', () => {
    expect(callerPhoneKey('+91 98806 93311')).toBe('9880693311');
    expect(callerPhoneKey('09880693311')).toBe('9880693311');
  });

  it('ignores numbers that are too short to be a mobile', () => {
    expect(callerPhoneKey('12345')).toBe('');
    expect(callerPhoneKey('')).toBe('');
  });
});

describe('caller directory day', () => {
  it('uses the India calendar day', () => {
    expect(callerDirectoryToday(new Date('2026-10-03T20:30:00.000Z'))).toBe('2026-10-04');
    expect(callerDirectoryToday(new Date('2026-10-03T12:00:00.000Z'))).toBe('2026-10-03');
  });

  it('downloads the full list only when the phone has no checkpoint', () => {
    expect(callerDirectoryNeedsFullSync(0, '')).toBe(true);
    expect(callerDirectoryNeedsFullSync(12, '')).toBe(true);
    expect(callerDirectoryNeedsFullSync(12, '2026-10-03T10:00:00.000Z')).toBe(false);
  });

  it('looks back a few minutes so a customer saved during the last check is included', () => {
    expect(callerChangesSince('2026-10-03T10:00:00.000Z')).toBe('2026-10-03T09:55:00.000Z');
    expect(callerChangesSince('')).toBe('');
  });

  it('downloads again only when the saved day is not today', () => {
    expect(callerDirectoryIsStale('', '2026-10-03')).toBe(true);
    expect(callerDirectoryIsStale('2026-10-02', '2026-10-03')).toBe(true);
    expect(callerDirectoryIsStale('2026-10-03', '2026-10-03')).toBe(false);
  });
});
