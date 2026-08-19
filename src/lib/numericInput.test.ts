import { describe, expect, it } from 'vitest';
import {
  isNumericZeroValue,
  stripLeadingZerosFromNumericInput,
} from './numericInput';

describe('stripLeadingZerosFromNumericInput', () => {
  it('keeps empty and in-progress drafts', () => {
    expect(stripLeadingZerosFromNumericInput('')).toBe('');
    expect(stripLeadingZerosFromNumericInput('.')).toBe('.');
    expect(stripLeadingZerosFromNumericInput('-')).toBe('-');
    expect(stripLeadingZerosFromNumericInput('-.')).toBe('-.');
  });

  it('turns leftover 0 + new digits into the digits only', () => {
    expect(stripLeadingZerosFromNumericInput('01')).toBe('1');
    expect(stripLeadingZerosFromNumericInput('012')).toBe('12');
    expect(stripLeadingZerosFromNumericInput('00012')).toBe('12');
  });

  it('keeps a real zero and decimal drafts', () => {
    expect(stripLeadingZerosFromNumericInput('0')).toBe('0');
    expect(stripLeadingZerosFromNumericInput('0.')).toBe('0.');
    expect(stripLeadingZerosFromNumericInput('0.5')).toBe('0.5');
    expect(stripLeadingZerosFromNumericInput('00.5')).toBe('0.5');
  });

  it('does not change normal amounts', () => {
    expect(stripLeadingZerosFromNumericInput('300')).toBe('300');
    expect(stripLeadingZerosFromNumericInput('12')).toBe('12');
    expect(stripLeadingZerosFromNumericInput('-12')).toBe('-12');
  });
});

describe('isNumericZeroValue', () => {
  it('detects numeric zero', () => {
    expect(isNumericZeroValue(0)).toBe(true);
    expect(isNumericZeroValue('0')).toBe(true);
    expect(isNumericZeroValue('')).toBe(false);
    expect(isNumericZeroValue(12)).toBe(false);
  });
});
