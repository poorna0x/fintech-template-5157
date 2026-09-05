function hasOpenScrollLockUI(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ) !== null
  );
}

function rootEl(): HTMLElement | null {
  return document.getElementById('root');
}

/** True when the app shell is non-interactive with no visible modal. */
export function isAppInteractionStuck(): boolean {
  if (hasOpenScrollLockUI()) return false;
  const body = document.body;
  const root = rootEl();
  if (body.style.pointerEvents === 'none') return true;
  if (root?.style.pointerEvents === 'none') return true;
  if (body.hasAttribute('data-scroll-locked')) return true;
  if (body.classList.contains('with-scroll-bars-hidden')) return true;
  // Orphan dim overlay with no open dialog still eats taps.
  if (
    document.querySelector(
      '[data-radix-dialog-overlay][data-state="open"], [data-radix-alert-dialog-overlay][data-state="open"]',
    )
  ) {
    return true;
  }
  return false;
}

/** Clear pointer-events left on body / #root by react-remove-scroll / DismissableLayer. */
function clearStalePointerEvents(): void {
  const body = document.body;
  if (body.style.pointerEvents === 'none') {
    body.style.removeProperty('pointer-events');
  }
  for (const child of Array.from(body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    // react-remove-scroll sets inline pointer-events:none on body children (#root, etc.).
    if (child.style.pointerEvents === 'none') {
      child.style.removeProperty('pointer-events');
    }
  }
}

/** Drop closed/orphan overlays that still sit on top and swallow taps. */
function clearOrphanOverlays(): void {
  if (hasOpenScrollLockUI()) return;
  const nodes = document.querySelectorAll(
    '[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]',
  );
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const state = node.getAttribute('data-state');
    // No open dialog → any leftover overlay (open or closed) must not eat taps.
    if (state === 'closed' || state === 'open' || state === null) {
      node.style.pointerEvents = 'none';
    }
  });
}

/**
 * Clear react-remove-scroll / Radix attrs left on body when no modal is open.
 * Without this, the admin UI can look fine but ignore every tap until the app is killed.
 */
export function clearStaleScrollLock(): void {
  if (hasOpenScrollLockUI()) return;

  const body = document.body;
  const hadLock =
    body.hasAttribute('data-scroll-locked') ||
    body.classList.contains('with-scroll-bars-hidden') ||
    body.style.pointerEvents === 'none' ||
    Array.from(body.children).some(
      (el) => el instanceof HTMLElement && el.style.pointerEvents === 'none',
    );

  body.removeAttribute('data-scroll-locked');
  body.classList.remove('with-scroll-bars-hidden');

  for (const prop of ['padding-right', 'padding-left', 'margin-right', 'margin-left'] as const) {
    body.style.removeProperty(prop);
  }
  document.documentElement.style.removeProperty('padding-right');
  document.documentElement.style.removeProperty('margin-right');

  if (!body.classList.contains('mobile-nav-open')) {
    body.style.removeProperty('overflow');
    body.style.removeProperty('touch-action');
  }

  clearStalePointerEvents();
  clearOrphanOverlays();

  if (hadLock && import.meta.env.DEV) {
    console.debug('[layoutStability] cleared stale scroll / pointer lock');
  }
}

/** Run after dialog teardown (next frames) so Radix cleanup finishes first. */
export function scheduleClearStaleScrollLock(): void {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => clearStaleScrollLock(), 0);
    // Second pass: nested AlertDialog+Dialog / Select sometimes unlocks one layer late.
    window.setTimeout(() => clearStaleScrollLock(), 120);
    window.setTimeout(() => clearStaleScrollLock(), 400);
  });
}

/** ~1.5s+ hidden ≈ background; also run on short switches if already locked. */
const MIN_HIDDEN_MS_FOR_RESUME_FIX = 1500;

/**
 * Global recovery for admin/tech freezes anywhere (Ongoing scroll → open dialog, etc.).
 * Clears leftover Radix scroll/pointer locks without waiting for force-quit.
 */
export function initLayoutStabilityOnResume(): () => void {
  let hiddenAt: number | null = null;
  let hadScrollLockWhenHidden = false;
  let lastHadOpenDialog = hasOpenScrollLockUI();

  const recoverIfStuck = () => {
    if (isAppInteractionStuck()) {
      clearStaleScrollLock();
    }
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      hadScrollLockWhenHidden =
        document.body.hasAttribute('data-scroll-locked') ||
        document.body.classList.contains('with-scroll-bars-hidden') ||
        document.body.style.pointerEvents === 'none' ||
        rootEl()?.style.pointerEvents === 'none';
      return;
    }

    const hiddenMs = hiddenAt !== null ? Date.now() - hiddenAt : 0;
    const shouldFix =
      hadScrollLockWhenHidden || hiddenMs >= MIN_HIDDEN_MS_FOR_RESUME_FIX;

    hiddenAt = null;
    hadScrollLockWhenHidden = false;

    if (shouldFix) {
      scheduleClearStaleScrollLock();
    } else {
      recoverIfStuck();
    }
  };

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      scheduleClearStaleScrollLock();
    } else {
      recoverIfStuck();
    }
  };

  // Immediate recovery on tap when the shell is locked with no open modal.
  const onPointerDownCapture = () => {
    recoverIfStuck();
  };

  // When the last open dialog/alertdialog disappears, unlock if Radix left a lock behind.
  const observer = new MutationObserver(() => {
    const openNow = hasOpenScrollLockUI();
    if (lastHadOpenDialog && !openNow) {
      scheduleClearStaleScrollLock();
    } else if (!openNow) {
      recoverIfStuck();
    }
    lastHadOpenDialog = openNow;
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state', 'data-scroll-locked', 'style', 'class'],
  });

  // Backup: catch locks that never fire a mutation/close event (Android WebView).
  const heartbeat = window.setInterval(recoverIfStuck, 2000);

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('pointerdown', onPointerDownCapture, true);
  document.addEventListener('touchstart', onPointerDownCapture, { capture: true, passive: true });

  let removeAppListener: (() => void) | undefined;
  void import('@capacitor/app')
    .then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) scheduleClearStaleScrollLock();
      }),
    )
    .then((handle) => {
      removeAppListener = () => {
        void handle.remove();
      };
    })
    .catch(() => {
      /* web */
    });

  // First paint: clear anything left from a previous crash-reload.
  scheduleClearStaleScrollLock();

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('pointerdown', onPointerDownCapture, true);
    document.removeEventListener('touchstart', onPointerDownCapture, true);
    observer.disconnect();
    window.clearInterval(heartbeat);
    removeAppListener?.();
  };
}
