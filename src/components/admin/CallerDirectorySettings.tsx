import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  downloadAdminCallerDirectory,
  isAdminCallerDirectoryAvailable,
  readAdminCallerDirectoryStatus,
} from '@/lib/adminCallerDirectory';

function formatSavedAt(syncedAt: number): string {
  if (!syncedAt) return '';
  try {
    return new Date(syncedAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Admin app only. Downloads the name/phone list used by the incoming-call banner. */
export function CallerDirectorySettings() {
  const [available, setAvailable] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [syncedAt, setSyncedAt] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const status = await readAdminCallerDirectoryStatus();
    setCount(status ? Number(status.count || 0) : 0);
    setSyncedAt(Number(status?.syncedAt || 0));
  };

  useEffect(() => {
    const on = isAdminCallerDirectoryAvailable();
    setAvailable(on);
    if (on) void refresh();
  }, []);

  if (!available) return null;

  const when = formatSavedAt(syncedAt);
  const summary =
    count == null
      ? 'Checking this phone…'
      : count > 0
        ? `${count.toLocaleString('en-IN')} customers saved on this phone${when ? ` · ${when}` : ''}`
        : 'Nothing saved on this phone yet.';

  return (
    <Card id="section-caller-directory">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl">Caller list on this phone</CardTitle>
        <CardDescription className="text-sm mt-1">
          Names and phone numbers stay on this phone so a call can show the customer right away.
          Opening the app adds only new or edited customers. Download again replaces the whole
          list after you clear the app storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-3">
        <p className="text-sm text-muted-foreground">{summary}</p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void downloadAdminCallerDirectory()
              .then(async (result) => {
                await refresh();
                toast.success(
                  result.count > 0
                    ? `Saved ${result.count.toLocaleString('en-IN')} customers on this phone`
                    : 'No customers with a phone number were found'
                );
              })
              .catch(() => {
                toast.error('Could not download the caller list. Try again.');
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Downloading…' : 'Download again'}
        </Button>
      </CardContent>
    </Card>
  );
}
