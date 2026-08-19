import { useEffect, useMemo, useState } from 'react';
import { Download, IndianRupee, Loader2, QrCode, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import DynamicUpiQrDisplay from '@/components/DynamicUpiQrDisplay';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateUpiQrPngBase64 } from '@/lib/generateUpiQrPng';
import {
  getDocumentBrandLabel,
  normalizeDocumentBrand,
  type DocumentBrand,
} from '@/lib/service-brands';
import { cn } from '@/lib/utils';
import { db } from '@/lib/supabase';
import {
  fetchUpiPaymentAccounts,
  getLastSelectedUpiAccountId,
  loadUpiPaymentAccounts,
  resolvePreferredUpiAccount,
  setLastSelectedUpiAccountId,
  type UpiPaymentAccount,
} from '@/lib/upiPaymentAccounts';
import { sendPayQrWhatsApp } from '@/lib/whatsappPayQrShare';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';

type CustomerOption = {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  alternatePhone: string;
};

function parseAmount(value: string): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null;
}

const LAST_QUICK_UPI_BRAND_KEY = 'hro_quick_upi_brand';
const QUICK_UPI_PREFILL_KEY = 'hro_quick_upi_prefill';

function getLastQuickUpiBrand(): DocumentBrand {
  if (typeof window === 'undefined') return 'elevenro';
  return normalizeDocumentBrand(localStorage.getItem(LAST_QUICK_UPI_BRAND_KEY)) || 'elevenro';
}

export default function QuickUpiQrGenerator() {
  const [accounts, setAccounts] = useState<UpiPaymentAccount[]>(() => loadUpiPaymentAccounts());
  const [selectedId, setSelectedId] = useState(() => getLastSelectedUpiAccountId() || '');
  const [brand, setBrand] = useState<DocumentBrand>(() => getLastQuickUpiBrand());
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const { ready: whatsAppReady, cloudApiOn } = useWhatsAppCloudApiGate('pending_payment');

  useEffect(() => {
    let active = true;

    const applyAccounts = (next: UpiPaymentAccount[]) => {
      if (!active) return;
      setAccounts(next);
      setSelectedId((current) => {
        if (next.some((account) => account.id === current)) return current;
        return resolvePreferredUpiAccount(next)?.id || '';
      });
    };

    void fetchUpiPaymentAccounts()
      .then(({ accounts: next }) => applyAccounts(next))
      .finally(() => {
        if (active) setLoading(false);
      });

    const handleAccountsUpdated = () => applyAccounts(loadUpiPaymentAccounts());
    window.addEventListener('upiPaymentAccountsUpdated', handleAccountsUpdated);
    window.addEventListener('storage', handleAccountsUpdated);
    return () => {
      active = false;
      window.removeEventListener('upiPaymentAccountsUpdated', handleAccountsUpdated);
      window.removeEventListener('storage', handleAccountsUpdated);
    };
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(QUICK_UPI_PREFILL_KEY);
    if (!raw) return;
    sessionStorage.removeItem(QUICK_UPI_PREFILL_KEY);
    let prefill: { customerId?: string | null; amount?: number | null; phone?: string | null } = {};
    try {
      prefill = JSON.parse(raw) as typeof prefill;
    } catch {
      return;
    }
    if (prefill.amount != null && Number(prefill.amount) > 0) {
      setAmount(String(prefill.amount));
    }
    if (prefill.phone) {
      setWhatsAppPhone(String(prefill.phone));
    }
    const customerId = String(prefill.customerId || '').trim();
    if (!customerId) return;
    void db.customers.getById(customerId).then(({ data, error }) => {
      if (error || !data) return;
      const row = data as Record<string, unknown>;
      const phone = String(row.phone || '');
      const alternatePhone = String(row.alternate_phone || '');
      setSelectedCustomer({
        id: String(row.id || customerId),
        customerId: String(row.customer_id || ''),
        name: String(row.full_name || 'Customer'),
        phone,
        alternatePhone,
      });
      setWhatsAppPhone(phone || alternatePhone);
    });
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) || null,
    [accounts, selectedId]
  );
  const qrAmount = parseAmount(amount);
  const paymentNote = useMemo(() => `Payment to ${getDocumentBrandLabel(brand)}`, [brand]);

  const selectAccount = (id: string) => {
    setSelectedId(id);
    setLastSelectedUpiAccountId(id);
  };

  const selectBrand = (next: DocumentBrand) => {
    setBrand(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_QUICK_UPI_BRAND_KEY, next);
    }
  };

  const searchCustomers = async () => {
    const query = customerQuery.trim();
    if (query.length < 2 || searching) {
      if (query.length < 2) toast.error('Enter at least 2 characters');
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await db.customers.searchSlim(query, 10);
      if (error) {
        toast.error('Could not search customers');
        return;
      }
      const next = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id || ''),
        customerId: String(row.customer_id || ''),
        name: String(row.full_name || 'Customer'),
        phone: String(row.phone || ''),
        alternatePhone: String(row.alternate_phone || ''),
      }));
      setSearchResults(next.filter((customer) => customer.id));
    } finally {
      setSearching(false);
    }
  };

  const chooseCustomer = (customer: CustomerOption) => {
    setSelectedCustomer(customer);
    setWhatsAppPhone(customer.phone || customer.alternatePhone);
    setCustomerQuery('');
    setSearchResults([]);
  };

  const shareOnWhatsApp = async () => {
    if (!selectedAccount || !qrAmount || sharing) return;
    const phone = whatsAppPhone.trim();
    if (phone.replace(/\D/g, '').length < 10) {
      toast.error('Enter a valid WhatsApp number');
      return;
    }
    setSharing(true);
    try {
      const result = await sendPayQrWhatsApp({
        to: phone,
        amount: qrAmount,
        brand,
        upiId: selectedAccount.upiId,
        payeeName: selectedAccount.payeeName || selectedAccount.label,
        paymentPhone: selectedAccount.phone,
        customerName: selectedCustomer?.name || 'there',
        customerId: selectedCustomer?.id || null,
        note: selectedCustomer?.name
          ? `Payment for ${selectedCustomer.name}`
          : paymentNote,
        jobRef: 'payment request',
        watchPhotos: false,
        source: 'pending_payment',
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not send payment QR');
        return;
      }
      toast.success(
        result.viaTemplate
          ? 'Payment QR sent using the WhatsApp template'
          : 'Payment QR sent on WhatsApp'
      );
    } catch (error) {
      console.error('[QuickUpiQrGenerator] WhatsApp share failed', error);
      toast.error('Could not send payment QR on WhatsApp');
    } finally {
      setSharing(false);
    }
  };

  const downloadQr = async () => {
    if (!selectedAccount || !qrAmount || downloading) return;
    setDownloading(true);
    try {
      const generated = await generateUpiQrPngBase64(
        {
          upiId: selectedAccount.upiId,
          payeeName: selectedAccount.payeeName || selectedAccount.label,
          phone: selectedAccount.phone,
          amount: qrAmount,
          note: paymentNote,
          brand,
        },
        { size: 420 }
      );
      if (!generated) {
        toast.error('Could not generate the QR image');
        return;
      }
      const link = document.createElement('a');
      link.href = `data:${generated.mimeType};base64,${generated.base64}`;
      link.download = generated.filename;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card id="section-quick-upi-qr" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <QrCode className="h-5 w-5" />
          Quick payment QR
        </CardTitle>
        <CardDescription>
          Select a saved UPI account and enter an amount. The amount is included in the QR.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_280px] sm:p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-upi-account">Payment account</Label>
            <Select value={selectedId} onValueChange={selectAccount} disabled={loading || !accounts.length}>
              <SelectTrigger id="quick-upi-account" className="h-11">
                <SelectValue placeholder={loading ? 'Loading accounts…' : 'Select payment account'} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label} · {account.upiId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Brand</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['hydrogenro', 'elevenro'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectBrand(option)}
                  className={cn(
                    'h-11 rounded-md border px-3 text-sm font-medium transition-colors',
                    brand === option
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  )}
                >
                  {getDocumentBrandLabel(option)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              WhatsApp pay links and templates use the selected brand site.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-upi-amount">Amount</Label>
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="quick-upi-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Enter amount"
                className="h-11 pl-9 text-base"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <div>
              <Label htmlFor="quick-upi-customer">Find customer (optional)</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Or skip this and enter any WhatsApp number below.
              </p>
            </div>

            {selectedCustomer ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedCustomer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedCustomer.customerId || selectedCustomer.phone}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove selected customer"
                  onClick={() => setSelectedCustomer(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    id="quick-upi-customer"
                    value={customerQuery}
                    onChange={(event) => setCustomerQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void searchCustomers();
                      }
                    }}
                    placeholder="Name, phone or customer ID"
                    className="h-11"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    disabled={searching || customerQuery.trim().length < 2}
                    onClick={() => void searchCustomers()}
                    aria-label="Search customers"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {searchResults.length ? (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-background p-1">
                    {searchResults.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="w-full rounded-md px-3 py-2 text-left hover:bg-muted"
                        onClick={() => chooseCustomer(customer)}
                      >
                        <span className="block truncate text-sm font-medium">{customer.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[customer.customerId, customer.phone || customer.alternatePhone]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            <div className="space-y-2 pt-1">
              <Label htmlFor="quick-upi-whatsapp">WhatsApp number</Label>
              <Input
                id="quick-upi-whatsapp"
                type="tel"
                inputMode="tel"
                value={whatsAppPhone}
                onChange={(event) => setWhatsAppPhone(event.target.value)}
                placeholder="Enter any WhatsApp number"
                className="h-11"
              />
            </div>
          </div>

          {!accounts.length && !loading ? (
            <p className="text-sm text-amber-700">
              Add a UPI payment account below before generating a payment QR.
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={!selectedAccount || !qrAmount || downloading}
              onClick={() => void downloadQr()}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download QR
            </Button>
            {whatsAppReady && cloudApiOn ? (
              <Button
                type="button"
                className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={
                  !selectedAccount ||
                  !qrAmount ||
                  whatsAppPhone.replace(/\D/g, '').length < 10 ||
                  sharing
                }
                onClick={() => void shareOnWhatsApp()}
              >
                {sharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <WhatsAppIcon className="h-4 w-4" />
                )}
                Send on WhatsApp
              </Button>
            ) : null}
          </div>
          {whatsAppReady && !cloudApiOn ? (
            <p className="text-xs text-muted-foreground">
              WhatsApp payment sends are disabled in WhatsApp Settings.
            </p>
          ) : null}
        </div>

        <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-3">
          {selectedAccount && qrAmount ? (
            <DynamicUpiQrDisplay
              key={`${selectedAccount.id}-${qrAmount}-${brand}`}
              upiId={selectedAccount.upiId}
              payeeName={selectedAccount.payeeName || selectedAccount.label}
              phone={selectedAccount.phone}
              amount={qrAmount}
              note={paymentNote}
              label={selectedAccount.label}
              size={230}
            />
          ) : (
            <div className="px-4 text-center text-sm text-muted-foreground">
              <QrCode className="mx-auto mb-2 h-9 w-9 opacity-50" />
              Select an account and enter an amount to generate the QR.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
