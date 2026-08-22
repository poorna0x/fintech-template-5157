import { describe, expect, it } from 'vitest';
import { titleCaseName } from './aiCrmOldCompletedJob';
import {
  extractPhoneFromChat,
  isCancelOldJobMessage,
  isSkipMapsMessage,
  isSkipOldJobMessage,
  leftoverNameFromMessage,
  matchOldJobTechnician,
  missingOldJobCustomerFields,
  parseBillAmount,
  parseEquipmentLabel,
  parseOldJobCustomerMessage,
  parseOldJobDateMessage,
  emptyOldJobCustomerDraft,
  oldJobPrompt,
} from './aiCrmOldCompletedJobChat';

describe('titleCaseName', () => {
  it('capitalizes the first letter of each word', () => {
    expect(titleCaseName('poorna')).toBe('Poorna');
    expect(titleCaseName('POORNA SHETTY')).toBe('Poorna Shetty');
    expect(titleCaseName('poorna  shetty')).toBe('Poorna Shetty');
  });
});

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

  it('title-cases a name leftover', () => {
    expect(leftoverNameFromMessage('poorna shetty 6361631253')).toBe('Poorna Shetty');
  });

  it('lets you skip maps when you do not have a pin', () => {
    const first = parseOldJobCustomerMessage('Poorna 6361631253', emptyOldJobCustomerDraft());
    const skipped = parseOldJobCustomerMessage('map i dont have', first);
    expect(skipped.fullName).toBe('Poorna');
    expect(skipped.skipMaps).toBe(true);
    expect(missingOldJobCustomerFields(skipped)).toEqual([]);
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
    expect(isSkipOldJobMessage('skip it')).toBe(true);
    expect(isSkipOldJobMessage('skip photo')).toBe(true);
    expect(isSkipOldJobMessage('skip brand')).toBe(true);
    expect(isSkipOldJobMessage('no photo')).toBe(true);
    expect(isSkipMapsMessage('map i dont have')).toBe(true);
    expect(isCancelOldJobMessage('cancel')).toBe(true);
    expect(parseBillAmount('1500 rs')).toBe(1500);
  });
});

describe('parseEquipmentLabel', () => {
  it('splits brand and model', () => {
    expect(parseEquipmentLabel('kent grand plus')).toEqual({ brand: 'Kent', model: 'Grand Plus' });
    expect(parseEquipmentLabel('Kent')).toEqual({ brand: 'Kent', model: 'Kent' });
  });
});

describe('old job prompts', () => {
  it('asks brand and photo as separate skippable steps', () => {
    expect(oldJobPrompt('brand')).toMatch(/skip/i);
    expect(oldJobPrompt('purifier_photo')).toMatch(/skip/i);
  });
});
