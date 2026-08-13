/**
 * Local-only WhatsApp inbox backup for Admin APK / browser.
 * Export → JSON file on device; Import restores text cache (+ optional media).
 * Does not upload to the server.
 */
import { Capacitor } from '@capacitor/core';
import {
  clearAllWhatsAppLocalTextCache,
  dumpWhatsAppThreadMessagesCache,
  inboxListRangeKey,
  loadWhatsAppInboxListRange,
  loadWhatsAppReadMap,
  peekWhatsAppInboxThreadsCache,
  restoreWhatsAppThreadMessagesCache,
  saveWhatsAppInboxListRange,
  writeWhatsAppInboxThreadsCache,
  type ThreadMsgsCacheEntry,
  type WhatsAppInboxListRange,
  type WhatsAppThread,
} from '@/lib/whatsappInbox';
import {
  clearAllCachedMedia,
  exportCachedMediaForBackup,
  importCachedMediaFromBackup,
  type WhatsAppMediaBackupItem,
} from '@/lib/whatsappMediaCache';

export const WHATSAPP_LOCAL_BACKUP_VERSION = 1 as const;

export type WhatsAppLocalBackup = {
  version: typeof WHATSAPP_LOCAL_BACKUP_VERSION;
  exportedAt: string;
  listRange: WhatsAppInboxListRange;
  readMap: Record<string, string>;
  threads: WhatsAppThread[];
  threadsRangeKey: string;
  messagesByPhone: Record<string, ThreadMsgsCacheEntry>;
  media?: WhatsAppMediaBackupItem[];
};

function markWhatsAppReadMap(map: Record<string, string>): void {
  try {
    localStorage.setItem('wa_inbox_read_at_v1', JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function buildWhatsAppLocalBackupTextOnly(): WhatsAppLocalBackup {
  const listRange = loadWhatsAppInboxListRange();
  const rangeKey = inboxListRangeKey(listRange);
  const list = peekWhatsAppInboxThreadsCache({ rangeKey });
  return {
    version: WHATSAPP_LOCAL_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    listRange,
    readMap: loadWhatsAppReadMap(),
    threads: list?.threads || [],
    threadsRangeKey: rangeKey,
    messagesByPhone: dumpWhatsAppThreadMessagesCache(),
  };
}

export async function buildWhatsAppLocalBackup(opts?: {
  includeMedia?: boolean;
}): Promise<WhatsAppLocalBackup> {
  const base = buildWhatsAppLocalBackupTextOnly();
  if (!opts?.includeMedia) return base;
  try {
    base.media = await exportCachedMediaForBackup();
  } catch {
    base.media = [];
  }
  return base;
}

export async function restoreWhatsAppLocalBackup(
  backup: WhatsAppLocalBackup
): Promise<{ phones: number; threads: number; media: number }> {
  if (!backup || backup.version !== WHATSAPP_LOCAL_BACKUP_VERSION) {
    throw new Error('Unsupported backup file');
  }
  if (backup.listRange) saveWhatsAppInboxListRange(backup.listRange);
  if (backup.readMap && typeof backup.readMap === 'object') {
    markWhatsAppReadMap(backup.readMap);
  }
  const threads = Array.isArray(backup.threads) ? backup.threads : [];
  const rangeKey =
    backup.threadsRangeKey || inboxListRangeKey(backup.listRange || 'today');
  writeWhatsAppInboxThreadsCache(threads, { rangeKey });
  const phones = restoreWhatsAppThreadMessagesCache(backup.messagesByPhone || {});
  let media = 0;
  if (backup.media?.length) {
    media = await importCachedMediaFromBackup(backup.media);
  }
  return { phones, threads: threads.length, media };
}

export async function clearWhatsAppLocalDeviceData(opts?: {
  includeMedia?: boolean;
}): Promise<void> {
  clearAllWhatsAppLocalTextCache();
  if (opts?.includeMedia !== false) {
    await clearAllCachedMedia();
  }
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** Save backup JSON to Downloads / share sheet (APK) or browser download. */
export async function saveWhatsAppLocalBackupFile(
  backup: WhatsAppLocalBackup
): Promise<{ ok: boolean; error?: string; path?: string }> {
  const filename = `hro-whatsapp-local-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify(backup);
  const blob = new Blob([json], { type: 'application/json' });

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const written = await Filesystem.writeFile({
        path: filename,
        data: btoa(unescape(encodeURIComponent(json))),
        directory: Directory.Cache,
      });
      const uri =
        written.uri ||
        (await Filesystem.getUri({ path: filename, directory: Directory.Cache })).uri;
      try {
        await Share.share({
          title: 'WhatsApp local backup',
          url: uri,
          dialogTitle: 'Save WhatsApp backup',
        });
      } catch {
        /* share cancelled — file still in cache */
      }
      return { ok: true, path: uri };
    } catch (err) {
      // Fall through to browser download
      console.warn('[wa-local-backup] native save failed', err);
    }
  }

  try {
    triggerBrowserDownload(blob, filename);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

export async function readWhatsAppLocalBackupFile(
  file: File
): Promise<WhatsAppLocalBackup> {
  const text = await file.text();
  const parsed = JSON.parse(text) as WhatsAppLocalBackup;
  if (!parsed || parsed.version !== WHATSAPP_LOCAL_BACKUP_VERSION) {
    throw new Error('Invalid or unsupported backup file');
  }
  return parsed;
}
