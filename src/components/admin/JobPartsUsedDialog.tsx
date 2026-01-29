import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Package, Plus, Trash2, Check, ChevronsUpDown, X } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inventoryCache } from '@/lib/inventoryCache';
import { Job, Technician } from '@/types';

interface InventoryItem {
  id: string;
  product_name: string;
  code: string | null;
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
  const [inventorySearchOpen, setInventorySearchOpen] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    inventory_id: '',
    quantity: ''
  });
  const [loading, setLoading] = useState(true);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(inventorySearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [inventorySearchQuery]);

  // Load technician inventory
  const loadTechnicianInventory = useCallback(async () => {
    if (!technician?.id) return;

    const cacheKey = `tech_inventory_${technician.id}`;
    const cached = inventoryCache.get<TechnicianInventoryItem[]>(cacheKey);
    if (cached && cached.length > 0) {
      setTechnicianInventory(cached);
    }

    try {
      const { data, error } = await db.technicianInventory.getByTechnician(technician.id);
      if (error) throw error;
      const inventoryData = data || [];
      setTechnicianInventory(inventoryData);
      inventoryCache.set(cacheKey, inventoryData);
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
    } finally {
      setLoading(false);
    }
  }, [job?.id]);

  // Load data when dialog opens
  useEffect(() => {
    if (open && job && technician) {
      setLoading(true);
      loadTechnicianInventory();
      loadPartsUsed();
    }
  }, [open, job?.id, technician?.id, loadTechnicianInventory, loadPartsUsed]);

  // Load main inventory items if needed (for items without inventory relation)
  const [mainInventoryItems, setMainInventoryItems] = useState<InventoryItem[]>([]);
  
  useEffect(() => {
    if (open) {
      // Always load main inventory when dialog opens (for fallback)
      const cacheKey = 'inventory_items';
      const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
      if (cached) {
        setMainInventoryItems(cached);
      } else {
        db.inventory.getAll().then(({ data, error }) => {
          if (!error && data) {
            setMainInventoryItems(data);
            inventoryCache.set(cacheKey, data);
          }
        });
      }
    }
  }, [open]);

  // Filter technician inventory for search
  const filteredInventoryItems = useMemo(() => {
    // Enrich items with inventory data if missing
    const enrichedItems = technicianInventory.map(item => {
      if (item.inventory) {
        return item;
      }
      // Try to find inventory from mainInventoryItems
      const inventoryItem = mainInventoryItems.find(i => i.id === item.inventory_id);
      if (inventoryItem) {
        return {
          ...item,
          inventory: inventoryItem
        };
      }
      return item;
    });

    let filtered = enrichedItems.filter(item => item.quantity > 0); // Only show items with quantity > 0
    
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const inventory = item.inventory;
        if (!inventory) {
          // If no inventory relation, try to match by ID from mainInventoryItems
          const mainItem = mainInventoryItems.find(i => i.id === item.inventory_id);
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
    
    filtered.sort((a, b) => {
      const aInventory = a.inventory || mainInventoryItems.find(i => i.id === a.inventory_id);
      const bInventory = b.inventory || mainInventoryItems.find(i => i.id === b.inventory_id);
      const aName = aInventory?.product_name || '';
      const bName = bInventory?.product_name || '';
      return aName.localeCompare(bName);
    });
    
    return filtered.slice(0, 20);
  }, [technicianInventory, debouncedSearchQuery, mainInventoryItems]);

  // Get selected inventory item name
  const selectedInventoryName = useMemo(() => {
    if (!formData.inventory_id) return 'Select part...';
    const item = technicianInventory.find(i => i.inventory_id === formData.inventory_id);
    const inventory = item?.inventory;
    return inventory ? `${inventory.product_name}${inventory.code ? ` (${inventory.code})` : ''}` : 'Select part...';
  }, [formData.inventory_id, technicianInventory]);

  // Get available quantity for selected item
  const availableQuantity = useMemo(() => {
    if (!formData.inventory_id) return 0;
    const item = technicianInventory.find(i => i.inventory_id === formData.inventory_id);
    return item?.quantity || 0;
  }, [formData.inventory_id, technicianInventory]);

  // Handle add part
  const handleAddPart = () => {
    setFormData({
      inventory_id: '',
      quantity: ''
    });
    setInventorySearchQuery('');
    setInventorySearchOpen(false);
    setAddPartDialogOpen(true);
  };

  // Handle save part
  const handleSavePart = async () => {
    if (!job?.id || !technician?.id || !formData.inventory_id || !formData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const quantity = parseInt(formData.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Quantity must be a valid positive number');
      return;
    }

    // Check available quantity
    const techItem = technicianInventory.find(i => i.inventory_id === formData.inventory_id);
    if (!techItem || techItem.quantity < quantity) {
      toast.error(`Insufficient quantity. Available: ${techItem?.quantity || 0}`);
      return;
    }

    try {
      // Check if part already added to this job
      const existingPart = partsUsed.find(p => p.inventory_id === formData.inventory_id);
      
      if (existingPart) {
        // Update existing part
        const newQuantity = existingPart.quantity_used + quantity;
        const { error: updateError } = await db.jobPartsUsed.update(existingPart.id, {
          quantity_used: newQuantity
        });
        if (updateError) throw updateError;
      } else {
        // Create new part
        const { error: createError } = await db.jobPartsUsed.create({
          job_id: job.id,
          technician_id: technician.id,
          inventory_id: formData.inventory_id,
          quantity_used: quantity
        });
        if (createError) throw createError;
      }

      // Subtract from technician inventory
      const newTechQuantity = techItem.quantity - quantity;
      if (newTechQuantity < 0) {
        throw new Error('Insufficient quantity in technician inventory');
      }

      const { error: updateTechError } = await db.technicianInventory.update(techItem.id, {
        quantity: newTechQuantity
      });
      if (updateTechError) throw updateTechError;

      toast.success('Part added and deducted from technician inventory');
      
      // Clear cache and reload
      inventoryCache.clear(`tech_inventory_${technician.id}`);
      await loadTechnicianInventory();
      await loadPartsUsed();
      
      setAddPartDialogOpen(false);
      setFormData({
        inventory_id: '',
        quantity: ''
      });
      setInventorySearchQuery('');
    } catch (error: any) {
      console.error('Error saving part:', error);
      toast.error(error?.message || 'Failed to save part');
    }
  };

  // Handle delete part
  const handleDeletePart = async (partId: string, inventoryId: string, quantityUsed: number) => {
    if (!technician?.id) return;

    try {
      // Find technician inventory item
      const techItem = technicianInventory.find(i => i.inventory_id === inventoryId);
      
      // Delete the part
      const { error: deleteError } = await db.jobPartsUsed.delete(partId);
      if (deleteError) throw deleteError;

      // Add back to technician inventory
      if (techItem) {
        const newQuantity = techItem.quantity + quantityUsed;
        const { error: updateError } = await db.technicianInventory.update(techItem.id, {
          quantity: newQuantity
        });
        if (updateError) throw updateError;
      }

      toast.success('Part removed and added back to technician inventory');
      
      // Clear cache and reload
      inventoryCache.clear(`tech_inventory_${technician.id}`);
      await loadTechnicianInventory();
      await loadPartsUsed();
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Parts Used for Job
            </DialogTitle>
            <DialogDescription>
              Manage parts used for this job. Parts will be automatically deducted from {technician.fullName || technician.full_name}'s inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add Part Button */}
            <div className="flex justify-end">
              <Button onClick={handleAddPart} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Part
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
              <div className="border rounded-lg overflow-hidden">
                <Table>
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

      {/* Add Part Dialog */}
      <Dialog open={addPartDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddPartDialogOpen(false);
          setFormData({
            inventory_id: '',
            quantity: ''
          });
          setInventorySearchQuery('');
          setInventorySearchOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Part Used</DialogTitle>
            <DialogDescription>
              Select a part from {technician.fullName || technician.full_name}'s inventory and specify the quantity used.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="inventory" className="text-sm font-medium">Part *</Label>
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
                      placeholder="Search parts by name or code..." 
                      value={inventorySearchQuery}
                      onValueChange={setInventorySearchQuery}
                      className="h-11 text-sm"
                    />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty className="py-6 text-center text-sm text-gray-500">
                        No parts found.
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredInventoryItems.length > 0 ? (
                          <>
                            {filteredInventoryItems.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={item.inventory_id}
                                onSelect={() => {
                                  setFormData({ ...formData, inventory_id: item.inventory_id });
                                  setInventorySearchOpen(false);
                                  setInventorySearchQuery('');
                                }}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0",
                                      formData.inventory_id === item.inventory_id ? "opacity-100 text-blue-600" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-sm font-medium truncate">
                                      {item.inventory?.product_name || mainInventoryItems.find(i => i.id === item.inventory_id)?.product_name || 'Unknown'}
                                    </span>
                                    {(item.inventory?.code || mainInventoryItems.find(i => i.id === item.inventory_id)?.code) && (
                                      <span className="text-xs text-gray-500">
                                        Code: {item.inventory?.code || mainInventoryItems.find(i => i.id === item.inventory_id)?.code}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 font-medium shrink-0">
                                  Available: {item.quantity}
                                </span>
                              </CommandItem>
                            ))}
                          </>
                        ) : technicianInventory.length === 0 ? (
                          <div className="py-6 text-center text-sm text-gray-500">
                            <p>No parts available in technician inventory.</p>
                            <p className="text-xs mt-1">The technician needs to add inventory items first.</p>
                          </div>
                        ) : (
                          <div className="py-6 text-center text-sm text-gray-500">
                            <p>No parts with available quantity.</p>
                            <p className="text-xs mt-1">All inventory items are out of stock.</p>
                          </div>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {formData.inventory_id && availableQuantity > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Available quantity: {availableQuantity}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="quantity">Quantity Used *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max={availableQuantity}
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="Enter quantity"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddPartDialogOpen(false);
              setFormData({
                inventory_id: '',
                quantity: ''
              });
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSavePart} 
              disabled={!formData.inventory_id || !formData.quantity || parseInt(formData.quantity) > availableQuantity}
            >
              Add Part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobPartsUsedDialog;
