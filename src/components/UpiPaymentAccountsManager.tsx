import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import ImageUpload from '@/components/ImageUpload';
import { Loader2, Pencil, Plus, QrCode, Trash2, X } from 'lucide-react';
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
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [dynamicUpiEnabled, setDynamicUpiEnabled] = useState(false);
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
    setQrCodeUrl('');
    setDynamicUpiEnabled(false);
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setLabel('');
    setUpiId('');
    setPayeeName('');
    setPhone('');
    setQrCodeUrl('');
    setDynamicUpiEnabled(false);
  };

  const startEdit = (a: UpiPaymentAccount) => {
    setAdding(false);
    setEditingId(a.id);
    setLabel(a.label);
    setUpiId(a.upiId);
    setPayeeName(a.payeeName);
    setPhone(a.phone || '');
    setQrCodeUrl(a.qrCodeUrl || '');
    setDynamicUpiEnabled(a.dynamicUpiEnabled ?? false);
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
        qrCodeUrl,
        dynamicUpiEnabled,
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
            UPI accounts and QR codes for pending-payment WhatsApp.
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
          No UPI accounts yet. Add UPI ID and payment phone, or upload a static QR standee photo.
        </p>
      ) : null}

      {!loading && accounts.length > 0 && !showForm ? (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-card hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {a.qrCodeUrl && a.qrCodeUrl !== '[object Object]' ? (
                  <img
                    src={a.qrCodeUrl}
                    alt={a.label}
                    className="h-12 w-12 rounded-md object-cover border bg-muted shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md border border-dashed flex items-center justify-center bg-muted/40 text-muted-foreground shrink-0">
                    <QrCode className="h-5 w-5 opacity-60" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{a.label}</span>
                    {a.dynamicUpiEnabled ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        Dynamic UPI
                      </Badge>
                    ) : a.qrCodeUrl ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Static QR
                      </Badge>
                    ) : null}
                  </div>
                  {a.upiId ? (
                    <div className="text-xs font-mono text-muted-foreground truncate">{a.upiId}</div>
                  ) : null}
                  {a.phone ? (
                    <div className="text-xs text-muted-foreground truncate">Phone: {a.phone}</div>
                  ) : (
                    <div className="text-xs text-amber-700 dark:text-amber-400">No payment phone</div>
                  )}
                </div>
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
        <div className="space-y-4 rounded-lg border p-3.5 bg-muted/30">
          <div>
            <Label htmlFor="upi-acct-label">Label *</Label>
            <Input
              id="upi-acct-label"
              className="mt-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Hydrogen RO HDFC / Office Standee"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="dynamic-upi-toggle" className="text-sm font-medium cursor-pointer">
                Dynamic UPI QR
              </Label>
              <p className="text-xs text-muted-foreground">
                {dynamicUpiEnabled
                  ? 'Generates dynamic QR with customer bill amount embedded for every WhatsApp send.'
                  : 'Sends the uploaded static QR photo (standee/GPay/PhonePe scanner) on WhatsApp.'}
              </p>
            </div>
            <Switch
              id="dynamic-upi-toggle"
              checked={dynamicUpiEnabled}
              onCheckedChange={setDynamicUpiEnabled}
            />
          </div>

          <div>
            <Label htmlFor="upi-acct-id">
              UPI ID {dynamicUpiEnabled ? '*' : '(optional if QR photo is uploaded)'}
            </Label>
            <Input
              id="upi-acct-id"
              className="mt-1 font-mono text-sm"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. hydrogenro@oksbi"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {dynamicUpiEnabled
                ? 'Required to generate the dynamic QR and short payment link.'
                : 'If provided, a short pay link & button will also be included alongside the static QR photo.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>QR Code Image / Standee Photo</Label>
            {qrCodeUrl && qrCodeUrl !== '[object Object]' ? (
              <div className="relative inline-block border rounded-lg p-1 bg-background">
                <img
                  src={qrCodeUrl}
                  alt="QR Code Preview"
                  className="h-28 w-28 object-contain rounded"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow"
                  onClick={() => setQrCodeUrl('')}
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <ImageUpload
                onImagesChange={(images) => {
                  const url = typeof images?.[0] === 'string' ? images[0].trim() : '';
                  setQrCodeUrl(url && url !== '[object Object]' ? url : '');
                }}
                maxImages={1}
                folder="common-qr-codes"
                title=""
                description="Upload static QR code standee or scanner photo"
                maxWidth={1000}
                quality={0.85}
              />
            )}
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

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
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
