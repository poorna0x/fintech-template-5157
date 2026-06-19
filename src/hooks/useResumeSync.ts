import { useEffect, useRef } from 'react';

export type UseResumeSyncOptions = {
  /** When false, listeners are not attached. Default true. */
  enabled?: boolean;
  /** Minimum time the tab was hidden before onResume runs. Default 60s. */
  minHiddenMs?: number;
  /** Minimum time between two onResume runs. Default 15s. */
  minIntervalMs?: number;
  onResume: () => void | Promise<void>;
};

/**
 * Runs onResume when the user returns to a tab after it was idle in the background.
 * Deduplicates visibilitychange + focus and debounces rapid syncs.
 */
export function useResumeSync({
  enabled = true,
  minHiddenMs = 60_000,
  minIntervalMs = 15_000,
  onResume,
}: UseResumeSyncOptions): void {
  const hiddenAtRef = useRef<number | null>(null);
  const lastSyncAtRef = useRef(0);
  const syncingRef = useRef(false);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    if (!enabled) return;

    const runSync = async (hiddenMs: number) => {
      if (hiddenMs < minHiddenMs) return;

      const now = Date.now();
      if (now - lastSyncAtRef.current < minIntervalMs) return;
      if (syncingRef.current) return;

      syncingRef.current = true;
      lastSyncAtRef.current = now;
      try {
        await onResumeRef.current();
      } catch (e) {
        console.warn('[useResumeSync] onResume failed:', e);
      } finally {
        syncingRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt == null) return;
      void runSync(Date.now() - hiddenAt);
    };

    const onFocus = () => {
      if (document.hidden) return;
      const hiddenAt = hiddenAtRef.current;
      if (hiddenAt == null) return;
      hiddenAtRef.current = null;
      void runSync(Date.now() - hiddenAt);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, minHiddenMs, minIntervalMs]);
}
