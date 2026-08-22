import { describe, expect, it } from 'vitest';
import {
  askForMissingCustomerFields,
  extractPhoneFromChat,
  isCancelOldJobMessage,
  isSkipOldJobMessage,
  matchOldJobTechnician,
  missingOldJobCustomerFields,
  parseBillAmount,
  parseOldJobCustomerMessage,
  parseOldJobDateMessage,
} from './aiCrmOldCompletedJobChat';
import { emptyOldJobCustomerDraft } from './aiCrmOldCompletedJobChat';

describe('parseOldJobCustomerMessage', () => {
  it('reads name, phone and maps link from one message', () => {
    const parsed = parseOldJobCustomerMessage(
      'Ramesh 9876543210 https://maps.app.goo.gl/abc',
      emptyOldJobCustomerDraft()
    );
    expect(parsed.fullName).toBe('Ramesh');
    expect(parsed.phone).toBe('9876543210');
    expect(parsed.googleLocation).toContain('maps.app.goo.gl');
    expect(missingOldJobCustomerFields(parsed)).toEqual([]);
  });

  it('fills missing pieces across messages', () => {
    const first = parseOldJobCustomerMessage('Poorna 6361631253', emptyOldJobCustomerDraft());
    expect(missingOldJobCustomerFields(first)).toEqual(['Google Maps location']);
    const second = parseOldJobCustomerMessage(
      'https://www.google.com/maps/place/12.97,77.59',
      first
    );
    expect(missingOldJobCustomerFields(second)).toEqual([]);
    expect(second.fullName).toBe('Poorna');
  });

  it('asks only for what is still missing', () => {
    expect(askForMissingCustomerFields(['phone'])).toBe('Still need the phone.');
  });
});

describe('extractPhoneFromChat', () => {
  it('ignores map coordinates', () => {
    expect(extractPhoneFromChat('https://www.google.com/maps/place/12.9716,77.5946')).toBeNull();
    expect(extractPhoneFromChat('Ramesh 98765 43210')).toBe('9876543210');
  });
});

describe('parseOldJobDateMessage', () => {
  it('accepts a day after last Sep', () => {
    const parsed = parseOldJobDateMessage('24', '2025-09-01');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.date.iso).toBe('2025-09-24');
  });

  it('accepts ok to keep the guessed month day', () => {
    const parsed = parseOldJobDateMessage('ok', '2025-09-01');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.date.iso).toBe('2025-09-01');
  });
});

describe('matchOldJobTechnician', () => {
  const techs = [
    { id: '1', fullName: 'Ravi Kumar' },
    { id: '2', fullName: 'Suresh' },
  ];
  it('matches office and first names', () => {
    expect(matchOldJobTechnician('office', techs).type).toBe('office');
    expect(matchOldJobTechnician('suresh', techs)).toEqual({ type: 'one', technician: techs[1] });
  });
});

describe('skip and cancel', () => {
  it('detects skip and cancel', () => {
    expect(isSkipOldJobMessage('skip')).toBe(true);
    expect(isCancelOldJobMessage('cancel')).toBe(true);
    expect(parseBillAmount('1500 rs')).toBe(1500);
  });
});
