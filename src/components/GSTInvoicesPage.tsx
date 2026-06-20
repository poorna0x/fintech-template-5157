import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  Search, 
  Download, 
  Receipt,
  Calendar,
  Filter,
  RefreshCw,
  ChevronDown,
  X,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { documentOutlineBtnClass } from '@/components/DocumentGeneratorPageHeader';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { generateCombinedTaxInvoicePDF } from '@/lib/tax-invoice-pdf-generator';
import { taxInvoiceToPdfData } from '@/lib/tax-invoice-edit-utils';
import GSTInvoiceDetailScreen from '@/components/gst/GSTInvoiceDetailScreen';
import { GSTInvoiceRowActions } from '@/components/gst/GSTInvoiceRowActions';
import { exportTaxInvoicePdf, type TaxInvoiceRecord } from '@/lib/tax-invoice-edit-utils';
import { cn } from '@/lib/utils';

type TaxInvoice = TaxInvoiceRecord;

type DateFilterMode = 'all' | 'custom' | 'month' | 'year';

function toLocalDateKey(dateString: string): string {
  if (!dateString) return '';
  const isoDate = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filterTaxInvoices(
  source: TaxInvoice[],
  opts: {
    filterType: 'ALL' | 'B2B' | 'B2C';
    dateFilter: DateFilterMode;
    startDate: string;
    endDate: string;
    selectedMonth: number;
    selectedYear: number;
    searchQuery: string;
  }
): TaxInvoice[] {
  let filtered = [...source];

  if (opts.filterType !== 'ALL') {
    filtered = filtered.filter((inv) => inv.invoice_type === opts.filterType);
  }

  if (opts.dateFilter === 'custom' && opts.startDate && opts.endDate) {
    const start = new Date(opts.startDate);
    const end = new Date(opts.endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((inv) => {
      const invDate = new Date(inv.invoice_date);
      return invDate >= start && invDate <= end;
    });
  } else if (opts.dateFilter === 'month') {
    filtered = filtered.filter((inv) => {
      const invDate = new Date(inv.invoice_date);
      return invDate.getMonth() + 1 === opts.selectedMonth && invDate.getFullYear() === opts.selectedYear;
    });
  } else if (opts.dateFilter === 'year') {
    filtered = filtered.filter((inv) => {
      const invDate = new Date(inv.invoice_date);
      return invDate.getFullYear() === opts.selectedYear;
    });
  }

  if (opts.searchQuery.trim()) {
    const query = opts.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (invoice) =>
        invoice.invoice_number.toLowerCase().includes(query) ||
        invoice.customer_name.toLowerCase().includes(query) ||
        invoice.customer_phone?.toLowerCase().includes(query) ||
        invoice.customer_email?.toLowerCase().includes(query) ||
        invoice.customer_gstin?.toLowerCase().includes(query)
    );
  }

  return filtered;
}

function getDateFilterSummary(
  dateFilter: DateFilterMode,
  selectedMonth: number,
  selectedYear: number,
  startDate: string,
  endDate: string
): string | null {
  if (dateFilter === 'all') return null;
  if (dateFilter === 'month') {
    const monthName = new Date(2000, selectedMonth - 1).toLocaleString('default', { month: 'long' });
    return `${monthName} ${selectedYear}`;
  }
  if (dateFilter === 'year') return String(selectedYear);
  if (dateFilter === 'custom' && startDate && endDate) return `${startDate} → ${endDate}`;
  if (dateFilter === 'custom') return 'Custom range (pick dates)';
  return null;
}

type GSTInvoicesPageProps = {
  onSubScreenChange?: (inSubScreen: boolean) => void;
};

export default function GSTInvoicesPage({ onSubScreenChange }: GSTInvoicesPageProps = {}) {
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [screen, setScreen] = useState<'list' | 'view' | 'edit'>('list');
  const [activeInvoice, setActiveInvoice] = useState<TaxInvoice | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bulkDownloadMode, setBulkDownloadMode] = useState<'filtered' | 'single' | 'range' | 'all'>('filtered');
  const [bulkDownloadInvoiceType, setBulkDownloadInvoiceType] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [bulkDownloadDate, setBulkDownloadDate] = useState('');
  const [bulkDownloadStartDate, setBulkDownloadStartDate] = useState('');
  const [bulkDownloadEndDate, setBulkDownloadEndDate] = useState('');
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Date filters - default to current month
  const [dateFilter, setDateFilter] = useState<'all' | 'custom' | 'month' | 'year'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadInvoices();
    
    const handleInvoiceRefresh = () => {
      loadInvoices();
    };
    
    // Listen for page visibility changes to refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadInvoices();
      }
    };
    
    window.addEventListener('taxInvoiceCreated', handleInvoiceRefresh);
    window.addEventListener('taxInvoiceUpdated', handleInvoiceRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('taxInvoiceCreated', handleInvoiceRefresh);
      window.removeEventListener('taxInvoiceUpdated', handleInvoiceRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Only load once on mount

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [filterType, dateFilter, startDate, endDate, selectedMonth, selectedYear, searchQuery]);

  useEffect(() => {
    applyFilters();
  }, [allInvoices, filterType, dateFilter, startDate, endDate, selectedMonth, selectedYear, searchQuery, currentPage]);

  useEffect(() => {
    onSubScreenChange?.(screen !== 'list');
  }, [screen, onSubScreenChange]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      // Load all invoices - use a high limit to get all invoices
      // If there are more than 50000, we'll need to load in batches
      let allLoadedInvoices: TaxInvoice[] = [];
      let offset = 0;
      const batchSize = 50000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error, count } = await db.taxInvoices.getAll(batchSize, offset);
        
        if (error) {
          toast.error('Failed to load invoices');
          console.error('Error loading invoices:', error);
          break;
        }
        
        if (data && data.length > 0) {
          allLoadedInvoices = [...allLoadedInvoices, ...data];
          offset += batchSize;
          // If we got fewer invoices than requested, we've reached the end
          hasMore = data.length === batchSize && (count === null || offset < count);
        } else {
          hasMore = false;
        }
      }
      
      console.log('Loaded invoices:', allLoadedInvoices.length);
      setAllInvoices(allLoadedInvoices);
      setTotalCount(allLoadedInvoices.length);
    } catch (error) {
      console.error('Error loading invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    const filtered = filterTaxInvoices(allInvoices, {
      filterType,
      dateFilter,
      startDate,
      endDate,
      selectedMonth,
      selectedYear,
      searchQuery,
    });

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    setInvoices(filtered.slice(startIndex, endIndex));
    setTotalCount(filtered.length);
  };

  const listFilterParams = {
    filterType,
    dateFilter,
    startDate,
    endDate,
    selectedMonth,
    selectedYear,
    searchQuery,
  };

  const filteredCountForBulk = filterTaxInvoices(allInvoices, listFilterParams).length;
  const dateFilterSummary = getDateFilterSummary(dateFilter, selectedMonth, selectedYear, startDate, endDate);

  const filteredInvoices = invoices;

  const handleViewInvoice = (invoice: TaxInvoice) => {
    setActiveInvoice(invoice);
    setScreen('view');
  };

  const handleEditInvoice = (invoice: TaxInvoice) => {
    setActiveInvoice(invoice);
    setScreen('edit');
  };

  const handleBackToList = () => {
    setScreen('list');
    setActiveInvoice(null);
  };

  const handleRegenerateInvoice = (invoice: TaxInvoice, action: 'print' | 'pdf' = 'pdf') => {
    try {
      exportTaxInvoicePdf(invoice, action);
      if (action === 'print') {
        toast.success('Invoice opened for printing');
      }
    } catch (error) {
      console.error('Error regenerating invoice:', error);
      toast.error('Failed to generate invoice');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDeleteInvoice = (invoice: TaxInvoice) => {
    setDeleteInvoiceId(invoice.id);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!deleteInvoiceId) return;

    setIsDeleting(true);
    const idToDelete = deleteInvoiceId;
    try {
      const { error } = await db.taxInvoices.delete(idToDelete);

      if (error) {
        const message =
          (error as { message?: string }).message ||
          'Failed to delete invoice';
        if (
          (error as { code?: string }).code === 'DELETE_NOT_APPLIED' ||
          (error as { code?: string }).code === '42501' ||
          message.toLowerCase().includes('permission')
        ) {
          toast.error(
            'Could not delete invoice. Run scripts/fix-tax-invoices-delete-rls.sql in Supabase, then try again.'
          );
        } else {
          toast.error(message);
        }
        return;
      }

      setAllInvoices((prev) => prev.filter((inv) => inv.id !== idToDelete));
      setInvoices((prev) => prev.filter((inv) => inv.id !== idToDelete));
      if (activeInvoice?.id === idToDelete) {
        handleBackToList();
      }
      setDeleteInvoiceId(null);
      setDeleteDialogOpen(false);
      toast.success('Invoice deleted successfully');
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDownload = async () => {
    // Validate based on mode
    if (bulkDownloadMode === 'single' && !bulkDownloadDate) {
      toast.error('Please select a date');
      return;
    }
    
    if (bulkDownloadMode === 'range') {
      if (!bulkDownloadStartDate || !bulkDownloadEndDate) {
        toast.error('Please select both start and end dates');
        return;
      }
      if (new Date(bulkDownloadStartDate) > new Date(bulkDownloadEndDate)) {
        toast.error('Start date must be before end date');
        return;
      }
    }

    setIsBulkDownloading(true);
    try {
      let dateInvoices: TaxInvoice[] = [];
      let invoicesToUse = allInvoices;

      // For "all" mode, reload invoices to ensure we have the latest data
      if (bulkDownloadMode === 'all') {
        toast.info('Loading all invoices...');
        // Load all invoices directly for download - use limit 0 to get all (or very high limit)
        let allLoadedInvoices: TaxInvoice[] = [];
        let offset = 0;
        const batchSize = 50000;
        let hasMore = true;
        let batchCount = 0;
        
        // First, get count to know how many batches we need
        const { count: totalCount } = await db.taxInvoices.getAll(1, 0);
        console.log(`Total invoices in database: ${totalCount || 'unknown'}`);
        
        const maxBatches = totalCount ? Math.ceil(totalCount / batchSize) + 1 : 10;
        
        while (hasMore && batchCount < maxBatches) {
          const { data, error } = await db.taxInvoices.getAll(batchSize, offset);
          
          if (error) {
            console.error('Error loading invoices for download:', error);
            // Fall back to existing allInvoices
            break;
          }
          
          console.log(`Batch ${batchCount + 1}: Loaded ${data?.length || 0} invoices (offset: ${offset}, total so far: ${allLoadedInvoices.length})`);
          
          if (data && data.length > 0) {
            allLoadedInvoices = [...allLoadedInvoices, ...data];
            offset += batchSize;
            // Continue if we got a full batch AND we haven't loaded all invoices yet
            hasMore = data.length === batchSize && (totalCount === null || allLoadedInvoices.length < totalCount);
            batchCount++;
          } else {
            hasMore = false;
          }
        }
        
        console.log(`Finished loading. Total invoices loaded: ${allLoadedInvoices.length} (expected: ${totalCount || 'unknown'})`);
        
        invoicesToUse = allLoadedInvoices.length > 0 ? allLoadedInvoices : allInvoices;
        console.log(`Total invoices loaded for bulk download: ${invoicesToUse.length}`);
        toast.info(`Loaded ${invoicesToUse.length} invoices`);
      }

      // Filter invoices based on selected mode
      if (bulkDownloadMode === 'filtered') {
        dateInvoices = filterTaxInvoices(invoicesToUse, listFilterParams);
      } else if (bulkDownloadMode === 'single') {
        dateInvoices = invoicesToUse.filter((inv) => toLocalDateKey(inv.invoice_date) === bulkDownloadDate);
      } else if (bulkDownloadMode === 'range') {
        const startKey = bulkDownloadStartDate;
        const endKey = bulkDownloadEndDate;
        dateInvoices = invoicesToUse.filter((inv) => {
          const key = toLocalDateKey(inv.invoice_date);
          return key >= startKey && key <= endKey;
        });
      } else if (bulkDownloadMode === 'all') {
        dateInvoices = invoicesToUse;
      }

      if (dateInvoices.length === 0) {
        const errorMsg =
          bulkDownloadMode === 'filtered'
            ? 'No invoices match your current filters'
            : bulkDownloadMode === 'all'
              ? 'No invoices found'
              : bulkDownloadMode === 'range'
                ? 'No invoices found for the selected date range'
                : 'No invoices found for the selected date';
        toast.error(errorMsg);
        setIsBulkDownloading(false);
        return;
      }

      console.log(`Total invoices after filtering: ${dateInvoices.length}`);
      
      // Filter by invoice type for bulk download (not applied in filtered mode — list chips already set type)
      let invoicesToDownload = dateInvoices;
      if (bulkDownloadMode !== 'filtered') {
        if (bulkDownloadInvoiceType === 'B2B') {
          invoicesToDownload = dateInvoices.filter((inv) => inv.invoice_type === 'B2B');
        } else if (bulkDownloadInvoiceType === 'B2C') {
          invoicesToDownload = dateInvoices.filter((inv) => inv.invoice_type === 'B2C');
        }
      }
      
      console.log(`Invoices to download (${bulkDownloadInvoiceType}): ${invoicesToDownload.length}`);
      
      if (invoicesToDownload.length === 0) {
        const errorMsg = bulkDownloadMode === 'all' 
          ? `No ${bulkDownloadInvoiceType === 'ALL' ? '' : bulkDownloadInvoiceType + ' '}invoices found`
          : bulkDownloadMode === 'range'
          ? `No ${bulkDownloadInvoiceType === 'ALL' ? '' : bulkDownloadInvoiceType + ' '}invoices found for the selected date range`
          : `No ${bulkDownloadInvoiceType === 'ALL' ? '' : bulkDownloadInvoiceType + ' '}invoices found for the selected date`;
        toast.error(errorMsg);
        setIsBulkDownloading(false);
        return;
      }

      // Separate B2B and B2C invoices for logging
      const b2bInvoices = invoicesToDownload.filter(inv => inv.invoice_type === 'B2B');
      const b2cInvoices = invoicesToDownload.filter(inv => inv.invoice_type === 'B2C');
      
      console.log(`B2B invoices: ${b2bInvoices.length}, B2C invoices: ${b2cInvoices.length}`);

      // Generate filename based on mode
      let filenameSuffix = '';
      if (bulkDownloadMode === 'filtered') {
        filenameSuffix =
          dateFilterSummary?.replace(/\s+/g, '_').replace(/→/g, 'to') ||
          (searchQuery.trim() ? 'Filtered' : 'Current_View');
      } else if (bulkDownloadMode === 'single') {
        filenameSuffix = bulkDownloadDate;
      } else if (bulkDownloadMode === 'range') {
        filenameSuffix = `${bulkDownloadStartDate}_to_${bulkDownloadEndDate}`;
      } else {
        filenameSuffix = 'All_Invoices';
      }

      // Generate combined PDF - combine filtered invoices into one PDF
      // Sort by invoice date to maintain chronological order
      const allBills = invoicesToDownload
        .sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime())
        .map(taxInvoiceToPdfData);
      
      const invoiceTypePrefix =
        bulkDownloadMode === 'filtered'
          ? filterType === 'ALL'
            ? 'Invoices'
            : `${filterType}_Invoices`
          : bulkDownloadInvoiceType === 'ALL'
            ? 'All_Invoices'
            : bulkDownloadInvoiceType === 'B2B'
              ? 'B2B_Invoices'
              : 'B2C_Invoices';

      if (allBills.length > 0) {
        await generateCombinedTaxInvoicePDF(allBills, `${invoiceTypePrefix}_${filenameSuffix}`, 'pdf');
      } else {
        toast.error('No invoices to download');
      }
    } catch (error) {
      console.error('Error downloading bulk invoices:', error);
      toast.error('Failed to download invoices');
    } finally {
      setIsBulkDownloading(false);
    }
  };

  if (screen !== 'list' && activeInvoice) {
    return (
      <GSTInvoiceDetailScreen
        invoice={activeInvoice}
        mode={screen === 'view' ? 'view' : 'edit'}
        onBack={handleBackToList}
        onEdit={() => setScreen('edit')}
        onUpdated={() => {
          void loadInvoices();
          handleBackToList();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-2 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">GST Invoices</h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            {totalCount} invoice{totalCount === 1 ? '' : 's'}
            {filterType !== 'ALL' ? ` · ${filterType}` : ''}
            {dateFilterSummary ? ` · ${dateFilterSummary}` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadInvoices()}
          disabled={loading}
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
          size="sm"
        >
          {loading ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
              Loading…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {/* Search + quick filters — compact */}
      <div className="rounded-lg border bg-white p-2.5 shadow-sm sm:p-3 space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search invoice #, customer, GSTIN…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {(['ALL', 'B2B', 'B2C'] as const).map((type) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant={filterType === type ? 'default' : 'outline'}
                className="h-8 rounded-full px-2.5 text-xs"
                onClick={() => setFilterType(type)}
              >
                {type === 'ALL' ? 'All' : type}
              </Button>
            ))}
          </div>
        </div>

        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-full justify-between rounded-md px-2 text-xs sm:text-sm',
                dateFilter !== 'all' ? 'bg-blue-50/80 text-blue-900 hover:bg-blue-100/80' : 'text-slate-700'
              )}
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 shrink-0" />
                <span className="font-medium">Date filters</span>
                {dateFilterSummary ? (
                  <Badge variant="secondary" className="ml-1 hidden bg-blue-100 text-blue-800 sm:inline-flex">
                    {dateFilterSummary}
                  </Badge>
                ) : null}
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', filtersOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 sm:p-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Period</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      { value: 'all', label: 'All dates' },
                      { value: 'month', label: 'Month' },
                      { value: 'year', label: 'Year' },
                      { value: 'custom', label: 'Custom' },
                    ] as const
                  ).map(({ value, label }) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={dateFilter === value ? 'default' : 'outline'}
                      className={cn(
                        'h-9 rounded-lg text-xs sm:text-sm',
                        dateFilter === value && 'bg-blue-600 shadow-sm hover:bg-blue-700'
                      )}
                      onClick={() => {
                        setDateFilter(value);
                        setCurrentPage(1);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {dateFilter === 'month' && (
                <div className="rounded-lg border bg-white p-3 shadow-sm">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    Select month
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select
                      value={selectedMonth.toString()}
                      onValueChange={(value) => {
                        setSelectedMonth(parseInt(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-10 w-full bg-slate-50/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                          <SelectItem key={month} value={month.toString()}>
                            {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedYear.toString()}
                      onValueChange={(value) => {
                        setSelectedYear(parseInt(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-10 w-full bg-slate-50/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {dateFilter === 'year' && (
                <div className="rounded-lg border bg-white p-3 shadow-sm">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    Select year
                  </p>
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(value) => {
                      setSelectedYear(parseInt(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-10 w-full max-w-[200px] bg-slate-50/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {dateFilter === 'custom' && (
                <div className="rounded-lg border bg-white p-3 shadow-sm">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    Date range
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DatePicker
                      value={startDate}
                      onChange={(v) => {
                        if (v) {
                          setStartDate(v);
                          setCurrentPage(1);
                        }
                      }}
                      placeholder="Start date"
                    />
                    <DatePicker
                      value={endDate}
                      onChange={(v) => {
                        if (v) {
                          setEndDate(v);
                          setCurrentPage(1);
                        }
                      }}
                      placeholder="End date"
                    />
                  </div>
                </div>
              )}

              {dateFilter !== 'all' && (
                <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-blue-900">
                    <span className="font-medium">Showing:</span>{' '}
                    {dateFilterSummary || 'Adjust filters above'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 text-blue-700 hover:bg-blue-100/80 hover:text-blue-900"
                    onClick={() => {
                      setDateFilter('all');
                      setStartDate('');
                      setEndDate('');
                      setSelectedMonth(new Date().getMonth() + 1);
                      setSelectedYear(new Date().getFullYear());
                      setCurrentPage(1);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={bulkOpen} onOpenChange={setBulkOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-full justify-between rounded-md px-2 text-xs sm:text-sm text-slate-700">
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span className="font-medium">Bulk PDF download</span>
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', bulkOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 sm:p-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Download scope</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      { value: 'filtered', label: 'Current view' },
                      { value: 'single', label: 'One date' },
                      { value: 'range', label: 'Date range' },
                      { value: 'all', label: 'All invoices' },
                    ] as const
                  ).map(({ value, label }) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={bulkDownloadMode === value ? 'default' : 'outline'}
                      className={cn(
                        'h-9 rounded-lg text-xs sm:text-sm',
                        bulkDownloadMode === value && 'bg-emerald-600 shadow-sm hover:bg-emerald-700'
                      )}
                      onClick={() => setBulkDownloadMode(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {bulkDownloadMode === 'filtered' && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm text-emerald-900">
                  Downloads <strong>{filteredCountForBulk}</strong> invoice{filteredCountForBulk === 1 ? '' : 's'}{' '}
                  matching your current search, type, and date filters.
                </div>
              )}

              {bulkDownloadMode === 'single' && (
                <div className="rounded-lg border bg-white p-3 shadow-sm">
                  <Label className="mb-2 block text-sm font-medium text-slate-700">Invoice date</Label>
                  <DatePicker
                    value={bulkDownloadDate}
                    onChange={(v) => v && setBulkDownloadDate(v)}
                    placeholder="Pick date"
                  />
                </div>
              )}

              {bulkDownloadMode === 'range' && (
                <div className="rounded-lg border bg-white p-3 shadow-sm">
                  <Label className="mb-2 block text-sm font-medium text-slate-700">From — To</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DatePicker
                      value={bulkDownloadStartDate}
                      onChange={(v) => v && setBulkDownloadStartDate(v)}
                      placeholder="Start"
                    />
                    <DatePicker
                      value={bulkDownloadEndDate}
                      onChange={(v) => v && setBulkDownloadEndDate(v)}
                      placeholder="End"
                    />
                  </div>
                </div>
              )}

              {bulkDownloadMode !== 'filtered' && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice type</p>
                  <div className="flex flex-wrap gap-2">
                    {(['ALL', 'B2B', 'B2C'] as const).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        size="sm"
                        variant={bulkDownloadInvoiceType === type ? 'default' : 'outline'}
                        className="h-8 rounded-full"
                        onClick={() => setBulkDownloadInvoiceType(type)}
                      >
                        {type === 'ALL' ? 'All types' : type}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleBulkDownload}
                disabled={
                  isBulkDownloading ||
                  (bulkDownloadMode === 'single' && !bulkDownloadDate) ||
                  (bulkDownloadMode === 'range' && (!bulkDownloadStartDate || !bulkDownloadEndDate)) ||
                  (bulkDownloadMode === 'filtered' && filteredCountForBulk === 0)
                }
                variant="outline"
                className={cn(documentOutlineBtnClass, 'h-11 w-full !shadow-none sm:w-auto')}
              >
                <Download className="h-4 w-4 shrink-0" />
                {isBulkDownloading ? 'Generating PDF…' : 'Download combined PDF'}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Invoice list */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Receipt className="h-4 w-4 text-blue-600" />
            Invoices
          </div>
          <span className="text-xs text-slate-500">{totalCount} total</span>
        </div>
        <div className="p-2 sm:p-3">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No invoices found</div>
          ) : (
            <div className="overflow-x-hidden">
              {/* Mobile */}
              <div className="space-y-3 md:hidden">
                {filteredInvoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => handleViewInvoice(invoice)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-slate-900 break-all">
                          {invoice.invoice_number}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="h-3 w-3" />
                          {formatDate(invoice.invoice_date)}
                        </p>
                      </div>
                      <Badge variant={invoice.invoice_type === 'B2B' ? 'default' : 'secondary'}>
                        {invoice.invoice_type}
                      </Badge>
                    </div>
                    <p className="mt-2 truncate font-medium text-slate-800">{invoice.customer_name}</p>
                    {invoice.customer_gstin ? (
                      <p className="mt-1 truncate font-mono text-xs text-slate-600">
                        GSTIN: {invoice.customer_gstin}
                      </p>
                    ) : null}
                    <p className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(invoice.total_amount)}</p>
                    <div
                      className="mt-3 border-t border-slate-200/80 pt-3"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <GSTInvoiceRowActions
                        onView={() => handleViewInvoice(invoice)}
                        onEdit={() => handleEditInvoice(invoice)}
                        onPrint={() => handleRegenerateInvoice(invoice, 'print')}
                        onDownload={() => handleRegenerateInvoice(invoice, 'pdf')}
                        onDelete={() => handleDeleteInvoice(invoice)}
                      />
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[72px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer hover:bg-slate-50/80"
                        onClick={() => handleViewInvoice(invoice)}
                      >
                        <TableCell>
                          <div className="font-mono text-sm font-semibold">{invoice.invoice_number}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(invoice.invoice_date)}
                            <Badge variant={invoice.invoice_type === 'B2B' ? 'default' : 'secondary'} className="h-5 px-1.5 text-[10px]">
                              {invoice.invoice_type}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{invoice.customer_name}</div>
                          {invoice.customer_phone ? (
                            <div className="text-xs text-slate-500">{invoice.customer_phone}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[140px] truncate">
                          {invoice.customer_gstin || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-semibold">{formatCurrency(invoice.total_amount)}</div>
                          <div className="text-xs text-slate-500">
                            {invoice.is_intra_state
                              ? `CGST ${formatCurrency(invoice.cgst || 0)}`
                              : `IGST ${formatCurrency(invoice.igst || 0)}`}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <GSTInvoiceRowActions
                            layout="menu"
                            onView={() => handleViewInvoice(invoice)}
                            onEdit={() => handleEditInvoice(invoice)}
                            onPrint={() => handleRegenerateInvoice(invoice, 'print')}
                            onDownload={() => handleRegenerateInvoice(invoice, 'pdf')}
                            onDelete={() => handleDeleteInvoice(invoice)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalCount > pageSize && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(10, Math.ceil(totalCount / pageSize)) }, (_, i) => {
                    const totalPages = Math.ceil(totalCount / pageSize);
                    let page: number;
                    if (totalPages <= 10) {
                      page = i + 1;
                    } else {
                      // Show pages around current page
                      const startPage = Math.max(1, currentPage - 4);
                      const endPage = Math.min(totalPages, startPage + 9);
                      page = startPage + i;
                      if (page > endPage) return null;
                    }
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  }).filter(Boolean)}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / pageSize), prev + 1))}
                      className={currentPage >= Math.ceil(totalCount / pageSize) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
              {deleteInvoiceId && allInvoices.find(inv => inv.id === deleteInvoiceId) && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <p className="font-semibold">Invoice: {allInvoices.find(inv => inv.id === deleteInvoiceId)?.invoice_number}</p>
                  <p className="text-sm">Customer: {allInvoices.find(inv => inv.id === deleteInvoiceId)?.customer_name}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setDeleteInvoiceId(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteInvoice}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

