import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ShoppingBag, Search, Check, X, Plus } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';

interface DirectSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a sale is recorded so the caller can refresh data. */
  onSaleCreated?: () => void | Promise<void>;
}

interface InventoryItem {
  id: string;
  product_name: string;
  code?: string | null;
  price: number;
  quantity: number;
}

interface QrOption {
  id: string;
  name: string;
  url: string;
}

type PaymentMode = 'CASH' | 'ONLINE' | 'PARTIAL';

const todayInputValue = (): string => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

const DirectSaleDialog: React.FC<DirectSaleDialogProps> = ({ open, onOpenChange, onSaleCreated }) => {
  const [amount, setAmount] = useState('');
  const [item, setItem] = useState('');
  const [saleDate, setSaleDate] = useState<string>(todayInputValue());
  const [isSaving, setIsSaving] = useState(false);

  // Payment selection (mirrors the job-completion flow: Cash / Online / Partial + QR).
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [partialCashAmount, setPartialCashAmount] = useState('');
  const [partialOnlineAmount, setPartialOnlineAmount] = useState('');
  const [selectedQrId, setSelectedQrId] = useState('');
  const [qrOptions, setQrOptions] = useState<QrOption[]>([]);
  const [loadingQr, setLoadingQr] = useState(false);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  // Multiple inventory items can be sold in one office sale: id -> chosen quantity (as text).
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, string>>({});
  const [inventorySearch, setInventorySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingInventory(true);
    db.inventory
      .getAll()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error('Could not load inventory items.');
          setInventory([]);
        } else {
          setInventory((data as InventoryItem[]) || []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInventory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Load QR codes (common + technician) for online/partial payments when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingQr(true);
    Promise.all([db.commonQrCodes.getAll(), db.technicians.getAll(100)])
      .then(([qrRes, techRes]) => {
        if (cancelled) return;
        const options: QrOption[] = [];
        (qrRes?.data || []).forEach((qr: any) => {
          if (qr?.qr_code_url) {
            options.push({ id: `common_${qr.id}`, name: qr.name || 'Common QR', url: qr.qr_code_url });
          }
        });
        (techRes?.data || []).forEach((t: any) => {
          const url = t?.qr_code || t?.qrCode;
          if (url && String(url).trim()) {
            options.push({
              id: `technician_${t.id}`,
              name: `${t.full_name || t.fullName || 'Technician'}'s QR Code`,
              url,
            });
          }
        });
        setQrOptions(options);
      })
      .catch(() => {
        if (!cancelled) setQrOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingQr(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounce inventory search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inventorySearch), 250);
    return () => clearTimeout(t);
  }, [inventorySearch]);

  const resetForm = () => {
    setAmount('');
    setItem('');
    setSaleDate(todayInputValue());
    setPaymentMode('CASH');
    setPartialCashAmount('');
    setPartialOnlineAmount('');
    setSelectedQrId('');
    setSelectedQuantities({});
    setInventorySearch('');
    setDebouncedSearch('');
  };

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next) resetForm();
    onOpenChange(next);
  };

  const addItem = (inv: InventoryItem) => {
    setSelectedQuantities((prev) => (prev[inv.id] ? prev : { ...prev, [inv.id]: '1' }));
  };

  const removeItem = (id: string) => {
    setSelectedQuantities((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setItemQuantity = (id: string, value: string) => {
    setSelectedQuantities((prev) => ({ ...prev, [id]: value }));
  };

  // Resolved list of selected items with their quantity + stock/price details.
  const selectedItems = useMemo(() => {
    return Object.keys(selectedQuantities)
      .map((id) => {
        const inv = inventory.find((i) => i.id === id);
        if (!inv) return null;
        const qty = Math.max(0, Math.floor(Number(selectedQuantities[id]) || 0));
        return { ...inv, qty };
      })
      .filter((x): x is InventoryItem & { qty: number } => x !== null);
  }, [selectedQuantities, inventory]);

  const filteredInventory = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = inventory;
    if (q) {
      list = inventory.filter(
        (i) =>
          i.product_name?.toLowerCase().includes(q) ||
          (i.code ? i.code.toLowerCase().includes(q) : false)
      );
    }
    return [...list].sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));
  }, [inventory, debouncedSearch]);

  const hasItems = selectedItems.length > 0;
  const amountNum = parseFloat(amount);
  const partsCost = selectedItems.reduce((s, it) => s + it.price * it.qty, 0);
  const profit = (isNaN(amountNum) ? 0 : amountNum) - partsCost;

  const selectedQr = qrOptions.find((q) => q.id === selectedQrId) || null;
  const needsQr = paymentMode === 'ONLINE' || paymentMode === 'PARTIAL';

  const handleSubmit = async () => {
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Enter a valid sale amount.');
      return;
    }
    if (!saleDate) {
      toast.error('Select the sale date.');
      return;
    }
    for (const it of selectedItems) {
      if (it.qty < 1) {
        toast.error(`Enter a valid quantity for ${it.product_name}.`);
        return;
      }
      if (it.qty > it.quantity) {
        toast.error(`Only ${it.quantity} in stock for ${it.product_name}.`);
        return;
      }
    }

    const partialCash = parseFloat(partialCashAmount) || 0;
    const partialOnline = parseFloat(partialOnlineAmount) || 0;
    if (paymentMode === 'PARTIAL') {
      if (partialCash + partialOnline <= 0) {
        toast.error('Enter the cash and online split.');
        return;
      }
      if (partialOnline > 0 && !selectedQr) {
        toast.error('Select a QR code for the online portion.');
        return;
      }
    }
    if (paymentMode === 'ONLINE' && !selectedQr) {
      toast.error('Select a QR code for the online payment.');
      return;
    }

    // Parse YYYY-MM-DD as a local date (avoid timezone shifting the day).
    const [y, m, d] = saleDate.split('-').map(Number);
    const parsedDate = new Date(y, (m || 1) - 1, d || 1);

    const resolvedItem = hasItems
      ? selectedItems.map((it) => `${it.product_name} × ${it.qty}`).join(', ')
      : item.trim();

    const qrPhotos = needsQr && selectedQr
      ? {
          qr_code_type: selectedQr.id.startsWith('common_') ? 'common' : 'technician',
          selected_qr_code_id: selectedQr.id,
          selected_qr_code_url: selectedQr.url,
          selected_qr_code_name: selectedQr.name,
        }
      : null;

    setIsSaving(true);
    try {
      const { data, error } = await db.jobs.createDirectSale({
        amount: amountNum,
        item: resolvedItem,
        saleDate: parsedDate,
        items: selectedItems.map((it) => ({
          inventoryId: it.id,
          quantity: it.qty,
          unitPrice: it.price,
          productName: it.product_name,
          code: it.code ?? null,
        })),
        paymentMode,
        partialCashAmount: partialCash,
        partialOnlineAmount: partialOnline,
        qrPhotos,
      });
      if (error || !data) {
        throw new Error(error?.message || 'Failed to record sale');
      }
      toast.success('Direct sale recorded.');
      resetForm();
      onOpenChange(false);
      await onSaleCreated?.();
    } catch (e: any) {
      toast.error('Could not record sale: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 [&>*]:min-w-0">
        <DialogHeader>
          <div className="px-6">
            <DialogTitle className="flex items-center justify-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Record Direct Sale
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-center mt-1">
              For office/counter sales with no customer or technician. Counts toward revenue for the
              selected date.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="direct-sale-amount">Sale amount (₹) *</Label>
            <Input
              id="direct-sale-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="What the customer paid, e.g. 1500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>From inventory</Label>

            {/* Selected items (multiple allowed) with per-item quantity. */}
            {hasItems && (
              <div className="space-y-2">
                {selectedItems.map((it) => {
                  const overStock = it.qty > it.quantity;
                  return (
                    <div
                      key={it.id}
                      className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 shrink-0 text-green-600" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-sm font-medium">
                            {it.product_name}
                            {it.code ? ` (${it.code})` : ''}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {it.quantity} in stock · ₹{formatCurrency(it.price)} each
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Label htmlFor={`qty-${it.id}`} className="sr-only">
                            Quantity for {it.product_name}
                          </Label>
                          <Input
                            id={`qty-${it.id}`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max={it.quantity}
                            step="1"
                            value={selectedQuantities[it.id] ?? ''}
                            onChange={(e) => setItemQuantity(it.id, e.target.value)}
                            className={`h-8 w-16 text-sm ${overStock ? 'border-red-400' : ''}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => removeItem(it.id)}
                            title="Remove item"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {overStock && (
                        <p className="mt-1 pl-6 text-xs text-red-600">
                          Only {it.quantity} in stock.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search items by name or code..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>
            <div className="rounded-lg border overflow-hidden">
              {loadingInventory ? (
                <div className="py-6 px-4 text-center text-sm text-muted-foreground">Loading items...</div>
              ) : filteredInventory.length === 0 ? (
                <div className="py-6 px-4 text-center text-sm text-muted-foreground">
                  {inventory.length === 0
                    ? 'No inventory items.'
                    : debouncedSearch.trim()
                    ? 'No items match your search.'
                    : 'No items.'}
                </div>
              ) : (
                <div className="max-h-[min(40vh,240px)] overflow-y-auto [scrollbar-width:thin]">
                  {filteredInventory.map((inv) => {
                    const outOfStock = inv.quantity <= 0;
                    const alreadyAdded = !!selectedQuantities[inv.id];
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        disabled={outOfStock || alreadyAdded}
                        onClick={() => addItem(inv)}
                        className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-sm font-medium">
                            {inv.product_name}
                            {inv.code ? ` (${inv.code})` : ''}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {outOfStock ? 'Out of stock' : `${inv.quantity} in stock`} · ₹
                            {formatCurrency(inv.price)}
                          </span>
                        </div>
                        {alreadyAdded ? (
                          <Check className="w-4 h-4 shrink-0 text-green-600" />
                        ) : (
                          <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Add one or more items to deduct stock and track cost for profit, or skip for other sales.
            </p>
          </div>

          {!hasItems && (
            <div className="space-y-1.5">
              <Label htmlFor="direct-sale-item">Item / description</Label>
              <Input
                id="direct-sale-item"
                type="text"
                placeholder="e.g. RO membrane, filter set"
                value={item}
                onChange={(e) => setItem(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="direct-sale-date">Sale date *</Label>
            <Input
              id="direct-sale-date"
              type="date"
              value={saleDate}
              max={todayInputValue()}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="direct-sale-payment-mode">Payment mode *</Label>
            <Select
              value={paymentMode}
              onValueChange={(value: PaymentMode) => {
                setPaymentMode(value);
                if (value === 'CASH') {
                  setSelectedQrId('');
                  setPartialCashAmount('');
                  setPartialOnlineAmount('');
                } else if (value === 'ONLINE') {
                  setPartialCashAmount('');
                  setPartialOnlineAmount('');
                } else if (value === 'PARTIAL') {
                  // Prefill online with full amount, cash 0, so the split is obvious.
                  const bill = parseFloat(amount) || 0;
                  setPartialCashAmount('0');
                  setPartialOnlineAmount(bill > 0 ? String(bill) : '');
                }
              }}
            >
              <SelectTrigger id="direct-sale-payment-mode" className="mt-1">
                <SelectValue placeholder="Select payment mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="PARTIAL">Partial (Cash + Online)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {paymentMode === 'PARTIAL' && (
            <div className="space-y-3 pl-3 border-l-2 border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="direct-sale-partial-cash">Cash amount (₹)</Label>
                  <Input
                    id="direct-sale-partial-cash"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={partialCashAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPartialCashAmount(v);
                      const bill = parseFloat(amount) || 0;
                      if (v !== '' && !/^\s*$/.test(v)) {
                        const cash = parseFloat(v.replace(/,/g, '')) || 0;
                        if (!Number.isNaN(cash) && bill >= 0) {
                          const online = Math.max(0, Math.round((bill - cash) * 100) / 100);
                          setPartialOnlineAmount(
                            online === Math.floor(online) ? String(Math.floor(online)) : online.toFixed(2)
                          );
                        }
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="direct-sale-partial-online">Online amount (₹)</Label>
                  <Input
                    id="direct-sale-partial-online"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={partialOnlineAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPartialOnlineAmount(v);
                      const bill = parseFloat(amount) || 0;
                      if (v !== '' && !/^\s*$/.test(v)) {
                        const online = parseFloat(v.replace(/,/g, '')) || 0;
                        if (!Number.isNaN(online) && bill >= 0) {
                          const cash = Math.max(0, Math.round((bill - online) * 100) / 100);
                          setPartialCashAmount(
                            cash === Math.floor(cash) ? String(Math.floor(cash)) : cash.toFixed(2)
                          );
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {needsQr && (
            <div className="space-y-3 pl-3 border-l-2 border-border">
              <div className="space-y-1.5">
                <Label htmlFor="direct-sale-qr">Select QR code {paymentMode === 'ONLINE' ? '*' : '(for online part)'}</Label>
                <Select value={selectedQrId} onValueChange={setSelectedQrId}>
                  <SelectTrigger id="direct-sale-qr" className="mt-1">
                    <SelectValue placeholder={loadingQr ? 'Loading QR codes...' : 'Select QR code'} />
                  </SelectTrigger>
                  <SelectContent className="!z-[100]">
                    {qrOptions.length === 0 ? (
                      <SelectItem value="no-qr" disabled>
                        {loadingQr ? 'Loading...' : 'No QR codes available'}
                      </SelectItem>
                    ) : (
                      qrOptions.map((qr) => (
                        <SelectItem key={qr.id} value={qr.id}>
                          {qr.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {hasItems && partsCost > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 dark:bg-gray-800/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Cost ({selectedItems.length} item{selectedItems.length > 1 ? 's' : ''})
                </span>
                <span className="font-medium text-orange-600">₹ {formatCurrency(partsCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit (sale − cost)</span>
                <span className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹ {formatCurrency(profit)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Record sale'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DirectSaleDialog;
