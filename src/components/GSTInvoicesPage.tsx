import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  Search, 
  Download, 
  Eye, 
  FileText,
  Calendar,
  User,
  Receipt,
  Filter,
  X,
  Edit,
  Trash2,
  Save,
  RefreshCw,
  FileSpreadsheet,
  FileDown
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { generateTaxInvoicePDF, generateCombinedTaxInvoicePDF } from '@/lib/tax-invoice-pdf-generator';
import { exportGSTInvoicesToCSV, exportGSTInvoicesToExcel } from '@/lib/gst-export';
import { Bill, CompanyInfo, BillItem } from '@/types';

interface TaxInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  invoice_type: 'B2B' | 'B2C';
  customer_id?: string;
  customer_name: string;
  customer_address: any;
  customer_phone?: string;
  customer_email?: string;
  customer_gstin?: string;
  company_info: CompanyInfo;
  items: BillItem[];
  place_of_supply?: string;
  place_of_supply_code?: string;
  is_intra_state: boolean;
  subtotal: number;
  total_discount: number;
  service_charge: number;
  total_tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total_amount: number;
  gst_breakup?: any;
  invoice_details?: any;
  bank_details?: any;
  notes?: string[];
  terms?: string;
  created_at: string;
}

export default function GSTInvoicesPage() {
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [isEditingInvoiceNumber, setIsEditingInvoiceNumber] = useState(false);
  const [isSavingInvoiceNumber, setIsSavingInvoiceNumber] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bulkDownloadMode, setBulkDownloadMode] = useState<'single' | 'range' | 'all'>('single');
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
    
    // Listen for invoice creation events to refresh the list
    const handleInvoiceCreated = () => {
      console.log('Tax invoice created event received, refreshing list...');
      loadInvoices();
    };
    
    // Listen for page visibility changes to refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Page became visible, refreshing invoices...');
        loadInvoices();
      }
    };
    
    window.addEventListener('taxInvoiceCreated', handleInvoiceCreated);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('taxInvoiceCreated', handleInvoiceCreated);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Only load once on mount

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [filterType, dateFilter, startDate, endDate, selectedMonth, selectedYear, searchQuery]);

  useEffect(() => {
    applyFilters();
  }, [allInvoices, filterType, dateFilter, startDate, endDate, selectedMonth, selectedYear, searchQuery, currentPage]);

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
    let filtered = [...allInvoices];

    // Filter by type
    if (filterType !== 'ALL') {
      filtered = filtered.filter(inv => inv.invoice_type === filterType);
    }

    // Filter by date
    if (dateFilter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include full end date
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate >= start && invDate <= end;
      });
    } else if (dateFilter === 'month') {
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate.getMonth() + 1 === selectedMonth && invDate.getFullYear() === selectedYear;
      });
    } else if (dateFilter === 'year') {
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate.getFullYear() === selectedYear;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(invoice =>
        invoice.invoice_number.toLowerCase().includes(query) ||
        invoice.customer_name.toLowerCase().includes(query) ||
        invoice.customer_phone?.toLowerCase().includes(query) ||
        invoice.customer_email?.toLowerCase().includes(query) ||
        invoice.customer_gstin?.toLowerCase().includes(query)
      );
    }

    // Pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    setInvoices(filtered.slice(startIndex, endIndex));
    setTotalCount(filtered.length);
  };

  const filteredInvoices = invoices;

  const handleViewInvoice = (invoice: TaxInvoice) => {
    setSelectedInvoice(invoice);
    setEditInvoiceNumber(invoice.invoice_number);
    setIsEditingInvoiceNumber(false);
    setViewModalOpen(true);
  };

  const handleRegenerateInvoice = (invoice: TaxInvoice) => {
    // Convert database invoice to Bill format for PDF generation
    const bill: Bill = {
      id: invoice.id,
      billNumber: invoice.invoice_number,
      billDate: invoice.invoice_date,
      company: invoice.company_info,
      customer: {
        id: invoice.customer_id || '',
        name: invoice.customer_name,
        address: typeof invoice.customer_address === 'object' 
          ? `${invoice.customer_address.street || ''}, ${invoice.customer_address.area || ''}`.trim() || ''
          : invoice.customer_address || '',
        city: invoice.customer_address?.city || '',
        state: invoice.customer_address?.state || '',
        pincode: invoice.customer_address?.pincode || '',
        phone: invoice.customer_phone || '',
        email: invoice.customer_email || '',
        gstNumber: invoice.customer_gstin
      },
      items: invoice.items,
      subtotal: invoice.subtotal,
      totalTax: invoice.total_tax,
      serviceCharge: invoice.service_charge,
      totalAmount: invoice.total_amount,
      paymentStatus: 'PENDING' as const,
      notes: invoice.notes?.join('\n'),
      terms: invoice.terms,
      createdAt: invoice.created_at,
      updatedAt: invoice.created_at
    };

    // Add GST-specific data
    (bill as any).gstData = {
      placeOfSupply: invoice.place_of_supply,
      placeOfSupplyCode: invoice.place_of_supply_code,
      isIntraState: invoice.is_intra_state,
      gstBreakup: invoice.gst_breakup,
      taxSplit: {
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst
      },
      reverseCharge: invoice.reverse_charge || false,
      eWayBillNo: invoice.e_way_bill_no,
      transportMode: invoice.transport_mode,
      vehicleNo: invoice.vehicle_no,
      roundOff: invoice.round_off,
      customerGstRequired: invoice.invoice_type === 'B2B'
    };

    // Add invoice details and bank details
    (bill as any).invoiceDetails = {
      invoiceType: invoice.invoice_type,
      ...invoice.invoice_details
    };
    
    (bill as any).bankDetails = invoice.bank_details;

    // Generate PDF
    const pdfData = {
      ...bill,
      gstData: (bill as any).gstData,
      invoiceDetails: (bill as any).invoiceDetails,
      bankDetails: (bill as any).bankDetails
    };

    try {
      generateTaxInvoicePDF(pdfData, 'pdf');
      toast.success('Invoice regenerated successfully');
    } catch (error) {
      console.error('Error regenerating invoice:', error);
      toast.error('Failed to regenerate invoice');
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

  const handleEditInvoiceNumber = (invoice: TaxInvoice) => {
    setSelectedInvoice(invoice);
    setEditInvoiceNumber(invoice.invoice_number);
    setIsEditingInvoiceNumber(true);
    setViewModalOpen(true);
  };

  const handleSaveInvoiceNumber = async () => {
    if (!selectedInvoice || !editInvoiceNumber.trim()) {
      toast.error('Invoice number cannot be empty');
      return;
    }

    if (editInvoiceNumber === selectedInvoice.invoice_number) {
      setIsEditingInvoiceNumber(false);
      return;
    }

    // Check if invoice number already exists
    const { exists } = await db.taxInvoices.checkInvoiceNumberExists(editInvoiceNumber, selectedInvoice.id);
    if (exists) {
      toast.error('Invoice number already exists. Please use a different number.');
      return;
    }

    setIsSavingInvoiceNumber(true);
    try {
      const { data, error } = await db.taxInvoices.update(selectedInvoice.id, {
        invoice_number: editInvoiceNumber.trim()
      });

      if (error) {
        throw error;
      }

      // Update local state
      setAllInvoices(prev => prev.map(inv => 
        inv.id === selectedInvoice.id 
          ? { ...inv, invoice_number: editInvoiceNumber.trim() }
          : inv
      ));
      setSelectedInvoice(prev => prev ? { ...prev, invoice_number: editInvoiceNumber.trim() } : null);
      setIsEditingInvoiceNumber(false);
      toast.success('Invoice number updated successfully');
    } catch (error: any) {
      console.error('Error updating invoice number:', error);
      if (error.code === '23505') { // Unique constraint violation
        toast.error('Invoice number already exists. Please use a different number.');
      } else {
        toast.error('Failed to update invoice number');
      }
    } finally {
      setIsSavingInvoiceNumber(false);
    }
  };

  const handleDeleteInvoice = (invoice: TaxInvoice) => {
    setDeleteInvoiceId(invoice.id);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!deleteInvoiceId) return;

    setIsDeleting(true);
    try {
      const { error } = await db.taxInvoices.delete(deleteInvoiceId);

      if (error) {
        throw error;
      }

      // Update local state
      setAllInvoices(prev => prev.filter(inv => inv.id !== deleteInvoiceId));
      if (selectedInvoice?.id === deleteInvoiceId) {
        setViewModalOpen(false);
        setSelectedInvoice(null);
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
      if (bulkDownloadMode === 'single') {
        dateInvoices = invoicesToUse.filter(inv => {
          const invDate = new Date(inv.invoice_date).toISOString().split('T')[0];
          return invDate === bulkDownloadDate;
        });
      } else if (bulkDownloadMode === 'range') {
        const start = new Date(bulkDownloadStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(bulkDownloadEndDate);
        end.setHours(23, 59, 59, 999);
        
        dateInvoices = invoicesToUse.filter(inv => {
          const invDate = new Date(inv.invoice_date);
          return invDate >= start && invDate <= end;
        });
      } else if (bulkDownloadMode === 'all') {
        dateInvoices = invoicesToUse;
      }

      if (dateInvoices.length === 0) {
        const errorMsg = bulkDownloadMode === 'all' 
          ? 'No invoices found'
          : bulkDownloadMode === 'range'
          ? 'No invoices found for the selected date range'
          : 'No invoices found for the selected date';
        toast.error(errorMsg);
        setIsBulkDownloading(false);
        return;
      }

      console.log(`Total invoices after filtering: ${dateInvoices.length}`);
      
      // Filter by invoice type for bulk download
      let invoicesToDownload = dateInvoices;
      if (bulkDownloadInvoiceType === 'B2B') {
        invoicesToDownload = dateInvoices.filter(inv => inv.invoice_type === 'B2B');
      } else if (bulkDownloadInvoiceType === 'B2C') {
        invoicesToDownload = dateInvoices.filter(inv => inv.invoice_type === 'B2C');
      }
      // If 'ALL', use all invoices
      
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

      // Convert invoices to Bill format
      const convertInvoiceToBill = (invoice: TaxInvoice): any => {
        const bill: Bill = {
          id: invoice.id,
          billNumber: invoice.invoice_number,
          billDate: invoice.invoice_date,
          company: invoice.company_info,
          customer: {
            id: invoice.customer_id || '',
            name: invoice.customer_name,
            address: typeof invoice.customer_address === 'object' 
              ? `${invoice.customer_address.street || ''}, ${invoice.customer_address.area || ''}`.trim() || ''
              : invoice.customer_address || '',
            city: invoice.customer_address?.city || '',
            state: invoice.customer_address?.state || '',
            pincode: invoice.customer_address?.pincode || '',
            phone: invoice.customer_phone || '',
            email: invoice.customer_email || '',
            gstNumber: invoice.customer_gstin
          },
          items: invoice.items,
          subtotal: invoice.subtotal,
          totalTax: invoice.total_tax,
          serviceCharge: invoice.service_charge,
          totalAmount: invoice.total_amount,
          paymentStatus: 'PENDING' as const,
          notes: invoice.notes?.join('\n'),
          terms: invoice.terms,
          createdAt: invoice.created_at,
          updatedAt: invoice.created_at
        };

        (bill as any).gstData = {
          placeOfSupply: invoice.place_of_supply,
          placeOfSupplyCode: invoice.place_of_supply_code,
          isIntraState: invoice.is_intra_state,
          gstBreakup: invoice.gst_breakup,
          taxSplit: {
            cgst: invoice.cgst,
            sgst: invoice.sgst,
            igst: invoice.igst
          },
          reverseCharge: invoice.reverse_charge || false,
          eWayBillNo: invoice.e_way_bill_no,
          transportMode: invoice.transport_mode,
          vehicleNo: invoice.vehicle_no,
          roundOff: invoice.round_off,
          customerGstRequired: invoice.invoice_type === 'B2B'
        };

        (bill as any).invoiceDetails = {
          invoiceType: invoice.invoice_type,
          ...invoice.invoice_details
        };
        
        (bill as any).bankDetails = invoice.bank_details;

        return bill;
      };

      // Generate filename based on mode
      let filenameSuffix = '';
      if (bulkDownloadMode === 'single') {
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
        .map(convertInvoiceToBill);
      
      // Generate filename based on invoice type
      const invoiceTypePrefix = bulkDownloadInvoiceType === 'ALL' 
        ? 'All_Invoices' 
        : bulkDownloadInvoiceType === 'B2B' 
        ? 'B2B_Invoices' 
        : 'B2C_Invoices';
      
      console.log(`Generating combined PDF for ${allBills.length} invoices (${b2bInvoices.length} B2B + ${b2cInvoices.length} B2C)`);
      
      if (allBills.length > 0) {
        // Generate single combined PDF with filtered invoices
        generateCombinedTaxInvoicePDF(allBills, `${invoiceTypePrefix}_${filenameSuffix}`, 'pdf');
      } else {
        toast.error('No invoices to download');
      }

      const modeText = bulkDownloadMode === 'all' 
        ? 'all invoices'
        : bulkDownloadMode === 'range'
        ? `invoices from ${bulkDownloadStartDate} to ${bulkDownloadEndDate}`
        : `invoices for ${bulkDownloadDate}`;
      
      const invoiceTypeText = bulkDownloadInvoiceType === 'ALL' 
        ? `${b2bInvoices.length} B2B and ${b2cInvoices.length} B2C`
        : bulkDownloadInvoiceType === 'B2B'
        ? `${b2bInvoices.length} B2B`
        : `${b2cInvoices.length} B2C`;
      
      toast.success(`Downloaded ${invoiceTypeText} ${modeText}`);
    } catch (error) {
      console.error('Error downloading bulk invoices:', error);
      toast.error('Failed to download invoices');
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const generateBulkInvoicePDF = async (bills: any[], filename: string) => {
    // For bulk download, we'll generate PDFs one by one
    // The browser will handle multiple downloads
    for (let i = 0; i < bills.length; i++) {
      const bill = bills[i];
      const pdfData = {
        ...bill,
        gstData: (bill as any).gstData,
        invoiceDetails: (bill as any).invoiceDetails,
        bankDetails: (bill as any).bankDetails
      };
      
      // Generate PDF for each invoice
      // Use a small delay between downloads to avoid browser blocking
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      generateTaxInvoicePDF(pdfData, 'pdf');
    }
  };

  // Get filtered invoices based on current filters
  const getFilteredInvoicesForExport = (): TaxInvoice[] => {
    let filtered = [...allInvoices];

    // Filter by type
    if (filterType !== 'ALL') {
      filtered = filtered.filter(inv => inv.invoice_type === filterType);
    }

    // Filter by date
    if (dateFilter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate >= start && invDate <= end;
      });
    } else if (dateFilter === 'month') {
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate.getMonth() + 1 === selectedMonth && invDate.getFullYear() === selectedYear;
      });
    } else if (dateFilter === 'year') {
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate.getFullYear() === selectedYear;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(invoice =>
        invoice.invoice_number.toLowerCase().includes(query) ||
        invoice.customer_name.toLowerCase().includes(query) ||
        invoice.customer_phone?.toLowerCase().includes(query) ||
        invoice.customer_email?.toLowerCase().includes(query) ||
        invoice.customer_gstin?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  // Export to CSV
  const handleExportToCSV = () => {
    const invoicesToExport = getFilteredInvoicesForExport();
    
    if (invoicesToExport.length === 0) {
      toast.error('No invoices to export');
      return;
    }

    let filename = 'GST_Invoices';
    if (dateFilter === 'month') {
      const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
      filename = `GST_Invoices_${monthName}_${selectedYear}`;
    } else if (dateFilter === 'year') {
      filename = `GST_Invoices_${selectedYear}`;
    } else if (dateFilter === 'custom' && startDate && endDate) {
      filename = `GST_Invoices_${startDate}_to_${endDate}`;
    }

    exportGSTInvoicesToCSV(invoicesToExport, filename);
    toast.success(`Exported ${invoicesToExport.length} invoices to CSV`);
  };

  // Export to Excel
  const handleExportToExcel = () => {
    const invoicesToExport = getFilteredInvoicesForExport();
    
    if (invoicesToExport.length === 0) {
      toast.error('No invoices to export');
      return;
    }

    let filename = 'GST_Invoices';
    if (dateFilter === 'month') {
      const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
      filename = `GST_Invoices_${monthName}_${selectedYear}`;
    } else if (dateFilter === 'year') {
      filename = `GST_Invoices_${selectedYear}`;
    } else if (dateFilter === 'custom' && startDate && endDate) {
      filename = `GST_Invoices_${startDate}_to_${endDate}`;
    }

    exportGSTInvoicesToExcel(invoicesToExport, filename);
    toast.success(`Exported ${invoicesToExport.length} invoices to Excel`);
  };

  // Export monthly invoices (all invoices of selected month)
  const handleExportMonthlyInvoices = (format: 'csv' | 'excel') => {
    const monthlyInvoices = allInvoices.filter(inv => {
      const invDate = new Date(inv.invoice_date);
      return invDate.getMonth() + 1 === selectedMonth && invDate.getFullYear() === selectedYear;
    });

    if (monthlyInvoices.length === 0) {
      toast.error(`No invoices found for ${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`);
      return;
    }

    const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
    const filename = `GST_Invoices_${monthName}_${selectedYear}`;

    if (format === 'csv') {
      exportGSTInvoicesToCSV(monthlyInvoices, filename);
      toast.success(`Exported ${monthlyInvoices.length} invoices for ${monthName} ${selectedYear} to CSV`);
    } else {
      exportGSTInvoicesToExcel(monthlyInvoices, filename);
      toast.success(`Exported ${monthlyInvoices.length} invoices for ${monthName} ${selectedYear} to Excel`);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">GST Invoices</h1>
          <p className="text-gray-500 mt-1">View and manage all tax invoices</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Quick Export Buttons */}
          {getFilteredInvoicesForExport().length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={handleExportToCSV}
                className="border-green-600 text-green-700 hover:bg-green-50"
                size="sm"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export CSV ({getFilteredInvoicesForExport().length})
              </Button>
              <Button
                variant="outline"
                onClick={handleExportToExcel}
                className="border-green-600 text-green-700 hover:bg-green-50"
                size="sm"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel ({getFilteredInvoicesForExport().length})
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => loadInvoices()}
            disabled={loading}
            className="flex items-center gap-2"
            size="sm"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <Input
              placeholder="Search by invoice number, customer name, phone, email, or GSTIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Invoice Type Filter */}
          <div>
            <Label className="mb-2 block">Invoice Type</Label>
            <div className="flex gap-2">
              <Button
                variant={filterType === 'ALL' ? 'default' : 'outline'}
                onClick={() => setFilterType('ALL')}
                size="sm"
              >
                All
              </Button>
              <Button
                variant={filterType === 'B2B' ? 'default' : 'outline'}
                onClick={() => setFilterType('B2B')}
                size="sm"
              >
                B2B
              </Button>
              <Button
                variant={filterType === 'B2C' ? 'default' : 'outline'}
                onClick={() => setFilterType('B2C')}
                size="sm"
              >
                B2C
              </Button>
            </div>
          </div>

          {/* Bulk Download */}
          <div className="border-t pt-4">
            <Label className="mb-2 block font-semibold">Bulk Download</Label>
            
            {/* Download Mode Selection */}
            <div className="mb-3">
              <Label className="mb-2 block text-xs">Download Mode</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={bulkDownloadMode === 'single' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBulkDownloadMode('single')}
                >
                  Single Date
                </Button>
                <Button
                  variant={bulkDownloadMode === 'range' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBulkDownloadMode('range')}
                >
                  Date Range
                </Button>
                <Button
                  variant={bulkDownloadMode === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBulkDownloadMode('all')}
                >
                  All Invoices
                </Button>
              </div>
            </div>

            {/* Single Date Mode */}
            {bulkDownloadMode === 'single' && (
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">Select Date</Label>
                  <Input
                    type="date"
                    value={bulkDownloadDate}
                    onChange={(e) => setBulkDownloadDate(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Date Range Mode */}
            {bulkDownloadMode === 'range' && (
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={bulkDownloadStartDate}
                    onChange={(e) => setBulkDownloadStartDate(e.target.value)}
                    className="w-full"
                    max={bulkDownloadEndDate || undefined}
                  />
                </div>
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={bulkDownloadEndDate}
                    onChange={(e) => setBulkDownloadEndDate(e.target.value)}
                    className="w-full"
                    min={bulkDownloadStartDate || undefined}
                  />
                </div>
              </div>
            )}

            {/* Invoice Type Selection for Bulk Download */}
            <div className="mb-3">
              <Label className="mb-2 block text-xs">Invoice Type</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={bulkDownloadInvoiceType === 'ALL' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBulkDownloadInvoiceType('ALL')}
                >
                  All (B2B + B2C)
                </Button>
                <Button
                  variant={bulkDownloadInvoiceType === 'B2B' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBulkDownloadInvoiceType('B2B')}
                >
                  B2B Only
                </Button>
                <Button
                  variant={bulkDownloadInvoiceType === 'B2C' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBulkDownloadInvoiceType('B2C')}
                >
                  B2C Only
                </Button>
              </div>
            </div>

            {/* All Mode - Show info */}
            {bulkDownloadMode === 'all' && (
              <div className="mb-3 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  This will download {bulkDownloadInvoiceType === 'ALL' ? `all ${allInvoices.length} invoices (B2B + B2C)` : bulkDownloadInvoiceType === 'B2B' ? 'all B2B invoices' : 'all B2C invoices'} in a single PDF.
                </p>
              </div>
            )}

            {/* Download Buttons */}
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleBulkDownload}
                  disabled={
                    isBulkDownloading ||
                    (bulkDownloadMode === 'single' && !bulkDownloadDate) ||
                    (bulkDownloadMode === 'range' && (!bulkDownloadStartDate || !bulkDownloadEndDate))
                  }
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isBulkDownloading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </>
                  )}
                </Button>
                
                {/* CSV Export Button */}
                <Button
                  onClick={handleExportToCSV}
                  variant="outline"
                  className="border-green-600 text-green-700 hover:bg-green-50"
                  disabled={
                    (bulkDownloadMode === 'single' && !bulkDownloadDate) ||
                    (bulkDownloadMode === 'range' && (!bulkDownloadStartDate || !bulkDownloadEndDate))
                  }
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                
                {/* Excel Export Button */}
                <Button
                  onClick={handleExportToExcel}
                  variant="outline"
                  className="border-green-600 text-green-700 hover:bg-green-50"
                  disabled={
                    (bulkDownloadMode === 'single' && !bulkDownloadDate) ||
                    (bulkDownloadMode === 'range' && (!bulkDownloadStartDate || !bulkDownloadEndDate))
                  }
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                
                {/* Clear button for range mode */}
                {bulkDownloadMode === 'range' && (bulkDownloadStartDate || bulkDownloadEndDate) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBulkDownloadStartDate('');
                      setBulkDownloadEndDate('');
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                )}
              </div>
              
              <p className="text-xs text-gray-500">
                {bulkDownloadMode === 'all' 
                  ? `Downloads ${bulkDownloadInvoiceType === 'ALL' ? 'all invoices (B2B + B2C)' : bulkDownloadInvoiceType === 'B2B' ? 'all B2B invoices' : 'all B2C invoices'} in a single PDF.`
                  : bulkDownloadMode === 'range'
                  ? `Downloads ${bulkDownloadInvoiceType === 'ALL' ? 'all invoices (B2B + B2C)' : bulkDownloadInvoiceType === 'B2B' ? 'B2B invoices' : 'B2C invoices'} within the selected date range.`
                  : `Downloads ${bulkDownloadInvoiceType === 'ALL' ? 'all invoices (B2B + B2C)' : bulkDownloadInvoiceType === 'B2B' ? 'B2B invoices' : 'B2C invoices'} for the selected date.`}
                <br />
                <span className="text-green-700 font-semibold">CSV/Excel exports are formatted in GST standard format for easy GST filing.</span>
              </p>
            </div>
          </div>

          {/* Monthly Export Section */}
          <div className="border-t pt-4 mt-4">
            <Label className="mb-2 block font-semibold">Monthly Export (GST Filing)</Label>
            <p className="text-xs text-gray-600 mb-3">
              Export all invoices for a specific month in GST standard format for easy GST payment and filing.
            </p>
            <div className="flex gap-2 items-end mb-3">
              <div className="flex-1">
                <Label className="mb-1 block text-xs">Month</Label>
                <Select value={selectedMonth.toString()} onValueChange={(value) => {
                  setSelectedMonth(parseInt(value));
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                      <SelectItem key={month} value={month.toString()}>
                        {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-1 block text-xs">Year</Label>
                <Select value={selectedYear.toString()} onValueChange={(value) => {
                  setSelectedYear(parseInt(value));
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleExportMonthlyInvoices('csv')}
                variant="outline"
                className="border-green-600 text-green-700 hover:bg-green-50 flex-1"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export Month CSV
              </Button>
              <Button
                onClick={() => handleExportMonthlyInvoices('excel')}
                variant="outline"
                className="border-green-600 text-green-700 hover:bg-green-50 flex-1"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Month Excel
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Exports all invoices for {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })} {selectedYear} in GST standard format.
            </p>
          </div>

          {/* Date Filter */}
          <div className="border-t pt-4">
            <Label className="mb-2 block text-sm sm:text-base">Date Filter</Label>
            <Select value={dateFilter} onValueChange={(value: 'all' | 'custom' | 'month' | 'year') => {
              setDateFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Select date filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === 'month' && (
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <Select value={selectedMonth.toString()} onValueChange={(value) => {
                  setSelectedMonth(parseInt(value));
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                      <SelectItem key={month} value={month.toString()}>
                        {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear.toString()} onValueChange={(value) => {
                  setSelectedYear(parseInt(value));
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dateFilter === 'year' && (
              <div className="mt-2">
                <Select value={selectedYear.toString()} onValueChange={(value) => {
                  setSelectedYear(parseInt(value));
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dateFilter === 'custom' && (
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setCurrentPage(1);
                    }}
                    className="mt-6"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {dateFilter !== 'all' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFilter('all');
                  setStartDate('');
                  setEndDate('');
                  setSelectedMonth(new Date().getMonth() + 1);
                  setSelectedYear(new Date().getFullYear());
                  setCurrentPage(1);
                }}
                className="mt-2"
              >
                Clear Date Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoices ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No invoices found</div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-4">
                {filteredInvoices.map((invoice) => (
                  <Card key={invoice.id} className="mx-4">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-semibold text-sm mb-1 break-all">
                            {invoice.invoice_number}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="h-3 w-3" />
                            {formatDate(invoice.invoice_date)}
                          </div>
                        </div>
                        <Badge variant={invoice.invoice_type === 'B2B' ? 'default' : 'secondary'} className="text-xs shrink-0">
                          {invoice.invoice_type}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Customer: </span>
                          <span>{invoice.customer_name}</span>
                        </div>
                        {invoice.customer_phone && (
                          <div>
                            <span className="font-medium">Phone: </span>
                            <span>{invoice.customer_phone}</span>
                          </div>
                        )}
                        {invoice.customer_gstin && (
                          <div>
                            <span className="font-medium">GSTIN: </span>
                            <span className="font-mono text-xs">{invoice.customer_gstin}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Total: </span>
                          <span className="font-semibold">{formatCurrency(invoice.total_amount)}</span>
                        </div>
                        <div className="text-xs">
                          {invoice.is_intra_state ? (
                            <div>
                              <span>CGST: {formatCurrency(invoice.cgst)}</span>
                              <span className="mx-2">|</span>
                              <span>SGST: {formatCurrency(invoice.sgst)}</span>
                            </div>
                          ) : (
                            <div>IGST: {formatCurrency(invoice.igst)}</div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewInvoice(invoice)}
                          className="flex-1 min-w-[80px] text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRegenerateInvoice(invoice)}
                          className="flex-1 min-w-[80px] text-xs"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            exportGSTInvoicesToCSV([invoice], `Invoice_${invoice.invoice_number}`);
                            toast.success('Invoice exported to CSV');
                          }}
                          className="border-green-600 text-green-700 hover:bg-green-50 text-xs"
                          title="Export to CSV"
                        >
                          <FileDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            exportGSTInvoicesToExcel([invoice], `Invoice_${invoice.invoice_number}`);
                            toast.success('Invoice exported to Excel');
                          }}
                          className="border-green-600 text-green-700 hover:bg-green-50 text-xs"
                          title="Export to Excel"
                        >
                          <FileSpreadsheet className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {/* Desktop Table View */}
              <div className="hidden sm:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Customer GSTIN</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono font-semibold">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {formatDate(invoice.invoice_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoice.invoice_type === 'B2B' ? 'default' : 'secondary'}>
                          {invoice.invoice_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{invoice.customer_name}</div>
                          {invoice.customer_phone && (
                            <div className="text-sm text-gray-500">{invoice.customer_phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {invoice.customer_gstin || '-'}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(invoice.total_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {invoice.is_intra_state ? (
                            <div>
                              <div>CGST: {formatCurrency(invoice.cgst)}</div>
                              <div>SGST: {formatCurrency(invoice.sgst)}</div>
                            </div>
                          ) : (
                            <div>IGST: {formatCurrency(invoice.igst)}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewInvoice(invoice)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRegenerateInvoice(invoice)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              exportGSTInvoicesToCSV([invoice], `Invoice_${invoice.invoice_number}`);
                              toast.success('Invoice exported to CSV');
                            }}
                            className="border-green-600 text-green-700 hover:bg-green-50"
                            title="Export to CSV"
                          >
                            <FileDown className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              exportGSTInvoicesToExcel([invoice], `Invoice_${invoice.invoice_number}`);
                              toast.success('Invoice exported to Excel');
                            }}
                            className="border-green-600 text-green-700 hover:bg-green-50"
                            title="Export to Excel"
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
        </CardContent>
      </Card>

      {/* View Invoice Modal */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details - {selectedInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>
              View complete invoice information
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Invoice Number</label>
                  {isEditingInvoiceNumber ? (
                    <div className="flex gap-2 items-center mt-1">
                      <Input
                        value={editInvoiceNumber}
                        onChange={(e) => setEditInvoiceNumber(e.target.value)}
                        className="font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveInvoiceNumber();
                          } else if (e.key === 'Escape') {
                            setIsEditingInvoiceNumber(false);
                            setEditInvoiceNumber(selectedInvoice.invoice_number);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveInvoiceNumber}
                        disabled={isSavingInvoiceNumber}
                      >
                        {isSavingInvoiceNumber ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsEditingInvoiceNumber(false);
                          setEditInvoiceNumber(selectedInvoice.invoice_number);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-semibold">{selectedInvoice.invoice_number}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditInvoiceNumber(selectedInvoice.invoice_number);
                          setIsEditingInvoiceNumber(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Invoice Date</label>
                  <p>{formatDate(selectedInvoice.invoice_date)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Invoice Type</label>
                  <Badge variant={selectedInvoice.invoice_type === 'B2B' ? 'default' : 'secondary'}>
                    {selectedInvoice.invoice_type}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Place of Supply</label>
                  <p>{selectedInvoice.place_of_supply || '-'}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium text-gray-500">Customer Information</label>
                <div className="mt-2 space-y-1">
                  <p className="font-medium">{selectedInvoice.customer_name}</p>
                  {selectedInvoice.customer_phone && <p>Phone: {selectedInvoice.customer_phone}</p>}
                  {selectedInvoice.customer_email && <p>Email: {selectedInvoice.customer_email}</p>}
                  {selectedInvoice.customer_gstin && (
                    <p className="font-mono">GSTIN: {selectedInvoice.customer_gstin}</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium text-gray-500">Financial Summary</label>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.total_discount > 0 && (
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span>-{formatCurrency(selectedInvoice.total_discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>GST:</span>
                    <span>{formatCurrency(selectedInvoice.total_tax)}</span>
                  </div>
                  {selectedInvoice.round_off !== 0 && (
                    <div className="flex justify-between">
                      <span>Round Off:</span>
                      <span>{formatCurrency(selectedInvoice.round_off)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total Amount:</span>
                    <span>{formatCurrency(selectedInvoice.total_amount)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t flex-wrap">
                <Button onClick={() => handleRegenerateInvoice(selectedInvoice)} className="flex-1 min-w-[140px]">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
                <Button 
                  onClick={() => {
                    exportGSTInvoicesToCSV([selectedInvoice], `Invoice_${selectedInvoice.invoice_number}`);
                    toast.success('Invoice exported to CSV');
                  }} 
                  variant="outline"
                  className="flex-1 min-w-[140px] border-green-600 text-green-700 hover:bg-green-50"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button 
                  onClick={() => {
                    exportGSTInvoicesToExcel([selectedInvoice], `Invoice_${selectedInvoice.invoice_number}`);
                    toast.success('Invoice exported to Excel');
                  }} 
                  variant="outline"
                  className="flex-1 min-w-[140px] border-green-600 text-green-700 hover:bg-green-50"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                <Button 
                  onClick={() => handleDeleteInvoice(selectedInvoice)}
                  variant="outline"
                  className="flex-1 min-w-[140px] border-red-600 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button variant="outline" onClick={() => setViewModalOpen(false)} className="min-w-[100px]">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

