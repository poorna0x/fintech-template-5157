import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { isNativeApp } from '@/lib/isNativeApp';
import {
  isDesktopPrivacyTarget,
  isMacPrivacyPlatform,
  readAdminPrivacyBlurEnabled,
  setAdminPrivacyBlurEnabled,
  subscribeAdminPrivacyBlurEnabled,
} from '@/lib/adminPrivacyBlur';

/** This computer only. Phones and the admin app do not blur, so the switch stays hidden there. */
export function ScreenLockSetting() {
  const [desktop, setDesktop] = useState(false);
  const [enabled, setEnabled] = useState(readAdminPrivacyBlurEnabled);

  useEffect(() => {
    setDesktop(
      isDesktopPrivacyTarget({
        nativeApp: isNativeApp(),
        hover: window.matchMedia('(hover: hover)').matches,
        finePointer: window.matchMedia('(pointer: fine)').matches,
      })
    );
    return subscribeAdminPrivacyBlurEnabled(() => setEnabled(readAdminPrivacyBlurEnabled()));
  }, []);

  if (!desktop) return null;

  const mac = isMacPrivacyPlatform(navigator.platform || '');
  const shortcut = mac
    ? 'Command+Shift+L locks and Command+Shift+U unlocks.'
    : 'Ctrl+Shift+L locks and Ctrl+Shift+U unlocks.';

  return (
    <div
      id="screen-lock"
      className="flex items-center justify-between gap-4 p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700"
    >
      <div className="flex-1">
        <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
          Screen lock
        </h3>
        <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
          This computer only. When on, the dashboard blurs after 3 minutes of no use. {shortcut}{' '}
          Turn this off to stop the blur.
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(next) => {
          setAdminPrivacyBlurEnabled(next);
          toast.success(next ? 'Screen lock on' : 'Screen lock off');
        }}
        aria-label="Screen lock"
        className="ml-2 sm:ml-6 shrink-0 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
      />
    </div>
  );
}
