import { settingsSectionElementId } from '@/lib/settingsSections';

const HIGHLIGHT_CLASS = ['ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-lg'] as const;
const LAYOUT_WATCH_MS = 5000;
const POLL_MS = 80;
const MAX_WAIT_MS = 8000;

function measureStickyHeaderOffset(): number {
  const header = document.querySelector('.admin-page .sticky.top-0');
  if (header instanceof HTMLElement) {
    return Math.ceil(header.getBoundingClientRect().height) + 12;
  }
  return 96;
}

function isTargetReady(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.height > 8 && rect.width > 8;
}

function scrollToTarget(el: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
  const offset = measureStickyHeaderOffset();
  el.style.scrollMarginTop = `${offset}px`;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

function highlight(el: HTMLElement): void {
  el.classList.add(...HIGHLIGHT_CLASS);
  window.setTimeout(() => {
    el.classList.remove(...HIGHLIGHT_CLASS);
  }, 2500);
}

export type SettingsSectionScrollOptions = {
  /** Called after the first successful scroll (URL may still have ?section=). */
  onScrolled?: () => void;
  /** Called when scrolling + layout correction window is finished. */
  onComplete?: () => void;
};

/**
 * Scroll to a Settings section (`section-{id}`). Retries until the node exists,
 * re-adjusts while the page layout shifts (images, lists, lazy chunks), and
 * accounts for the sticky Settings header height.
 */
export function scrollToSettingsSection(
  section: string,
  options?: SettingsSectionScrollOptions
): () => void {
  const targetId = settingsSectionElementId(section);
  let cancelled = false;
  let resizeObserver: ResizeObserver | null = null;
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let hasScrolled = false;
  const startedAt = Date.now();

  const finish = () => {
    if (cancelled) return;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (layoutTimer) clearTimeout(layoutTimer);
    options?.onComplete?.();
  };

  const watchLayout = (el: HTMLElement) => {
    resizeObserver?.disconnect();
    const root = document.querySelector('.admin-page') ?? document.body;
    resizeObserver = new ResizeObserver(() => {
      if (cancelled) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cancelled) return;
        const node = document.getElementById(targetId);
        if (node) scrollToTarget(node, 'auto');
      }, 120);
    });
    resizeObserver.observe(root);
    resizeObserver.observe(el);

    layoutTimer = setTimeout(finish, LAYOUT_WATCH_MS);
  };

  const attemptScroll = (): boolean => {
    const el = document.getElementById(targetId);
    if (!el || !isTargetReady(el)) return false;

    scrollToTarget(el, hasScrolled ? 'auto' : 'smooth');
    if (!hasScrolled) {
      hasScrolled = true;
      highlight(el);
      options?.onScrolled?.();
      watchLayout(el);
    }
    return true;
  };

  const poll = () => {
    if (cancelled) return;
    if (attemptScroll()) return;
    if (Date.now() - startedAt >= MAX_WAIT_MS) {
      finish();
      return;
    }
    setTimeout(poll, POLL_MS);
  };

  requestAnimationFrame(() => {
    setTimeout(poll, 50);
  });

  return () => {
    cancelled = true;
    resizeObserver?.disconnect();
    if (layoutTimer) clearTimeout(layoutTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
