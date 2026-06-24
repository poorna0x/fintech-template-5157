import React from 'react';
import { isIOS, markNativeSwitchHaptic } from '@/lib/haptics';

type Props = {
  disabled?: boolean;
};

/**
 * Invisible native iOS switch over a button — direct tap triggers Taptic Engine (Safari 17.4+).
 * Programmatic .click() no longer works on iOS 26.5+; this overlay is the reliable path.
 */
export function IOSSwitchHapticOverlay({ disabled }: Props) {
  if (!isIOS()) return null;

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (disabled) return;
    const host = e.currentTarget.parentElement as HTMLElement | null;
    host?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    markNativeSwitchHaptic();
    e.currentTarget.checked = false;
  };

  return (
    <input
      type="checkbox"
      {...({ switch: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
      aria-hidden
      tabIndex={-1}
      disabled={disabled}
      onChange={handleChange}
      onClick={handleClick}
      className="absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0 touch-manipulation"
      style={{
        WebkitTapHighlightColor: 'transparent',
        clipPath: 'inset(0 round 999px)',
      }}
    />
  );
}
