import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Package, Plus, Search, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { getOfficeJobParts, OfficeJobPart } from '@/lib/adminUtils';
import { Job } from '@/types';

interface InventoryItem {
  id: string;
  product_name: string;
  code?: string | null;
  price: number;
  quantity: number;
}

interface OfficeJobPartsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  /** Reports the new parts cost total after each change so the caller can update profit display. */
  onPartsChanged?: (partsCostTotal: number) => void;
}

const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

const OfficeJobPartsDialog: React.FC<OfficeJobPartsDialogProps> = ({
  open,
  onOpenChange,
  job,
  onPartsChanged,
}) => {
  const [parts, setParts] = useState<OfficeJobPart[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (!open || !job) return;
    let cancelled = false;
    setLoading(true);
    db.inventory
      .getAll()
      .then(({ data, error }) => {
        if (cancelled) return;
        const inv = error ? [] : ((data as InventoryItem[]) || []);
        setInventory(inv);
        // Enrich existing parts (esp. legacy ones) with current name/code from inventory.
        const existing = getOfficeJobParts(job).map((p) => {
          const match = inv.find((i) => i.id === p.inventory_id);
          return {
            ...p,
            product_name: p.product_name || match?.product_name || 'Unknown item',
            code: p.code ?? match?.code ?? null,
            unit_price: p.unit_price || (match ? Number(match.price) || 0 : 0),
          };
        });
        setParts(existing);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, job?.id]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const partsCostTotal = useMemo(
    () => parts.reduce((s, p) => s + p.quantity * p.unit_price, 0),
    [parts]
  );

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

  const persist = async (nextParts: OfficeJobPart[]) => {
    if (!job?.id) return;
    const { error } = await db.jobs.setOfficeJobParts(job.id, nextParts);
    if (error) {
      throw new Error(error.message || 'Failed to save parts');
    }
    const total = nextParts.reduce((s, p) => s + p.quantity * p.unit_price, 0);
    onPartsChanged?.(total);
  };

  const handleAddPart = async (inv: InventoryItem) => {
    if (!job?.id || saving) return;
    if (inv.quantity <= 0) {
      toast.error('Out of stock in main inventory.');
      return;
    }
    setSaving(true);
    try {
      const { error: decErr } = await db.inventory.decrementForJob(inv.id, 1);
      if (decErr) {
        throw new Error(decErr.message || 'Could not deduct main inventory');
      }
      const existing = parts.find((p) => p.inventory_id === inv.id);
      const next = existing
        ? parts.map((p) =>
            p.inventory_id === inv.id ? { ...p, quantity: p.quantity + 1 } : p
          )
        : [
            ...parts,
            {
              inventory_id: inv.id,
              product_name: inv.product_name,
              code: inv.code ?? null,
              quantity: 1,
              unit_price: Number(inv.price) || 0,
            },
          ];
      await persist(next);
      setParts(next);
      // Reflect stock change locally so repeated adds respect remaining stock.
      setInventory((prev) =>
        prev.map((i) => (i.id === inv.id ? { ...i, quantity: i.quantity - 1 } : i))
      );
      toast.success('Part added. Main inventory updated.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add part');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOne = async (part: OfficeJobPart) => {
    if (!job?.id || saving) return;
    setSaving(true);
    try {
      const { error: incErr } = await db.inventory.incrementForJob(part.inventory_id, 1);
      if (incErr) {
        throw new Error(incErr.message || 'Could not restore main inventory');
      }
      const next =
        part.quantity > 1
          ? parts.map((p) =>
              p.inventory_id === part.inventory_id ? { ...p, quantity: p.quantity - 1 } : p
            )
          : parts.filter((p) => p.inventory_id !== part.inventory_id);
      await persist(next);
      setParts(next);
      setInventory((prev) =>
        prev.map((i) =>
          i.id === part.inventory_id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
      toast.success('Removed 1 qty. Stock returned to main inventory.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove part');
    } finally {
      setSaving(false);
    }
  };

  if (!job) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Spare Parts (Office Sale)
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Add or remove parts for this office/walk-in job. Each change updates main
              inventory and the job&apos;s parts cost, so profit and analytics stay accurate.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Parts cost: </span>
                <span className="font-semibold text-orange-600">₹ {formatCurrency(partsCostTotal)}</span>
              </div>
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={saving}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Part
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : parts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No parts added yet.</p>
                <p className="text-sm mt-1">Click &quot;Add Part&quot; to track spare parts for this sale.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {parts.map((part) => (
                  <div
                    key={part.inventory_id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate text-sm font-medium">
                        {part.product_name || 'Unknown item'}
                        {part.code ? ` (${part.code})` : ''}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Qty {part.quantity} × ₹{formatCurrency(part.unit_price)} = ₹
                        {formatCurrency(part.quantity * part.unit_price)}
                      </span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0" disabled={saving}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {part.quantity > 1 ? 'Remove 1 quantity?' : 'Remove part?'}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {part.quantity > 1
                              ? `Reduce ${part.product_name || 'this part'} from ${part.quantity} to ${part.quantity - 1}. One unit returns to main inventory.`
                              : 'Remove this part? The quantity returns to main inventory.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRemoveOne(part)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {part.quantity > 1 ? 'Remove 1' : 'Remove'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Part - search main inventory, click + to add 1 qty */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false);
            setSearch('');
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base sm:text-lg">Add Part</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Search and click + to add 1 qty from main inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col min-h-0 flex-1">
            <div className="relative shrink-0 mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search parts by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>
            <div className="rounded-lg border flex-1 min-h-0 overflow-hidden">
              {loading ? (
                <div className="py-8 px-4 text-center text-sm text-gray-500">Loading...</div>
              ) : filteredInventory.length === 0 ? (
                <div className="py-8 px-4 text-center text-sm text-gray-500">
                  {inventory.length === 0
                    ? 'No inventory items.'
                    : debouncedSearch.trim()
                    ? 'No parts match your search.'
                    : 'No items.'}
                </div>
              ) : (
                <div className="max-h-[min(50vh,300px)] overflow-y-auto">
                  {filteredInventory.map((inv) => {
                    const outOfStock = inv.quantity <= 0;
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center gap-2 border-b px-3 py-2.5 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-sm font-medium">
                            {inv.product_name}
                            {inv.code ? ` (${inv.code})` : ''}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {outOfStock ? 'Out of stock' : `${inv.quantity} in stock`} · ₹
                            {formatCurrency(Number(inv.price) || 0)}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 min-w-[2rem] shrink-0"
                          onClick={() => handleAddPart(inv)}
                          disabled={outOfStock || saving}
                          title="Add 1 qty"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="shrink-0 pt-3 border-t mt-3">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setAddOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OfficeJobPartsDialog;
