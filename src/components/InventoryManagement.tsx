import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, Plus, Edit, Trash2, Search, X, RefreshCw, User } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import TechnicianInventoryManagement from './TechnicianInventoryManagement';

interface InventoryItem {
  id: string;
  product_name: string;
  code: string | null;
  price: number;
  quantity: number;
  created_at: string;
  updated_at: string;
}

interface InventoryManagementProps {
  onBack?: () => void;
}

const InventoryManagement: React.FC<InventoryManagementProps> = ({ onBack }) => {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [addInventoryDialogOpen, setAddInventoryDialogOpen] = useState(false);
  const [editInventoryDialogOpen, setEditInventoryDialogOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [inventoryFormData, setInventoryFormData] = useState({
    product_name: '',
    code: '',
    price: '',
    quantity: ''
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const itemsPerPage = 50; // Show 50 items per page for better performance

  // Cache duration: 30 seconds - reload only if data is stale
  const CACHE_DURATION = 30000;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load inventory with caching - only reload if cache is stale
  const loadInventory = useCallback(async (forceReload = false) => {
    const now = Date.now();
    const cacheValid = now - lastLoadTime < CACHE_DURATION;

    if (!forceReload && cacheValid && inventoryItems.length > 0) {
      // Use cached data
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await db.inventory.getAll();
      if (error) throw error;
      setInventoryItems(data || []);
      setLastLoadTime(now);
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [lastLoadTime, inventoryItems.length]);

  // Load on mount, but use cache if available
  useEffect(() => {
    loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - loadInventory is stable

  // Filter inventory items based on search query
  const filteredItems = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return inventoryItems;
    }

    const query = debouncedSearchQuery.toLowerCase().trim();
    return inventoryItems.filter(item => {
      const nameMatch = item.product_name?.toLowerCase().includes(query);
      const codeMatch = item.code?.toLowerCase().includes(query);
      return nameMatch || codeMatch;
    });
  }, [inventoryItems, debouncedSearchQuery]);

  // Generate search suggestions
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    const suggestions: Array<{ type: 'name' | 'code'; value: string; item: InventoryItem }> = [];

    inventoryItems.forEach(item => {
      if (item.product_name?.toLowerCase().includes(query)) {
        suggestions.push({ type: 'name', value: item.product_name, item });
      }
      if (item.code?.toLowerCase().includes(query)) {
        suggestions.push({ type: 'code', value: item.code, item });
      }
    });

    // Remove duplicates and limit to 8 suggestions
    const uniqueSuggestions = Array.from(
      new Map(suggestions.map(s => [s.value, s])).values()
    ).slice(0, 8);

    return uniqueSuggestions;
  }, [searchQuery, inventoryItems]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, currentPage]);

  // Total pages
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSuggestions(value.length >= 2);
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: { type: 'name' | 'code'; value: string; item: InventoryItem }) => {
    setSearchQuery(suggestion.value);
    setShowSuggestions(false);
    setDebouncedSearchQuery(suggestion.value);
    setCurrentPage(1);
    // Scroll to the item in the table
    setTimeout(() => {
      const element = document.querySelector(`[data-item-id="${suggestion.item.id}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddInventory = () => {
    setInventoryFormData({
      product_name: '',
      code: '',
      price: '',
      quantity: ''
    });
    setSelectedInventoryItem(null);
    setAddInventoryDialogOpen(true);
  };

  const handleEditInventory = (item: InventoryItem) => {
    setSelectedInventoryItem(item);
    setInventoryFormData({
      product_name: item.product_name || '',
      code: item.code || '',
      price: item.price?.toString() || '',
      quantity: item.quantity?.toString() || ''
    });
    setEditInventoryDialogOpen(true);
  };

  const handleSaveInventory = async () => {
    try {
      if (!inventoryFormData.product_name || !inventoryFormData.price || !inventoryFormData.quantity) {
        toast.error('Please fill in all required fields');
        return;
      }

      const price = parseFloat(inventoryFormData.price);
      const quantity = parseInt(inventoryFormData.quantity);

      if (isNaN(price) || price < 0) {
        toast.error('Please enter a valid price');
        return;
      }

      if (isNaN(quantity) || quantity < 0) {
        toast.error('Please enter a valid quantity');
        return;
      }

      if (editInventoryDialogOpen && selectedInventoryItem) {
        const { error } = await db.inventory.update(selectedInventoryItem.id, {
          product_name: inventoryFormData.product_name,
          code: inventoryFormData.code || null,
          price: price,
          quantity: quantity
        });

        if (error) throw error;
        toast.success('Inventory item updated successfully');
        setEditInventoryDialogOpen(false);
      } else {
        const { error } = await db.inventory.create({
          product_name: inventoryFormData.product_name,
          code: inventoryFormData.code || undefined,
          price: price,
          quantity: quantity
        });

        if (error) throw error;
        toast.success('Inventory item added successfully');
        setAddInventoryDialogOpen(false);
      }

      setInventoryFormData({
        product_name: '',
        code: '',
        price: '',
        quantity: ''
      });
      setSelectedInventoryItem(null);
      loadInventory(true); // Force reload after save
    } catch (error: any) {
      console.error('Error saving inventory:', error);
      toast.error(error?.message || 'Failed to save inventory item');
    }
  };

  const handleDeleteInventory = async (id: string) => {
    try {
      const { error } = await db.inventory.delete(id);
      if (error) throw error;
      toast.success('Inventory item deleted successfully');
      // Optimistically update local state instead of reloading
      setInventoryItems(prev => prev.filter(item => item.id !== id));
      setLastLoadTime(Date.now()); // Update cache time
    } catch (error: any) {
      console.error('Error deleting inventory:', error);
      toast.error(error?.message || 'Failed to delete inventory item');
      // Reload on error to sync with server
      loadInventory(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs for Main Inventory and Technician Inventory */}
      <Tabs defaultValue="main" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="main" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Main Inventory
          </TabsTrigger>
          <TabsTrigger value="technician" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Technician Inventory
          </TabsTrigger>
        </TabsList>

        {/* Main Inventory Tab */}
        <TabsContent value="main" className="space-y-6">
          {/* Inventory Management */}
          <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <ShoppingCart className="w-5 h-5" />
                Inventory Management
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Manage product inventory with name, code, price, and quantity
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => loadInventory(true)}
                className="w-full sm:w-auto"
                title="Refresh inventory"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                onClick={handleAddInventory}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Search Bar */}
          <div className="mb-4 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search by product name or code..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchQuery.length >= 2) {
                    setShowSuggestions(true);
                  }
                }}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                    setShowSuggestions(false);
                  }}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Search Suggestions Dropdown */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
              >
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.value}-${index}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{suggestion.value}</div>
                        <div className="text-xs text-gray-500">
                          {suggestion.type === 'name' ? 'Product Name' : 'Code'} • ₹{suggestion.item.price.toFixed(2)} • Qty: {suggestion.item.quantity}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results Count */}
          {!loading && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
              <div>
                {filteredItems.length === inventoryItems.length ? (
                  <>Showing {paginatedItems.length} of {inventoryItems.length} items</>
                ) : (
                  <>
                    Found {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for "{debouncedSearchQuery}"
                    {inventoryItems.length !== filteredItems.length && (
                      <span className="ml-2">(out of {inventoryItems.length} total)</span>
                    )}
                  </>
                )}
              </div>
              {lastLoadTime > 0 && (
                <div className="text-xs text-gray-500">
                  Last updated: {new Date(lastLoadTime).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading inventory...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              {searchQuery ? (
                <>
                  <p>No items found matching "{debouncedSearchQuery}"</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                    }}
                    className="mt-4"
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <p>No inventory items yet. Add your first product to get started.</p>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">Product Name</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">Code</th>
                      <th className="text-right p-3 text-sm font-semibold text-gray-700">Price</th>
                      <th className="text-right p-3 text-sm font-semibold text-gray-700">Quantity</th>
                      <th className="text-right p-3 text-sm font-semibold text-gray-700">Total Value</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item) => (
                      <tr key={item.id} data-item-id={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 text-sm text-gray-900">{item.product_name}</td>
                        <td className="p-3 text-sm text-gray-600">{item.code || '-'}</td>
                        <td className="p-3 text-sm text-right text-gray-900">₹{item.price.toFixed(2)}</td>
                        <td className="p-3 text-sm text-right text-gray-900">
                          <span className={item.quantity <= 5 ? 'text-red-600 font-semibold' : ''}>
                            {item.quantity}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-right text-gray-900 font-medium">
                          ₹{(item.price * item.quantity).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditInventory(item)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Inventory Item</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{item.product_name}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteInventory(item.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td colSpan={3} className="p-3 text-sm font-semibold text-gray-900">Total</td>
                      <td className="p-3 text-sm text-right font-semibold text-gray-900">
                        {filteredItems.reduce((sum, item) => sum + item.quantity, 0)}
                      </td>
                      <td className="p-3 text-sm text-right font-semibold text-gray-900">
                        ₹{filteredItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(prev => Math.max(1, prev - 1));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.ceil(filteredItems.length / itemsPerPage) }, (_, i) => i + 1).map((page) => {
                        const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
                        const showPage = 
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1);

                        if (!showPage) {
                          if (page === currentPage - 2 || page === currentPage + 2) {
                            return (
                              <PaginationItem key={page}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            );
                          }
                          return null;
                        }

                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(prev => Math.min(totalPages, prev + 1));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Inventory Dialog */}
      <Dialog open={addInventoryDialogOpen || editInventoryDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddInventoryDialogOpen(false);
          setEditInventoryDialogOpen(false);
          setInventoryFormData({
            product_name: '',
            code: '',
            price: '',
            quantity: ''
          });
          setSelectedInventoryItem(null);
        }
      }}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md">
          <DialogHeader>
            <DialogTitle>{editInventoryDialogOpen ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
            <DialogDescription>
              {editInventoryDialogOpen ? 'Update' : 'Add a new'} product to your inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product_name">Product Name *</Label>
              <Input
                id="product_name"
                value={inventoryFormData.product_name}
                onChange={(e) => setInventoryFormData({ ...inventoryFormData, product_name: e.target.value })}
                placeholder="Enter product name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Product Code (Optional)</Label>
              <Input
                id="code"
                value={inventoryFormData.code}
                onChange={(e) => setInventoryFormData({ ...inventoryFormData, code: e.target.value })}
                placeholder="Enter product code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (₹) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={inventoryFormData.price}
                onChange={(e) => setInventoryFormData({ ...inventoryFormData, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={inventoryFormData.quantity}
                onChange={(e) => setInventoryFormData({ ...inventoryFormData, quantity: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddInventoryDialogOpen(false);
                setEditInventoryDialogOpen(false);
                setInventoryFormData({
                  product_name: '',
                  code: '',
                  price: '',
                  quantity: ''
                });
                setSelectedInventoryItem(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveInventory}
              disabled={!inventoryFormData.product_name || !inventoryFormData.price || !inventoryFormData.quantity}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editInventoryDialogOpen ? 'Update' : 'Add'} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        {/* Technician Inventory Tab */}
        <TabsContent value="technician" className="space-y-6">
          <TechnicianInventoryManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InventoryManagement;
