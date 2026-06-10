import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Package, Plus, Search, Trash2, Layers } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { inventoryCache } from '@/lib/inventoryCache';
import { hapticTap } from '@/lib/haptics';
import { Job, Technician } from '@/types';

interface InventoryItem {
  id: string;
  product_name: string;
  code: string | null;
  price?: number;
}

interface TechnicianInventoryItem {
  id: string;
  technician_id: string;
  inventory_id: string;
  quantity: number;
  inventory?: InventoryItem;
}

interface JobPartUsed {
  id: string;
  job_id: string;
  technician_id: string;
  inventory_id: string | null;
  custom_name?: string | null;
  source?: string | null;
  quantity_used: number;
  price_at_time_of_use?: number | null;
  created_at: string;
  inventory?: InventoryItem;
}

interface JobPartsUsedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technician: Technician | null;
}

const JobPartsUsedDialog: React.FC<JobPartsUsedDialogProps> = ({
  open,
  onOpenChange,
  job,
  technician
}) => {
  const [technicianInventory, setTechnicianInventory] = useState<TechnicianInventoryItem[]>([]);
  const [partsUsed, setPartsUsed] = useState<JobPartUsed[]>([]);
  const [addPartDialogOpen, setAddPartDialogOpen] = useState(false);
  const [addBundleDialogOpen, setAddBundleDialogOpen] = useState(false);
  const [bundles, setBundles] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoadedParts, setHasLoadedParts] = useState(false);
  const [applyingBundle, setApplyingBundle] = useState(false);
  const [addPartInventoryLoading, setAddPartInventoryLoading] = useState(false);

  // Custom (one-off) part entry — name + qty + price, not tracked in any stock.
  // Opened from a "+ Add custom item" row that appears while searching.
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customPrice, setCustomPrice] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);

  const resetCustomForm = () => {
    setCustomDialogOpen(false);
    setCustomName('');
    setCustomQty('1');
    setCustomPrice('');
  };

  const openCustomDialog = () => {
    setCustomName('');
    setCustomQty('1');
    setCustomPrice('');
    setCustomDialogOpen(true);
  };

  // The virtual "Custom Item" entry surfaces when the user searches for it (e.g. "custom").
  const customQueryMatches = (() => {
    const q = inventorySearchQuery.trim().toLowerCase();
    return q.length > 0 && 'custom item'.includes(q);
  })();

  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecalcJobIdRef = useRef<string | null>(null);
  /** Prevents overlapping quick-adds for the same inventory (double-tap / slow network). */
  const quickAddInFlightRef = useRef<Set<string>>(new Set());

  const RECALC_DEBOUNCE_MS = 180;

  const scheduleRecalcJobPartsCost = useCallback((jobId: string) => {
    pendingRecalcJobIdRef.current = jobId;
    if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current);
    recalcTimeoutRef.current = setTimeout(() => {
      db.jobPartsUsed.recalculateAndUpdateJobPartsCost(jobId).catch(() => {});
      pendingRecalcJobIdRef.current = null;
      recalcTimeoutRef.current = null;
    }, RECALC_DEBOUNCE_MS);
  }, []);

  const flushPendingRecalc = useCallback(() => {
    if (recalcTimeoutRef.current) {
      clearTimeout(recalcTimeoutRef.current);
      recalcTimeoutRef.current = null;
    }
    const jobId = pendingRecalcJobIdRef.current;
    if (jobId) {
      pendingRecalcJobIdRef.current = null;
      db.jobPartsUsed.recalculateAndUpdateJobPartsCost(jobId).catch(() => {});
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(inventorySearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [inventorySearchQuery]);

  // Load technician inventory (updates cache; used for initial load and background revalidate)
  const loadTechnicianInventory = useCallback(async () => {
    if (!technician?.id) return;

    try {
      const { data, error } = await db.technicianInventory.getByTechnician(technician.id);
      if (error) throw error;
      const inventoryData = data || [];
      setTechnicianInventory(inventoryData);
      inventoryCache.set(`tech_inventory_${technician.id}`, inventoryData);
    } catch (error) {
      console.error('Error loading technician inventory:', error);
      toast.error('Failed to load technician inventory');
    }
  }, [technician?.id]);

  // Load parts used for this job
  const loadPartsUsed = useCallback(async () => {
    if (!job?.id) return;

    try {
      const { data, error } = await db.jobPartsUsed.getByJob(job.id);
      if (error) throw error;
      setPartsUsed(data || []);
    } catch (error) {
      console.error('Error loading parts used:', error);
      toast.error('Failed to load parts used');
    }
  }, [job?.id]);

  const loadPartsUsedOnDemand = useCallback(async () => {
    if (!job?.id) return;
    setLoading(true);
    await loadPartsUsed().finally(() => setLoading(false));
    setHasLoadedParts(true);
  }, [job?.id, loadPartsUsed]);

  // Load parts only when this dialog opens (not during completed list load),
  // so egress stays low until user explicitly clicks Parts.
  useEffect(() => {
    if (open && job && technician) {
      setLoading(true);
      setHasLoadedParts(false);
      loadPartsUsedOnDemand();
    } else if (!open) {
      setTechnicianInventory([]);
      setPartsUsed([]);
      setHasLoadedParts(false);
      setMainInventoryItems([]);
      setMainInventoryLoaded(false);
      setInventorySearchQuery('');
      setDebouncedSearchQuery('');
      setAddBundleDialogOpen(false);
      setAddPartInventoryLoading(false);
      resetCustomForm();
    }
  }, [open, job?.id, technician?.id, loadPartsUsedOnDemand]);

  // Lazy-load technician inventory only when Add Part or Add Bundle dialog opens (reduces load when user only views parts)
  useEffect(() => {
    if (!(addPartDialogOpen || addBundleDialogOpen) || !technician?.id) return;

    const cacheKey = `tech_inventory_${technician.id}`;
    const cached = inventoryCache.get<TechnicianInventoryItem[]>(cacheKey);

    if (cached && cached.length >= 0) {
      setTechnicianInventory(cached);
      loadTechnicianInventory(); // revalidate in background
      return;
    }

    setAddPartInventoryLoading(true);
    loadTechnicianInventory().finally(() => setAddPartInventoryLoading(false));
  }, [addPartDialogOpen, addBundleDialogOpen, technician?.id, loadTechnicianInventory]);

  // Flush pending recalc when dialog closes so job parts_cost_total is up to date
  useEffect(() => {
    if (!open) flushPendingRecalc();
    return () => flushPendingRecalc();
  }, [open, flushPendingRecalc]);

  // Load bundles when Add Bundle dialog opens
  useEffect(() => {
    if (addBundleDialogOpen) {
      db.inventoryBundles.getAll().then(({ data, error }) => {
        if (!error && data) setBundles(data);
      });
    }
  }, [addBundleDialogOpen]);

  // Load main inventory items only when needed (lazy load for fallback)
  const [mainInventoryItems, setMainInventoryItems] = useState<InventoryItem[]>([]);
  const [mainInventoryLoaded, setMainInventoryLoaded] = useState(false);
  
  // Only load main inventory if technician inventory items are missing inventory relations
  useEffect(() => {
    if (open && technicianInventory.length > 0 && !mainInventoryLoaded) {
      // Check if any items are missing inventory relations
      const needsMainInventory = technicianInventory.some(item => !item.inventory);
      
      if (needsMainInventory) {
        const cacheKey = 'inventory_items';
        const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
        if (cached && cached.length > 0) {
          setMainInventoryItems(cached);
          setMainInventoryLoaded(true);
        } else {
          // Only fetch essential fields to reduce egress
          db.inventory.getAll().then(({ data, error }) => {
            if (!error && data) {
              setMainInventoryItems(data);
              inventoryCache.set(cacheKey, data);
            }
            setMainInventoryLoaded(true);
          });
        }
      }
    }
  }, [open, technicianInventory, mainInventoryLoaded]);

  // Memoize inventory lookup map for O(1) access
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    mainInventoryItems.forEach(item => map.set(item.id, item));
    return map;
  }, [mainInventoryItems]);

  // Filter technician inventory for search (optimized)
  const filteredInventoryItems = useMemo(() => {
    // Early return if no inventory
    if (technicianInventory.length === 0) return [];

    // Enrich items with inventory data if missing (using Map for O(1) lookup)
    const enrichedItems = technicianInventory.map(item => {
      if (item.inventory) {
        return item;
      }
      // Try to find inventory from map (faster than array.find)
      const inventoryItem = inventoryMap.get(item.inventory_id);
      if (inventoryItem) {
        return {
          ...item,
          inventory: inventoryItem
        };
      }
      return item;
    });

    // Filter by quantity first (cheaper operation)
    let filtered = enrichedItems.filter(item => item.quantity > 0);
    
    // Then filter by search query if provided
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const inventory = item.inventory || inventoryMap.get(item.inventory_id);
        if (!inventory) return false;
        const nameMatch = inventory.product_name?.toLowerCase().includes(query);
        const codeMatch = inventory.code?.toLowerCase().includes(query);
        return nameMatch || codeMatch;
      });
    }
    
    // Sort (only if needed)
    if (filtered.length > 1) {
      filtered.sort((a, b) => {
        const aInventory = a.inventory || inventoryMap.get(a.inventory_id);
        const bInventory = b.inventory || inventoryMap.get(b.inventory_id);
        const aName = aInventory?.product_name || '';
        const bName = bInventory?.product_name || '';
        return aName.localeCompare(bName);
      });
    }
    
    return filtered;
  }, [technicianInventory, debouncedSearchQuery, inventoryMap]);

  // Handle add part - opens dialog with search
  const handleAddPart = () => {
    setInventorySearchQuery('');
    setAddPartDialogOpen(true);
  };

  // Apply bundle: add all bundle items to job; deduct from the technician's bag only. Price at time of use stored per part. All-or-nothing if insufficient tech stock.
  const handleApplyBundle = async (bundleId: string) => {
    if (!job?.id || !technician?.id) return;
    setApplyingBundle(true);
    try {
      const { data: bundleData, error: bundleError } = await db.inventoryBundles.getByIdWithItems(bundleId);
      if (bundleError || !bundleData?.items?.length) {
        toast.error('Failed to load bundle or bundle is empty');
        setApplyingBundle(false);
        return;
      }
      const items = bundleData.items as { inventory_id: string; quantity: number; inventory?: { id: string; price?: number } }[];
      const short: string[] = [];
      for (const it of items) {
        const techItem = technicianInventory.find(i => i.inventory_id === it.inventory_id);
        const need = it.quantity;
        const have = techItem?.quantity ?? 0;
        if (have < need) {
          const name = techItem?.inventory?.product_name || it.inventory_id;
          short.push(`${name}: tech has ${have}, need ${need}`);
        }
      }
      if (short.length > 0) {
        toast.error(`Insufficient technician stock: ${short.join('; ')}`);
        setApplyingBundle(false);
        return;
      }
      const priceMap = new Map<string, number>();
      for (const it of items) {
        const inv = inventoryMap.get(it.inventory_id) as InventoryItem | undefined;
        if (inv?.price != null) priceMap.set(it.inventory_id, Number(inv.price));
        else {
          const { data: invData } = await db.inventory.getById(it.inventory_id);
          priceMap.set(it.inventory_id, invData?.price ? Number(invData.price) : 0);
        }
      }
      let workingParts: JobPartUsed[] = [...partsUsed];
      for (const it of items) {
        const techItem = technicianInventory.find(i => i.inventory_id === it.inventory_id)!;
        const existingPart = workingParts.find(p => p.inventory_id === it.inventory_id);
        const price = priceMap.get(it.inventory_id) ?? 0;
        if (existingPart) {
          const newQty = existingPart.quantity_used + it.quantity;
          await db.jobPartsUsed.update(existingPart.id, { quantity_used: newQty });
          const newTechQty = techItem.quantity - it.quantity;
          await db.technicianInventory.update(techItem.id, { quantity: newTechQty });
          workingParts = workingParts.map(p =>
            p.id === existingPart.id ? { ...p, quantity_used: newQty } : p
          );
          setPartsUsed(workingParts);
          setTechnicianInventory(prev => prev.map(i => i.id === techItem.id ? { ...i, quantity: newTechQty } : i));
        } else {
          const { data: newPart, error: createErr } = await db.jobPartsUsed.create({
            job_id: job.id,
            technician_id: technician.id,
            inventory_id: it.inventory_id,
            quantity_used: it.quantity,
            price_at_time_of_use: price
          });
          if (createErr) throw createErr;
          const newTechQty = techItem.quantity - it.quantity;
          await db.technicianInventory.update(techItem.id, { quantity: newTechQty });
          if (newPart) {
            workingParts = [newPart, ...workingParts];
            setPartsUsed(workingParts);
          }
          setTechnicianInventory(prev => prev.map(i => i.id === techItem.id ? { ...i, quantity: newTechQty } : i));
        }
      }
      setAddBundleDialogOpen(false);
      scheduleRecalcJobPartsCost(job.id);
      toast.success(`Bundle applied: ${items.length} part(s) added from technician stock.`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to apply bundle');
    } finally {
      setApplyingBundle(false);
    }
  };

  // Quick add part with qty 1 (called from + button) — price from cache when possible, optimistic update
  const handleQuickAddPart = async (inventoryId: string) => {
    if (!job?.id || !technician?.id) return;
    if (quickAddInFlightRef.current.has(inventoryId)) return;
    quickAddInFlightRef.current.add(inventoryId);

    const techItem = technicianInventory.find(i => i.inventory_id === inventoryId);
    if (!techItem || techItem.quantity < 1) {
      toast.error('Insufficient quantity');
      quickAddInFlightRef.current.delete(inventoryId);
      return;
    }

    try {
      // Single getById only when price isn't already cached.
      let currentPrice = 0;
      const cachedInv = inventoryMap.get(inventoryId) as InventoryItem | undefined;
      if (cachedInv?.price != null) {
        currentPrice = Number(cachedInv.price);
      } else {
        const { data: inventoryData, error: invError } = await db.inventory.getById(inventoryId);
        if (invError) throw invError;
        currentPrice = inventoryData?.price ? Number(inventoryData.price) : 0;
      }

      // Parts come from the technician's bag only. Main inventory is replenished
      // later via Top-up (or corrected via "hide from top-up" for direct-from-main parts).
      const existingPart = partsUsed.find(p => p.inventory_id === inventoryId);
      if (existingPart) {
        const newQuantity = existingPart.quantity_used + 1;
        const { data: updatedPart, error: updateError } = await db.jobPartsUsed.update(existingPart.id, {
          quantity_used: newQuantity
        });
        if (updateError) throw updateError;

        const newTechQuantity = techItem.quantity - 1;
        const { error: updateTechError } = await db.technicianInventory.update(techItem.id, {
          quantity: newTechQuantity
        });
        if (updateTechError) throw updateTechError;

        // Optimistic update: no refetch
        setPartsUsed(prev => prev.map(p => p.id === existingPart.id ? (updatedPart || p) : p));
        setTechnicianInventory(prev => prev.map(i => i.id === techItem.id ? { ...i, quantity: newTechQuantity } : i));
      } else {
        const { data: newPart, error: createError } = await db.jobPartsUsed.create({
          job_id: job.id,
          technician_id: technician.id,
          inventory_id: inventoryId,
          quantity_used: 1,
          price_at_time_of_use: currentPrice
        });
        if (createError) throw createError;

        const newTechQuantity = techItem.quantity - 1;
        const { error: updateTechError } = await db.technicianInventory.update(techItem.id, {
          quantity: newTechQuantity
        });
        if (updateTechError) throw updateTechError;

        // Optimistic update: no refetch
        if (newPart) setPartsUsed(prev => [newPart, ...prev]);
        setTechnicianInventory(prev => prev.map(i => i.id === techItem.id ? { ...i, quantity: newTechQuantity } : i));
      }

      scheduleRecalcJobPartsCost(job.id);
      toast.success('Part added (1 qty) from technician stock.');
    } catch (error: any) {
      console.error('Error quick adding part:', error);
      toast.error(error?.message || 'Failed to add part');
    } finally {
      quickAddInFlightRef.current.delete(inventoryId);
    }
  };

  // Add a custom one-off part (not in inventory). Stored with custom_name + price; no stock movement.
  const handleAddCustomPart = async () => {
    if (!job?.id || !technician?.id || addingCustom) return;
    const name = customName.trim();
    const qty = Math.max(1, Math.floor(Number(customQty) || 0));
    const price = Math.max(0, Number(customPrice) || 0);
    if (!name) {
      toast.error('Enter an item name.');
      return;
    }
    setAddingCustom(true);
    try {
      const { data: newPart, error } = await db.jobPartsUsed.create({
        job_id: job.id,
        technician_id: technician.id,
        inventory_id: null,
        custom_name: name,
        quantity_used: qty,
        price_at_time_of_use: price,
        source: 'custom',
      });
      if (error) throw error;
      if (newPart) setPartsUsed(prev => [newPart as unknown as JobPartUsed, ...prev]);
      resetCustomForm();
      setInventorySearchQuery('');
      scheduleRecalcJobPartsCost(job.id);
      toast.success('Custom part added.');
    } catch (error: any) {
      console.error('Error adding custom part:', error);
      toast.error(error?.message || 'Failed to add custom part');
    } finally {
      setAddingCustom(false);
    }
  };

  // Remove part from job: if qty > 1, reduce by 1 only; if qty is 1, remove the row entirely.
  // Stock returns to the technician's bag only (single-source); main is untouched here.
  // Custom parts (no inventory_id) carry no stock, so nothing is restored on removal.
  const handleDeletePart = async (partId: string, inventoryId: string | null, quantityUsed: number) => {
    if (!technician?.id) return;

    const isCustom = !inventoryId;

    const restoreTech = async (delta: number) => {
      if (!inventoryId) return; // custom parts have no stock to restore
      // The parts list view doesn't preload technician inventory, so resolve the row
      // from memory first, then from the DB. Always INCREMENT an existing row — never
      // insert (a row may already exist and would violate the unique constraint).
      let row = technicianInventory.find(i => i.inventory_id === inventoryId);
      if (!row) {
        const { data } = await db.technicianInventory.getByTechnician(technician.id);
        row = (data || []).find((t: any) => t.inventory_id === inventoryId) as TechnicianInventoryItem | undefined;
      }
      if (row) {
        const next = row.quantity + delta;
        const { error } = await db.technicianInventory.update(row.id, { quantity: next });
        if (error) throw error;
        const rowId = row.id;
        setTechnicianInventory(prev =>
          prev.some(i => i.id === rowId)
            ? prev.map(i => (i.id === rowId ? { ...i, quantity: next } : i))
            : [...prev, { ...(row as TechnicianInventoryItem), quantity: next }]
        );
      } else {
        // Technician genuinely has no row for this item yet — create one.
        const { data, error } = await db.technicianInventory.create({
          technician_id: technician.id,
          inventory_id: inventoryId,
          quantity: delta,
        });
        if (error) throw error;
        if (data) setTechnicianInventory(prev => [...prev, data as TechnicianInventoryItem]);
      }
    };

    try {
      if (quantityUsed > 1) {
        const newQuantityUsed = quantityUsed - 1;
        const { data: updatedPart, error: updateError } = await db.jobPartsUsed.update(partId, {
          quantity_used: newQuantityUsed,
        });
        if (updateError) throw updateError;

        await restoreTech(1);

        setPartsUsed(prev =>
          prev.map(p => (p.id === partId ? (updatedPart || { ...p, quantity_used: newQuantityUsed }) : p))
        );
        if (job?.id) scheduleRecalcJobPartsCost(job.id);
        toast.success(isCustom ? 'Removed 1 qty from job.' : 'Removed 1 qty from job; returned to technician stock.');
      } else {
        const { error: deleteError } = await db.jobPartsUsed.delete(partId);
        if (deleteError) throw deleteError;

        await restoreTech(quantityUsed);

        setPartsUsed(prev => prev.filter(p => p.id !== partId));
        if (job?.id) scheduleRecalcJobPartsCost(job.id);
        toast.success(isCustom ? 'Custom part removed.' : 'Part removed; returned to technician stock.');
      }
    } catch (error: any) {
      console.error('Error deleting part:', error);
      toast.error(error?.message || 'Failed to remove part');
    }
  };

  if (!job || !technician) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6 sm:max-h-[85vh] [&>button]:shrink-0 [&>button]:z-10 [&>button]:!top-[max(1rem,env(safe-area-inset-top,0px))]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Parts Used for Job
            </DialogTitle>
<DialogDescription>
            Manage parts used for this job. Each part is deducted from the technician&apos;s inventory. Price at time of use is stored per part. Main inventory is replenished via Top-up.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 -mx-1 px-1">
            {/* Add Part / Add Bundle */}
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleAddPart}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Part
              </Button>
              <Button
                onClick={() => setAddBundleDialogOpen(true)}
                size="sm"
                variant="outline"
              >
                <Layers className="w-4 h-4 mr-2" />
                Add Bundle
              </Button>
            </div>

            {/* Parts List */}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : !hasLoadedParts ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 text-muted-foreground/70" />
                <p>Unable to load parts used.</p>
              </div>
            ) : partsUsed.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 text-muted-foreground/70" />
                <p>No parts added yet.</p>
                <p className="text-sm mt-2">Click "Add Part" to add parts used for this job.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table className="min-w-[280px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead className="text-right">Quantity Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partsUsed.map(part => (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">
                          {part.inventory
                            ? `${part.inventory.product_name}${part.inventory.code ? ` (${part.inventory.code})` : ''}`
                            : part.custom_name || 'Unknown'}
                          {!part.inventory_id && (
                            <span className="ml-2 align-middle rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Custom
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {part.quantity_used}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {part.quantity_used > 1 ? 'Remove 1 quantity?' : 'Remove part?'}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {!part.inventory_id
                                    ? part.quantity_used > 1
                                      ? `This will reduce quantity used from ${part.quantity_used} to ${part.quantity_used - 1}.`
                                      : 'Remove this custom item from the job?'
                                    : part.quantity_used > 1
                                    ? `This will reduce quantity used from ${part.quantity_used} to ${part.quantity_used - 1}. One unit returns to the technician's stock.`
                                    : "Remove this part from the job? The quantity will return to the technician's stock."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeletePart(part.id, part.inventory_id, part.quantity_used)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {part.quantity_used > 1 ? 'Remove 1' : 'Remove'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Part Dialog - search and click + to add 1 qty directly */}
      <Dialog open={addPartDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddPartDialogOpen(false);
          setInventorySearchQuery('');
        }
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-hidden [&>div]:min-w-0 flex flex-col [&>button]:shrink-0 [&>button]:z-10 [&>button]:!top-[max(1rem,env(safe-area-inset-top,0px))]">
          <div className="flex flex-col min-h-0 min-w-0 gap-4 flex-1 max-w-full">
          <DialogHeader className="space-y-1.5 shrink-0">
            <DialogTitle className="text-base sm:text-lg">Add Part Used</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Search and click + to add 1 qty from {technician.fullName || technician.full_name}'s inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col min-h-0 min-w-0 flex-1 py-0 overflow-hidden">
            <div className="relative shrink-0 mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search parts by name or code..."
                value={inventorySearchQuery}
                onChange={(e) => setInventorySearchQuery(e.target.value)}
                className="pl-9 h-10 sm:h-11 text-sm"
              />
            </div>
            <div className="rounded-lg border flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden w-full">
              {addPartInventoryLoading ? (
                <div className="py-8 px-4 text-center text-sm text-muted-foreground">
                  Loading parts...
                </div>
              ) : filteredInventoryItems.length === 0 ? (
                <div className="overflow-y-auto overflow-x-hidden max-h-[min(50vh,280px)] sm:max-h-[320px] w-full min-w-0">
                  {customQueryMatches && (
                    <div className="group flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b last:border-b-0 bg-background hover:bg-muted/50 w-full max-w-full overflow-hidden">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <span className="text-sm font-medium truncate block">
                          Custom Item
                        </span>
                        <span className="text-xs text-muted-foreground truncate block">
                          Not in inventory · tap + to enter details
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 min-w-[2rem] shrink-0 bg-card text-foreground transition-colors hover:!bg-gray-800 hover:!text-white hover:!border-gray-800"
                        onClick={() => { hapticTap(); openCustomDialog(); }}
                        title="Add custom item"
                      >
                        <Plus className="w-4 h-4 text-current" />
                      </Button>
                    </div>
                  )}
                  <div className="py-8 px-4 text-center text-sm text-muted-foreground">
                    {technicianInventory.length === 0
                      ? 'No parts in technician inventory.'
                      : debouncedSearchQuery.trim()
                      ? 'No parts match your search.'
                      : 'No parts with available quantity.'}
                  </div>
                </div>
              ) : (
                <div className="overflow-y-auto overflow-x-hidden max-h-[min(50vh,280px)] sm:max-h-[320px] w-full min-w-0 pl-0 pr-0 [scrollbar-gutter:stable] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {customQueryMatches && (
                    <div className="group flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b last:border-b-0 bg-background hover:bg-muted/50 w-full max-w-full overflow-hidden">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <span className="text-sm font-medium truncate block">
                          Custom Item
                        </span>
                        <span className="text-xs text-muted-foreground truncate block">
                          Not in inventory · tap + to enter details
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 min-w-[2rem] shrink-0 bg-card text-foreground transition-colors hover:!bg-gray-800 hover:!text-white hover:!border-gray-800"
                        onClick={() => { hapticTap(); openCustomDialog(); }}
                        title="Add custom item"
                      >
                        <Plus className="w-4 h-4 text-current" />
                      </Button>
                    </div>
                  )}
                  {filteredInventoryItems.map((item) => {
                    const productName = item.inventory?.product_name || inventoryMap.get(item.inventory_id)?.product_name || 'Unknown';
                    const code = item.inventory?.code || inventoryMap.get(item.inventory_id)?.code || '';
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b last:border-b-0 bg-background hover:bg-muted/50 w-full max-w-full overflow-hidden"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="text-sm font-medium truncate block">
                            {productName}
                          </span>
                          {code && (
                            <span className="text-xs text-muted-foreground truncate block">
                              Code: {code}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 min-w-[2rem] shrink-0 bg-card text-foreground transition-colors hover:!bg-gray-800 hover:!text-white hover:!border-gray-800"
                          onClick={() => {
                            hapticTap();
                            handleQuickAddPart(item.inventory_id);
                          }}
                          disabled={item.quantity < 1}
                          title="Add 1 qty"
                        >
                          <Plus className="w-4 h-4 text-current" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 pt-3 border-t mt-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setAddPartDialogOpen(false)}
            >
              Done
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Item Dialog - enter name, qty, price for a part not in inventory */}
      <Dialog open={customDialogOpen} onOpenChange={(o) => { if (!o) resetCustomForm(); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm p-4 sm:p-6">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-base sm:text-lg">Add custom item</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Enter a part not in inventory. It&apos;s added to this job only and isn&apos;t tracked in stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Item name</label>
              <Input
                placeholder="e.g. Custom filter housing"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-10 text-sm"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Qty</label>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Unit price (₹)</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0"
                  className="h-10 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={resetCustomForm} disabled={addingCustom}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAddCustomPart}
              disabled={addingCustom || !customName.trim()}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {addingCustom ? 'Adding...' : 'Add item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Bundle Dialog */}
      <Dialog open={addBundleDialogOpen} onOpenChange={setAddBundleDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Add Bundle
            </DialogTitle>
            <DialogDescription>
              Select a bundle to add all its parts to this job. Parts are deducted from {technician?.fullName || technician?.full_name}'s inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {addPartInventoryLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading technician inventory...</p>
            ) : bundles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No bundles defined. Create bundles in Inventory → Bundles.</p>
            ) : (
              <ul className="space-y-2">
                {bundles.map((b) => (
                  <li key={b.id}>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleApplyBundle(b.id)}
                      disabled={applyingBundle}
                    >
                      <Package className="w-4 h-4 mr-2" />
                      {b.name}
                      {applyingBundle ? ' ...' : ''}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobPartsUsedDialog;
