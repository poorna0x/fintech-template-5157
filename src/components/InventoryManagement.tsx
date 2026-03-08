import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, Plus, Edit, Trash2, Search, X, RefreshCw, User, Package } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { inventoryCache } from '@/lib/inventoryCache';
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
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const itemsPerPage = 50; // Show 50 items per page for better performance

  // Bundles state
  const [bundles, setBundles] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [bundlesLoaded, setBundlesLoaded] = useState(false);
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [bundleName, setBundleName] = useState('');
  const [bundleDescription, setBundleDescription] = useState('');
  const [bundleItems, setBundleItems] = useState<{ inventory_id: string; quantity: number; product_name?: string; code?: string | null }[]>([]);
  const [bundleItemInventoryId, setBundleItemInventoryId] = useState('');
  const [bundleItemQty, setBundleItemQty] = useState('1');
  const [bundleDialogInventory, setBundleDialogInventory] = useState<InventoryItem[]>([]);
  const [bundleDialogInventoryLoading, setBundleDialogInventoryLoading] = useState(false);
  const [bundleSearchQuery, setBundleSearchQuery] = useState('');
  const [debouncedBundleSearch, setDebouncedBundleSearch] = useState('');

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

  // Debounce bundle dialog search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBundleSearch(bundleSearchQuery), 300);
    return () => clearTimeout(t);
  }, [bundleSearchQuery]);

  // Load inventory when bundle dialog opens (no need to load main inventory tab first)
  useEffect(() => {
    if (!bundleDialogOpen) return;
    setBundleDialogInventoryLoading(true);
    const cacheKey = 'inventory_items';
    const cached = inventoryCache.get<InventoryItem[]>(cacheKey);
    if (cached && cached.length >= 0) {
      setBundleDialogInventory(cached);
      setBundleDialogInventoryLoading(false);
    } else {
      db.inventory.getAll()
        .then(({ data, error }) => {
          if (!error && data) {
            setBundleDialogInventory(data);
            inventoryCache.set(cacheKey, data);
          }
          setBundleDialogInventoryLoading(false);
        })
        .catch(() => setBundleDialogInventoryLoading(false));
    }
  }, [bundleDialogOpen]);

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

  // Load main inventory on demand when user clicks "Show inventory"
  const handleShowInventory = useCallback(async () => {
    await loadInventory(true);
    setInventoryLoaded(true);
  }, [loadInventory]);

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

      // Check for duplicate product code (only if code is provided)
      if (inventoryFormData.code && inventoryFormData.code.trim()) {
        const codeToCheck = inventoryFormData.code.trim();
        const existingItem = inventoryItems.find(
          item => item.code && item.code.toLowerCase() === codeToCheck.toLowerCase() && 
          (!editInventoryDialogOpen || item.id !== selectedInventoryItem?.id)
        );
        
        if (existingItem) {
          toast.error(`Product code "${codeToCheck}" already exists. Please use a different code.`);
          return;
        }
      }

      if (editInventoryDialogOpen && selectedInventoryItem) {
        const { error } = await db.inventory.update(selectedInventoryItem.id, {
          product_name: inventoryFormData.product_name,
          code: inventoryFormData.code || null,
          price: price,
          quantity: quantity
        });

        if (error) {
          // Check if it's a unique constraint violation
          if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
            toast.error('Product code already exists. Please use a different code.');
            return;
          }
          throw error;
        }
        toast.success('Inventory item updated successfully');
        setEditInventoryDialogOpen(false);
      } else {
        const { error } = await db.inventory.create({
          product_name: inventoryFormData.product_name,
          code: inventoryFormData.code || undefined,
          price: price,
          quantity: quantity
        });

        if (error) {
          // Check if it's a unique constraint violation
          if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
            toast.error('Product code already exists. Please use a different code.');
            return;
          }
          throw error;
        }
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
      
      // Clear all technician inventory caches since they contain joined inventory data
      // This ensures technician views show updated product names, codes, etc.
      // Clear all inventory-related caches
      const allCacheKeys = Object.keys(localStorage);
      allCacheKeys.forEach(key => {
        // Clear all technician inventory caches (format: inventory_cache_tech_inventory_*)
        if (key.startsWith('inventory_cache_') && key.includes('tech_inventory_')) {
          const cacheKey = key.replace('inventory_cache_', '');
          inventoryCache.clear(cacheKey);
        }
        // Clear main inventory cache
        if (key.startsWith('inventory_cache_') && (key.includes('main_inventory') || key.includes('inventory_items'))) {
          const cacheKey = key.replace('inventory_cache_', '');
          inventoryCache.clear(cacheKey);
        }
      });
      
      await loadInventory(true); // Force reload after save
      setInventoryLoaded(true);
    } catch (error: any) {
      console.error('Error saving inventory:', error);
      toast.error(error?.message || 'Failed to save inventory item');
    }
  };

  const loadBundles = useCallback(async () => {
    try {
      const { data, error } = await db.inventoryBundles.getAll();
      if (error) throw error;
      setBundles(data || []);
      setBundlesLoaded(true);
    } catch (e) {
      console.error('Error loading bundles:', e);
      toast.error('Failed to load bundles');
    }
  }, []);

  const handleOpenAddBundle = () => {
    setEditingBundleId(null);
    setBundleName('');
    setBundleDescription('');
    setBundleItems([]);
    setBundleSearchQuery('');
    setDebouncedBundleSearch('');
    setBundleDialogOpen(true);
  };

  const handleOpenEditBundle = async (id: string) => {
    const { data, error } = await db.inventoryBundles.getByIdWithItems(id);
    if (error || !data) {
      toast.error('Failed to load bundle');
      return;
    }
    setEditingBundleId(id);
    setBundleName(data.name);
    setBundleDescription(data.description || '');
    setBundleItems((data.items || []).map((it: any) => ({
      inventory_id: it.inventory_id,
      quantity: it.quantity,
      product_name: it.inventory?.product_name,
      code: it.inventory?.code ?? null
    })));
    setBundleSearchQuery('');
    setDebouncedBundleSearch('');
    setBundleDialogOpen(true);
  };

  const handleAddBundleItem = () => {
    if (!bundleItemInventoryId || !bundleItemQty || parseInt(bundleItemQty, 10) < 1) return;
    const item = bundleDialogInventory.find(i => i.id === bundleItemInventoryId) || inventoryItems.find(i => i.id === bundleItemInventoryId);
    if (!item) return;
    const qty = parseInt(bundleItemQty, 10);
    setBundleItems(prev => {
      const existing = prev.find(p => p.inventory_id === bundleItemInventoryId);
      if (existing) {
        return prev.map(p => p.inventory_id === bundleItemInventoryId ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, { inventory_id: bundleItemInventoryId, quantity: qty, product_name: item.product_name, code: item.code }];
    });
    setBundleItemInventoryId('');
    setBundleItemQty('1');
  };

  const handleAddBundleItemFromSearch = (item: InventoryItem, qty: number = 1) => {
    setBundleItems(prev => {
      const existing = prev.find(p => p.inventory_id === item.id);
      if (existing) {
        return prev.map(p => p.inventory_id === item.id ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, { inventory_id: item.id, quantity: qty, product_name: item.product_name, code: item.code }];
    });
  };

  const handleRemoveBundleItem = (inventoryId: string) => {
    setBundleItems(prev => prev.filter(p => p.inventory_id !== inventoryId));
  };

  const filteredBundleDialogInventory = useMemo(() => {
    if (!debouncedBundleSearch.trim()) return bundleDialogInventory;
    const q = debouncedBundleSearch.toLowerCase().trim();
    return bundleDialogInventory.filter(
      (i) =>
        i.product_name?.toLowerCase().includes(q) ||
        (i.code && i.code.toLowerCase().includes(q))
    );
  }, [bundleDialogInventory, debouncedBundleSearch]);

  const handleSaveBundle = async () => {
    if (!bundleName.trim()) {
      toast.error('Enter bundle name');
      return;
    }
    if (bundleItems.length === 0) {
      toast.error('Add at least one item to the bundle');
      return;
    }
    try {
      if (editingBundleId) {
        const { error: updateError } = await db.inventoryBundles.update(editingBundleId, { name: bundleName.trim(), description: bundleDescription.trim() || undefined });
        if (updateError) throw updateError;
        const { error: setError } = await db.inventoryBundles.setItems(editingBundleId, bundleItems.map(i => ({ inventory_id: i.inventory_id, quantity: i.quantity })));
        if (setError) throw setError;
        toast.success('Bundle updated');
        setBundles(prev => prev.map(b => b.id === editingBundleId ? { ...b, name: bundleName.trim(), description: bundleDescription.trim() || null } : b));
      } else {
        const { data: created, error: createError } = await db.inventoryBundles.create({ name: bundleName.trim(), description: bundleDescription.trim() || undefined });
        if (createError || !created) throw createError || new Error('Create failed');
        const { error: setError } = await db.inventoryBundles.setItems(created.id, bundleItems.map(i => ({ inventory_id: i.inventory_id, quantity: i.quantity })));
        if (setError) throw setError;
        toast.success('Bundle created');
        setBundles(prev => [...(prev || []), { id: created.id, name: bundleName.trim(), description: bundleDescription.trim() || null }]);
      }
      setBundleDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save bundle');
    }
  };

  const handleDeleteBundle = async (id: string) => {
    try {
      const { error } = await db.inventoryBundles.delete(id);
      if (error) throw error;
      toast.success('Bundle deleted');
      setBundles(prev => prev.filter(b => b.id !== id));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete bundle');
    }
  };

  const handleDeleteInventory = async (id: string) => {
    try {
      const { error } = await db.inventory.delete(id);
      if (error) throw error;
      toast.success('Inventory item deleted successfully');
      
      // Clear all technician inventory caches since they contain joined inventory data
      // Clear all inventory-related caches
      const allCacheKeys = Object.keys(localStorage);
      allCacheKeys.forEach(key => {
        // Clear all technician inventory caches (format: inventory_cache_tech_inventory_*)
        if (key.startsWith('inventory_cache_') && key.includes('tech_inventory_')) {
          const cacheKey = key.replace('inventory_cache_', '');
          inventoryCache.clear(cacheKey);
        }
        // Clear main inventory cache
        if (key.startsWith('inventory_cache_') && (key.includes('main_inventory') || key.includes('inventory_items'))) {
          const cacheKey = key.replace('inventory_cache_', '');
          inventoryCache.clear(cacheKey);
        }
      });
      
      // Optimistically update local state instead of reloading
      setInventoryItems(prev => prev.filter(item => item.id !== id));
      setLastLoadTime(Date.now()); // Update cache time
      setInventoryLoaded(true); // Keep table visible
    } catch (error: any) {
      console.error('Error deleting inventory:', error);
      toast.error(error?.message || 'Failed to delete inventory item');
      // Reload on error to sync with server
      loadInventory(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs for Main Inventory, Bundles, and Technician Inventory */}
      <Tabs defaultValue="main" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="main" className="flex items-center gap-1.5 min-w-0 overflow-hidden px-2 sm:px-3">
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span className="min-w-0 truncate">Main Inventory</span>
          </TabsTrigger>
          <TabsTrigger value="bundles" className="flex items-center gap-1.5 min-w-0 overflow-hidden px-2 sm:px-3" onClick={() => !bundlesLoaded && loadBundles()}>
            <Package className="w-4 h-4 shrink-0" />
            <span className="min-w-0 truncate">Bundles</span>
          </TabsTrigger>
          <TabsTrigger value="technician" className="flex items-center gap-1.5 min-w-0 overflow-hidden px-2 sm:px-3">
            <User className="w-4 h-4 shrink-0" />
            <span className="min-w-0 truncate">Technician Inventory</span>
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
            <div className="flex gap-2 flex-wrap">
              {!inventoryLoaded && (
                <Button
                  onClick={handleShowInventory}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Show inventory</span>
                </Button>
              )}
              {inventoryLoaded && (
                <Button
                  variant="outline"
                  onClick={() => loadInventory(true)}
                  className="w-full sm:w-auto"
                  title="Refresh inventory"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              )}
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
          {!inventoryLoaded ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Click &quot;Show inventory&quot; to load main inventory (saves egress)</p>
            </div>
          ) : (
            <>
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

        {/* Bundles Tab */}
        <TabsContent value="bundles" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Package className="w-5 h-5" />
                    Part Bundles
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Create bundles to add multiple job parts at once when recording parts used.
                  </p>
                </div>
                <Button onClick={handleOpenAddBundle} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Bundle
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!bundlesLoaded ? (
                <div className="text-center py-8 text-gray-500">Switch to this tab to load bundles.</div>
              ) : bundles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No bundles yet.</p>
                  <p className="text-sm mt-2">Create a bundle to quickly add a set of parts to a job.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">Description</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundles.map((b) => (
                        <tr key={b.id} className="border-b last:border-b-0">
                          <td className="p-3 font-medium">{b.name}</td>
                          <td className="p-3 text-gray-600">{b.description || '—'}</td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEditBundle(b.id)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete bundle</AlertDialogTitle>
                                    <AlertDialogDescription>Delete &quot;{b.name}&quot;? This cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteBundle(b.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technician Inventory Tab */}
        <TabsContent value="technician" className="space-y-6">
          <TechnicianInventoryManagement />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Bundle Dialog */}
      <Dialog open={bundleDialogOpen} onOpenChange={setBundleDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBundleId ? 'Edit' : 'Add'} Bundle</DialogTitle>
            <DialogDescription>Name the bundle and add parts with quantities. These can be added to a job in one step.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bundle name *</Label>
              <Input value={bundleName} onChange={(e) => setBundleName(e.target.value)} placeholder="e.g. RO Service Kit" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={bundleDescription} onChange={(e) => setBundleDescription(e.target.value)} placeholder="Short description" />
            </div>
            <div className="space-y-2">
              <Label>Add parts</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by product name or code..."
                  value={bundleSearchQuery}
                  onChange={(e) => setBundleSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              {bundleDialogInventoryLoading ? (
                <p className="text-sm text-gray-500 py-3">Loading products...</p>
              ) : bundleDialogInventory.length === 0 ? (
                <p className="text-sm text-gray-500 py-3">No products in inventory. Add products in Main Inventory first.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden max-h-[220px] overflow-y-auto">
                  {filteredBundleDialogInventory.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">No products match your search.</div>
                  ) : (
                    filteredBundleDialogInventory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 bg-background hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium truncate block">{item.product_name}</span>
                          {item.code && <span className="text-xs text-gray-500 truncate block">Code: {item.code}</span>}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-8 w-8 min-w-[2rem] shrink-0"
                          onClick={() => handleAddBundleItemFromSearch(item, 1)}
                          title="Add 1 to bundle"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
              {bundleItems.length > 0 && (
                <div className="mt-3">
                  <Label className="text-xs text-gray-600">Items in this bundle</Label>
                  <ul className="border rounded-lg divide-y mt-1">
                    {bundleItems.map((item) => (
                      <li key={item.inventory_id} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm">{item.product_name}{item.code ? ` (${item.code})` : ''} × {item.quantity}</span>
                        <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => handleRemoveBundleItem(item.inventory_id)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBundleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBundle} disabled={!bundleName.trim() || bundleItems.length === 0} className="bg-blue-600 hover:bg-blue-700">
              {editingBundleId ? 'Update' : 'Create'} Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryManagement;
