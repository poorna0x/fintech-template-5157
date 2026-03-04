import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Package, Plus, Search, Trash2, Layers } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { inventoryCache } from '@/lib/inventoryCache';
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
  inventory_id: string;
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
  const [applyingBundle, setApplyingBundle] = useState(false);

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

  // Load data when dialog opens (use cache for tech inventory when valid to avoid extra query)
  useEffect(() => {
    if (open && job && technician) {
      setLoading(true);
      const cacheKey = `tech_inventory_${technician.id}`;
      const cached = inventoryCache.get<TechnicianInventoryItem[]>(cacheKey);
      if (cached && cached.length >= 0) {
        setTechnicianInventory(cached);
        loadPartsUsed().finally(() => setLoading(false));
        // Revalidate in background so cache stays fresh
        loadTechnicianInventory();
      } else {
        Promise.all([
          loadTechnicianInventory(),
          loadPartsUsed()
        ]).finally(() => setLoading(false));
      }
    } else if (!open) {
      setTechnicianInventory([]);
      setPartsUsed([]);
      setMainInventoryItems([]);
      setMainInventoryLoaded(false);
      setInventorySearchQuery('');
      setDebouncedSearchQuery('');
      setAddBundleDialogOpen(false);
    }
  }, [open, job?.id, technician?.id, loadTechnicianInventory, loadPartsUsed]);

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

  // Deduct from main inventory (warehouse). Returns error message if insufficient.
  const deductMainInventory = async (inventoryId: string, quantity: number): Promise<string | null> => {
    const { data: mainItem, error: fetchErr } = await db.inventory.getById(inventoryId);
    if (fetchErr || !mainItem) return 'Could not load main inventory';
    const current = Number((mainItem as any).quantity ?? 0);
    if (current < quantity) return `Main inventory has ${current}, need ${quantity}`;
    const { error: updateErr } = await db.inventory.update(inventoryId, { quantity: current - quantity });
    return updateErr ? updateErr.message : null;
  };

  // Handle add part - opens dialog with search
  const handleAddPart = () => {
    setInventorySearchQuery('');
    setAddPartDialogOpen(true);
  };

  // Apply bundle: add all bundle items to job; deduct from technician AND main inventory. Price at time of use stored per part. All-or-nothing if insufficient stock.
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
      // Check main inventory has enough for all items
      for (const it of items) {
        const { data: mainItem } = await db.inventory.getById(it.inventory_id);
        const mainQty = mainItem ? Number((mainItem as any).quantity ?? 0) : 0;
        if (mainQty < it.quantity) {
          const name = inventoryMap.get(it.inventory_id)?.product_name || it.inventory_id;
          short.push(`${name}: main has ${mainQty}, need ${it.quantity}`);
        }
      }
      if (short.length > 0) {
        toast.error(`Insufficient main inventory: ${short.join('; ')}`);
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
      for (const it of items) {
        const techItem = technicianInventory.find(i => i.inventory_id === it.inventory_id)!;
        const existingPart = partsUsed.find(p => p.inventory_id === it.inventory_id);
        const price = priceMap.get(it.inventory_id) ?? 0;
        const err = await deductMainInventory(it.inventory_id, it.quantity);
        if (err) {
          toast.error(`Main inventory: ${err}`);
          setApplyingBundle(false);
          return;
        }
        if (existingPart) {
          const newQty = existingPart.quantity_used + it.quantity;
          await db.jobPartsUsed.update(existingPart.id, { quantity_used: newQty });
          const newTechQty = techItem.quantity - it.quantity;
          await db.technicianInventory.update(techItem.id, { quantity: newTechQty });
          setPartsUsed(prev => prev.map(p => p.id === existingPart.id ? { ...p, quantity_used: newQty } : p));
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
          if (newPart) setPartsUsed(prev => [newPart, ...prev]);
          setTechnicianInventory(prev => prev.map(i => i.id === techItem.id ? { ...i, quantity: newTechQty } : i));
        }
      }
      setAddBundleDialogOpen(false);
      await db.jobPartsUsed.recalculateAndUpdateJobPartsCost(job.id);
      toast.success(`Bundle applied: ${items.length} part(s) added. Technician and main inventory updated.`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to apply bundle');
    } finally {
      setApplyingBundle(false);
    }
  };

  // Quick add part with qty 1 (called from + button) — price from cache when possible, optimistic update
  const handleQuickAddPart = async (inventoryId: string) => {
    if (!job?.id || !technician?.id) return;

    const techItem = technicianInventory.find(i => i.inventory_id === inventoryId);
    if (!techItem || techItem.quantity < 1) {
      toast.error('Insufficient quantity');
      return;
    }

    // Price from cache/map when available to avoid getById per click
    let currentPrice = 0;
    const cachedInv = inventoryMap.get(inventoryId) as InventoryItem | undefined;
    if (cachedInv?.price != null) {
      currentPrice = Number(cachedInv.price);
    } else {
      const { data: inventoryData, error: invError } = await db.inventory.getById(inventoryId);
      if (invError) throw invError;
      currentPrice = inventoryData?.price ? Number(inventoryData.price) : 0;
    }

    const existingPart = partsUsed.find(p => p.inventory_id === inventoryId);

    try {
      // Deduct from main inventory (warehouse) as well
      const mainErr = await deductMainInventory(inventoryId, 1);
      if (mainErr) {
        toast.error(`Main inventory: ${mainErr}`);
        return;
      }
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

      await db.jobPartsUsed.recalculateAndUpdateJobPartsCost(job.id);
      toast.success('Part added (1 qty). Technician and main inventory updated.');
    } catch (error: any) {
      console.error('Error quick adding part:', error);
      toast.error(error?.message || 'Failed to add part');
    }
  };

  // Handle delete part — optimistic update, no refetch
  const handleDeletePart = async (partId: string, inventoryId: string, quantityUsed: number) => {
    if (!technician?.id) return;

    const techItem = technicianInventory.find(i => i.inventory_id === inventoryId);

    try {
      const { error: deleteError } = await db.jobPartsUsed.delete(partId);
      if (deleteError) throw deleteError;

      if (techItem) {
        const newQuantity = techItem.quantity + quantityUsed;
        const { error: updateError } = await db.technicianInventory.update(techItem.id, {
          quantity: newQuantity
        });
        if (updateError) throw updateError;
      }

      setPartsUsed(prev => prev.filter(p => p.id !== partId));
      if (techItem) {
        setTechnicianInventory(prev => prev.map(i => i.id === techItem.id ? { ...i, quantity: techItem.quantity + quantityUsed } : i));
      }
      if (job?.id) await db.jobPartsUsed.recalculateAndUpdateJobPartsCost(job.id);
      toast.success('Part removed and added back to technician inventory');
    } catch (error: any) {
      console.error('Error deleting part:', error);
      toast.error(error?.message || 'Failed to delete part');
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
            Manage parts used for this job. Each part (or bundle) is deducted from the technician&apos;s inventory and from main inventory. Price at time of use is stored per part. Top-up still works per item as before.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 -mx-1 px-1">
            {/* Add Part / Add Bundle */}
            <div className="flex justify-end gap-2">
              <Button onClick={handleAddPart} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Part
              </Button>
              <Button onClick={() => setAddBundleDialogOpen(true)} size="sm" variant="outline">
                <Layers className="w-4 h-4 mr-2" />
                Add Bundle
              </Button>
            </div>

            {/* Parts List */}
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : partsUsed.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No parts added yet.</p>
                <p className="text-sm mt-2">Click "Add Part" to add parts used for this job.</p>
                {technicianInventory.length === 0 && (
                  <p className="text-xs mt-2 text-orange-600">
                    Note: Technician has no inventory items. They need to add items first.
                  </p>
                )}
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
                            : 'Unknown'}
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
                                <AlertDialogTitle>Remove Part?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove this part? The quantity will be added back to the technician's inventory.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeletePart(part.id, part.inventory_id, part.quantity_used)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Remove
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
              {filteredInventoryItems.length === 0 ? (
                <div className="py-8 px-4 text-center text-sm text-gray-500">
                  {technicianInventory.length === 0
                    ? 'No parts in technician inventory.'
                    : debouncedSearchQuery.trim()
                    ? 'No parts match your search.'
                    : 'No parts with available quantity.'}
                </div>
              ) : (
                <div className="overflow-y-auto overflow-x-hidden max-h-[min(50vh,280px)] sm:max-h-[320px] w-full min-w-0 pl-0 pr-4">
                  {filteredInventoryItems.map((item) => {
                    const productName = item.inventory?.product_name || inventoryMap.get(item.inventory_id)?.product_name || 'Unknown';
                    const code = item.inventory?.code || inventoryMap.get(item.inventory_id)?.code || '';
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 sm:gap-3 pl-3 pr-2 py-2.5 border-b last:border-b-0 bg-background hover:bg-muted/50 w-full max-w-full overflow-hidden"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="text-sm font-medium truncate block">
                            {productName}
                          </span>
                          {code && (
                            <span className="text-xs text-gray-500 truncate block">
                              Code: {code}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 w-8 min-w-[2rem] shrink-0"
                          onClick={() => handleQuickAddPart(item.inventory_id)}
                          disabled={item.quantity < 1}
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
            {bundles.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No bundles defined. Create bundles in Inventory → Bundles.</p>
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
