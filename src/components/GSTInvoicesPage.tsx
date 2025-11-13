import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Search, 
  Download, 
  Eye, 
  FileText,
  Calendar,
  User,
  Receipt,
  Filter
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { generateTaxInvoicePDF } from '@/lib/tax-invoice-pdf-generator';
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    loadInvoices();
  }, [currentPage, filterType]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const { data, error, count } = await db.taxInvoices.getAll(pageSize, offset);
      
      if (error) {
        toast.error('Failed to load invoices');
        console.error(error);
        return;
      }
      
      // Filter by type if needed
      let filteredData = data || [];
      if (filterType !== 'ALL') {
        filteredData = filteredData.filter(inv => inv.invoice_type === filterType);
      }
      
      setInvoices(filteredData);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const query = searchQuery.toLowerCase();
    return (
      invoice.invoice_number.toLowerCase().includes(query) ||
      invoice.customer_name.toLowerCase().includes(query) ||
      invoice.customer_phone?.toLowerCase().includes(query) ||
      invoice.customer_email?.toLowerCase().includes(query) ||
      invoice.customer_gstin?.toLowerCase().includes(query)
    );
  });

  const handleViewInvoice = (invoice: TaxInvoice) => {
    setSelectedInvoice(invoice);
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">GST Invoices</h1>
          <p className="text-gray-500 mt-1">View and manage all tax invoices</p>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <Input
                placeholder="Search by invoice number, customer name, phone, email, or GSTIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterType === 'ALL' ? 'default' : 'outline'}
                onClick={() => setFilterType('ALL')}
              >
                All
              </Button>
              <Button
                variant={filterType === 'B2B' ? 'default' : 'outline'}
                onClick={() => setFilterType('B2B')}
              >
                B2B
              </Button>
              <Button
                variant={filterType === 'B2C' ? 'default' : 'outline'}
                onClick={() => setFilterType('B2C')}
              >
                B2C
              </Button>
            </div>
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
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No invoices found</div>
          ) : (
            <div className="overflow-x-auto">
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
                        <div className="flex gap-2">
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
                            onClick={() => handleRegenerateInvoice(invoice)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
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
                  <p className="font-mono font-semibold">{selectedInvoice.invoice_number}</p>
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

              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={() => handleRegenerateInvoice(selectedInvoice)} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download Invoice
                </Button>
                <Button variant="outline" onClick={() => setViewModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

