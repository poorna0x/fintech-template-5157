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
import { User, Plus, Edit, Trash2, Package, Search, Check, ChevronsUpDown, X, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { db } from '@/lib/supabase';
import TechnicianTopUpDialog from '@/components/TechnicianTopUpDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inventoryCache, debounce } from '@/lib/inventoryCache';

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
      const { data, error } = await db.technicians.getAll();
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

  // Filter technician inventory based on selected technician and item search (using debounced query)
  const filteredInventory = useMemo(() => {
    let filtered = technicianInventory;
    
    // Filter by technician
    if (selectedTechnicianId) {
      filtered = filtered.filter(item => item.technician_id === selectedTechnicianId);
    }
    
    // Filter by debounced item search query
    if (debouncedItemSearchQuery.trim()) {
      const query = debouncedItemSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const inventory = item.inventory;
        if (!inventory) {
          const mainItem = inventoryItems.find(i => i.id === item.inventory_id);
          if (mainItem) {
            const nameMatch = mainItem.product_name?.toLowerCase().includes(query);
            const codeMatch = mainItem.code?.toLowerCase().includes(query);
            return nameMatch || codeMatch;
          }
          return false;
        }
        const nameMatch = inventory.product_name?.toLowerCase().includes(query);
        const codeMatch = inventory.code?.toLowerCase().includes(query);
        return nameMatch || codeMatch;
      });
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

  // Handle add inventory
  const handleAddInventory = () => {
    setFormData({
      technician_id: selectedTechnicianId || '',
      inventory_id: '',
      quantity: ''
    });
    setInventorySearchQuery('');
    setInventorySearchOpen(false);
    setAddDialogOpen(true);
  };

  // Quick assign 1 qty from main inventory to selected technician (or 1 to each when "All")
  const handleQuickAssignInventory = async (inventoryId: string) => {
    const technicianId = formData.technician_id || selectedTechnicianId;
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

      if (isAll) {
        for (const tech of technicians) {
          const existingTechItem = technicianInventory.find(
            i => i.technician_id === tech.id && i.inventory_id === inventoryId
          );
          if (existingTechItem) {
            const { error } = await db.technicianInventory.update(existingTechItem.id, {
              quantity: existingTechItem.quantity + 1
            });
            if (error) throw error;
          } else {
            const { error } = await db.technicianInventory.upsert({
              technician_id: tech.id,
              inventory_id: inventoryId,
              quantity: 1
            });
            if (error) throw error;
          }
        }
        toast.success(`1 qty assigned to all ${technicians.length} technicians`);
        technicians.forEach(t => inventoryCache.clear(`tech_inventory_${t.id}`));
        inventoryCache.clear('all_tech_inventory');
      } else {
        const existingTechItem = technicianInventory.find(
          i => i.technician_id === technicianId && i.inventory_id === inventoryId
        );
        if (existingTechItem) {
          const { error } = await db.technicianInventory.update(existingTechItem.id, {
            quantity: existingTechItem.quantity + 1
          });
          if (error) throw error;
        } else {
          const { error } = await db.technicianInventory.upsert({
            technician_id: technicianId,
            inventory_id: inventoryId,
            quantity: 1
          });
          if (error) throw error;
        }
        toast.success('1 qty assigned to technician');
        inventoryCache.clear(`tech_inventory_${technicianId}`);
      }

      inventoryCache.clear('inventory_items');
      await loadInventoryItems(true);
      if (isAll) {
        await loadTechnicianInventory(undefined, true);
      } else {
        await loadTechnicianInventory(technicianId, true);
        setLoadedForTechnicianId(technicianId);
      }
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
    if (!formData.technician_id || !formData.inventory_id || !formData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const quantity = parseInt(formData.quantity);
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
      } else if (formData.technician_id === ASSIGN_ALL_TECHNICIANS) {
        // Assign to all technicians
        const count = technicians.length;
        if (count === 0) {
          toast.error('No technicians to assign to');
          return;
        }
        const totalNeeded = quantity * count;
        const availableQty = mainItem.quantity ?? 0;
        if (availableQty < totalNeeded) {
          toast.error(`Insufficient stock. Available: ${availableQty}, Needed: ${totalNeeded} (${quantity} × ${count} technicians)`);
          return;
        }

        // Subtract total from main inventory
        const newMainQuantity = availableQty - totalNeeded;
        const { error: updateMainError } = await db.inventory.update(formData.inventory_id, {
          quantity: newMainQuantity
        });
        if (updateMainError) throw updateMainError;

        for (const tech of technicians) {
          const existingTechItem = technicianInventory.find(
            i => i.technician_id === tech.id && i.inventory_id === formData.inventory_id
          );
          if (existingTechItem) {
            const { error } = await db.technicianInventory.update(existingTechItem.id, {
              quantity: existingTechItem.quantity + quantity
            });
            if (error) throw error;
          } else {
            const { error } = await db.technicianInventory.upsert({
              technician_id: tech.id,
              inventory_id: formData.inventory_id,
              quantity
            });
            if (error) throw error;
          }
        }
        toast.success(`Assigned ${quantity} qty to all ${count} technicians`);
      } else {
        // Create new item - single technician
        if (mainItem.quantity < quantity) {
          toast.error(`Insufficient stock. Available: ${mainItem.quantity}, Requested: ${quantity}`);
          return;
        }

        // Subtract from main inventory
        const newMainQuantity = mainItem.quantity - quantity;
        const { error: updateMainError } = await db.inventory.update(formData.inventory_id, {
          quantity: newMainQuantity
        });
        if (updateMainError) throw updateMainError;

        // Create new item (use upsert to handle duplicates)
        const { error } = await db.technicianInventory.upsert({
          technician_id: formData.technician_id,
          inventory_id: formData.inventory_id,
          quantity
        });
        if (error) throw error;
        toast.success('Inventory item assigned to technician successfully');
      }

      // Clear cache and reload data
      if (formData.technician_id === ASSIGN_ALL_TECHNICIANS) {
        technicians.forEach(t => inventoryCache.clear(`tech_inventory_${t.id}`));
        inventoryCache.clear('all_tech_inventory');
      } else {
        const cacheKey = selectedTechnicianId ? `tech_inventory_${selectedTechnicianId}` : 'all_tech_inventory';
        inventoryCache.clear(cacheKey);
      }
      inventoryCache.clear('inventory_items');
      await loadInventoryItems(true);
      if (formData.technician_id === ASSIGN_ALL_TECHNICIANS) {
        await loadTechnicianInventory(undefined, true);
      } else if (selectedTechnicianId) {
        await loadTechnicianInventory(selectedTechnicianId, true);
        setLoadedForTechnicianId(selectedTechnicianId);
      } else {
        await loadTechnicianInventory(undefined, true);
      }

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

      // Clear cache and reload data
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
    let filtered = inventoryItems;
    
    // Filter by debounced search query
    if (debouncedInventorySearchQuery.trim()) {
      const query = debouncedInventorySearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const nameMatch = item.product_name?.toLowerCase().includes(query);
        const codeMatch = item.code?.toLowerCase().includes(query);
        return nameMatch || codeMatch;
      });
    }
    
    // Sort by usage count (most used first), then by name (only if needed)
    if (filtered.length > 0) {
      filtered = [...filtered].sort((a, b) => {
        const aUsage = inventoryUsageCount[a.id] || 0;
        const bUsage = inventoryUsageCount[b.id] || 0;
        if (bUsage !== aUsage) {
          return bUsage - aUsage; // Most used first
        }
        return a.product_name.localeCompare(b.product_name);
      });
    }
    
    // Return all filtered results (Command component will handle display)
    return filtered;
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
            <div className="border rounded-lg overflow-hidden">
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
          setFormData({
            technician_id: '',
            inventory_id: '',
            quantity: ''
          });
        }
      }}>
        <DialogContent className={cn(
          "max-h-[90vh] p-4 sm:p-6",
          !selectedItem && (formData.technician_id || selectedTechnicianId)
            ? "w-[calc(100%-2rem)] max-w-md sm:max-w-lg overflow-hidden flex flex-col [&>div]:min-w-0"
            : "sm:max-w-[500px] overflow-y-auto"
        )}>
          <DialogHeader className="px-1 shrink-0 space-y-1.5">
            <DialogTitle className="text-base sm:text-lg">{selectedItem ? 'Edit Technician Inventory' : 'Assign Inventory to Technician'}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedItem ? 'Update the quantity for this inventory item.' : 'Assign inventory items to a technician. Search by product name or code.'}
            </DialogDescription>
          </DialogHeader>
          <div className={cn(
            "space-y-4 py-2 sm:py-4 min-w-0",
            !selectedItem && (formData.technician_id || selectedTechnicianId) && "flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
          )}>
            <div>
              <Label htmlFor="technician" className="text-sm font-medium">Technician *</Label>
              <Select
                value={formData.technician_id || undefined}
                onValueChange={(value) => setFormData({ ...formData, technician_id: value })}
                disabled={!!selectedItem}
              >
                <SelectTrigger id="technician" className="h-10 text-sm">
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ASSIGN_ALL_TECHNICIANS} className="text-sm font-medium">
                    All technicians
                  </SelectItem>
                  {technicians.length > 0 ? (
                    technicians.map(tech => (
                      <SelectItem key={tech.id} value={tech.id} className="text-sm">
                        {tech.full_name} ({tech.employee_id})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled className="text-sm">Loading technicians...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Quick add from main inventory - list with + button (mobile responsive like Add Part) */}
            {!selectedItem && (formData.technician_id || selectedTechnicianId) && (
              <div className="flex flex-col min-h-0 min-w-0 flex-1 py-0 overflow-hidden space-y-2">
                <Label className="text-sm font-medium shrink-0">Quick add from main inventory</Label>
                <p className="text-xs text-muted-foreground shrink-0">
                  {formData.technician_id === ASSIGN_ALL_TECHNICIANS
                    ? `Search and click + to assign 1 qty to each of the ${technicians.length} technicians.`
                    : 'Search and click + to assign 1 qty to this technician.'}
                </p>
                <div className="relative shrink-0 mb-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search by name or code..."
                    value={inventorySearchQuery}
                    onChange={(e) => setInventorySearchQuery(e.target.value)}
                    className="pl-9 h-10 sm:h-11 text-sm"
                  />
                </div>
                <div className="rounded-lg border flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden w-full">
                  {filteredInventoryItems.length === 0 ? (
                    <div className="py-8 px-4 text-center text-sm text-gray-500">
                      {inventoryItems.length === 0 ? 'No products in main inventory.' : debouncedInventorySearchQuery.trim() ? 'No products match your search.' : 'No products.'}
                    </div>
                  ) : (
                    <div className="overflow-y-auto overflow-x-hidden max-h-[min(50vh,280px)] sm:max-h-[320px] w-full min-w-0 pl-0 pr-4">
                      {                    filteredInventoryItems.map((item) => {
                        const qty = item.quantity ?? 0;
                        const isAll = formData.technician_id === ASSIGN_ALL_TECHNICIANS;
                        const minQty = isAll ? technicians.length : 1;
                        const canAdd = qty >= minQty;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 sm:gap-3 pl-3 pr-2 py-2.5 border-b last:border-b-0 bg-background hover:bg-muted/50 w-full max-w-full overflow-hidden"
                          >
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <span className="text-sm font-medium truncate block">{item.product_name}</span>
                              {item.code && (
                                <span className="text-xs text-gray-500 truncate block">Code: {item.code}</span>
                              )}
                              {qty >= 0 && (
                                <span className="text-xs text-muted-foreground truncate block">Available: {qty}</span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 w-8 min-w-[2rem] shrink-0"
                              onClick={() => handleQuickAssignInventory(item.id)}
                              disabled={!canAdd}
                              title={isAll ? `Assign 1 to each (need ${minQty})` : 'Assign 1 qty'}
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

            <div>
              <Label htmlFor="inventory" className="text-sm font-medium">Product *</Label>
              <Popover open={inventorySearchOpen} onOpenChange={setInventorySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={inventorySearchOpen}
                    className="w-full justify-between h-10 text-sm"
                    disabled={!!selectedItem}
                  >
                    <span className="truncate text-left flex-1">{selectedInventoryName}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
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
                                      formData.inventory_id === item.id ? "opacity-100 text-blue-600" : "opacity-0"
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
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="Enter quantity"
              />
            </div>
          </div>
          <DialogFooter className={cn(!selectedItem && (formData.technician_id || selectedTechnicianId) && "shrink-0")}>
            <Button variant="outline" onClick={() => {
              setAddDialogOpen(false);
              setEditDialogOpen(false);
              setSelectedItem(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveInventory}>
              {selectedItem ? 'Update' : 'Assign'}
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
