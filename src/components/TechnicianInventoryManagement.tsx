import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User, Plus, Edit, Trash2, Package, Search, Check, ChevronsUpDown, X, RefreshCw, ArrowUpCircle, Loader2 } from 'lucide-react';
import { db, supabase } from '@/lib/supabase';
import TechnicianTopUpDialog from '@/components/TechnicianTopUpDialog';
import { toast } from 'sonner';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { inventoryCache, debounce } from '@/lib/inventoryCache';
import {
  filterNestedInventoryByApproxSearch,
  scoreInventoryMatch,
} from '@/lib/inventorySearch';

interface Technician {
  id: string;
  full_name: string;
  employee_id: string;
}

interface InventoryItem {
  id: string;
  product_name: string;
  code: string | null;
  price: number;
  quantity?: number;
}

interface TechnicianInventoryItem {
  id: string;
  technician_id: string;
  inventory_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  technician?: Technician;
  inventory?: InventoryItem;
}

interface TechnicianInventoryManagementProps {
  onBack?: () => void;
}

const ASSIGN_ALL_TECHNICIANS = '__all__';

type AssignTargetMode = 'individual' | 'all';

/** Assign-inventory dialog: grayscale-only field styling (matches admin mockup). */
const assignFieldClass =
  'h-11 sm:h-10 w-full bg-[#EBEBEB] border-[#DDDDDD] text-[#333333] placeholder:text-[#757575] focus-visible:ring-gray-400 focus-visible:border-gray-400';
const assignLabelClass = 'text-sm font-medium text-[#333333]';

const TechnicianInventoryManagement: React.FC<TechnicianInventoryManagementProps> = ({ onBack }) => {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [technicianInventory, setTechnicianInventory] = useState<TechnicianInventoryItem[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TechnicianInventoryItem | null>(null);
  const [formData, setFormData] = useState({
    technician_id: '',
    inventory_id: '',
    quantity: ''
  });
  const [loading, setLoading] = useState(true);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [debouncedItemSearchQuery, setDebouncedItemSearchQuery] = useState('');
  const [inventorySearchOpen, setInventorySearchOpen] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [debouncedInventorySearchQuery, setDebouncedInventorySearchQuery] = useState('');
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [assignTargetMode, setAssignTargetMode] = useState<AssignTargetMode>('individual');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkAssignConfirmOpen, setBulkAssignConfirmOpen] = useState(false);
  const [loadedForTechnicianId, setLoadedForTechnicianId] = useState<string | null>(null);
  const lastLoadTimeRef = useRef<number>(0);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Debounce search queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedItemSearchQuery(itemSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInventorySearchQuery(inventorySearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [inventorySearchQuery]);

  // Load technicians with caching
  const loadTechnicians = useCallback(async () => {
    const cacheKey = 'technicians_list';
    const cached = inventoryCache.get<Technician[]>(cacheKey);
    if (cached) {
      setTechnicians(cached);
      return;
    }

    try {
      const { data, error } = await db.technicians.getList();
      if (error) throw error;
      const techData = data || [];
      setTechnicians(techData);
      inventoryCache.set(cacheKey, techData);
    } catch (error) {
      console.error('Error loading technicians:', error);
      toast.error('Failed to load technicians');
    }
  }, []);

  // Load inventory items with caching
  const loadInventoryItems = useCallback(async (forceReload = false) => {
    const cacheKey = 'inventory_items';
    
    if (!forceReload) {
      const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
      if (cached) {
        setInventoryItems(cached);
        return;
      }
    }

    try {
      const { data, error } = await db.inventory.getAll();
      if (error) throw error;
      const items = data || [];
      setInventoryItems(items);
      inventoryCache.set(cacheKey, items);
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Failed to load inventory items');
    }
  }, []);

  // Load technician inventory with caching
  const loadTechnicianInventory = useCallback(async (technicianId?: string, forceReload = false) => {
    const cacheKey = technicianId ? `tech_inventory_${technicianId}` : 'all_tech_inventory';
    const now = Date.now();
    const cacheValid = now - lastLoadTimeRef.current < CACHE_DURATION;

    // Check cache first
    if (!forceReload && cacheValid) {
      const cached = inventoryCache.get<TechnicianInventoryItem[]>(cacheKey);
      if (cached) {
        setTechnicianInventory(cached);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      let result;
      if (technicianId) {
        result = await db.technicianInventory.getByTechnician(technicianId);
      } else {
        result = await db.technicianInventory.getAll();
      }
      
      if (result.error) throw result.error;
      const inventoryData = result.data || [];
      setTechnicianInventory(inventoryData);
      inventoryCache.set(cacheKey, inventoryData);
      lastLoadTimeRef.current = now;
    } catch (error) {
      console.error('Error loading technician inventory:', error);
      toast.error('Failed to load technician inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount - only load technicians and inventory items (not technician inventory)
  useEffect(() => {
    loadTechnicians();
    loadInventoryItems();
    // Don't load technician inventory by default - only when technician is selected
  }, [loadTechnicians, loadInventoryItems]);

  // When technician changes, clear loaded state and inventory (don't auto-load)
  useEffect(() => {
    if (!selectedTechnicianId) {
      setTechnicianInventory([]);
      setLoadedForTechnicianId(null);
      setLoading(false);
    } else {
      setLoadedForTechnicianId(null);
      setTechnicianInventory([]);
      setLoading(false);
    }
  }, [selectedTechnicianId]);

  // Realtime: when technician_inventory changes (admin assign, tech top-up), refresh current list (no manual refresh needed)
  useEffect(() => {
    const channel = supabase
      .channel('admin-technician-inventory')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_inventory' },
        () => {
          if (!selectedTechnicianId) return;
          if (selectedTechnicianId !== ASSIGN_ALL_TECHNICIANS) {
            inventoryCache.clear(`tech_inventory_${selectedTechnicianId}`);
            loadTechnicianInventory(selectedTechnicianId, true);
          } else {
            inventoryCache.clear('all_tech_inventory');
            loadTechnicianInventory(undefined, true);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTechnicianId, loadTechnicianInventory]);

  // Filter technician inventory based on selected technician and item search (using debounced query)
  const filteredInventory = useMemo(() => {
    let filtered = technicianInventory;

    // Filter by technician
    if (selectedTechnicianId) {
      filtered = filtered.filter((item) => item.technician_id === selectedTechnicianId);
    }

    // Client-side approx match on product name / code (no extra egress)
    if (debouncedItemSearchQuery.trim()) {
      filtered = filterNestedInventoryByApproxSearch(
        filtered,
        debouncedItemSearchQuery,
        (item) => item.inventory || inventoryItems.find((i) => i.id === item.inventory_id)
      );
    }

    return filtered;
  }, [technicianInventory, selectedTechnicianId, debouncedItemSearchQuery, inventoryItems]);

  // Get selected technician name
  const selectedTechnician = useMemo(() => {
    if (!selectedTechnicianId) return null;
    return technicians.find(t => t.id === selectedTechnicianId);
  }, [technicians, selectedTechnicianId]);

  // Load inventory on demand when user clicks "Show inventory"
  const handleShowInventory = useCallback(async () => {
    if (!selectedTechnicianId) return;
    inventoryCache.clear(`tech_inventory_${selectedTechnicianId}`);
    await loadTechnicianInventory(selectedTechnicianId, true);
    setLoadedForTechnicianId(selectedTechnicianId);
  }, [selectedTechnicianId, loadTechnicianInventory]);

  // Group inventory by technician for display (to show technician name only once per group)
  const groupedInventory = useMemo(() => {
    if (!selectedTechnicianId) {
      // Group by technician when showing all
      const groups = new Map<string, TechnicianInventoryItem[]>();
      filteredInventory.forEach(item => {
        const techId = item.technician_id;
        if (!groups.has(techId)) {
          groups.set(techId, []);
        }
        groups.get(techId)!.push(item);
      });
      return Array.from(groups.entries()).map(([techId, items]) => ({
        technicianId: techId,
        technicianName: items[0]?.technician 
          ? `${items[0].technician.full_name} (${items[0].technician.employee_id})`
          : getTechnicianName(techId),
        items
      }));
    } else {
      // Single technician - no grouping needed, but still return in same format
      return [{
        technicianId: selectedTechnicianId,
        technicianName: selectedTechnician 
          ? `${selectedTechnician.full_name} (${selectedTechnician.employee_id})`
          : getTechnicianName(selectedTechnicianId),
        items: filteredInventory
      }];
    }
  }, [filteredInventory, selectedTechnicianId, selectedTechnician]);

  const resolveAssignTechnicianId = useCallback((): string => {
    if (assignTargetMode === 'all' || formData.technician_id === ASSIGN_ALL_TECHNICIANS) {
      return ASSIGN_ALL_TECHNICIANS;
    }
    return formData.technician_id || '';
  }, [assignTargetMode, formData.technician_id]);

  const getTargetTechnicianIds = useCallback(
    (technicianId: string): string[] => {
      if (technicianId === ASSIGN_ALL_TECHNICIANS) return technicians.map((t) => t.id);
      return technicianId ? [technicianId] : [];
    },
    [technicians]
  );

  const fetchAssignmentKeyMap = useCallback(
    async (techIds: string[], inventoryIds: string[]) => {
      const { data, error } = await db.technicianInventory.getAssignmentKeys(techIds, inventoryIds);
      if (error) throw error;
      const map = new Map<string, { id: string; quantity: number }>();
      for (const row of data || []) {
        map.set(`${row.technician_id}:${row.inventory_id}`, {
          id: row.id,
          quantity: row.quantity,
        });
      }
      return map;
    },
    []
  );

  const assignQuantityToTechnicians = async (
    inventoryId: string,
    quantity: number,
    techIds: string[],
    existingMap: Map<string, { id: string; quantity: number }>
  ) => {
    if (techIds.length === 0) return;
    const rows = techIds.map((techId) => {
      const key = `${techId}:${inventoryId}`;
      const existing = existingMap.get(key);
      const newQty = (existing?.quantity ?? 0) + quantity;
      existingMap.set(key, { id: existing?.id ?? '', quantity: newQty });
      return {
        technician_id: techId,
        inventory_id: inventoryId,
        quantity: newQty,
      };
    });
    const { error } = await db.technicianInventory.bulkUpsertAssignments(rows);
    if (error) throw error;
  };

  // Handle add inventory
  const handleAddInventory = () => {
    setAssignTargetMode('individual');
    setFormData({
      technician_id: '',
      inventory_id: '',
      quantity: '1',
    });
    setInventorySearchQuery('');
    setInventorySearchOpen(false);
    setAddDialogOpen(true);
  };

  const handleAssignTargetModeChange = (mode: AssignTargetMode) => {
    setAssignTargetMode(mode);
    if (mode === 'all') {
      setFormData((prev) => ({ ...prev, technician_id: ASSIGN_ALL_TECHNICIANS }));
    } else {
      setFormData((prev) => ({
        ...prev,
        technician_id: prev.technician_id === ASSIGN_ALL_TECHNICIANS ? '' : prev.technician_id,
      }));
    }
  };

  const handleAssignTechnicianSelect = (value: string) => {
    if (value === ASSIGN_ALL_TECHNICIANS) {
      handleAssignTargetModeChange('all');
    } else {
      setAssignTargetMode('individual');
      setFormData((prev) => ({ ...prev, technician_id: value }));
    }
  };

  // Assign every main-inventory product (qty per item) to one technician or all technicians
  const handleAssignAllItems = async () => {
    const technicianId = resolveAssignTechnicianId();
    if (!technicianId) {
      toast.error('Select a technician or choose All technicians');
      return;
    }

    const quantity = parseInt(formData.quantity, 10);
    if (isNaN(quantity) || quantity < 1) {
      toast.error('Enter a valid quantity (at least 1) for each item');
      return;
    }

    const techIds = getTargetTechnicianIds(technicianId);
    if (techIds.length === 0) {
      toast.error('No technicians to assign to');
      return;
    }

    const neededPerItem = quantity * techIds.length;
    const itemsToAssign = inventoryItems.filter((item) => (item.quantity ?? 0) >= neededPerItem);
    const skippedCount = inventoryItems.length - itemsToAssign.length;

    if (itemsToAssign.length === 0) {
      toast.error(
        `No products have enough stock (need ${neededPerItem} per product${techIds.length > 1 ? ` — ${quantity} × ${techIds.length} technicians` : ''})`
      );
      return;
    }

    setBulkAssigning(true);
    setBulkAssignConfirmOpen(false);
    try {
      const inventoryIds = itemsToAssign.map((item) => item.id);
      const existingMap = await fetchAssignmentKeyMap(techIds, inventoryIds);

      const assignmentRows: Array<{
        technician_id: string;
        inventory_id: string;
        quantity: number;
      }> = [];

      for (const mainItem of itemsToAssign) {
        for (const techId of techIds) {
          const key = `${techId}:${mainItem.id}`;
          const existing = existingMap.get(key);
          const newQty = (existing?.quantity ?? 0) + quantity;
          existingMap.set(key, { id: existing?.id ?? '', quantity: newQty });
          assignmentRows.push({
            technician_id: techId,
            inventory_id: mainItem.id,
            quantity: newQty,
          });
        }
      }

      const mainQtyUpdates = itemsToAssign.map((mainItem) => ({
        id: mainItem.id,
        quantity: (mainItem.quantity ?? 0) - neededPerItem,
      }));
      const { error: mainError } = await db.inventory.bulkUpdateQuantities(mainQtyUpdates);
      if (mainError) throw mainError;

      const { error: assignError } = await db.technicianInventory.bulkUpsertAssignments(assignmentRows);
      if (assignError) throw assignError;

      const mainQtyById = new Map(mainQtyUpdates.map((u) => [u.id, u.quantity]));
      setInventoryItems((prev) =>
        prev.map((item) =>
          mainQtyById.has(item.id) ? { ...item, quantity: mainQtyById.get(item.id)! } : item
        )
      );

      techIds.forEach((id) => inventoryCache.clear(`tech_inventory_${id}`));
      inventoryCache.clear('all_tech_inventory');
      inventoryCache.clear('inventory_items');

      const targetLabel =
        technicianId === ASSIGN_ALL_TECHNICIANS
          ? `all ${techIds.length} technicians`
          : getTechnicianName(techIds[0]);

      toast.success(
        `Assigned ${itemsToAssign.length} product${itemsToAssign.length === 1 ? '' : 's'} (${quantity} each) to ${targetLabel}` +
          (skippedCount > 0 ? `. Skipped ${skippedCount} (insufficient stock).` : '')
      );
    } catch (error: unknown) {
      console.error('Error assigning all inventory items:', error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'Failed to assign all items';
      toast.error(message);
    } finally {
      setBulkAssigning(false);
    }
  };

  // Quick assign 1 qty from main inventory to selected technician (or 1 to each when "All")
  const handleQuickAssignInventory = async (inventoryId: string) => {
    const technicianId = resolveAssignTechnicianId();
    if (!technicianId) {
      toast.error('Please select a technician or All technicians first');
      return;
    }

    const mainItem = inventoryItems.find(i => i.id === inventoryId);
    if (!mainItem) {
      toast.error('Product not found in main inventory');
      return;
    }

    const availableQty = mainItem.quantity ?? 0;
    const isAll = technicianId === ASSIGN_ALL_TECHNICIANS;
    if (isAll && technicians.length === 0) {
      toast.error('No technicians to assign to');
      return;
    }
    const qtyNeeded = isAll ? technicians.length : 1;
    if (availableQty < qtyNeeded) {
      toast.error(isAll
        ? `Insufficient stock. Available: ${availableQty}, Needed: ${qtyNeeded} (1 per technician)`
        : `Insufficient stock. Available: ${availableQty}`);
      return;
    }

    try {
      const newMainQuantity = availableQty - qtyNeeded;
      const { error: updateMainError } = await db.inventory.update(inventoryId, {
        quantity: newMainQuantity
      });
      if (updateMainError) throw updateMainError;

      const techIds = getTargetTechnicianIds(technicianId);
      const existingMap = isAll
        ? await fetchAssignmentKeyMap(techIds, [inventoryId])
        : new Map<string, { id: string; quantity: number }>();

      if (!isAll) {
        const existingTechItem = technicianInventory.find(
          (i) => i.technician_id === technicianId && i.inventory_id === inventoryId
        );
        if (existingTechItem) {
          existingMap.set(`${technicianId}:${inventoryId}`, {
            id: existingTechItem.id,
            quantity: existingTechItem.quantity,
          });
        }
      }

      await assignQuantityToTechnicians(inventoryId, 1, techIds, existingMap);

      if (isAll) {
        toast.success(`1 qty assigned to all ${technicians.length} technicians`);
        technicians.forEach((t) => inventoryCache.clear(`tech_inventory_${t.id}`));
        inventoryCache.clear('all_tech_inventory');
      } else {
        toast.success('1 qty assigned to technician');
        inventoryCache.clear(`tech_inventory_${technicianId}`);
      }

      // Optimistic update only: don't refetch so list order and scroll position stay (no jump to top)
      setInventoryItems(prev => prev.map(item =>
        item.id === inventoryId
          ? { ...item, quantity: Math.max(0, (item.quantity ?? 0) - qtyNeeded) }
          : item
      ));
      inventoryCache.clear('inventory_items');
      // Don't call loadInventoryItems or loadTechnicianInventory here – refresh when dialog closes
    } catch (error: any) {
      console.error('Error quick assigning inventory:', error);
      toast.error(error?.message || 'Failed to assign inventory');
    }
  };

  // Handle edit inventory
  const handleEditInventory = (item: TechnicianInventoryItem) => {
    setSelectedItem(item);
    setFormData({
      technician_id: item.technician_id,
      inventory_id: item.inventory_id,
      quantity: item.quantity.toString()
    });
    setInventorySearchQuery('');
    setInventorySearchOpen(false);
    setEditDialogOpen(true);
  };

  // Handle save inventory (add or update)
  const handleSaveInventory = async () => {
    const assignTechnicianId = selectedItem
      ? formData.technician_id
      : resolveAssignTechnicianId();

    if (!assignTechnicianId || !formData.inventory_id || !formData.quantity) {
      toast.error('Select a technician (or All technicians) and fill in product and quantity');
      return;
    }

    const quantity = parseInt(formData.quantity, 10);
    if (isNaN(quantity) || quantity < 0) {
      toast.error('Quantity must be a valid number');
      return;
    }

    try {
      // Get main inventory item to check available quantity
      const mainItem = inventoryItems.find(i => i.id === formData.inventory_id);
      if (!mainItem) {
        toast.error('Product not found in main inventory');
        return;
      }

      if (selectedItem) {
        // Update existing item - calculate quantity difference
        const quantityDifference = quantity - selectedItem.quantity;
        
        if (quantityDifference > 0) {
          // Adding more items - check if main inventory has enough
          if (mainItem.quantity < quantityDifference) {
            toast.error(`Insufficient stock. Available: ${mainItem.quantity}, Needed: ${quantityDifference}`);
            return;
          }
          
          // Subtract from main inventory
          const newMainQuantity = mainItem.quantity - quantityDifference;
          const { error: updateMainError } = await db.inventory.update(formData.inventory_id, {
            quantity: newMainQuantity
          });
          if (updateMainError) throw updateMainError;
        } else if (quantityDifference < 0) {
          // Removing items - add back to main inventory
          const newMainQuantity = mainItem.quantity + Math.abs(quantityDifference);
          const { error: updateMainError } = await db.inventory.update(formData.inventory_id, {
            quantity: newMainQuantity
          });
          if (updateMainError) throw updateMainError;
        }

        // Update technician inventory
        const { error } = await db.technicianInventory.update(selectedItem.id, {
          quantity
        });
        if (error) throw error;
        toast.success('Technician inventory updated successfully');
      } else if (assignTechnicianId === ASSIGN_ALL_TECHNICIANS) {
        const techIds = getTargetTechnicianIds(assignTechnicianId);
        if (techIds.length === 0) {
          toast.error('No technicians to assign to');
          return;
        }
        const totalNeeded = quantity * techIds.length;
        const availableQty = mainItem.quantity ?? 0;
        if (availableQty < totalNeeded) {
          toast.error(
            `Insufficient stock. Available: ${availableQty}, Needed: ${totalNeeded} (${quantity} × ${techIds.length} technicians)`
          );
          return;
        }

        const newMainQuantity = availableQty - totalNeeded;
        const { error: updateMainError } = await db.inventory.update(formData.inventory_id, {
          quantity: newMainQuantity,
        });
        if (updateMainError) throw updateMainError;

        const existingMap = await fetchAssignmentKeyMap(techIds, [formData.inventory_id]);
        await assignQuantityToTechnicians(formData.inventory_id, quantity, techIds, existingMap);
        toast.success(`Assigned ${quantity} qty to all ${techIds.length} technicians`);
      } else {
        if (mainItem.quantity < quantity) {
          toast.error(`Insufficient stock. Available: ${mainItem.quantity}, Requested: ${quantity}`);
          return;
        }

        const newMainQuantity = mainItem.quantity - quantity;
        const { error: updateMainError } = await db.inventory.update(formData.inventory_id, {
          quantity: newMainQuantity,
        });
        if (updateMainError) throw updateMainError;

        const existingMap = new Map<string, { id: string; quantity: number }>();
        const existingTechItem = technicianInventory.find(
          (i) => i.technician_id === assignTechnicianId && i.inventory_id === formData.inventory_id
        );
        if (existingTechItem) {
          existingMap.set(`${assignTechnicianId}:${formData.inventory_id}`, {
            id: existingTechItem.id,
            quantity: existingTechItem.quantity,
          });
        }
        await assignQuantityToTechnicians(
          formData.inventory_id,
          quantity,
          [assignTechnicianId],
          existingMap
        );
        toast.success('Inventory item assigned to technician successfully');
      }

      // Clear cache and reload data (preserve scroll so user stays in place)
      const scrollY = window.scrollY ?? document.documentElement.scrollTop;
      if (assignTechnicianId === ASSIGN_ALL_TECHNICIANS) {
        technicians.forEach((t) => inventoryCache.clear(`tech_inventory_${t.id}`));
        inventoryCache.clear('all_tech_inventory');
      } else {
        const cacheKey = selectedTechnicianId
          ? `tech_inventory_${selectedTechnicianId}`
          : 'all_tech_inventory';
        inventoryCache.clear(cacheKey);
        inventoryCache.clear(`tech_inventory_${assignTechnicianId}`);
      }
      inventoryCache.clear('inventory_items');
      await loadInventoryItems(true);
      if (assignTechnicianId === ASSIGN_ALL_TECHNICIANS) {
        await loadTechnicianInventory(undefined, true);
      } else if (selectedTechnicianId) {
        await loadTechnicianInventory(selectedTechnicianId, true);
        setLoadedForTechnicianId(selectedTechnicianId);
      } else {
        await loadTechnicianInventory(undefined, true);
      }
      requestAnimationFrame(() => { window.scrollTo(0, scrollY); });

      setAddDialogOpen(false);
      setEditDialogOpen(false);
      setSelectedItem(null);
      setInventorySearchOpen(false);
      setInventorySearchQuery('');
      setFormData({
        technician_id: '',
        inventory_id: '',
        quantity: ''
      });
    } catch (error: any) {
      console.error('Error saving technician inventory:', error);
      toast.error(error?.message || 'Failed to save technician inventory');
    }
  };

  // Handle delete inventory
  const handleDeleteInventory = async () => {
    if (!selectedItem) return;

    try {
      // Get main inventory item to add back quantity
      const mainItem = inventoryItems.find(i => i.id === selectedItem.inventory_id);
      
      if (mainItem) {
        // Add back to main inventory
        const newMainQuantity = mainItem.quantity + selectedItem.quantity;
        const { error: updateMainError } = await db.inventory.update(selectedItem.inventory_id, {
          quantity: newMainQuantity
        });
        if (updateMainError) throw updateMainError;
      }

      // Delete from technician inventory
      const { error } = await db.technicianInventory.delete(selectedItem.id);
      if (error) throw error;
      toast.success('Inventory item removed from technician and returned to main inventory');

      // Clear cache and reload data (preserve scroll so user stays in place)
      const scrollY = window.scrollY ?? document.documentElement.scrollTop;
      inventoryCache.clear('main_inventory');
      await loadInventoryItems(true);
      const cacheKey = selectedTechnicianId ? `tech_inventory_${selectedTechnicianId}` : 'all_tech_inventory';
      inventoryCache.clear(cacheKey);
      if (selectedTechnicianId) {
        await loadTechnicianInventory(selectedTechnicianId, true);
        setLoadedForTechnicianId(selectedTechnicianId);
      } else {
        await loadTechnicianInventory(undefined, true);
      }
      requestAnimationFrame(() => { window.scrollTo(0, scrollY); });

      setDeleteDialogOpen(false);
      setSelectedItem(null);
    } catch (error: any) {
      console.error('Error deleting technician inventory:', error);
      toast.error(error?.message || 'Failed to delete technician inventory');
    }
  };

  // Get inventory item name
  const getInventoryItemName = (inventoryId: string) => {
    const item = inventoryItems.find(i => i.id === inventoryId);
    return item ? `${item.product_name}${item.code ? ` (${item.code})` : ''}` : 'Unknown';
  };

  // Get technician name
  const getTechnicianName = (technicianId: string) => {
    const tech = technicians.find(t => t.id === technicianId);
    return tech ? `${tech.full_name} (${tech.employee_id})` : 'Unknown';
  };

  // Calculate usage count for each inventory item (how many times it's assigned)
  const inventoryUsageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    technicianInventory.forEach(item => {
      counts[item.inventory_id] = (counts[item.inventory_id] || 0) + 1;
    });
    return counts;
  }, [technicianInventory]);

  // Filter and sort inventory items for search (using debounced query)
  const filteredInventoryItems = useMemo(() => {
    const q = debouncedInventorySearchQuery.trim();
    if (!q) {
      return [...inventoryItems].sort((a, b) => {
        const aUsage = inventoryUsageCount[a.id] || 0;
        const bUsage = inventoryUsageCount[b.id] || 0;
        if (bUsage !== aUsage) return bUsage - aUsage;
        return a.product_name.localeCompare(b.product_name);
      });
    }

    // Approx match first, then usage as tiebreaker (client-side only)
    const scored: Array<{ item: (typeof inventoryItems)[number]; score: number }> = [];
    for (const item of inventoryItems) {
      const score = scoreInventoryMatch(item.product_name, item.code, q);
      if (score != null) scored.push({ item, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aUsage = inventoryUsageCount[a.item.id] || 0;
      const bUsage = inventoryUsageCount[b.item.id] || 0;
      if (bUsage !== aUsage) return bUsage - aUsage;
      return a.item.product_name.localeCompare(b.item.product_name);
    });
    return scored.map((s) => s.item);
  }, [inventoryItems, debouncedInventorySearchQuery, inventoryUsageCount]);

  // Get selected inventory item name
  const selectedInventoryName = useMemo(() => {
    if (!formData.inventory_id) return 'Select product...';
    const item = inventoryItems.find(i => i.id === formData.inventory_id);
    return item ? `${item.product_name}${item.code ? ` (${item.code})` : ''}` : 'Select product...';
  }, [formData.inventory_id, inventoryItems]);

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <User className="w-4 h-4 sm:w-5 sm:h-5" />
            Technician Inventory Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {/* Technician Filter */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-end">
            <div className="flex-1 w-full">
              <Label htmlFor="technician-select" className="text-sm font-medium">Select Technician</Label>
              <Select 
                value={selectedTechnicianId || undefined} 
                onValueChange={(value) => {
                  if (value) {
                    setSelectedTechnicianId(value);
                  } else {
                    setSelectedTechnicianId("");
                  }
                }}
              >
                <SelectTrigger id="technician-select" className="w-full">
                  <SelectValue placeholder="Select Technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.length > 0 ? (
                    technicians.map(tech => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.full_name} ({tech.employee_id})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>Loading technicians...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-wrap">
              {selectedTechnicianId && loadedForTechnicianId !== selectedTechnicianId && (
                <Button 
                  onClick={handleShowInventory}
                  className="w-full sm:w-auto text-sm bg-blue-600 hover:bg-blue-700"
                >
                  <Package className="w-4 h-4 sm:mr-2" />
                  <span className="sm:inline">Show inventory</span>
                </Button>
              )}
              <Button 
                onClick={handleAddInventory} 
                className="w-full sm:w-auto text-sm"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="sm:inline">Assign Inventory</span>
              </Button>
              {selectedTechnicianId && (
                <>
                  <Button 
                    variant="outline"
                    onClick={() => setTopUpDialogOpen(true)}
                    className="w-full sm:w-auto text-sm"
                  >
                    <ArrowUpCircle className="w-4 h-4 sm:mr-2" />
                    <span className="sm:inline">Top Up Used Items</span>
                  </Button>
                  {loadedForTechnicianId === selectedTechnicianId && (
                    <Button 
                      variant="outline"
                      onClick={() => {
                        inventoryCache.clear(`tech_inventory_${selectedTechnicianId}`);
                        loadTechnicianInventory(selectedTechnicianId, true);
                      }}
                      className="w-full sm:w-auto text-sm"
                    >
                      <RefreshCw className="w-4 h-4 sm:mr-2" />
                      <span className="sm:inline">Refresh</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Item Search - only when inventory is loaded */}
          {selectedTechnicianId && loadedForTechnicianId === selectedTechnicianId && (
            <div>
              <Label htmlFor="item-search" className="text-sm font-medium">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="item-search"
                  type="text"
                  placeholder="Search by product name or code..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="pl-10 pr-10 text-sm h-10"
                />
                {itemSearchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setItemSearchQuery('')}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {itemSearchQuery && (
                <p className="text-xs text-gray-500 mt-1">
                  {filteredInventory.length} item{filteredInventory.length !== 1 ? 's' : ''} found
                </p>
              )}
            </div>
          )}

          {/* Summary - when inventory loaded */}
          {selectedTechnician && loadedForTechnicianId === selectedTechnicianId && (
            <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
              <p className="text-xs sm:text-sm font-medium text-blue-900">
                Showing inventory for: <span className="font-semibold">{selectedTechnician.full_name}</span> ({selectedTechnician.employee_id})
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Total items: {filteredInventory.length}
              </p>
            </div>
          )}

          {/* Inventory Table */}
          {!selectedTechnicianId ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
              <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm sm:text-base">Select a technician to view their inventory</p>
            </div>
          ) : loadedForTechnicianId !== selectedTechnicianId ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
              <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm sm:text-base">Click &quot;Show inventory&quot; to load this technician&apos;s inventory</p>
            </div>
          ) : loading ? (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-sm sm:text-base">Loading...</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
              <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm sm:text-base">No inventory items assigned yet.</p>
              <p className="text-xs sm:text-sm mt-2">Click &quot;Assign Inventory&quot; to add items to this technician.</p>
            </div>
          ) : (
            <>
            <div className="space-y-2 sm:hidden">
              {groupedInventory.flatMap((group) =>
                group.items.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-3 bg-white flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm leading-snug line-clamp-2">
                        {item.inventory
                          ? item.inventory.product_name
                          : getInventoryItemName(item.inventory_id).split(' (')[0]}
                      </p>
                      {item.inventory?.code && (
                        <p className="text-xs text-gray-500 mt-0.5">Code: {item.inventory.code}</p>
                      )}
                      <p className="text-sm font-semibold text-blue-700 mt-1">Qty: {item.quantity}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditInventory(item)}
                        className="h-10 w-10 p-0 touch-manipulation"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedItem(item)}
                            className="h-10 w-10 p-0 touch-manipulation"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md sm:w-full">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-base">Remove Inventory Item?</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm">
                              Remove this item from the technician? Stock returns to main inventory.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
                            <AlertDialogCancel onClick={() => setSelectedItem(null)} className="w-full sm:w-auto">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteInventory}
                              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden sm:block border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm">Product</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">Quantity</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedInventory.map((group) => 
                      group.items.map((item, itemIndex) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs sm:text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {item.inventory
                                  ? item.inventory.product_name
                                  : getInventoryItemName(item.inventory_id).split(' (')[0]}
                              </span>
                              {item.inventory?.code && (
                                <span className="text-xs text-gray-500 mt-0.5">Code: {item.inventory.code}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-xs sm:text-sm">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 sm:gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditInventory(item)}
                                className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                              >
                                <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedItem(item)}
                                    className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="sm:max-w-[425px]">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-base sm:text-lg">Remove Inventory Item?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-sm">
                                      Are you sure you want to remove this inventory item from the technician? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                    <AlertDialogCancel onClick={() => setSelectedItem(null)} className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteInventory} className="bg-red-600 hover:bg-red-700 w-full sm:w-auto">
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={addDialogOpen || editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddDialogOpen(false);
          setEditDialogOpen(false);
          setSelectedItem(null);
          setInventorySearchOpen(false);
          setInventorySearchQuery('');
          setAssignTargetMode('individual');
          setFormData({
            technician_id: '',
            inventory_id: '',
            quantity: ''
          });
          // Refresh data when closing assign dialog (preserve scroll)
          const scrollY = window.scrollY ?? document.documentElement.scrollTop;
          inventoryCache.clear('inventory_items');
          loadInventoryItems(true);
          if (selectedTechnicianId) {
            inventoryCache.clear(`tech_inventory_${selectedTechnicianId}`);
            loadTechnicianInventory(selectedTechnicianId, true).then(() => {
              setLoadedForTechnicianId(selectedTechnicianId);
              requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
            });
          } else {
            technicians.forEach(t => inventoryCache.clear(`tech_inventory_${t.id}`));
            inventoryCache.clear('all_tech_inventory');
            loadTechnicianInventory(undefined, true).then(() => {
              requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
            });
          }
        }
      }}>
        <DialogContent
          className={cn(
            'flex flex-col gap-3 sm:gap-4 overflow-hidden p-3 sm:p-6',
            'w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] sm:w-[95vw] sm:max-w-2xl',
            'h-[92dvh] max-h-[92dvh] sm:h-auto sm:max-h-[90vh]',
            '[&>div]:min-w-0',
            selectedItem && 'sm:max-w-[500px] sm:overflow-y-auto'
          )}
        >
          <DialogHeader className="shrink-0 space-y-1.5 pr-8 text-left">
            <DialogTitle className="text-base sm:text-lg leading-snug">
              {selectedItem ? 'Edit Technician Inventory' : 'Assign Inventory'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-left">
              {selectedItem
                ? 'Update the quantity for this inventory item.'
                : 'Choose a technician (or All technicians), then assign one product or use quick add / assign all items.'}
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              'min-h-0 flex-1 space-y-3 sm:space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain py-1 sm:py-2',
              !selectedItem && 'flex flex-col'
            )}
          >
            {!selectedItem ? (
              <div className="space-y-2 shrink-0">
                <Label htmlFor="assign-technician" className={assignLabelClass}>
                  Technician *
                </Label>
                <Select
                  value={
                    formData.technician_id === ASSIGN_ALL_TECHNICIANS
                      ? ASSIGN_ALL_TECHNICIANS
                      : formData.technician_id || undefined
                  }
                  onValueChange={handleAssignTechnicianSelect}
                >
                  <SelectTrigger id="assign-technician" className={assignFieldClass}>
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ASSIGN_ALL_TECHNICIANS} className="text-sm font-medium">
                      All technicians
                    </SelectItem>
                    {technicians.length > 0 ? (
                      technicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id} className="text-sm">
                          {tech.full_name} ({tech.employee_id})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="loading" disabled className="text-sm">
                        Loading technicians...
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className={assignLabelClass}>Technician</Label>
                <p className="text-sm text-[#333333] mt-1">{getTechnicianName(formData.technician_id)}</p>
              </div>
            )}

            {/* Quick add from main inventory - list with + button (mobile responsive like Add Part) */}
            {!selectedItem && (
              <div className="flex flex-col min-w-0 overflow-hidden shrink-0 space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#333333]">Quick add from main inventory</h3>
                  <p className="text-xs text-[#757575] mt-1">
                    {resolveAssignTechnicianId()
                      ? assignTargetMode === 'all'
                        ? `Tap + to assign 1 qty of a product to each technician, or use “Assign all items” below for every product.`
                        : 'Search and click + to assign 1 qty to the selected technician.'
                      : 'Select a technician or All technicians above to enable assignment.'}
                  </p>
                </div>
                {!resolveAssignTechnicianId() && (
                  <p className="text-xs text-[#757575] bg-[#EBEBEB] border border-[#DDDDDD] rounded-md px-3 py-2">
                    Select a technician or All technicians to enable quick add.
                  </p>
                )}
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#757575] pointer-events-none" />
                  <Input
                    placeholder="Search by name or code..."
                    value={inventorySearchQuery}
                    onChange={(e) => setInventorySearchQuery(e.target.value)}
                    className={cn('pl-9', assignFieldClass)}
                  />
                </div>
                <div className="rounded-md border border-[#DDDDDD] bg-white flex flex-col overflow-hidden min-h-[22rem] h-[min(28rem,calc(92dvh-17rem))] sm:min-h-[20rem] sm:h-[min(24rem,48vh)]">
                  {filteredInventoryItems.length === 0 ? (
                    <div className="py-8 px-4 text-center text-sm text-[#757575] flex-1 flex items-center justify-center">
                      {inventoryItems.length === 0 ? 'No products in main inventory.' : debouncedInventorySearchQuery.trim() ? 'No products match your search.' : 'No products.'}
                    </div>
                  ) : (
                    <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 w-full min-w-0 touch-pan-y [-webkit-overflow-scrolling:touch]">
                      {filteredInventoryItems.map((item) => {
                        const qty = item.quantity ?? 0;
                        const isAll = assignTargetMode === 'all';
                        const minQty = isAll ? technicians.length : 1;
                        const canAdd = resolveAssignTechnicianId() && qty >= minQty;
                        return (
                          <div
                            key={item.id}
                            className="group flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2.5 sm:py-3 border-b last:border-b-0 active:bg-[#EBEBEB] w-full min-h-[4.25rem]"
                          >
                            <div className="min-w-0 flex-1 overflow-hidden pr-1">
                              <span className="text-sm font-medium text-[#333333] line-clamp-2 sm:truncate block leading-snug">
                                {item.product_name}
                              </span>
                              {item.code && (
                                <span className="text-xs text-[#757575] truncate block">{item.code}</span>
                              )}
                              <span className="text-xs text-[#757575] truncate block">
                                Available: {qty}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 w-10 min-w-[2.5rem] shrink-0 rounded border-[#DDDDDD] bg-[#EBEBEB] text-[#333333] hover:bg-[#E0E0E0] disabled:opacity-40 touch-manipulation p-0"
                              onClick={() => {
                                hapticTap();
                                handleQuickAssignInventory(item.id);
                              }}
                              disabled={!canAdd}
                              title={
                                !resolveAssignTechnicianId()
                                  ? 'Select assign target first'
                                  : isAll
                                    ? `Assign 1 to each (need ${minQty} in stock)`
                                    : 'Assign 1 unit'
                              }
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
            )}

            <div className={cn(!selectedItem && 'space-y-3 shrink-0')}>
            <div>
              <Label htmlFor="inventory" className={assignLabelClass}>
                Product *
              </Label>
              <Popover open={inventorySearchOpen} onOpenChange={setInventorySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={inventorySearchOpen}
                    className={cn('justify-between font-normal', assignFieldClass)}
                    disabled={!!selectedItem}
                  >
                    <span className="truncate text-left flex-1">{selectedInventoryName}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-0 z-[60]"
                  align="start"
                  sideOffset={4}
                >
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Search products by name or code..." 
                      value={inventorySearchQuery}
                      onValueChange={setInventorySearchQuery}
                      className="h-11 text-sm"
                    />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty className="py-6 text-center text-sm text-gray-500">No products found.</CommandEmpty>
                      <CommandGroup>
                        {filteredInventoryItems.length > 0 ? (
                          <>
                            {filteredInventoryItems.slice(0, 20).map((item) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.product_name} ${item.code || ''}`.trim()}
                                onSelect={() => {
                                  setFormData({ ...formData, inventory_id: item.id });
                                  setInventorySearchOpen(false);
                                  setInventorySearchQuery('');
                                }}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0",
                                      formData.inventory_id === item.id ? "opacity-100 text-[#333333]" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-sm font-medium truncate">{item.product_name}</span>
                                    {item.code && (
                                      <span className="text-xs text-gray-500">Code: {item.code}</span>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </>
                        ) : (
                          <CommandItem disabled className="py-6 text-center text-sm text-gray-500">Loading products...</CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="quantity" className={assignLabelClass}>Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                inputMode="numeric"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="Quantity"
                className={assignFieldClass}
              />
            </div>

            {!selectedItem && resolveAssignTechnicianId() && (
              <div className="rounded-md border border-[#DDDDDD] p-3 space-y-2 bg-[#EBEBEB]/50">
                <p className="text-xs text-[#757575]">
                  Assign every product in main inventory that has enough stock. Uses the quantity above for each product
                  {assignTargetMode === 'all'
                    ? ` × ${technicians.length} technicians.`
                    : '.'}
                </p>
                <AlertDialog open={bulkAssignConfirmOpen} onOpenChange={setBulkAssignConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      disabled={bulkAssigning || !resolveAssignTechnicianId()}
                    >
                      {bulkAssigning ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Assigning all items…
                        </>
                      ) : (
                        <>
                          <Package className="w-4 h-4 mr-2" />
                          Assign all items to{' '}
                          {assignTargetMode === 'all' ? 'all technicians' : 'selected technician'}
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md sm:w-full">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Assign all inventory items?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will assign {formData.quantity || '1'} unit(s) of each product with enough stock to{' '}
                        {assignTargetMode === 'all'
                          ? `all ${technicians.length} technicians`
                          : getTechnicianName(resolveAssignTechnicianId())}
                        . Products without enough stock will be skipped.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleAssignAllItems} disabled={bulkAssigning}>
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            </div>
          </div>
          <DialogFooter
            className={cn(
              'shrink-0 gap-2 pt-3 mt-auto border-t bg-background',
              'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
              'flex-col-reverse sm:flex-row sm:justify-end'
            )}
          >
            <Button
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false);
                setEditDialogOpen(false);
                setSelectedItem(null);
              }}
              className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveInventory}
              className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation"
            >
              {selectedItem ? 'Update' : 'Assign selected product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedTechnicianId && (
        <TechnicianTopUpDialog
          technicianId={selectedTechnicianId}
          open={topUpDialogOpen}
          onOpenChange={setTopUpDialogOpen}
          onSuccess={() => loadTechnicianInventory(selectedTechnicianId, true)}
        />
      )}
    </div>
  );
};

export default TechnicianInventoryManagement;
