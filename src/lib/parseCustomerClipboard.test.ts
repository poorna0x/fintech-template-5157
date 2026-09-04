import { describe, expect, it } from 'vitest';
import {
  clipboardFingerprint,
  isFreshClipboardTimestamp,
  parseCustomerClipboardText,
} from '@/lib/parseCustomerClipboard';

describe('parseCustomerClipboardText', () => {
  it('parses phone only', () => {
    expect(parseCustomerClipboardText('9876543210')).toEqual({
      phone: '9876543210',
      email: '',
      mapsUrl: '',
    });
  });

  it('parses +91 phone', () => {
    expect(parseCustomerClipboardText('+91 98765 43210').phone).toBe('9876543210');
  });

  it('parses email only', () => {
    expect(parseCustomerClipboardText('ramesh@gmail.com')).toEqual({
      phone: '',
      email: 'ramesh@gmail.com',
      mapsUrl: '',
    });
  });

  it('parses maps short link', () => {
    const parsed = parseCustomerClipboardText('https://maps.app.goo.gl/AbCdEfGhIjKlMnOp');
    expect(parsed.mapsUrl).toContain('maps.app.goo.gl');
    expect(parsed.phone).toBe('');
  });

  it('ignores name lines', () => {
    const parsed = parseCustomerClipboardText('Ramesh Kumar\n9876543210');
    expect(parsed.phone).toBe('9876543210');
    expect(parsed.email).toBe('');
  });

  it('does not treat image-like emails as email', () => {
    expect(parseCustomerClipboardText('asset@cdn.example.png').email).toBe('');
  });
});

describe('isFreshClipboardTimestamp', () => {
  it('accepts copies within 15s', () => {
    expect(isFreshClipboardTimestamp(Date.now() - 5_000)).toBe(true);
  });

  it('rejects older copies', () => {
    expect(isFreshClipboardTimestamp(Date.now() - 20_000)).toBe(false);
  });

  it('rejects missing timestamp', () => {
    expect(isFreshClipboardTimestamp(null)).toBe(false);
    expect(isFreshClipboardTimestamp(0)).toBe(false);
  });
});

describe('clipboardFingerprint', () => {
  it('is stable for whitespace differences', () => {
    expect(clipboardFingerprint('a  b')).toBe(clipboardFingerprint('a b'));
  });
});
