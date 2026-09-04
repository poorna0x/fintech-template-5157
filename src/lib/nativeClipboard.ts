/**
 * Read plain text from the OS clipboard.
 * On Capacitor Android/iOS, navigator.clipboard.readText is often blocked in
 * the WebView — use the native Clipboard plugin instead.
 *
 * Admin APK: prefers AdminClipboard (handles Google Maps HTML/URI shares that
 * stock @capacitor/clipboard often returns empty for).
 *
 * Desktop website: Clipboard API needs a fresh user gesture. Callers should
 * prefer `beginWebClipboardRead()` at the start of a click handler (before any
 * await) so Chrome does not drop transient activation.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

type AdminClipboardPlugin = {
  readText(): Promise<{ value?: string; timestampMs?: number }>;
};

const AdminClipboard = registerPlugin<AdminClipboardPlugin>('AdminClipboard');

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

async function readViaAdminClipboardPlugin(): Promise<{
  text: string;
  timestampMs: number | null;
} | null> {
  if (!Capacitor.isPluginAvailable('AdminClipboard')) return null;
  try {
    const result = await AdminClipboard.readText();
    const text = typeof result.value === 'string' ? result.value : '';
    const timestampMs =
      typeof result.timestampMs === 'number' && result.timestampMs > 0
        ? result.timestampMs
        : null;
    return { text, timestampMs };
  } catch {
    return null;
  }
}

/** Text + copy time when AdminClipboard provides it (Android APK). */
export async function readClipboardPayload(): Promise<{
  text: string;
  timestampMs: number | null;
}> {
  if (isNativePlatform()) {
    const adminRead = await readViaAdminClipboardPlugin();
    if (adminRead !== null) return adminRead;
    return { text: await readClipboardText(), timestampMs: null };
  }
  return { text: await readClipboardText(), timestampMs: null };
}

export async function readClipboardText(): Promise<string> {
  if (isNativePlatform()) {
    // Prefer admin-hardened reader (Maps shares, UI-thread, coerceToText).
    const adminRead = await readViaAdminClipboardPlugin();
    if (adminRead !== null) return adminRead.text;

    const { Clipboard } = await import('@capacitor/clipboard');
    try {
      const { value } = await Clipboard.read();
      return typeof value === 'string' ? value : '';
    } catch (err) {
      // The Android plugin REJECTS when the clipboard is merely empty
      // ("There is no data on the clipboard") — that's not a denial, so
      // return '' and let callers show their "clipboard is empty" message.
      const msg = err instanceof Error ? err.message : String(err);
      if (/no data/i.test(msg)) return '';
      // Plugin failed for another reason (e.g. null clip description on some
      // Samsung builds) — try the WebView Clipboard API before giving up.
      try {
        if (navigator?.clipboard?.readText) {
          return await navigator.clipboard.readText();
        }
      } catch {
        // fall through to clipboard_denied
      }
      throw new Error('clipboard_denied');
    }
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
