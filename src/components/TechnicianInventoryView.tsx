import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Plus, Search, Check, ChevronsUpDown, RefreshCw, ArrowUpCircle, Pencil } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inventoryCache, debounce } from '@/lib/inventoryCache';

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

interface TechnicianInventoryViewProps {
  technicianId: string;
  onClose?: () => void;
}

const TechnicianInventoryView: React.FC<TechnicianInventoryViewProps> = ({ technicianId, onClose }) => {
  const [myInventory, setMyInventory] = useState<TechnicianInventoryItem[]>([]);
  const [mainInventory, setMainInventory] = useState<InventoryItem[]>([]);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestFormData, setRequestFormData] = useState({
    inventory_id: '',
    quantity: ''
  });
  const [inventorySearchOpen, setInventorySearchOpen] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [mainInventoryLoading, setMainInventoryLoading] = useState(false);
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [topUpItems, setTopUpItems] = useState<Array<{
    inventory_id: string;
    quantity_used: number;
    quantity_needed: number;
    last_used_at: string;
    inventory?: { id: string; product_name: string; code: string | null };
  }>>([]);
  const [currentTopUpIndex, setCurrentTopUpIndex] = useState(0);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [editableTopUpQty, setEditableTopUpQty] = useState<string>('');
  const [isTopUpQtyEditing, setIsTopUpQtyEditing] = useState(false);
  const [topUpLastWorkingDayLabel, setTopUpLastWorkingDayLabel] = useState<string>('');
  const topUpQtyInputRef = useRef<HTMLInputElement>(null);
  const lastLoadTimeRef = useRef<number>(0);
  const CACHE_DURATION = 30 * 1000; // 30 seconds

  const toDateKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Safety check - don't render if no technicianId
  if (!technicianId) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Technician ID not available</p>
      </div>
    );
  }

  // Debounced search query update
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(inventorySearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [inventorySearchQuery]);

  // Load technician's inventory with caching
  const loadMyInventory = useCallback(async (forceReload = false) => {
    const cacheKey = `tech_inventory_${technicianId}`;
    
    // If force reload, clear cache first
    if (forceReload) {
      inventoryCache.clear(cacheKey);
      lastLoadTimeRef.current = 0; // Reset cache time
    }
    
    const now = Date.now();
    const cacheValid = now - lastLoadTimeRef.current < CACHE_DURATION;

    // Check cache first (only if not forcing reload)
    if (!forceReload && cacheValid) {
      const cached = inventoryCache.get<TechnicianInventoryItem[]>(cacheKey);
      if (cached) {
        setMyInventory(cached);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      // Always fetch fresh data from database to get latest inventory details
      const { data, error } = await db.technicianInventory.getByTechnician(technicianId);
      if (error) throw error;
      const inventoryData = data || [];
      setMyInventory(inventoryData);
      inventoryCache.set(cacheKey, inventoryData);
      lastLoadTimeRef.current = now;
    } catch (error) {
      console.error('Error loading technician inventory:', error);
      toast.error('Failed to load your inventory');
    } finally {
      setLoading(false);
    }
  }, [technicianId]);

  // Load main inventory with caching (only when dialog opens)
  const loadMainInventory = useCallback(async (forceReload = false) => {
    const cacheKey = 'main_inventory';
    
    // If force reload, clear cache first
    if (forceReload) {
      inventoryCache.clear(cacheKey);
    }
    
    // Check cache first (only if not forcing reload)
    if (!forceReload) {
      const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
      if (cached) {
        setMainInventory(cached);
        return;
      }
    }

    try {
      setMainInventoryLoading(true);
      // Always fetch fresh data from database
      const { data, error } = await db.inventory.getAll();
      if (error) throw error;
      const inventoryData = data || [];
      setMainInventory(inventoryData);
      inventoryCache.set(cacheKey, inventoryData);
    } catch (error) {
      console.error('Error loading main inventory:', error);
      toast.error('Failed to load main inventory');
    } finally {
      setMainInventoryLoading(false);
    }
  }, []);

  // Load technician inventory on mount and when component becomes visible
  useEffect(() => {
    // Always fetch fresh data on mount to ensure we have latest inventory details
    loadMyInventory(true);
  }, [loadMyInventory]);

  // Load main inventory only when dialog opens (lazy loading)
  useEffect(() => {
    if (requestDialogOpen && mainInventory.length === 0) {
      loadMainInventory();
    }
  }, [requestDialogOpen, mainInventory.length, loadMainInventory]);

  // Filter and sort inventory items for search (using debounced query)
  const filteredInventoryItems = useMemo(() => {
    let filtered = mainInventory;
    
    // Filter by debounced search query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const nameMatch = item.product_name?.toLowerCase().includes(query);
        const codeMatch = item.code?.toLowerCase().includes(query);
        return nameMatch || codeMatch;
      });
    }
    
    // Sort by name (only if needed)
    if (filtered.length > 0) {
      filtered = [...filtered].sort((a, b) => a.product_name.localeCompare(b.product_name));
    }
    
    // Limit results for performance
    return filtered.slice(0, 20);
  }, [mainInventory, debouncedSearchQuery]);

  // Get selected inventory item name
  const selectedInventoryName = useMemo(() => {
    if (!requestFormData.inventory_id) return 'Select product...';
    const item = mainInventory.find(i => i.id === requestFormData.inventory_id);
    return item ? `${item.product_name}${item.code ? ` (${item.code})` : ''}` : 'Select product...';
  }, [requestFormData.inventory_id, mainInventory]);

  // Handle add inventory
  const handleRequestInventory = () => {
    setRequestFormData({
      inventory_id: '',
      quantity: ''
    });
    setInventorySearchQuery('');
    setInventorySearchOpen(false);
    setRequestDialogOpen(true);
  };

  // Handle submit add
  const handleSubmitRequest = async () => {
    if (!requestFormData.inventory_id || !requestFormData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const quantity = parseInt(requestFormData.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Quantity must be a valid positive number');
      return;
    }

    try {
      // Check available quantity in main inventory
      const mainItem = mainInventory.find(i => i.id === requestFormData.inventory_id);
      if (!mainItem) {
        toast.error('Product not found in main inventory');
        return;
      }

      if (mainItem.quantity < quantity) {
        toast.error(`Insufficient stock. Available: ${mainItem.quantity}, Requested: ${quantity}`);
        return;
      }

      // Check if technician already has this item
      const existingItem = myInventory.find(item => item.inventory_id === requestFormData.inventory_id);
      
      if (existingItem) {
        // Update existing quantity
        const newQuantity = existingItem.quantity + quantity;
        const { error } = await db.technicianInventory.update(existingItem.id, {
          quantity: newQuantity
        });
        if (error) throw error;
      } else {
        // Create new assignment
        const { error } = await db.technicianInventory.upsert({
          technician_id: technicianId,
          inventory_id: requestFormData.inventory_id,
          quantity
        });
        if (error) throw error;
      }

      // Subtract from main inventory
      const newMainQuantity = mainItem.quantity - quantity;
      if (newMainQuantity < 0) {
        throw new Error('Insufficient quantity in main inventory');
      }

      const { error: updateMainError } = await db.inventory.update(requestFormData.inventory_id, {
        quantity: newMainQuantity
      });
      if (updateMainError) throw updateMainError;

      toast.success(`Added ${quantity} items. ${existingItem ? `Total: ${existingItem.quantity + quantity}` : ''}`);

      // Reload inventories and clear cache
      inventoryCache.clear(`tech_inventory_${technicianId}`);
      inventoryCache.clear('main_inventory');
      await loadMyInventory(true);
      await loadMainInventory(true);
      
      setRequestDialogOpen(false);
      setRequestFormData({
        inventory_id: '',
        quantity: ''
      });
      setInventorySearchQuery('');
    } catch (error: any) {
      console.error('Error requesting inventory:', error);
      toast.error(error?.message || 'Failed to request inventory');
    }
  };

  // Get inventory item name
  const getInventoryItemName = (inventoryId: string) => {
    const item = mainInventory.find(i => i.id === inventoryId);
    return item ? `${item.product_name}${item.code ? ` (${item.code})` : ''}` : 'Unknown';
  };

  // Top Up: show ONLY parts from technician's LAST WORKING DAY. Last working day = from JOBS table (max completed_at), not from parts — so if you delete all parts from that day, list is empty.
  const handleTopUp = async () => {
    try {
      setTopUpLoading(true);
      inventoryCache.clear(`tech_inventory_${technicianId}`);
      inventoryCache.clear('main_inventory');
      if (mainInventory.length === 0) await loadMainInventory(true);

      const [jobsResult, partsResult] = await Promise.all([
        db.jobs.getByTechnicianId(technicianId),
        db.jobPartsUsed.getByTechnician(technicianId),
      ]);
      const jobs = jobsResult.data || [];
      const allPartsUsed = partsResult.data || []; // Live from DB — if you deleted parts, they won't be here
      const jobsError = jobsResult.error;
      const partsError = partsResult.error;

      if (jobsError) throw jobsError;
      if (partsError) throw partsError;

      // Last working day = max COMPLETED job date only (from jobs table — so deleting parts doesn't change this)
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

      // Only parts whose JOB was completed on last working day (so if you deleted all parts from that day = empty)
      const partsOnLastDay = allPartsUsed.filter((part: any) => getPartJobDayKey(part) === lastWorkingDayKey);

      // Dedupe by (job_id, inventory_id) then group by inventory_id and sum
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

      const groupedItems = new Map<string, {
        inventory_id: string;
        quantity_used: number;
        last_used_at: string;
        inventory?: { id: string; product_name: string; code: string | null };
      }>();
      byJobAndInv.forEach(({ quantity_used, last_used_at, part }) => {
        const key = part.inventory_id;
        if (groupedItems.has(key)) {
          const existing = groupedItems.get(key)!;
          existing.quantity_used += quantity_used;
          if (new Date(last_used_at) > new Date(existing.last_used_at)) existing.last_used_at = last_used_at;
        } else {
          groupedItems.set(key, {
            inventory_id: part.inventory_id,
            quantity_used,
            last_used_at,
            inventory: part.inventory,
          });
        }
      });

      const itemsArray = Array.from(groupedItems.values())
        .map((item) => ({ ...item, quantity_needed: item.quantity_used }))
        .sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime());

      if (itemsArray.length === 0) {
        const lastDayLabel = lastWorkingDayKey
          ? new Date(lastWorkingDayKey + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'that day';
        toast.info(`No parts were used on your last working day (${lastDayLabel}). Data is from the database — if you removed parts from the job, the list will be empty.`);
        return;
      }

      const lastDayLabel = new Date(lastWorkingDayKey + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      setTopUpLastWorkingDayLabel(lastDayLabel);
      setTopUpItems(itemsArray);
      setCurrentTopUpIndex(0);
      setEditableTopUpQty(itemsArray[0] ? String(itemsArray[0].quantity_used) : '');
      setIsTopUpQtyEditing(false);
      setTopUpDialogOpen(true);
    } catch (error: any) {
      console.error('Error loading top up items:', error);
      toast.error(error?.message || 'Failed to load used items');
    } finally {
      setTopUpLoading(false);
    }
  };

  // Sync editable qty when current item changes (default = quantity_used, not 0)
  useEffect(() => {
    if (topUpDialogOpen && topUpItems.length > 0 && currentTopUpIndex < topUpItems.length) {
      const item = topUpItems[currentTopUpIndex];
      if (item) setEditableTopUpQty(String(item.quantity_used));
      setIsTopUpQtyEditing(false);
    }
  }, [topUpDialogOpen, currentTopUpIndex, topUpItems]);

  useEffect(() => {
    if (isTopUpQtyEditing) {
      const t = setTimeout(() => topUpQtyInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isTopUpQtyEditing]);

  // Add to inventory (use editable qty), then show next
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
        const mainItem = mainInventory.find(i => i.id === currentItem.inventory_id);
        if (!mainItem) {
          toast.error('Product not found in main inventory');
          return;
        }
        if (mainItem.quantity < qty) {
          toast.error(`Insufficient stock in main inventory. Available: ${mainItem.quantity}, needed: ${qty}.`);
          return;
        }
        const existingItem = myInventory.find(item => item.inventory_id === currentItem.inventory_id);
        if (existingItem) {
          const { error } = await db.technicianInventory.update(existingItem.id, {
            quantity: existingItem.quantity + qty,
          });
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
      await loadMyInventory(true);
      await loadMainInventory(true);

      const nextItems = topUpItems.filter((_, i) => i !== currentTopUpIndex);
      setTopUpItems(nextItems);
      if (nextItems.length === 0) {
        toast.success('Done!');
        setTopUpDialogOpen(false);
        setCurrentTopUpIndex(0);
      } else {
        const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
        setCurrentTopUpIndex(nextIndex);
        setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
        setIsTopUpQtyEditing(false);
      }
    } catch (error: any) {
      console.error('Error topping up item:', error);
      toast.error(error?.message || 'Failed to top up item');
    } finally {
      setTopUpLoading(false);
    }
  };

  // Skip = just go to next (no persist)
  const handleSkipTopUp = () => {
    const nextItems = topUpItems.filter((_, i) => i !== currentTopUpIndex);
    setTopUpItems(nextItems);
    if (nextItems.length === 0) {
      setTopUpDialogOpen(false);
      setCurrentTopUpIndex(0);
    } else {
      const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
      setCurrentTopUpIndex(nextIndex);
      setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
      setIsTopUpQtyEditing(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                  My Inventory
                </CardTitle>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  View and manage your assigned inventory items
                </p>
              </div>
              {/* Close handled by parent Dialog's X — no duplicate */}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  // Clear all related caches and force fresh fetch
                  inventoryCache.clear(`tech_inventory_${technicianId}`);
                  inventoryCache.clear('main_inventory');
                  inventoryCache.clear('inventory_items');
                  lastLoadTimeRef.current = 0; // Reset cache timestamp
                  loadMyInventory(true);
                  loadMainInventory(true); // Also refresh main inventory cache
                }}
                className="w-full sm:w-auto"
                title="Refresh inventory"
              >
                <RefreshCw className="w-4 h-4 sm:mr-2" />
                <span className="sm:inline">Refresh</span>
              </Button>
              <Button onClick={handleRequestInventory} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="sm:inline">Add from Main Inventory</span>
              </Button>
              <Button 
                onClick={handleTopUp} 
                variant="outline"
                className="w-full sm:w-auto"
              >
                <ArrowUpCircle className="w-4 h-4 sm:mr-2" />
                <span className="sm:inline">Top Up Used Items</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : myInventory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No inventory items assigned yet.</p>
              <p className="text-sm mt-2">Click "Request from Main Inventory" to add items.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm">Product</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myInventory.map(item => {
                      const inventoryItem = item.inventory || mainInventory.find(i => i.id === item.inventory_id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-xs sm:text-sm">
                            <div className="flex flex-col">
                              <span>{inventoryItem
                                ? inventoryItem.product_name
                                : getInventoryItemName(item.inventory_id).split(' (')[0]}</span>
                              {inventoryItem?.code && (
                                <span className="text-xs text-gray-500">Code: {inventoryItem.code}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-xs sm:text-sm">
                            {item.quantity}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Inventory Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setRequestDialogOpen(false);
          setRequestFormData({
            inventory_id: '',
            quantity: ''
          });
          setInventorySearchQuery('');
          setInventorySearchOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1">
            <DialogTitle className="text-base sm:text-lg">Add Inventory from Main Stock</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Select a product from the main inventory and specify the quantity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 sm:py-4">
            <div>
              <Label htmlFor="inventory" className="text-sm font-medium">Product *</Label>
              <Popover open={inventorySearchOpen} onOpenChange={setInventorySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={inventorySearchOpen}
                    className="w-full justify-between h-10 text-sm"
                  >
                    <span className="truncate text-left flex-1">{selectedInventoryName}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                  <Command className="rounded-lg">
                    <CommandInput 
                      placeholder="Search products by name or code..." 
                      value={inventorySearchQuery}
                      onValueChange={setInventorySearchQuery}
                      className="h-11 text-sm"
                    />
                    <CommandList className="max-h-[300px]">
                      {mainInventoryLoading ? (
                        <div className="py-6 text-center text-sm text-gray-500">Loading products...</div>
                      ) : (
                        <>
                          <CommandEmpty className="py-6 text-center text-sm text-gray-500">
                            No products found.
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredInventoryItems.length > 0 ? (
                              <>
                                {filteredInventoryItems.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={item.id}
                                onSelect={() => {
                                  setRequestFormData({ ...requestFormData, inventory_id: item.id });
                                  setInventorySearchOpen(false);
                                  setInventorySearchQuery('');
                                }}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0",
                                      requestFormData.inventory_id === item.id ? "opacity-100 text-blue-600" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-sm font-medium truncate">{item.product_name}</span>
                                    {item.code && (
                                      <span className="text-xs text-gray-500">Code: {item.code}</span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 font-medium shrink-0">
                                  Stock: {item.quantity}
                                </span>
                              </CommandItem>
                                ))}
                              </>
                            ) : null}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={requestFormData.quantity}
                onChange={(e) => setRequestFormData({ ...requestFormData, quantity: e.target.value })}
                placeholder="Enter quantity"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRequestDialogOpen(false);
              setRequestFormData({
                inventory_id: '',
                quantity: ''
              });
            }}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRequest} disabled={!requestFormData.inventory_id || !requestFormData.quantity}>
              Add Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog — all parts used, one by one. Skip = next; Add = add qty (editable) then next. No persist. */}
      <Dialog open={topUpDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setTopUpDialogOpen(false);
          setTopUpItems([]);
          setCurrentTopUpIndex(0);
          setEditableTopUpQty('');
          setIsTopUpQtyEditing(false);
          setTopUpLastWorkingDayLabel('');
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              Top Up — Last working day: {topUpLastWorkingDayLabel || '—'} ({currentTopUpIndex + 1} of {topUpItems.length})
            </DialogTitle>
          </DialogHeader>
          {topUpItems.length > 0 && currentTopUpIndex < topUpItems.length && (() => {
            const item = topUpItems[currentTopUpIndex];
            return (
              <div className="space-y-4 py-4">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Product</Label>
                      <p className="text-base font-semibold mt-1">
                        {item.inventory?.product_name || 'Unknown Product'}
                      </p>
                      {item.inventory?.code && (
                        <p className="text-sm text-gray-500">Code: {item.inventory.code}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Quantity used</Label>
                      <p className="text-lg font-bold text-blue-600 mt-1">{item.quantity_used}</p>
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
                            <span className="text-lg font-semibold min-w-[2ch]">{editableTopUpQty || item.quantity_used}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => {
                                setEditableTopUpQty(String(item.quantity_used));
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
            );
          })()}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTopUpDialogOpen(false);
                setTopUpItems([]);
                setCurrentTopUpIndex(0);
              }}
              disabled={topUpLoading}
              className="order-2 sm:order-1"
            >
              Cancel
            </Button>
            <div className="flex gap-2 order-1 sm:order-2 sm:ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={handleSkipTopUp}
                disabled={topUpLoading}
              >
                Skip
              </Button>
              <Button
                onClick={handleConfirmTopUp}
                disabled={topUpLoading || topUpItems.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {topUpLoading ? 'Adding...' : 'Add to Inventory'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TechnicianInventoryView;
