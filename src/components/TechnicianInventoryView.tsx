import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Plus, Search, Check, ChevronsUpDown, RefreshCw, X } from 'lucide-react';
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
  const lastLoadTimeRef = useRef<number>(0);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    const now = Date.now();
    const cacheValid = now - lastLoadTimeRef.current < CACHE_DURATION;

    // Check cache first
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
    
    // Check cache first
    if (!forceReload) {
      const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
      if (cached) {
        setMainInventory(cached);
        return;
      }
    }

    try {
      setMainInventoryLoading(true);
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

  // Load technician inventory on mount
  useEffect(() => {
    loadMyInventory();
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
    if (isNaN(quantity) || quantity < 0) {
      toast.error('Quantity must be a valid number');
      return;
    }

    try {
      // Check if technician already has this item
      const existingItem = myInventory.find(item => item.inventory_id === requestFormData.inventory_id);
      
      if (existingItem) {
        // Update existing quantity
        const newQuantity = existingItem.quantity + quantity;
        const { error } = await db.technicianInventory.update(existingItem.id, {
          quantity: newQuantity
        });
        if (error) throw error;
        toast.success(`Added ${quantity} more items. Total: ${newQuantity}`);
      } else {
        // Create new assignment
        const { error } = await db.technicianInventory.upsert({
          technician_id: technicianId,
          inventory_id: requestFormData.inventory_id,
          quantity
        });
        if (error) throw error;
        toast.success('Inventory item added successfully');
      }

      // Reload inventory and clear cache
      inventoryCache.clear(`tech_inventory_${technicianId}`);
      await loadMyInventory(true);
      
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
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0 -mt-1 -mr-1"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  inventoryCache.clear(`tech_inventory_${technicianId}`);
                  loadMyInventory(true);
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
    </div>
  );
};

export default TechnicianInventoryView;
