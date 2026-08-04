import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getAdminBiometricResumeEpoch,
  isAdminAppLocked,
  isAdminBiometricUnlocking,
  subscribeAdminBiometricLock,
  unlockAdminAppWithBiometric,
} from '@/lib/adminBiometricLock';

/**
 * Full-screen gate over admin portal while fingerprint lock is active.
 * Push deep-links stay queued until unlock succeeds.
 */
export function AdminBiometricLockScreen() {
  const [locked, setLocked] = useState(() => isAdminAppLocked());
  const [busy, setBusy] = useState(() => isAdminBiometricUnlocking());
  const [resumeEpoch, setResumeEpoch] = useState(() => getAdminBiometricResumeEpoch());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAdminBiometricLock(() => {
      setLocked(isAdminAppLocked());
      setBusy(isAdminBiometricUnlocking());
      setResumeEpoch(getAdminBiometricResumeEpoch());
    });
  }, []);

  useEffect(() => {
    if (!locked || busy) return;
    // Auto-prompt on lock appear and when returning from background (push tap).
    const t = window.setTimeout(() => {
      void handleUnlock();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prompt on lock/resume only
  }, [locked, resumeEpoch]);

  async function handleUnlock() {
    setError(null);
    const result = await unlockAdminAppWithBiometric();
    if (result === 'failed') {
      setError('Could not verify. Try again.');
    }
  }

  if (!locked) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#FAFAFA] dark:bg-gray-950 px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Admin"
    >
      <div className="flex flex-col items-center gap-5 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
          <Fingerprint className="w-8 h-8 text-sky-700 dark:text-sky-400" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Unlock Admin
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Use fingerprint, face, or your phone PIN. After unlock, any notification
            you opened will open normally.
          </p>
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full h-11 touch-manipulation bg-sky-700 hover:bg-sky-800"
          onClick={() => void handleUnlock()}
          disabled={busy}
        >
          {busy ? 'Waiting…' : 'Unlock with fingerprint'}
        </Button>
      </div>
    </div>
  );
}
