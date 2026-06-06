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
import { Loader2, ShoppingBag, Search, Check, X } from 'lucide-react';
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

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [quantity, setQuantity] = useState('1');
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

  // Debounce inventory search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inventorySearch), 250);
    return () => clearTimeout(t);
  }, [inventorySearch]);

  const resetForm = () => {
    setAmount('');
    setItem('');
    setSaleDate(todayInputValue());
    setSelectedInventoryId('');
    setQuantity('1');
    setInventorySearch('');
    setDebouncedSearch('');
  };

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next) resetForm();
    onOpenChange(next);
  };

  const selectedItem = inventory.find((i) => i.id === selectedInventoryId) || null;

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

  const qtyNum = Math.max(0, Math.floor(Number(quantity) || 0));
  const amountNum = parseFloat(amount);
  const partsCost = selectedItem ? selectedItem.price * qtyNum : 0;
  const profit = (isNaN(amountNum) ? 0 : amountNum) - partsCost;

  const handleSubmit = async () => {
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Enter a valid sale amount.');
      return;
    }
    if (!saleDate) {
      toast.error('Select the sale date.');
      return;
    }
    if (selectedItem) {
      if (qtyNum < 1) {
        toast.error('Enter a valid quantity.');
        return;
      }
      if (qtyNum > selectedItem.quantity) {
        toast.error(`Only ${selectedItem.quantity} in stock for ${selectedItem.product_name}.`);
        return;
      }
    }

    // Parse YYYY-MM-DD as a local date (avoid timezone shifting the day).
    const [y, m, d] = saleDate.split('-').map(Number);
    const parsedDate = new Date(y, (m || 1) - 1, d || 1);

    const resolvedItem = selectedItem ? selectedItem.product_name : item.trim();

    setIsSaving(true);
    try {
      const { data, error } = await db.jobs.createDirectSale({
        amount: amountNum,
        item: resolvedItem,
        saleDate: parsedDate,
        inventoryId: selectedItem ? selectedItem.id : null,
        quantity: selectedItem ? qtyNum : 0,
        partsCost,
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
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Record Direct Sale
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            For office/counter sales with no customer or technician. Counts toward revenue for the
            selected date.
          </DialogDescription>
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

            {selectedItem ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 p-2.5">
                <Check className="w-4 h-4 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate text-sm font-medium">
                    {selectedItem.product_name}
                    {selectedItem.code ? ` (${selectedItem.code})` : ''}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {selectedItem.quantity} in stock · ₹{formatCurrency(selectedItem.price)} each
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  onClick={() => {
                    setSelectedInventoryId('');
                    setQuantity('1');
                    setInventorySearch('');
                  }}
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
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
                    <div className="py-6 px-4 text-center text-sm text-gray-500">Loading items...</div>
                  ) : filteredInventory.length === 0 ? (
                    <div className="py-6 px-4 text-center text-sm text-gray-500">
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
                        return (
                          <button
                            key={inv.id}
                            type="button"
                            disabled={outOfStock}
                            onClick={() => {
                              setSelectedInventoryId(inv.id);
                              setQuantity('1');
                            }}
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
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick an item to deduct stock and track cost for profit, or skip it for other sales.
                </p>
              </>
            )}
          </div>

          {selectedItem ? (
            <div className="space-y-1.5">
              <Label htmlFor="direct-sale-qty">Quantity *</Label>
              <Input
                id="direct-sale-qty"
                type="number"
                inputMode="numeric"
                min="1"
                max={selectedItem.quantity}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          ) : (
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

          {selectedItem && qtyNum > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Cost ({qtyNum} × ₹{formatCurrency(selectedItem.price)})
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
