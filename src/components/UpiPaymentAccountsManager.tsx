import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteUpiPaymentAccount,
  fetchUpiPaymentAccounts,
  isUpiRemoteUnavailable,
  loadUpiPaymentAccounts,
  upsertUpiPaymentAccount,
  type UpiPaymentAccount,
} from '@/lib/upiPaymentAccounts';

type UpiPaymentAccountsManagerProps = {
  /** Compact layout for dialogs */
  compact?: boolean;
  onAccountsChange?: (accounts: UpiPaymentAccount[]) => void;
};

export default function UpiPaymentAccountsManager({
  compact = false,
  onAccountsChange,
}: UpiPaymentAccountsManagerProps) {
  const [accounts, setAccounts] = useState<UpiPaymentAccount[]>(() => loadUpiPaymentAccounts());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [phone, setPhone] = useState('');
  const [fromRemote, setFromRemote] = useState(false);

  const applyAccounts = (next: UpiPaymentAccount[], remote: boolean) => {
    setAccounts(next);
    setFromRemote(remote);
    onAccountsChange?.(next);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const { accounts: next, fromRemote: remote } = await fetchUpiPaymentAccounts();
      applyAccounts(next, remote && !isUpiRemoteUnavailable());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onUpdate = () => {
      applyAccounts(loadUpiPaymentAccounts(), fromRemote);
    };
    window.addEventListener('upiPaymentAccountsUpdated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('upiPaymentAccountsUpdated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setAdding(false);
    setLabel('');
    setUpiId('');
    setPayeeName('');
    setPhone('');
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setLabel('');
    setUpiId('');
    setPayeeName('');
    setPhone('');
  };

  const startEdit = (a: UpiPaymentAccount) => {
    setAdding(false);
    setEditingId(a.id);
    setLabel(a.label);
    setUpiId(a.upiId);
    setPayeeName(a.payeeName);
    setPhone(a.phone || '');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { account, error, fromRemote: remote } = await upsertUpiPaymentAccount({
        id: editingId || undefined,
        label,
        upiId,
        payeeName: payeeName.trim() || label,
        phone,
      });
      if (error || !account) {
        toast.error(error || 'Could not save UPI account');
        return;
      }
      toast.success(editingId ? 'UPI account updated' : 'UPI account added');
      setFromRemote(remote);
      resetForm();
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await deleteUpiPaymentAccount(id);
      if (error) {
        toast.error(error);
        return;
      }
      if (editingId === id) resetForm();
      toast.success('UPI account removed');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const showForm = adding || !!editingId;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {!showForm && (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            UPI ID + payment phone for pending-payment WhatsApp.
            {fromRemote
              ? ' Synced to the cloud (all admin devices).'
              : ' Saved on this device until the database table is set up.'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startAdd}
            className="shrink-0"
            disabled={loading || saving}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      {!loading && accounts.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">
          No UPI accounts yet. Add UPI ID and payment phone (e.g. Hydrogen RO @oksbi + 98869xxxxx).
        </p>
      ) : null}

      {!loading && accounts.length > 0 && !showForm ? (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{a.label}</div>
                <div className="text-xs font-mono text-muted-foreground truncate">{a.upiId}</div>
                {a.phone ? (
                  <div className="text-xs text-muted-foreground truncate">Phone: {a.phone}</div>
                ) : (
                  <div className="text-xs text-amber-700 dark:text-amber-400">No payment phone</div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => startEdit(a)}
                  title="Edit"
                  disabled={saving}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-600 hover:text-red-700"
                  onClick={() => void handleDelete(a.id)}
                  title="Delete"
                  disabled={saving}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showForm ? (
        <div className="space-y-3 rounded-md border p-3 bg-muted/30">
          <div>
            <Label htmlFor="upi-acct-label">Label *</Label>
            <Input
              id="upi-acct-label"
              className="mt-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Hydrogen RO HDFC"
            />
          </div>
          <div>
            <Label htmlFor="upi-acct-id">UPI ID *</Label>
            <Input
              id="upi-acct-id"
              className="mt-1 font-mono text-sm"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. hydrogenro@oksbi"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div>
            <Label htmlFor="upi-acct-phone">Payment phone</Label>
            <Input
              id="upi-acct-phone"
              className="mt-1"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile (for iPhone / UPI to phone)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown in WhatsApp so iPhone users can pay to this number if the UPI link does not open.
            </p>
          </div>
          <div>
            <Label htmlFor="upi-acct-payee">Payee name (optional)</Label>
            <Input
              id="upi-acct-payee"
              className="mt-1"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="Shown in GPay / PhonePe — defaults to label"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : editingId ? (
                'Save changes'
              ) : (
                'Add UPI account'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
