import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Package, Plus, Search, Trash2, Layers, X } from 'lucide-react';
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
  quantity?: number;
}

/** Row in the Add Part picker — tech bag or warehouse fallback. */
type AddablePartRow = {
  key: string;
  inventory_id: string;
  product_name: string;
  code: string | null;
  available: number;
  source: 'technician' | 'main';
};

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
  const [savingCustom, setSavingCustom] = useState(false);

  // Main (warehouse) inventory — name/price enrich + add-from-main fallback
  const [mainInventoryItems, setMainInventoryItems] = useState<InventoryItem[]>([]);
  const [mainInventoryLoaded, setMainInventoryLoaded] = useState(false);

  // Custom (non-inventory) item entry — name + qty + price. Not tracked in main
  // or technician stock since these are one-off parts outside the catalog.
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customPrice, setCustomPrice] = useState('');

  const resetCustomForm = useCallback(() => {
    setShowCustom(false);
    setCustomName('');
    setCustomQty('1');
    setCustomPrice('');
  }, []);

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
  }, [open, job?.id, technician?.id, loadPartsUsedOnDemand, resetCustomForm]);

  // Lazy-load technician inventory only when Add Part or Add Bundle dialog opens (reduces load when user only views parts)
  useEffect(() => {
    if (!(addPartDialogOpen || addBundleDialogOpen) || !technician?.id) return;

    const cacheKey = `tech_inventory_${technician.id}`;
    const cached = inventoryCache.get<TechnicianInventoryItem[]>(cacheKey);

    // inventoryCache.get already enforces TTL — use cache as-is (no background refetch)
    if (cached) {
      setTechnicianInventory(cached);
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

  const loadMainInventory = useCallback(async (opts?: { force?: boolean }) => {
    if (mainInventoryLoaded && !opts?.force) return;
    const cacheKey = 'inventory_items';

    // Prefer valid cache — do not silently re-fetch getAll (large egress)
    if (!opts?.force) {
      const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
      if (cached && cached.length > 0) {
        setMainInventoryItems(cached);
        setMainInventoryLoaded(true);
        return;
      }
    }

    const { data, error } = await db.inventory.getAll();
    if (!error && data) {
      setMainInventoryItems(data);
      inventoryCache.set(cacheKey, data);
    }
    setMainInventoryLoaded(true);
  }, [mainInventoryLoaded]);

  // Load main inventory when Add Part / Add Bundle opens (fallback + name enrich)
  useEffect(() => {
    if (!(addPartDialogOpen || addBundleDialogOpen)) return;
    void loadMainInventory();
  }, [addPartDialogOpen, addBundleDialogOpen, loadMainInventory]);

  // Memoize inventory lookup map for O(1) access
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    mainInventoryItems.forEach(item => map.set(item.id, item));
    return map;
  }, [mainInventoryItems]);

  /** Patch one main row in local state + cache (avoids getAll after a single-item refresh). */
  const patchMainLocalItem = useCallback((item: InventoryItem) => {
    setMainInventoryItems(prev => {
      const idx = prev.findIndex(m => m.id === item.id);
      const next =
        idx >= 0
          ? prev.map((m, i) => (i === idx ? { ...m, ...item } : m))
          : [...prev, item];
      inventoryCache.set('inventory_items', next);
      return next;
    });
  }, []);

  /** Sync tech bag list into inventoryCache after local qty changes. */
  const setTechnicianInventoryAndCache = useCallback(
    (updater: (prev: TechnicianInventoryItem[]) => TechnicianInventoryItem[]) => {
      setTechnicianInventory(prev => {
        const next = updater(prev);
        if (technician?.id) {
          inventoryCache.set(`tech_inventory_${technician.id}`, next);
        }
        return next;
      });
    },
    [technician?.id]
  );

  /**
   * Add Part list: technician bag (qty > 0) first; then main warehouse parts the
   * tech does not have (or has 0), so admin can pull directly from main.
   */
  const filteredInventoryItems = useMemo((): AddablePartRow[] => {
    const rows: AddablePartRow[] = [];
    const techQtyByInv = new Map<string, number>();

    for (const item of technicianInventory) {
      const inv = item.inventory || inventoryMap.get(item.inventory_id);
      techQtyByInv.set(item.inventory_id, item.quantity);
      if (item.quantity > 0) {
        rows.push({
          key: `tech-${item.inventory_id}`,
          inventory_id: item.inventory_id,
          product_name: inv?.product_name || 'Unknown',
          code: inv?.code ?? null,
          available: item.quantity,
          source: 'technician',
        });
      }
    }

    for (const main of mainInventoryItems) {
      const techQty = techQtyByInv.get(main.id) ?? 0;
      const mainQty = Number(main.quantity ?? 0);
      if (techQty < 1 && mainQty > 0) {
        rows.push({
          key: `main-${main.id}`,
          inventory_id: main.id,
          product_name: main.product_name || 'Unknown',
          code: main.code ?? null,
          available: mainQty,
          source: 'main',
        });
      }
    }

    let filtered = rows;
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = rows.filter(item => {
        const nameMatch = item.product_name.toLowerCase().includes(query);
        const codeMatch = item.code?.toLowerCase().includes(query);
        return nameMatch || !!codeMatch;
      });
    }

    if (filtered.length > 1) {
      filtered = [...filtered].sort((a, b) => {
        if (a.source !== b.source) return a.source === 'technician' ? -1 : 1;
        return a.product_name.localeCompare(b.product_name);
      });
    }

    return filtered;
  }, [technicianInventory, mainInventoryItems, debouncedSearchQuery, inventoryMap]);

  // Deduct from main inventory (warehouse). Returns error message if insufficient.
  // If existingMainItem is provided (e.g. from a prior getById for price), skip the fetch to avoid double getById.
  // Uses SECURITY DEFINER RPC so technicians (blocked by RLS on direct UPDATE) can deduct too.
  const deductMainInventory = async (
    inventoryId: string,
    quantity: number,
    existingMainItem?: { quantity?: number } | null
  ): Promise<string | null> => {
    if (existingMainItem != null) {
      const existingQty = Number((existingMainItem as any).quantity ?? NaN);
      if (!Number.isNaN(existingQty) && existingQty < quantity) {
        return `Main inventory has ${existingQty}, need ${quantity}`;
      }
    }
    const { error: rpcErr } = await db.inventory.decrementForJob(inventoryId, quantity);
    return rpcErr ? (rpcErr as { message?: string }).message || 'Failed to update main inventory' : null;
  };

  const restoreMainInventory = async (
    inventoryId: string,
    quantity: number
  ): Promise<string | null> => {
    const { error: rpcErr } = await db.inventory.incrementForJob(inventoryId, quantity);
    return rpcErr
      ? (rpcErr as { message?: string }).message || 'Failed to restore main inventory'
      : null;
  };

  /** Keep local main list + inventoryCache in sync after deduct/restore. */
  const bumpMainLocalQty = useCallback((inventoryId: string, delta: number) => {
    setMainInventoryItems(prev => {
      const next = prev.map(m =>
        m.id === inventoryId
          ? { ...m, quantity: Math.max(0, Number(m.quantity ?? 0) + delta) }
          : m
      );
      inventoryCache.set('inventory_items', next);
      return next;
    });
  }, []);

  /** Restore technician bag qty; create the bag row if it was deleted. */
  const restoreTechBagQty = async (
    inventoryId: string,
    qty: number
  ): Promise<void> => {
    if (!technician?.id || qty <= 0) return;
    const techItem = technicianInventory.find(i => i.inventory_id === inventoryId);
    if (techItem) {
      const newQty = techItem.quantity + qty;
      const { error } = await db.technicianInventory.update(techItem.id, { quantity: newQty });
      if (error) throw error;
      setTechnicianInventoryAndCache(prev =>
        prev.map(i => (i.id === techItem.id ? { ...i, quantity: newQty } : i))
      );
      return;
    }
    const { data, error } = await db.technicianInventory.create({
      technician_id: technician.id,
      inventory_id: inventoryId,
      quantity: qty,
    });
    if (error) throw error;
    if (data) {
      setTechnicianInventoryAndCache(prev => [data as TechnicianInventoryItem, ...prev]);
    }
  };

  // Handle add part - opens dialog with search
  const handleAddPart = () => {
    setInventorySearchQuery('');
    setAddPartDialogOpen(true);
  };

  // Add a custom (one-off) item not in any inventory. No stock movement on the
  // technician or main inventory — it's tracked only as a job part with its own price.
  const handleAddCustomPart = async () => {
    if (!job?.id || !technician?.id || savingCustom) return;
    const name = customName.trim();
    const qty = Math.max(1, Math.floor(Number(customQty) || 0));
    const price = Math.max(0, Number(customPrice) || 0);
    if (!name) {
      toast.error('Enter an item name.');
      return;
    }
    setSavingCustom(true);
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
      if (newPart) setPartsUsed(prev => [newPart as JobPartUsed, ...prev]);
      resetCustomForm();
      setInventorySearchQuery('');
      scheduleRecalcJobPartsCost(job.id);
      toast.success('Custom item added.');
    } catch (e: any) {
      console.error('Error adding custom part:', e);
      toast.error(e?.message || 'Failed to add custom item');
    } finally {
      setSavingCustom(false);
    }
  };

  // Apply bundle: prefer technician stock; remainder (or full need) from main with source=main.
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

      type Plan = { inventory_id: string; fromTech: number; fromMain: number; name: string };
      const plans: Plan[] = [];
      const short: string[] = [];

      for (const it of items) {
        const techItem = technicianInventory.find(i => i.inventory_id === it.inventory_id);
        const need = it.quantity;
        const techHave = techItem?.quantity ?? 0;
        const fromTech = Math.min(techHave, need);
        const fromMain = need - fromTech;
        const name =
          techItem?.inventory?.product_name ||
          inventoryMap.get(it.inventory_id)?.product_name ||
          it.inventory_id;

        if (fromMain > 0) {
          // Use already-loaded main list — no per-item getById
          const mainQty = Number(inventoryMap.get(it.inventory_id)?.quantity ?? 0);
          if (mainQty < fromMain) {
            short.push(`${name}: need ${need} (tech ${techHave} + main ${mainQty})`);
            continue;
          }
        }
        plans.push({ inventory_id: it.inventory_id, fromTech, fromMain, name });
      }

      if (short.length > 0) {
        toast.error(`Insufficient stock: ${short.join('; ')}`);
        setApplyingBundle(false);
        return;
      }

      const priceMap = new Map<string, number>();
      const missingPriceIds: string[] = [];
      for (const it of items) {
        const fromBundle = (it.inventory as { price?: number } | undefined)?.price;
        const fromMap = inventoryMap.get(it.inventory_id)?.price;
        if (fromBundle != null) priceMap.set(it.inventory_id, Number(fromBundle));
        else if (fromMap != null) priceMap.set(it.inventory_id, Number(fromMap));
        else missingPriceIds.push(it.inventory_id);
      }
      // At most one getById per missing price (rare — catalog usually already loaded)
      for (const id of missingPriceIds) {
        const { data: invData } = await db.inventory.getById(id);
        priceMap.set(id, invData?.price ? Number(invData.price) : 0);
      }

      let workingParts: JobPartUsed[] = [...partsUsed];
      let workingTech = [...technicianInventory];

      const upsertPart = async (
        inventoryId: string,
        qty: number,
        source: 'technician' | 'main',
        price: number
      ) => {
        const existing = workingParts.find(
          p => p.inventory_id === inventoryId && (p.source || 'technician') === source
        );
        if (existing) {
          const newQty = existing.quantity_used + qty;
          await db.jobPartsUsed.update(existing.id, { quantity_used: newQty });
          workingParts = workingParts.map(p =>
            p.id === existing.id ? { ...p, quantity_used: newQty } : p
          );
        } else {
          const { data: newPart, error: createErr } = await db.jobPartsUsed.create({
            job_id: job.id,
            technician_id: technician.id,
            inventory_id: inventoryId,
            quantity_used: qty,
            price_at_time_of_use: price,
            source,
          });
          if (createErr) throw createErr;
          if (newPart) workingParts = [newPart as JobPartUsed, ...workingParts];
        }
      };

      for (const plan of plans) {
        const price = priceMap.get(plan.inventory_id) ?? 0;
        // Only touch main inventory for the warehouse shortfall — tech bag is enough otherwise
        if (plan.fromMain > 0) {
          const err = await deductMainInventory(plan.inventory_id, plan.fromMain);
          if (err) {
            toast.error(`Main inventory: ${err}`);
            setApplyingBundle(false);
            const { data } = await db.inventory.getById(plan.inventory_id);
            if (data) patchMainLocalItem(data as InventoryItem);
            return;
          }
        }

        try {
          if (plan.fromTech > 0) {
            const techItem = workingTech.find(i => i.inventory_id === plan.inventory_id);
            if (!techItem || techItem.quantity < plan.fromTech) {
              throw new Error(`Technician stock changed for ${plan.name}`);
            }
            await upsertPart(plan.inventory_id, plan.fromTech, 'technician', price);
            const newTechQty = techItem.quantity - plan.fromTech;
            const { error: techErr } = await db.technicianInventory.update(techItem.id, {
              quantity: newTechQty,
            });
            if (techErr) throw techErr;
            workingTech = workingTech.map(i =>
              i.id === techItem.id ? { ...i, quantity: newTechQty } : i
            );
          }

          if (plan.fromMain > 0) {
            await upsertPart(plan.inventory_id, plan.fromMain, 'main', price);
          }
        } catch (planErr) {
          if (plan.fromMain > 0) {
            await restoreMainInventory(plan.inventory_id, plan.fromMain);
          }
          throw planErr;
        }
      }

      setPartsUsed(workingParts);
      setTechnicianInventoryAndCache(() => workingTech);
      setMainInventoryItems(prev => {
        const next = prev.map(m => {
          const plan = plans.find(p => p.inventory_id === m.id);
          if (!plan || plan.fromMain <= 0) return m;
          return { ...m, quantity: Math.max(0, Number(m.quantity ?? 0) - plan.fromMain) };
        });
        inventoryCache.set('inventory_items', next);
        return next;
      });
      setAddBundleDialogOpen(false);
      scheduleRecalcJobPartsCost(job.id);
      toast.success(`Bundle applied: ${items.length} part(s) added.`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to apply bundle');
      void loadPartsUsed();
      void loadTechnicianInventory();
    } finally {
      setApplyingBundle(false);
    }
  };

  // Quick add 1 qty — tech bag when available; main only when tech has none/zero.
  // Tech path does NOT touch main inventory.
  const handleQuickAddPart = async (
    inventoryId: string,
    source: 'technician' | 'main' = 'technician'
  ) => {
    if (!job?.id || !technician?.id) return;
    const flightKey = `${source}:${inventoryId}`;
    if (quickAddInFlightRef.current.has(flightKey)) return;
    quickAddInFlightRef.current.add(flightKey);

    try {
      const techItem = technicianInventory.find(i => i.inventory_id === inventoryId);
      let mainCached = inventoryMap.get(inventoryId) as InventoryItem | undefined;

      let currentPrice: number | undefined =
        mainCached?.price != null
          ? Number(mainCached.price)
          : techItem?.inventory?.price != null
          ? Number(techItem.inventory.price)
          : undefined;

      if (source === 'main') {
        if (!mainCached || Number(mainCached.quantity ?? 0) < 1) {
          const { data, error } = await db.inventory.getById(inventoryId);
          if (error) throw error;
          if (data) {
            mainCached = data as InventoryItem;
            patchMainLocalItem(mainCached);
            if (currentPrice == null && data.price != null) currentPrice = Number(data.price);
          }
        }

        const mainQty = Number(mainCached?.quantity ?? NaN);
        if (!Number.isNaN(mainQty) && mainQty < 1) {
          toast.error('Insufficient main inventory');
          return;
        }

        const mainErr = await deductMainInventory(inventoryId, 1, mainCached ?? null);
        if (mainErr) {
          toast.error(`Main inventory: ${mainErr}`);
          const { data } = await db.inventory.getById(inventoryId);
          if (data) patchMainLocalItem(data as InventoryItem);
          return;
        }

        try {
          const existingPart = partsUsed.find(
            p => p.inventory_id === inventoryId && p.source === 'main'
          );
          if (existingPart) {
            const newQuantity = existingPart.quantity_used + 1;
            const { data: updatedPart, error: updateError } = await db.jobPartsUsed.update(
              existingPart.id,
              { quantity_used: newQuantity }
            );
            if (updateError) throw updateError;
            setPartsUsed(prev =>
              prev.map(p =>
                p.id === existingPart.id
                  ? (updatedPart as JobPartUsed) || { ...p, quantity_used: newQuantity }
                  : p
              )
            );
          } else {
            const { data: newPart, error: createError } = await db.jobPartsUsed.create({
              job_id: job.id,
              technician_id: technician.id,
              inventory_id: inventoryId,
              quantity_used: 1,
              price_at_time_of_use: currentPrice,
              source: 'main',
            });
            if (createError) throw createError;
            if (newPart) setPartsUsed(prev => [newPart as JobPartUsed, ...prev]);
          }
        } catch (writeErr) {
          await restoreMainInventory(inventoryId, 1);
          throw writeErr;
        }

        bumpMainLocalQty(inventoryId, -1);
        scheduleRecalcJobPartsCost(job.id);
        toast.success('Part added (1 qty) from main inventory.');
        return;
      }

      // Technician bag path — no main inventory check or deduct
      if (!techItem || techItem.quantity < 1) {
        toast.error('Insufficient technician quantity');
        return;
      }

      const existingPart = partsUsed.find(
        p => p.inventory_id === inventoryId && (p.source || 'technician') === 'technician'
      );

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

        setPartsUsed(prev => prev.map(p => p.id === existingPart.id ? (updatedPart || p) : p));
        setTechnicianInventoryAndCache(prev =>
          prev.map(i => (i.id === techItem.id ? { ...i, quantity: newTechQuantity } : i))
        );
      } else {
        const { data: newPart, error: createError } = await db.jobPartsUsed.create({
          job_id: job.id,
          technician_id: technician.id,
          inventory_id: inventoryId,
          quantity_used: 1,
          price_at_time_of_use: currentPrice,
          source: 'technician',
        });
        if (createError) throw createError;

        const newTechQuantity = techItem.quantity - 1;
        const { error: updateTechError } = await db.technicianInventory.update(techItem.id, {
          quantity: newTechQuantity
        });
        if (updateTechError) throw updateTechError;

        if (newPart) setPartsUsed(prev => [newPart as JobPartUsed, ...prev]);
        setTechnicianInventoryAndCache(prev =>
          prev.map(i => (i.id === techItem.id ? { ...i, quantity: newTechQuantity } : i))
        );
      }

      scheduleRecalcJobPartsCost(job.id);
      toast.success('Part added (1 qty) from technician bag.');
    } catch (error: any) {
      console.error('Error quick adding part:', error);
      toast.error(error?.message || 'Failed to add part');
    } finally {
      quickAddInFlightRef.current.delete(flightKey);
    }
  };

  // Remove: main → restore main only; technician → restore tech bag only; custom → neither.
  const handleDeletePart = async (
    partId: string,
    inventoryId: string | null,
    quantityUsed: number,
    isCustom = false,
    partSource: string | null | undefined = 'technician'
  ) => {
    if (!technician?.id) return;

    const fromMainOnly = !isCustom && partSource === 'main';
    const fromTechnician = !isCustom && !fromMainOnly && !!inventoryId;
    const qtyToRestore = quantityUsed > 1 ? 1 : quantityUsed;

    try {
      if (quantityUsed > 1) {
        const newQuantityUsed = quantityUsed - 1;
        const { data: updatedPart, error: updateError } = await db.jobPartsUsed.update(partId, {
          quantity_used: newQuantityUsed,
        });
        if (updateError) throw updateError;
        if (!updatedPart) throw new Error('Part quantity was not updated. Please try again.');

        if (fromMainOnly && inventoryId) {
          const mainErr = await restoreMainInventory(inventoryId, qtyToRestore);
          if (mainErr) {
            toast.error(`Part qty reduced, but main inventory restore failed: ${mainErr}`);
          } else {
            bumpMainLocalQty(inventoryId, qtyToRestore);
          }
        }

        if (fromTechnician && inventoryId) {
          await restoreTechBagQty(inventoryId, 1);
        }

        setPartsUsed(prev =>
          prev.map(p => (p.id === partId ? (updatedPart || { ...p, quantity_used: newQuantityUsed }) : p))
        );
        if (job?.id) scheduleRecalcJobPartsCost(job.id);
        toast.success(
          isCustom
            ? 'Removed 1 qty from job.'
            : fromMainOnly
            ? 'Removed 1 qty from job; stock returned to main inventory.'
            : 'Removed 1 qty from job; stock returned to technician bag.'
        );
      } else {
        const { error: deleteError } = await db.jobPartsUsed.delete(partId);
        if (deleteError) throw deleteError;

        if (fromMainOnly && inventoryId) {
          const mainErr = await restoreMainInventory(inventoryId, qtyToRestore);
          if (mainErr) {
            toast.error(`Part removed, but main inventory restore failed: ${mainErr}`);
          } else {
            bumpMainLocalQty(inventoryId, qtyToRestore);
          }
        }

        if (fromTechnician && inventoryId) {
          await restoreTechBagQty(inventoryId, quantityUsed);
        }

        setPartsUsed(prev => prev.filter(p => p.id !== partId));
        if (job?.id) scheduleRecalcJobPartsCost(job.id);
        toast.success(
          isCustom
            ? 'Custom item removed.'
            : fromMainOnly
            ? 'Part removed; stock returned to main inventory.'
            : 'Part removed; stock returned to technician bag.'
        );
      }
    } catch (error: any) {
      console.error('Error deleting part:', error);
      toast.error(error?.message || 'Failed to remove part');
      if (job?.id) void loadPartsUsed();
      void loadTechnicianInventory();
    }
  };

  if (!job || !technician) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className="w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6 sm:max-h-[85vh]"
        >
          <div className="shrink-0 flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-left text-lg font-semibold leading-none tracking-tight m-0">
              <Package className="w-5 h-5 shrink-0" />
              Parts Used for Job
            </DialogTitle>
            <DialogClose className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground focus:outline-none focus-visible:ring-0">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

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
                    {partsUsed.map(part => {
                      const partIsCustom = part.source === 'custom' || !part.inventory_id;
                      const partFromMain = part.source === 'main';
                      const partName = partIsCustom
                        ? (part.custom_name || 'Custom item')
                        : part.inventory
                        ? `${part.inventory.product_name}${part.inventory.code ? ` (${part.inventory.code})` : ''}`
                        : 'Unknown';
                      return (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">
                          {partName}
                          {partIsCustom && (
                            <span className="ml-2 align-middle rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Custom
                            </span>
                          )}
                          {partFromMain && (
                            <span className="ml-2 align-middle rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                              Main
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
                                  {part.quantity_used > 1
                                    ? `This will reduce quantity used from ${part.quantity_used} to ${part.quantity_used - 1}.${
                                        partIsCustom
                                          ? ''
                                          : partFromMain
                                          ? ' One unit returns to main inventory.'
                                          : ' One unit returns to the technician bag.'
                                      }`
                                    : partIsCustom
                                    ? 'Remove this custom item from the job?'
                                    : partFromMain
                                    ? 'Remove this part from the job? The quantity will return to main inventory only.'
                                    : 'Remove this part from the job? The quantity will return to the technician bag.'}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleDeletePart(
                                      part.id,
                                      part.inventory_id,
                                      part.quantity_used,
                                      partIsCustom,
                                      part.source
                                    )
                                  }
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {part.quantity_used > 1 ? 'Remove 1' : 'Remove'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                      );
                    })}
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
          resetCustomForm();
        }
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-hidden [&>div]:min-w-0 flex flex-col [&>button]:shrink-0 [&>button]:z-10 [&>button]:!top-[max(1rem,env(safe-area-inset-top,0px))]">
          <div className="flex flex-col min-h-0 min-w-0 gap-4 flex-1 max-w-full">
          <DialogHeader className="space-y-1.5 shrink-0">
            <DialogTitle className="text-base sm:text-lg">Add Part Used</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Search and click + to add 1 qty from {technician.fullName || technician.full_name}&apos;s bag.
              Parts the tech doesn&apos;t have (or has 0 of) appear from main inventory. You can also add a custom item.
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
              {addPartInventoryLoading && !mainInventoryLoaded ? (
                <div className="py-8 px-4 text-center text-sm text-muted-foreground">
                  Loading parts...
                </div>
              ) : filteredInventoryItems.length === 0 && !inventorySearchQuery.trim() ? (
                <div className="py-8 px-4 text-center text-sm text-muted-foreground">
                  {technicianInventory.length === 0 && mainInventoryItems.every(m => Number(m.quantity ?? 0) < 1)
                    ? 'No parts in technician or main inventory.'
                    : 'No parts with available quantity.'}
                </div>
              ) : (
                <div className="overflow-y-auto overflow-x-hidden max-h-[min(50vh,280px)] sm:max-h-[320px] w-full min-w-0 pl-0 pr-0 [scrollbar-gutter:stable] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {filteredInventoryItems.map((item) => {
                    const productName = item.product_name;
                    const code = item.code || '';
                    return (
                      <div
                        key={item.key}
                        className="group flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b last:border-b-0 bg-background hover:bg-muted/50 w-full max-w-full overflow-hidden"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="text-sm font-medium truncate block">
                            {productName}
                            {item.source === 'main' && (
                              <span className="ml-1.5 align-middle rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                                Main
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">
                            {code ? `Code: ${code} · ` : ''}
                            {item.source === 'main' ? 'Main stock' : 'Tech bag'}: {item.available}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 min-w-[2rem] shrink-0 bg-card text-foreground transition-colors hover:!bg-gray-800 hover:!text-white hover:!border-gray-800"
                          onClick={() => {
                            hapticTap();
                            handleQuickAddPart(item.inventory_id, item.source);
                          }}
                          disabled={item.available < 1}
                          title={item.source === 'main' ? 'Add 1 qty from main' : 'Add 1 qty from tech bag'}
                        >
                          <Plus className="w-4 h-4 text-current" />
                        </Button>
                      </div>
                    );
                  })}

                  {/* When searching, offer the typed text as a custom (non-inventory) item. */}
                  {inventorySearchQuery.trim() && (
                    <div className="group flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b last:border-b-0 bg-muted/30 w-full max-w-full overflow-hidden">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <span className="text-sm font-medium truncate block">
                          {inventorySearchQuery.trim()}
                        </span>
                        <span className="text-xs text-muted-foreground truncate block">
                          Custom item (not in inventory)
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 min-w-[2rem] shrink-0 bg-card text-foreground transition-colors hover:!bg-gray-800 hover:!text-white hover:!border-gray-800"
                        onClick={() => {
                          hapticTap();
                          setShowCustom(true);
                          setCustomName(inventorySearchQuery.trim().toUpperCase());
                          setCustomQty('1');
                          setCustomPrice('');
                        }}
                        disabled={savingCustom}
                        title="Add as custom item"
                      >
                        <Plus className="w-4 h-4 text-current" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 pt-3 border-t mt-2 space-y-3">
            {showCustom && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Custom item (not in inventory)
                </p>
                <Input
                  placeholder="Item name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="h-9 text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-muted-foreground">Qty</label>
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={customQty}
                      onChange={(e) => setCustomQty(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-muted-foreground">Unit price (₹)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={resetCustomForm} disabled={savingCustom}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleAddCustomPart}
                    disabled={savingCustom || !customName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add item
                  </Button>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setAddPartDialogOpen(false)}
              >
                Done
              </Button>
            </div>
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
              Select a bundle to add all its parts to this job. Uses the technician&apos;s bag first; any shortfall is taken from main inventory.
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
