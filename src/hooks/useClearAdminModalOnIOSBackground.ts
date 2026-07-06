import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isIOS } from '@/lib/haptics';
import { isPWAMode } from '@/lib/pwa';
import {
  adminDashboardLocation,
  buildAdminDashboardSearch,
  parseAdminDashboardUrl,
} from '@/lib/adminDashboardUrl';

/**
 * iOS standalone PWA restores the last URL on reopen — ?modal=… can reopen dialogs.
 * Clear modal params when the app is hidden (close / app switcher).
 */
export function useClearAdminModalOnIOSBackground(onLocalClear?: () => void): void {
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef(location.search);
  searchRef.current = location.search;
  const onLocalClearRef = useRef(onLocalClear);
  onLocalClearRef.current = onLocalClear;

  useEffect(() => {
    if (!isIOS() || !isPWAMode()) return;

    const clearModalFromUrl = () => {
      const parsed = parseAdminDashboardUrl(searchRef.current);
      if (parsed.modal) {
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch({ clearModal: true }, searchRef.current)
          ),
          { replace: true }
        );
      }
      onLocalClearRef.current?.();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearModalFromUrl();
      }
    };

    window.addEventListener('pagehide', clearModalFromUrl);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', clearModalFromUrl);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [navigate]);
}
