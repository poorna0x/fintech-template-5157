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
import { User, Plus, Edit, Trash2, Package, Search, Check, ChevronsUpDown, X } from 'lucide-react';
import { db } from '@/lib/supabase';
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

  // Load data on mount
  useEffect(() => {
    loadTechnicians();
    loadInventoryItems();
    loadTechnicianInventory();
  }, [loadTechnicians, loadInventoryItems, loadTechnicianInventory]);

  // Reload when technician filter changes
  useEffect(() => {
    if (selectedTechnicianId) {
      loadTechnicianInventory(selectedTechnicianId);
    } else {
      loadTechnicianInventory();
    }
  }, [selectedTechnicianId, loadTechnicianInventory]);

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
      if (selectedItem) {
        // Update existing item
        const { error } = await db.technicianInventory.update(selectedItem.id, {
          quantity
        });
        if (error) throw error;
        toast.success('Technician inventory updated successfully');
      } else {
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
      const cacheKey = selectedTechnicianId ? `tech_inventory_${selectedTechnicianId}` : 'all_tech_inventory';
      inventoryCache.clear(cacheKey);
      if (selectedTechnicianId) {
        await loadTechnicianInventory(selectedTechnicianId, true);
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
      const { error } = await db.technicianInventory.delete(selectedItem.id);
      if (error) throw error;
      toast.success('Inventory item removed from technician');

      // Clear cache and reload data
      const cacheKey = selectedTechnicianId ? `tech_inventory_${selectedTechnicianId}` : 'all_tech_inventory';
      inventoryCache.clear(cacheKey);
      if (selectedTechnicianId) {
        await loadTechnicianInventory(selectedTechnicianId, true);
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
    
    // Limit results for performance
    return filtered.slice(0, 20);
  }, [inventoryItems, debouncedInventorySearchQuery, inventoryUsageCount]);

  // Get selected inventory item name
  const selectedInventoryName = useMemo(() => {
    if (!formData.inventory_id) return 'Select product...';
    const item = inventoryItems.find(i => i.id === formData.inventory_id);
    return item ? `${item.product_name}${item.code ? ` (${item.code})` : ''}` : 'Select product...';
  }, [formData.inventory_id, inventoryItems]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Technician Inventory Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Technician Filter */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1">
              <Label htmlFor="technician-select">Filter by Technician</Label>
              <Select 
                value={selectedTechnicianId || undefined} 
                onValueChange={(value) => {
                  if (value === "__all__" || !value) {
                    setSelectedTechnicianId("");
                  } else {
                    setSelectedTechnicianId(value);
                  }
                }}
              >
                <SelectTrigger id="technician-select" className="w-full">
                  <SelectValue placeholder="All Technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Technicians</SelectItem>
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
            <Button onClick={handleAddInventory} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Assign Inventory
            </Button>
          </div>

          {/* Item Search */}
          <div>
            <Label htmlFor="item-search">Search Items</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                id="item-search"
                type="text"
                placeholder="Search by product name or code..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="pl-10 pr-10"
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

          {/* Summary */}
          {selectedTechnician && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-900">
                Showing inventory for: <span className="font-semibold">{selectedTechnician.full_name}</span> ({selectedTechnician.employee_id})
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Total items: {filteredInventory.length}
              </p>
            </div>
          )}

          {/* Inventory Table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No inventory items assigned yet.</p>
              {selectedTechnicianId && (
                <p className="text-sm mt-2">Click "Assign Inventory" to add items to this technician.</p>
              )}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technician</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.technician 
                          ? `${item.technician.full_name} (${item.technician.employee_id})`
                          : getTechnicianName(item.technician_id)}
                      </TableCell>
                      <TableCell>
                        {item.inventory
                          ? `${item.inventory.product_name}${item.inventory.code ? ` (${item.inventory.code})` : ''}`
                          : getInventoryItemName(item.inventory_id)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditInventory(item)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedItem(item)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Inventory Item?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove this inventory item from the technician? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedItem(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteInventory} className="bg-red-600 hover:bg-red-700">
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedItem ? 'Edit Technician Inventory' : 'Assign Inventory to Technician'}</DialogTitle>
            <DialogDescription>
              {selectedItem ? 'Update the quantity for this inventory item.' : 'Assign inventory items to a technician. Search by product name or code.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="technician">Technician *</Label>
              <Select
                value={formData.technician_id || undefined}
                onValueChange={(value) => setFormData({ ...formData, technician_id: value })}
                disabled={!!selectedItem}
              >
                <SelectTrigger id="technician">
                  <SelectValue placeholder="Select technician" />
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
            <div>
              <Label htmlFor="inventory">Product *</Label>
              <Popover open={inventorySearchOpen} onOpenChange={setInventorySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={inventorySearchOpen}
                    className="w-full justify-between"
                    disabled={!!selectedItem}
                  >
                    <span className="truncate">{selectedInventoryName}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="Search products by name or code..." 
                      value={inventorySearchQuery}
                      onValueChange={setInventorySearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No products found.</CommandEmpty>
                      <CommandGroup>
                        {filteredInventoryItems.length > 0 ? (
                          <>
                            {filteredInventoryItems.slice(0, 10).map((item) => (
                              <CommandItem
                                key={item.id}
                                value={item.id}
                                onSelect={() => {
                                  setFormData({ ...formData, inventory_id: item.id });
                                  setInventorySearchOpen(false);
                                  setInventorySearchQuery('');
                                }}
                                className="flex items-center gap-2"
                              >
                                <Check
                                  className={cn(
                                    "h-4 w-4",
                                    formData.inventory_id === item.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span>{item.product_name}</span>
                                {item.code && (
                                  <span className="text-xs text-gray-500">({item.code})</span>
                                )}
                              </CommandItem>
                            ))}
                          </>
                        ) : (
                          <CommandItem disabled>Loading products...</CommandItem>
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
          <DialogFooter>
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
    </div>
  );
};

export default TechnicianInventoryManagement;
