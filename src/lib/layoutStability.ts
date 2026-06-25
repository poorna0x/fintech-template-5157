function hasOpenScrollLockUI(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ) !== null
  );
}

/** Clear react-remove-scroll / Radix attrs left on body after sleep when no modal is open */
export function clearStaleScrollLock(): void {
  if (hasOpenScrollLockUI()) return;

  const body = document.body;
  const hadLock =
    body.hasAttribute('data-scroll-locked') ||
    body.classList.contains('with-scroll-bars-hidden');
  if (!hadLock) return;

  body.removeAttribute('data-scroll-locked');
  body.classList.remove('with-scroll-bars-hidden');

  for (const prop of ['padding-right', 'padding-left', 'margin-right', 'margin-left'] as const) {
    body.style.removeProperty(prop);
  }
  document.documentElement.style.removeProperty('padding-right');
  document.documentElement.style.removeProperty('margin-right');

  if (!body.classList.contains('mobile-nav-open')) {
    body.style.removeProperty('overflow');
  }
}

/** ~3s+ hidden ≈ sleep/lock screen; skip quick browser tab switches */
const MIN_HIDDEN_MS_FOR_RESUME_FIX = 3000;

export function initLayoutStabilityOnResume(): () => void {
  let hiddenAt: number | null = null;
  let hadScrollLockWhenHidden = false;

  const onVisibilityChange = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      hadScrollLockWhenHidden =
        document.body.hasAttribute('data-scroll-locked') ||
        document.body.classList.contains('with-scroll-bars-hidden');
      return;
    }

    const hiddenMs = hiddenAt !== null ? Date.now() - hiddenAt : 0;
    const shouldFix =
      hadScrollLockWhenHidden || hiddenMs >= MIN_HIDDEN_MS_FOR_RESUME_FIX;

    hiddenAt = null;
    hadScrollLockWhenHidden = false;

    if (shouldFix) {
      clearStaleScrollLock();
    }
  };

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      clearStaleScrollLock();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
  };
}
