/**
 * Save a file into the public Downloads folder on Capacitor Android/iOS.
 * WebView ignores <a download> for blob URLs — use the native PdfSave plugin.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

type PdfSavePlugin = {
  saveToDownloads(options: {
    filename: string;
    data: string;
    mimeType?: string;
  }): Promise<{ path?: string; filename?: string }>;
};

const PdfSave = registerPlugin<PdfSavePlugin>('PdfSave');

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
}

/** Write bytes to Downloads via native plugin. Returns false on web or if unavailable. */
export async function saveBytesToNativeDownloads(
  buffer: ArrayBuffer,
  filename: string,
  mimeType = 'application/octet-stream'
): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    if (!Capacitor.isPluginAvailable('PdfSave')) return false;

    await PdfSave.saveToDownloads({
      filename: sanitizeFilename(filename),
      data: arrayBufferToBase64(buffer),
      mimeType,
    });
    return true;
  } catch (err) {
    console.warn('[downloads] native save failed', err);
    return false;
  }
}
