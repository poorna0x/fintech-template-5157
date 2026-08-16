/**
 * Open a downloaded file with the phone's own viewer from the Capacitor WebView.
 * Android WebView has no PDF renderer and drops `window.open('blob:…')`, so the
 * bytes must be handed to a native app instead.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { arrayBufferToBase64, sanitizeFilename } from '@/lib/nativeDownloadsSave';

type PdfSaveOpenPlugin = {
  openFile(options: {
    filename: string;
    data: string;
    mimeType?: string;
  }): Promise<{ opened?: boolean }>;
};

const PdfSave = registerPlugin<PdfSaveOpenPlugin>('PdfSave');

/** 'opened' = system viewer, 'shared' = share sheet fallback on older APKs. */
export type NativeFileOpenResult = 'opened' | 'shared' | 'unavailable';

export function isNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function shareFromCache(
  data: string,
  safeName: string
): Promise<NativeFileOpenResult> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const path = `hro-open/${safeName}`;
    const written = await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    const fileUrl =
      written.uri || (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
    await Share.share({ title: safeName, url: fileUrl, dialogTitle: 'Open with' });
    return 'shared';
  } catch (err) {
    console.warn('[native-open] share fallback failed', err);
    return 'unavailable';
  }
}

export async function openBytesNatively(
  buffer: ArrayBuffer,
  filename: string,
  mimeType = 'application/octet-stream'
): Promise<NativeFileOpenResult> {
  if (!isNativeRuntime()) return 'unavailable';

  const safeName = sanitizeFilename(filename);
  const data = arrayBufferToBase64(buffer);

  if (Capacitor.isPluginAvailable('PdfSave')) {
    try {
      await PdfSave.openFile({ filename: safeName, data, mimeType });
      return 'opened';
    } catch (err) {
      // APKs built before openFile existed reject here — share sheet still works.
      console.warn('[native-open] native viewer unavailable', err);
    }
  }

  return shareFromCache(data, safeName);
}
