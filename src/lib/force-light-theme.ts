import { cn } from '@/lib/utils';

/** Keeps email template UIs on a white/light theme even when CRM dark mode is on. */
export const FORCE_LIGHT_THEME_CLASS = 'force-light-theme';

export function forceLightThemeClass(...classes: (string | undefined | null | false)[]) {
  return cn(FORCE_LIGHT_THEME_CLASS, ...classes);
}

/** Radix Select portals outside the dialog — pass this to SelectContent. */
export function forceLightSelectContentClass(
  ...classes: (string | undefined | null | false)[]
) {
  return forceLightThemeClass(...classes);
}
