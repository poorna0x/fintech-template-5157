/**
 * Read plain text from the OS clipboard.
 * On Capacitor Android/iOS, navigator.clipboard.readText is often blocked in
 * the WebView — use the native Clipboard plugin instead.
 */
import { Capacitor } from '@capacitor/core';

export async function readClipboardText(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { Clipboard } = await import('@capacitor/clipboard');
    const { value } = await Clipboard.read();
    return typeof value === 'string' ? value : '';
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.readText !== 'function'
  ) {
    throw new Error('clipboard_unavailable');
  }

  return await navigator.clipboard.readText();
}
