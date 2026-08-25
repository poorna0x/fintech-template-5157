import { describe, expect, it } from 'vitest';
import { mapPasskeyError, passkeyHostnameHint } from './passkeyErrors';

describe('mapPasskeyError', () => {
  it('maps user cancel', () => {
    expect(mapPasskeyError({ name: 'NotAllowedError' })).toMatch(/cancelled/i);
    expect(mapPasskeyError({ name: 'AbortError' })).toMatch(/cancelled/i);
  });

  it('maps already-registered', () => {
    expect(mapPasskeyError({ name: 'InvalidStateError' })).toMatch(/already registered/i);
  });

  it('maps passkeys disabled / missing feature', () => {
    expect(mapPasskeyError({ status: 404 })).toMatch(/not enabled/i);
    expect(mapPasskeyError({ error_code: 'passkey_disabled' })).toMatch(/not enabled/i);
    expect(mapPasskeyError({ msg: 'Passkeys are disabled' })).toMatch(/not enabled/i);
  });

  it('falls back for unknown errors', () => {
    expect(mapPasskeyError(null)).toMatch(/try again/i);
    expect(mapPasskeyError({ message: 'weird' })).toBe('weird');
  });

  it('hints when the page is not hydrogenro.com', () => {
    expect(passkeyHostnameHint('localhost')).toMatch(/hydrogenro\.com/i);
    expect(passkeyHostnameHint('hydrogenro.com')).toBeNull();
  });
});
