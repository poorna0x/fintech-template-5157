/**
 * Read plain text from the OS clipboard.
 * On Capacitor Android/iOS, navigator.clipboard.readText is often blocked in
 * the WebView — use the native Clipboard plugin instead.
 *
 * Desktop website: Clipboard API needs a fresh user gesture. Callers should
 * prefer `beginWebClipboardRead()` at the start of a click handler (before any
 * await) so Chrome does not drop transient activation.
 */
import { Capacitor } from '@capacitor/core';

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Legacy paste fallback when Clipboard API is blocked (desktop browsers only). */
function readClipboardViaExecCommand(): string {
  const ta = document.createElement('textarea');
  ta.value = '';
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('paste');
  } catch {
    ok = false;
  }
  const value = ta.value;
  document.body.removeChild(ta);
  if (ok || value) return value;
  throw new Error('clipboard_denied');
}

/**
 * Start a web clipboard read in the same tick as a user click (no await before this).
 * Returns null on native apps — those must use Capacitor via readClipboardText().
 */
export function beginWebClipboardRead(): Promise<string> | null {
  if (isNativePlatform()) return null;
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.readText !== 'function'
  ) {
    return null;
  }
  return navigator.clipboard.readText();
}

export async function readClipboardText(): Promise<string> {
  if (isNativePlatform()) {
    const { Clipboard } = await import('@capacitor/clipboard');
    const { value } = await Clipboard.read();
    return typeof value === 'string' ? value : '';
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.readText !== 'function'
  ) {
    // Last resort before giving up (some older desktop browsers).
    try {
      return readClipboardViaExecCommand();
    } catch {
      throw new Error('clipboard_unavailable');
    }
  }

  try {
    return await navigator.clipboard.readText();
  } catch {
    // Clipboard API denied / activation lost — try legacy paste (desktop only).
    try {
      return readClipboardViaExecCommand();
    } catch {
      throw new Error('clipboard_denied');
    }
  }
}
