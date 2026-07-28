import { useEffect, useState } from 'react';
import {
  FOLLOW_UP_GLOW_CHANGED_EVENT,
  FOLLOW_UP_GLOW_ENABLED_KEY,
  isFollowUpGlowEnabled,
} from '@/lib/followUpGlowSettings';

export function useFollowUpGlowEnabled(): boolean {
  const [enabled, setEnabled] = useState(isFollowUpGlowEnabled);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setEnabled(detail?.enabled ?? isFollowUpGlowEnabled());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === FOLLOW_UP_GLOW_ENABLED_KEY) {
        setEnabled(isFollowUpGlowEnabled());
      }
    };

    window.addEventListener(FOLLOW_UP_GLOW_CHANGED_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(FOLLOW_UP_GLOW_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return enabled;
}
