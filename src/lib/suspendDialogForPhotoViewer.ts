import { useCallback, useRef } from 'react';

/**
 * Close a parent Radix Dialog before opening PhotoSwipe, then restore it on close.
 * Keeps RemoveScroll from eating pinch / double-tap zoom (same pattern as technician app).
 */
export function useSuspendDialogForPhotoViewer() {
  const suspendedRef = useRef(false);

  const openSuspendedViewer = useCallback((closeParent: () => void, openViewer: () => void) => {
    suspendedRef.current = true;
    closeParent();
    window.setTimeout(openViewer, 50);
  }, []);

  const closeSuspendedViewer = useCallback((reopenParent: () => void, clearViewer: () => void) => {
    clearViewer();
    if (!suspendedRef.current) return;
    // Keep suspendedRef true until parent has reopened so report can skip refetch.
    reopenParent();
    window.setTimeout(() => {
      suspendedRef.current = false;
    }, 0);
  }, []);

  const ignoreParentDismissWhileSuspended = useCallback(() => suspendedRef.current, []);

  return {
    suspendedRef,
    openSuspendedViewer,
    closeSuspendedViewer,
    ignoreParentDismissWhileSuspended,
  };
}
