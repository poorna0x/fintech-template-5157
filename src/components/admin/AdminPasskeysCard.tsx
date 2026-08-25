import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
 * Settings (bottom) → Passkeys. Face ID / fingerprint on hydrogenro.com.
 * Separate from APK app lock.
 */
export function AdminPasskeysCard() {
  const native = isNativeApp();
  const [loading, setLoading] = useState(!native);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<PasskeyListItem[]>([]);
  const hostnameHint = passkeyHostnameHint();
  const supported = browserSupportsWebAuthn();
  const canAdd = !native && supported && !saving;

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
    if (!canAdd) return;
    setSaving(true);
    try {
      await registerPasskey();
      toast.success('Passkey added');
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
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-sky-700" />
          Passkeys
        </CardTitle>
        {!native ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer h-9 shrink-0"
            disabled={!canAdd}
            onClick={() => void onAdd()}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {saving ? 'Waiting…' : 'Add'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {native ? (
          <p className="text-sm text-muted-foreground">Use hydrogenro.com in Chrome.</p>
        ) : hostnameHint ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">{hostnameHint}</p>
        ) : !supported ? (
          <p className="text-sm text-muted-foreground">Not supported in this browser.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {key.friendly_name || 'Passkey'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPasskeyWhen(key.created_at) || '—'}
                    {key.last_used_at ? ` · ${formatPasskeyWhen(key.last_used_at)}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 shrink-0"
                  disabled={saving}
                  onClick={() => void onDelete(key.id)}
                  aria-label="Remove passkey"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
