import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearStaleScrollLock, isAppInteractionStuck } from '@/lib/layoutStability';

describe('clearStaleScrollLock', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    document.body.removeAttribute('data-scroll-locked');
    document.body.className = '';
    document.body.style.cssText = '';
    const root = document.getElementById('root')!;
    root.style.cssText = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clears pointer-events:none on #root when no dialog is open', () => {
    const root = document.getElementById('root')!;
    root.style.pointerEvents = 'none';
    document.body.setAttribute('data-scroll-locked', '1');

    expect(isAppInteractionStuck()).toBe(true);
    clearStaleScrollLock();

    expect(root.style.pointerEvents).toBe('');
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(isAppInteractionStuck()).toBe(false);
  });

  it('does not clear while a dialog is open', () => {
    document.body.innerHTML =
      '<div id="root"></div><div role="dialog" data-state="open"></div>';
    const root = document.getElementById('root')!;
    root.style.pointerEvents = 'none';
    document.body.setAttribute('data-scroll-locked', '1');

    expect(isAppInteractionStuck()).toBe(false);
    clearStaleScrollLock();

    expect(root.style.pointerEvents).toBe('none');
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(true);
  });
});
