import { describe, expect, it } from 'vitest';
import { ADMIN_PRIVACY_IDLE_MS, adminPrivacyChord, isDesktopPrivacyTarget } from './adminPrivacyBlur';

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

  it('auto-blurs after 3 minutes without use', () => {
    expect(ADMIN_PRIVACY_IDLE_MS).toBe(3 * 60 * 1000);
  });

  it('blurs on a desktop with a mouse and skips phones and the admin app', () => {
    expect(isDesktopPrivacyTarget({ nativeApp: false, hover: true, finePointer: true })).toBe(true);
    expect(isDesktopPrivacyTarget({ nativeApp: true, hover: true, finePointer: true })).toBe(false);
    expect(isDesktopPrivacyTarget({ nativeApp: false, hover: false, finePointer: false })).toBe(false);
    expect(isDesktopPrivacyTarget({ nativeApp: false, hover: true, finePointer: false })).toBe(false);
  });
});
