import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/isNativeApp';
import {
  browserSupportsWebAuthn,
  deletePasskey,
  listPasskeys,
  mapPasskeyError,
  passkeyHostnameHint,
  registerPasskey,
  type PasskeyListItem,
} from '@/lib/passkeys';

function formatPasskeyWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Settings → Passkeys. Face ID / fingerprint on hydrogenro.com.
 * Separate from APK app lock.
 */
export function AdminPasskeysCard() {
  const native = isNativeApp();
  const [loading, setLoading] = useState(!native);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<PasskeyListItem[]>([]);
  const hostnameHint = passkeyHostnameHint();
  const supported = browserSupportsWebAuthn();

  const refresh = useCallback(async () => {
    if (native) return;
    setLoading(true);
    try {
      setKeys(await listPasskeys());
    } catch (err) {
      setKeys([]);
      toast.error(mapPasskeyError(err, 'Could not load passkeys.'));
    } finally {
      setLoading(false);
    }
  }, [native]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAdd() {
    if (saving) return;
    setSaving(true);
    try {
      await registerPasskey();
      toast.success('Passkey added. Next visit, use Face ID or fingerprint on this site.');
      await refresh();
    } catch (err) {
      toast.error(mapPasskeyError(err, 'Could not add a passkey.'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      await deletePasskey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success('Passkey removed');
    } catch (err) {
      toast.error(mapPasskeyError(err, 'Could not remove that passkey.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="section-passkeys" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-sky-700" />
          Passkeys
        </CardTitle>
        <CardDescription>
          One-touch sign-in on hydrogenro.com with Face ID or fingerprint. Email and
          password stay as backup. This is not the Admin app lock.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {native ? (
          <p className="text-sm text-muted-foreground leading-snug">
            Passkeys work in Safari or Chrome on hydrogenro.com. This app uses App
            lock instead.
          </p>
        ) : (
          <>
            {hostnameHint ? (
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-snug">{hostnameHint}</p>
            ) : null}
            {!supported ? (
              <p className="text-sm text-muted-foreground leading-snug">
                This browser does not support passkeys. Use Safari or Chrome on hydrogenro.com.
              </p>
            ) : null}

            <div className="space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading passkeys…</p>
              ) : keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No passkeys yet.</p>
              ) : (
                keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {key.friendly_name || 'Passkey'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {formatPasskeyWhen(key.created_at) || '—'}
                        {key.last_used_at ? ` · Last used ${formatPasskeyWhen(key.last_used_at)}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 shrink-0"
                      disabled={saving}
                      onClick={() => void onDelete(key.id)}
                      aria-label="Remove passkey"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={saving || !supported}
              onClick={() => void onAdd()}
            >
              {saving ? 'Waiting for device…' : 'Add passkey'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
