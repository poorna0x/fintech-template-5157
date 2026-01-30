import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { inventoryCache } from '@/lib/inventoryCache';

interface InventoryItem {
  id: string;
  product_name: string;
  code: string | null;
  price: number;
  quantity: number;
}

interface TechnicianInventoryItem {
  id: string;
  technician_id: string;
  inventory_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  inventory?: InventoryItem;
}

export interface TechnicianTopUpDialogProps {
  technicianId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type TopUpItem = {
  inventory_id: string;
  quantity_used: number;
  quantity_needed: number;
  last_used_at: string;
  inventory?: { id: string; product_name: string; code: string | null };
};

const TechnicianTopUpDialog: React.FC<TechnicianTopUpDialogProps> = ({
  technicianId,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [topUpItems, setTopUpItems] = useState<TopUpItem[]>([]);
  const [currentTopUpIndex, setCurrentTopUpIndex] = useState(0);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [editableTopUpQty, setEditableTopUpQty] = useState<string>('');
  const [isTopUpQtyEditing, setIsTopUpQtyEditing] = useState(false);
  const [topUpLastWorkingDayLabel, setTopUpLastWorkingDayLabel] = useState<string>('');
  const [mainInventory, setMainInventory] = useState<InventoryItem[]>([]);
  const [myInventory, setMyInventory] = useState<TechnicianInventoryItem[]>([]);
  const topUpQtyInputRef = useRef<HTMLInputElement>(null);

  const loadMainAndTechInventory = async () => {
    const [mainRes, techRes] = await Promise.all([
      db.inventory.getAll(),
      db.technicianInventory.getByTechnician(technicianId),
    ]);
    if (mainRes.data) setMainInventory(mainRes.data);
    if (techRes.data) setMyInventory(techRes.data);
  };

  useEffect(() => {
    if (!open || !technicianId) return;
    let cancelled = false;
    const run = async () => {
      setTopUpLoading(true);
      inventoryCache.clear(`tech_inventory_${technicianId}`);
      inventoryCache.clear('main_inventory');
      try {
        await loadMainAndTechInventory();
        const [jobsResult, partsResult] = await Promise.all([
          db.jobs.getByTechnicianId(technicianId),
          db.jobPartsUsed.getByTechnician(technicianId),
        ]);
        const jobs = jobsResult.data || [];
        const allPartsUsed = (partsResult.data || []) as any[];
        if (jobsResult.error) throw jobsResult.error;
        if (partsResult.error) throw partsResult.error;

        const completedJobs = (jobs as any[]).filter((j: any) => j.status === 'COMPLETED');
        let lastWorkingDayKey: string | null = null;
        completedJobs.forEach((job: any) => {
          const dateStr = job.completed_at || job.end_time;
          if (!dateStr) return;
          const key = toDateKey(new Date(dateStr));
          if (lastWorkingDayKey == null || key > lastWorkingDayKey) lastWorkingDayKey = key;
        });
        if (!lastWorkingDayKey) {
          toast.info('No completed jobs found.');
          onOpenChange(false);
          return;
        }

        const getJob = (p: any) => (Array.isArray(p.job) ? p.job[0] : p.job);
        const getPartJobDayKey = (part: any): string | null => {
          const job = getJob(part);
          if (!job || (!job.completed_at && !job.end_time)) return null;
          return toDateKey(new Date(job.completed_at || job.end_time));
        };
        const getPartDate = (part: any): string => {
          const job = getJob(part);
          if (job && (job.completed_at || job.end_time)) return job.completed_at || job.end_time;
          return part.created_at || '';
        };

        const partsOnLastDay = allPartsUsed.filter((part: any) => getPartJobDayKey(part) === lastWorkingDayKey);
        const byJobAndInv = new Map<string, { quantity_used: number; last_used_at: string; part: any }>();
        partsOnLastDay.forEach((part: any) => {
          const key = `${part.job_id}_${part.inventory_id}`;
          if (byJobAndInv.has(key)) {
            const existing = byJobAndInv.get(key)!;
            const partDate = getPartDate(part);
            if (partDate && new Date(partDate) > new Date(existing.last_used_at)) existing.last_used_at = partDate;
            return;
          }
          byJobAndInv.set(key, {
            quantity_used: Number(part.quantity_used) || 0,
            last_used_at: getPartDate(part) || part.created_at || '',
            part,
          });
        });

        const groupedItems = new Map<string, { inventory_id: string; quantity_used: number; last_used_at: string; inventory?: any }>();
        byJobAndInv.forEach(({ quantity_used, last_used_at, part }) => {
          const key = part.inventory_id;
          if (groupedItems.has(key)) {
            const existing = groupedItems.get(key)!;
            existing.quantity_used += quantity_used;
            if (new Date(last_used_at) > new Date(existing.last_used_at)) existing.last_used_at = last_used_at;
          } else {
            groupedItems.set(key, { inventory_id: part.inventory_id, quantity_used, last_used_at, inventory: part.inventory });
          }
        });

        const itemsArray = Array.from(groupedItems.values())
          .map((item) => ({ ...item, quantity_needed: item.quantity_used }))
          .sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()) as TopUpItem[];

        if (cancelled) return;
        if (itemsArray.length === 0) {
          const lastDayLabel = lastWorkingDayKey
            ? new Date(lastWorkingDayKey + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'that day';
          toast.info(`No parts were used on last working day (${lastDayLabel}).`);
          onOpenChange(false);
          return;
        }

        const lastDayLabel = new Date(lastWorkingDayKey + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        setTopUpLastWorkingDayLabel(lastDayLabel);
        setTopUpItems(itemsArray);
        setCurrentTopUpIndex(0);
        setEditableTopUpQty(String(itemsArray[0].quantity_used));
        setIsTopUpQtyEditing(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading top up items:', err);
          toast.error(err?.message || 'Failed to load used items');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setTopUpLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [open, technicianId, onOpenChange]);

  useEffect(() => {
    if (open && topUpItems.length > 0 && currentTopUpIndex < topUpItems.length) {
      const item = topUpItems[currentTopUpIndex];
      if (item) setEditableTopUpQty(String(item.quantity_used));
      setIsTopUpQtyEditing(false);
    }
  }, [open, currentTopUpIndex, topUpItems]);

  useEffect(() => {
    if (isTopUpQtyEditing) {
      const t = setTimeout(() => topUpQtyInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isTopUpQtyEditing]);

  const handleConfirmTopUp = async () => {
    if (currentTopUpIndex >= topUpItems.length) return;
    const currentItem = topUpItems[currentTopUpIndex];
    if (!currentItem) return;
    const qty = Math.max(0, parseInt(editableTopUpQty, 10) || 0);

    try {
      setTopUpLoading(true);
      if (qty === 0) {
        toast.success('Skipped (0 qty)');
      } else {
        const mainItem = mainInventory.find((i) => i.id === currentItem.inventory_id);
        if (!mainItem) {
          toast.error('Product not found in main inventory');
          return;
        }
        if (mainItem.quantity < qty) {
          toast.error(`Insufficient stock in main inventory. Available: ${mainItem.quantity}, needed: ${qty}.`);
          return;
        }
        const existingItem = myInventory.find((item) => item.inventory_id === currentItem.inventory_id);
        if (existingItem) {
          const { error } = await db.technicianInventory.update(existingItem.id, { quantity: existingItem.quantity + qty });
          if (error) throw error;
        } else {
          const { error } = await db.technicianInventory.upsert({
            technician_id: technicianId,
            inventory_id: currentItem.inventory_id,
            quantity: qty,
          });
          if (error) throw error;
        }
        const { error: updateMainError } = await db.inventory.update(currentItem.inventory_id, {
          quantity: mainItem.quantity - qty,
        });
        if (updateMainError) throw updateMainError;
        toast.success(`Added ${qty} ${currentItem.inventory?.product_name || 'items'}`);
      }

      inventoryCache.clear(`tech_inventory_${technicianId}`);
      inventoryCache.clear('main_inventory');
      await loadMainAndTechInventory();
      onSuccess?.();

      const nextItems = topUpItems.filter((_, i) => i !== currentTopUpIndex);
      setTopUpItems(nextItems);
      if (nextItems.length === 0) {
        toast.success('Done!');
        onOpenChange(false);
        setCurrentTopUpIndex(0);
      } else {
        const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
        setCurrentTopUpIndex(nextIndex);
        setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
        setIsTopUpQtyEditing(false);
      }
    } catch (err: any) {
      console.error('Error topping up item:', err);
      toast.error(err?.message || 'Failed to top up item');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleSkipTopUp = () => {
    const nextItems = topUpItems.filter((_, i) => i !== currentTopUpIndex);
    setTopUpItems(nextItems);
    if (nextItems.length === 0) {
      onOpenChange(false);
      setCurrentTopUpIndex(0);
    } else {
      const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
      setCurrentTopUpIndex(nextIndex);
      setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
      setIsTopUpQtyEditing(false);
    }
  };

  const handleClose = () => {
    setTopUpItems([]);
    setCurrentTopUpIndex(0);
    setEditableTopUpQty('');
    setIsTopUpQtyEditing(false);
    setTopUpLastWorkingDayLabel('');
    onOpenChange(false);
  };

  const currentItem = topUpItems.length > 0 && currentTopUpIndex < topUpItems.length ? topUpItems[currentTopUpIndex] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[500px]" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            Top Up — Last working day: {topUpLastWorkingDayLabel || '—'}
          </DialogTitle>
        </DialogHeader>
        {topUpLoading && topUpItems.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : currentItem ? (
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-medium text-gray-600">Product</Label>
                  <p className="text-base font-semibold mt-1">{currentItem.inventory?.product_name || 'Unknown Product'}</p>
                  {currentItem.inventory?.code && (
                    <p className="text-sm text-gray-500">Code: {currentItem.inventory.code}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Quantity used</Label>
                  <p className="text-lg font-bold text-blue-600 mt-1">{currentItem.quantity_used}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Quantity to add</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {isTopUpQtyEditing ? (
                      <Input
                        ref={topUpQtyInputRef}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={editableTopUpQty}
                        onChange={(e) => setEditableTopUpQty(e.target.value)}
                        onBlur={() => setIsTopUpQtyEditing(false)}
                        className="max-w-[100px] text-lg font-semibold"
                      />
                    ) : (
                      <>
                        <span className="text-lg font-semibold min-w-[2ch]">{editableTopUpQty || currentItem.quantity_used}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            setEditableTopUpQty(String(currentItem.quantity_used));
                            setIsTopUpQtyEditing(true);
                          }}
                          aria-label="Edit quantity"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter className="flex flex-col sm:flex-col gap-2 w-full items-stretch">
          <div className="flex gap-2 w-full">
            <Button type="button" variant="outline" onClick={handleSkipTopUp} disabled={topUpLoading} className="flex-1">
              Skip
            </Button>
            <Button
              onClick={handleConfirmTopUp}
              disabled={topUpLoading || topUpItems.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {topUpLoading ? 'Adding...' : 'Add to Inventory'}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 w-full items-center">
            <p className="text-xs text-muted-foreground">
              {currentTopUpIndex + 1} of {topUpItems.length}
            </p>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={topUpLoading} className="w-full">
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianTopUpDialog;
