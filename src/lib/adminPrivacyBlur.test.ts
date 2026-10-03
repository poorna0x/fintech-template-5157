import { describe, expect, it } from 'vitest';
import { adminPrivacyChord } from './adminPrivacyBlur';

const base = { shiftKey: true, altKey: false, repeat: false, metaKey: false, ctrlKey: false };

describe('adminPrivacyChord', () => {
  it('locks and unlocks with Command+Shift on Mac', () => {
    expect(adminPrivacyChord({ ...base, metaKey: true, code: 'KeyL' }, true)).toBe('lock');
    expect(adminPrivacyChord({ ...base, metaKey: true, code: 'KeyU' }, true)).toBe('unlock');
    expect(adminPrivacyChord({ ...base, ctrlKey: true, code: 'KeyL' }, true)).toBeNull();
  });

  it('locks and unlocks with Control+Shift on Windows', () => {
    expect(adminPrivacyChord({ ...base, ctrlKey: true, code: 'KeyL' }, false)).toBe('lock');
    expect(adminPrivacyChord({ ...base, ctrlKey: true, key: 'U' }, false)).toBe('unlock');
    expect(adminPrivacyChord({ ...base, metaKey: true, code: 'KeyL' }, false)).toBeNull();
  });

  it('ignores repeats and shortcuts without Shift', () => {
    expect(adminPrivacyChord({ ...base, metaKey: true, code: 'KeyL', repeat: true }, true)).toBeNull();
    expect(
      adminPrivacyChord({ ...base, metaKey: true, code: 'KeyL', shiftKey: false }, true)
    ).toBeNull();
  });
});
