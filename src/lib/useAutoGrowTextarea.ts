import { useCallback, useEffect, useRef } from 'react';

/**
 * Chat-style composer that grows with its content and scrolls once it hits maxHeight.
 */
export function useAutoGrowTextarea(value: string, maxHeight = 180) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
}
