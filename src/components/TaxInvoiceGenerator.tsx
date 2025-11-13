import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Download, Edit, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero';
  
  const convertHundreds = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' ';
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100);
  };
  
  let result = '';
  let remaining = Math.floor(num);
  
  if (remaining >= 10000000) {
    result += convertHundreds(Math.floor(remaining / 10000000)) + 'Crore ';
    remaining %= 10000000;
  }
  if (remaining >= 100000) {
    result += convertHundreds(Math.floor(remaining / 100000)) + 'Lakh ';
    remaining %= 100000;
  }
  if (remaining >= 1000) {
    result += convertHundreds(Math.floor(remaining / 1000)) + 'Thousand ';
    remaining %= 1000;
  }
  if (remaining > 0) {
    result += convertHundreds(remaining);
  }
  
  const paise = Math.round((num - Math.floor(num)) * 100);
  const words = result.trim() + ' Rupees';
  if (paise > 0) {
    return words + ' and ' + paise + ' Paise Only';
  }
  return words + ' Only';
}

interface TaxInvoiceGeneratorProps {
  customer?: Customer;
  onPrint?: (bill: Bill, action?: 'print' | 'pdf') => void;
}

const defaultCompanyInfo: CompanyInfo = {
  name: "Authorised Service Franchise",
  address: "Ground Floor, 13, 4th Main Road, Next To Jain Temple,Seshadripuram, Kumara Park West",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560020",
  phone: "9886944288 & 8884944288",
  email: "mail@hydrogenro.com",
  gstNumber: "29LIJPS5140P1Z6",
  panNumber: "LIJPS5140P",
  website: "hydrogenro.com"
};

const defaultBankDetails = {
  bankName: "State Bank of India",
  accountNumber: "123456789012",
  ifscCode: "SBIN0001234",
  branchName: "Seshadripuram Branch, Bengaluru",
  accountHolderName: "Hydrogen RO Services"
};

const defaultTaxInvoiceItems: BillItem[] = [
  {
    id: '1',
    description: 'RO Water Purifier Installation',
    quantity: 1,
    unitPrice: 15000,
    total: 17700, // Base + GST
    taxRate: 18, // Default 18% GST
    taxAmount: 2700,
    hsnCode: '8421' // Default HSN code
  }
];

export default function TaxInvoiceGenerator({ customer, onPrint }: TaxInvoiceGeneratorProps) {
  // Safe customer data extraction
  const customerName = customer?.fullName || (customer as any)?.full_name || 'Customer Name';
  const customerPhone = typeof customer?.phone === 'string' ? customer.phone : (customer as any)?.phone || '';
  const customerEmail = customer?.email || '';
  const customerAddress = customer?.address || {};
  const customerGst = customer?.gstNumber || '';
  const customerServiceType = customer?.serviceType || 'RO';

  // State management
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [items, setItems] = useState<BillItem[]>(defaultTaxInvoiceItems);
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [validityNote, setValidityNote] = useState('This tax invoice is valid for 30 days from the date of issue. Prices are subject to change without prior notice.');
  const [showValidityNote, setShowValidityNote] = useState(false);
  const [terms, setTerms] = useState(`1. Goods once sold will not be taken back and refund or exchange.
2. There is 60 Days warranty for RO & PUMP. No Warranty for other spare parts.
3. Without the invoice there will not be any warranty / free service given.
4. There is no warranty on the water purifier used for more than 750 PPM water TDS level.
5. Once the order placed cannot be cancelled and advance amount will not be returned.
6. Charges of Rs. 500/- extra to be paid on collection of the cash against cheque return.
7. Company is not responsible for any transactions done personally with the technicians.`);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  
  // GST-specific state
  const [placeOfSupply, setPlaceOfSupply] = useState(customerAddress.state || 'Karnataka');
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState('29'); // Karnataka state code
  const [reverseCharge, setReverseCharge] = useState(false);
  const [eWayBillNo, setEWayBillNo] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [roundOff, setRoundOff] = useState(true);
  const [customerGstRequired, setCustomerGstRequired] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'B2B' | 'B2C'>('B2C'); // B2B = Business to Business, B2C = Business to Consumer
  const [bankDetails, setBankDetails] = useState(defaultBankDetails);
  const [poNumber, setPONumber] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: '',
    area: '',
    city: '',
    state: '',
    pincode: ''
  });
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);

  // Auto-set customer GST required based on invoice type
  useEffect(() => {
    if (invoiceType === 'B2B') {
      setCustomerGstRequired(true);
    } else {
      setCustomerGstRequired(false);
      // Clear GST if switching to B2C
      setEditableCustomer(prev => ({ ...prev, gst: prev.gst || '' }));
    }
  }, [invoiceType]);

  // Editable customer information state
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editableCustomer, setEditableCustomer] = useState({
    name: customerName || '',
    phone: customerPhone || '',
    email: customerEmail || '',
    gst: customerGst || '',
    address: {
      street: customerAddress.street || '',
      area: customerAddress.area || '',
      city: customerAddress.city || '',
      state: customerAddress.state || '',
      pincode: customerAddress.pincode || ''
    }
  });

  // Calculate totals with GST (after discounts)
  const subtotal = items.reduce((sum, item) => {
    const baseAmount = item.quantity * item.unitPrice;
    const discount = (item as any).discount || 0;
    return sum + Math.max(0, baseAmount - discount);
  }, 0); // Taxable amount after discounts
  const totalDiscount = items.reduce((sum, item) => sum + ((item as any).discount || 0), 0);
  const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
  
  // Determine if intra-state (same state) or inter-state (different state)
  const isIntraState = placeOfSupply === company.state;
  
  // Calculate GST breakup by rate (after discounts)
  const calculateGSTBreakup = () => {
    const gstByRate: Record<number, { taxableAmount: number; taxAmount: number }> = {};
    
    items.forEach(item => {
      if (item.taxRate > 0) {
        const baseAmount = item.quantity * item.unitPrice;
        const discount = (item as any).discount || 0;
        const taxableAmount = Math.max(0, baseAmount - discount);
        if (!gstByRate[item.taxRate]) {
          gstByRate[item.taxRate] = { taxableAmount: 0, taxAmount: 0 };
        }
        gstByRate[item.taxRate].taxableAmount += taxableAmount;
        gstByRate[item.taxRate].taxAmount += item.taxAmount;
      }
    });
    
    return gstByRate;
  };
  
  const gstBreakup = calculateGSTBreakup();
  
  // Calculate CGST, SGST (for intra-state) or IGST (for inter-state)
  const calculateTaxSplit = () => {
    if (isIntraState) {
      // Intra-state: CGST + SGST (each half of GST)
      return {
        cgst: totalTax / 2,
        sgst: totalTax / 2,
        igst: 0
      };
    } else {
      // Inter-state: IGST (full GST)
      return {
        cgst: 0,
        sgst: 0,
        igst: totalTax
      };
    }
  };
  
  const taxSplit = calculateTaxSplit();
  
  // Calculate total with round off
  let calculatedTotal = subtotal + serviceCharge + totalTax;
  let finalRoundOff = 0;
  
  if (roundOff) {
    finalRoundOff = Math.round(calculatedTotal) - calculatedTotal;
    calculatedTotal = Math.round(calculatedTotal);
  }
  
  const totalAmount = calculatedTotal;

  // Generate invoice number
  useEffect(() => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setBillNumber(`INV-${year}-${month}-${randomNum}`);
  }, []);

  const addItem = () => {
    const newItem: BillItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
      taxRate: 18, // Default 18% GST
      taxAmount: 0,
      hsnCode: '8421', // Default HSN code for water purification equipment
      discount: 0 // Default discount
    } as any;
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const addNote = () => {
    if (newNote.trim()) {
      setNotes([...notes, newNote.trim()]);
      setNewNote('');
    }
  };

  const editNote = (index: number) => {
    setEditingNoteIndex(index);
    setNewNote(notes[index]);
  };

  const updateNote = () => {
    if (editingNoteIndex !== null && newNote.trim()) {
      const updatedNotes = [...notes];
      updatedNotes[editingNoteIndex] = newNote.trim();
      setNotes(updatedNotes);
      setEditingNoteIndex(null);
      setNewNote('');
    }
  };

  const removeNote = (index: number) => {
    setNotes(notes.filter((_, i) => i !== index));
  };

  const cancelEdit = () => {
    setEditingNoteIndex(null);
    setNewNote('');
  };

  const updateItem = (id: string, field: keyof BillItem, value: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate totals when quantity, unitPrice, or taxRate changes
        if (field === 'quantity' || field === 'unitPrice' || field === 'taxRate') {
          const baseTotal = updatedItem.quantity * updatedItem.unitPrice;
          updatedItem.total = baseTotal;
          updatedItem.taxAmount = Math.round((baseTotal * updatedItem.taxRate) / 100);
          updatedItem.total = baseTotal + updatedItem.taxAmount;
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const addTerm = () => {
    if (newTerm.trim()) {
      const currentTerms = terms.split('\n').filter(line => line.trim());
      const termNumber = currentTerms.length + 1;
      const formattedTerm = `${termNumber}. ${newTerm.trim()}`;
      const updatedTerms = [...currentTerms, formattedTerm].join('\n');
      setTerms(updatedTerms);
      setNewTerm('');
    }
  };

  const removeTerm = (index: number) => {
    const currentTerms = terms.split('\n').filter(line => line.trim());
    const updatedTerms = currentTerms.filter((_, i) => i !== index);
    // Renumber the terms
    const renumberedTerms = updatedTerms.map((term, i) => {
      const termText = term.replace(/^\d+\.\s*/, ''); // Remove existing number
      return `${i + 1}. ${termText}`;
    });
    setTerms(renumberedTerms.join('\n'));
  };

  const termsList = terms.split('\n').filter(line => line.trim());
  const notesList = notes;

  const handlePrint = (action: 'print' | 'pdf' = 'print') => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }

    // Validate B2B invoice requires customer GST
    if (invoiceType === 'B2B' && !editableCustomer.gst) {
      toast.error('Customer GSTIN is mandatory for B2B invoices. Please enter customer GST number.');
      return;
    }

    const bill: Bill = {
      id: Date.now().toString(),
      billNumber,
      billDate,
      company,
      customer: {
        id: customer.id || '',
        name: editableCustomer.name,
        address: `${editableCustomer.address.street || ''}, ${editableCustomer.address.area || ''}`.trim() || '',
        city: editableCustomer.address.city || '',
        state: editableCustomer.address.state || '',
        pincode: editableCustomer.address.pincode || '',
        phone: editableCustomer.phone,
        email: editableCustomer.email,
        gstNumber: editableCustomer.gst
      },
      items,
      subtotal,
      totalTax,
      serviceCharge,
      totalAmount,
      paymentStatus: 'PENDING',
      paymentMethod: 'CASH',
      notes: notes.join('\n'),
      terms: showValidityNote ? `${validityNote}\n\n${terms}` : terms,
      serviceType: customerServiceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;
    
    // Add GST-specific data
    (bill as any).gstData = {
      placeOfSupply,
      placeOfSupplyCode,
      isIntraState,
      gstBreakup,
      taxSplit,
      reverseCharge,
      eWayBillNo,
      transportMode,
      vehicleNo,
      roundOff: finalRoundOff,
      customerGstRequired: invoiceType === 'B2B'
    };
    
    // Add bank details
    (bill as any).bankDetails = bankDetails;
    
    // Add additional invoice details
    (bill as any).invoiceDetails = {
      invoiceType,
      poNumber,
      paymentDueDate,
      deliveryAddress: showDeliveryAddress ? deliveryAddress : null,
      totalDiscount
    };

    onPrint?.(bill, action);
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 text-center sm:text-left">Generate Tax Invoice</h1>
        <div className="flex justify-center sm:justify-end">
          <Button onClick={() => handlePrint('print')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto min-w-[140px]">
            <Download className="w-4 h-4 mr-2" />
            Download Tax Invoice
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Invoice Information */}
        <Card>
          <CardHeader>
            <CardTitle>Tax Invoice Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="invoiceType">Invoice Type <span className="text-red-500">*</span></Label>
                <Select
                  value={invoiceType}
                  onValueChange={(value: 'B2B' | 'B2C') => setInvoiceType(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select invoice type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="B2B">B2B (Business to Business)</SelectItem>
                    <SelectItem value="B2C">B2C (Business to Consumer)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {invoiceType === 'B2B' ? 'Customer GSTIN is mandatory for B2B' : 'Customer GSTIN is optional for B2C'}
                </p>
              </div>
              <div>
                <Label htmlFor="billNumber">Invoice Number</Label>
                <Input
                  id="billNumber"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="INV-2024-001"
                />
              </div>
              <div>
                <Label htmlFor="billDate">Invoice Date</Label>
                <Input
                  id="billDate"
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="placeOfSupply">Place of Supply (State)</Label>
                <Input
                  id="placeOfSupply"
                  value={placeOfSupply}
                  onChange={(e) => setPlaceOfSupply(e.target.value)}
                  placeholder="Karnataka"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {isIntraState ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}
                </p>
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="reverseCharge"
                  checked={reverseCharge}
                  onChange={(e) => setReverseCharge(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <Label htmlFor="reverseCharge" className="text-sm font-medium cursor-pointer">
                  Reverse Charge Applicable
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="eWayBillNo">E-Way Bill No. (Optional)</Label>
                <Input
                  id="eWayBillNo"
                  value={eWayBillNo}
                  onChange={(e) => setEWayBillNo(e.target.value)}
                  placeholder="Enter E-Way Bill number"
                />
              </div>
              <div>
                <Label htmlFor="vehicleNo">Vehicle No. (Optional)</Label>
                <Input
                  id="vehicleNo"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="Enter vehicle number"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="roundOff"
                checked={roundOff}
                onChange={(e) => setRoundOff(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <Label htmlFor="roundOff" className="text-sm font-medium cursor-pointer">
                Round Off Total Amount
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle>Customer Information</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingCustomer(!isEditingCustomer)}
                className="w-full sm:w-auto"
              >
                <Edit className="w-4 h-4 mr-2" />
                {isEditingCustomer ? 'View' : 'Edit'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            {isEditingCustomer ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label htmlFor="customer-name">Customer Name</Label>
                    <Input
                      id="customer-name"
                      value={editableCustomer.name}
                      onChange={(e) => setEditableCustomer(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter customer name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer-phone">Phone</Label>
                    <Input
                      id="customer-phone"
                      value={editableCustomer.phone}
                      onChange={(e) => setEditableCustomer(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer-email">Email (Optional)</Label>
                    <Input
                      id="customer-email"
                      type="email"
                      value={editableCustomer.email}
                      onChange={(e) => setEditableCustomer(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email address"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="customer-gst">
                      Customer GSTIN {invoiceType === 'B2B' ? <span className="text-red-500">*</span> : '(Optional)'}
                    </Label>
                    <Input
                      id="customer-gst"
                      value={editableCustomer.gst}
                      onChange={(e) => setEditableCustomer(prev => ({ ...prev, gst: e.target.value }))}
                      placeholder={invoiceType === 'B2B' ? 'Enter GSTIN (Required for B2B)' : 'Enter GSTIN (Optional)'}
                      required={invoiceType === 'B2B'}
                      className={invoiceType === 'B2B' && !editableCustomer.gst ? 'border-red-500' : ''}
                    />
                    {invoiceType === 'B2B' && (
                      <p className="text-xs text-red-500 mt-1">Customer GSTIN is mandatory for B2B invoices</p>
                    )}
                  </div>
                </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Address</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="address-street">Street</Label>
                      <Input
                        id="address-street"
                        value={editableCustomer.address.street}
                        onChange={(e) => setEditableCustomer(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, street: e.target.value }
                        }))}
                        placeholder="Enter street address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-area">Area</Label>
                      <Input
                        id="address-area"
                        value={editableCustomer.address.area}
                        onChange={(e) => setEditableCustomer(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, area: e.target.value }
                        }))}
                        placeholder="Enter area"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-city">City</Label>
                      <Input
                        id="address-city"
                        value={editableCustomer.address.city}
                        onChange={(e) => setEditableCustomer(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, city: e.target.value }
                        }))}
                        placeholder="Enter city"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-state">State</Label>
                      <Input
                        id="address-state"
                        value={editableCustomer.address.state}
                        onChange={(e) => setEditableCustomer(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, state: e.target.value }
                        }))}
                        placeholder="Enter state"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-pincode">Pincode</Label>
                      <Input
                        id="address-pincode"
                        value={editableCustomer.address.pincode}
                        onChange={(e) => setEditableCustomer(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, pincode: e.target.value }
                        }))}
                        placeholder="Enter pincode"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <div className="space-y-2">
                <div className="font-semibold text-lg">{editableCustomer.name}</div>
              <div className="text-sm text-gray-600">
                  {(editableCustomer.address.street || editableCustomer.address.area) && (
                    <div>{editableCustomer.address.street || ''}, {editableCustomer.address.area || ''}</div>
                  )}
                  {(editableCustomer.address.city || editableCustomer.address.state || editableCustomer.address.pincode) && (
                    <div>{editableCustomer.address.city || ''}, {editableCustomer.address.state || ''} - {editableCustomer.address.pincode || ''}</div>
                  )}
                  {editableCustomer.phone && <div>Phone: {editableCustomer.phone}</div>}
                  {editableCustomer.email && <div>Email: {editableCustomer.email}</div>}
                  {editableCustomer.gst && <div>GST: {editableCustomer.gst}</div>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bank Details */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="bankName">Bank Name</Label>
              <Input
                id="bankName"
                value={bankDetails.bankName}
                onChange={(e) => setBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                placeholder="Bank Name"
              />
            </div>
            <div>
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                value={bankDetails.accountNumber}
                onChange={(e) => setBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                placeholder="Account Number"
              />
            </div>
            <div>
              <Label htmlFor="ifscCode">IFSC Code</Label>
              <Input
                id="ifscCode"
                value={bankDetails.ifscCode}
                onChange={(e) => setBankDetails(prev => ({ ...prev, ifscCode: e.target.value }))}
                placeholder="IFSC Code"
              />
            </div>
            <div>
              <Label htmlFor="branchName">Branch Name</Label>
              <Input
                id="branchName"
                value={bankDetails.branchName}
                onChange={(e) => setBankDetails(prev => ({ ...prev, branchName: e.target.value }))}
                placeholder="Branch Name"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="accountHolderName">Account Holder Name</Label>
              <Input
                id="accountHolderName"
                value={bankDetails.accountHolderName}
                onChange={(e) => setBankDetails(prev => ({ ...prev, accountHolderName: e.target.value }))}
                placeholder="Account Holder Name"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Items */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:gap-4">
            <CardTitle className="text-lg sm:text-xl">Invoice Items</CardTitle>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Label htmlFor="serviceCharge" className="text-sm font-medium whitespace-nowrap">Service Charge:</Label>
                <Input
                  id="serviceCharge"
                  type="number"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-full sm:w-24"
                  placeholder="0"
                />
              </div>
              <Button onClick={addItem} size="sm" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="space-y-3 sm:space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="space-y-3 sm:space-y-4 p-3 sm:p-4 border rounded-lg">
                {/* Mobile-first grid layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                  <div className="sm:col-span-2 lg:col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div>
                    <Label>HSN/SAC</Label>
                    <Input
                      value={(item as any).hsnCode || ''}
                      onChange={(e) => updateItem(item.id, 'hsnCode' as any, e.target.value)}
                      placeholder="8421"
                    />
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label>Unit Price</Label>
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                  <div className="sm:col-span-1">
                    <Label>GST Rate (%)</Label>
                    <Select
                      value={item.taxRate.toString()}
                      onValueChange={(value) => updateItem(item.id, 'taxRate', parseFloat(value) || 0)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="GST %" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                        <SelectItem value="28">28%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-1 lg:col-span-4 flex items-end justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      className="h-10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Item totals - mobile friendly */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t">
                  <div className="text-sm">
                    <span className="text-gray-500">Base Amount: </span>
                    <span className="font-semibold">₹{(item.quantity * item.unitPrice).toLocaleString()}</span>
                  </div>
                  {(item as any).discount > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Discount: </span>
                      <span className="font-semibold text-red-600">-₹{((item as any).discount || 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="text-sm">
                    <span className="text-gray-500">Taxable: </span>
                    <span className="font-semibold">₹{((item.quantity * item.unitPrice) - ((item as any).discount || 0)).toLocaleString()}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">GST ({item.taxRate}%): </span>
                    <span className="font-semibold">₹{item.taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="text-sm sm:col-span-4">
                    <span className="text-gray-500">Total: </span>
                    <span className="font-semibold text-lg">₹{item.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GST Summary by Rate */}
      {Object.keys(gstBreakup).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">GST Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(gstBreakup).map(([rate, data]) => (
                <div key={rate} className="flex justify-between text-sm border-b pb-2">
                  <span>GST @ {rate}%</span>
                  <div className="text-right">
                    <div>Taxable: ₹{data.taxableAmount.toLocaleString()}</div>
                    <div>Tax: ₹{data.taxAmount.toLocaleString()}</div>
                    {isIntraState ? (
                      <div className="text-xs text-gray-600">
                        CGST: ₹{(data.taxAmount / 2).toLocaleString()} | SGST: ₹{(data.taxAmount / 2).toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600">IGST: ₹{data.taxAmount.toLocaleString()}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Invoice Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex justify-between text-lg">
              <span>Subtotal (Base Amount):</span>
              <span>₹{(items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)).toLocaleString()}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-lg text-red-600">
                <span>Total Discount:</span>
                <span>-₹{totalDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold border-t pt-2">
              <span>Taxable Value (After Discount):</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            {isIntraState ? (
              <>
                <div className="flex justify-between text-lg">
                  <span>CGST:</span>
                  <span>₹{taxSplit.cgst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>SGST:</span>
                  <span>₹{taxSplit.sgst.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-lg">
                <span>IGST:</span>
                <span>₹{taxSplit.igst.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold border-t pt-2">
              <span>Total GST:</span>
              <span>₹{totalTax.toLocaleString()}</span>
            </div>
            {serviceCharge > 0 && (
              <div className="flex justify-between text-lg">
                <span>Service Charge:</span>
                <span>₹{serviceCharge.toLocaleString()}</span>
              </div>
            )}
            {roundOff && finalRoundOff !== 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Round Off:</span>
                <span>₹{finalRoundOff.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold border-t pt-4">
              <span>Grand Total:</span>
              <span>₹{totalAmount.toLocaleString()}</span>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Amount in Words: {numberToWords(totalAmount)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl text-blue-800">Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Notes Section */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-blue-800">Additional Info</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                  className="w-full sm:w-auto border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {isEditingNotes ? 'View' : 'Edit'}
                </Button>
              </div>
              
              {isEditingNotes ? (
                <div className="space-y-4">
                  <div className="text-sm text-blue-600">
                    Add new notes. Each note will be displayed separately.
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Enter new note..."
                      onKeyPress={(e) => e.key === 'Enter' && addNote()}
                    />
                    <Button onClick={addNote} size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Note
                    </Button>
                  </div>
                  <Textarea
                    value={notes.join('\n')}
                    onChange={(e) => setNotes(e.target.value.split('\n').filter(line => line.trim()))}
                    placeholder="Or edit all notes at once..."
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-blue-600">
                    Current notes:
                  </div>
                  <div className="space-y-2">
                    {notesList.map((note, index) => (
                      <div key={`note-${index}-${note.slice(0, 10)}`} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                        <span className="text-blue-400 mt-1">•</span>
                        <span className="flex-1 text-sm">{note}</span>
                        {isEditingNotes && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeNote(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {notesList.length === 0 && (
                      <div className="text-center text-gray-500 py-4">
                        No notes added yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Terms & Conditions Section */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
                <h3 className="text-base sm:text-lg font-semibold">Terms & Conditions</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingTerms(!isEditingTerms)}
                  className="w-full sm:w-auto"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {isEditingTerms ? 'View' : 'Edit'}
                </Button>
              </div>
              
              {isEditingTerms ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Add new terms and conditions. Each term will be automatically numbered.
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      placeholder="Enter new term (e.g., 'Payment due within 30 days')"
                      onKeyPress={(e) => e.key === 'Enter' && addTerm()}
                      className="flex-1"
                    />
                    <Button onClick={addTerm} size="sm" disabled={!newTerm.trim()} className="w-full sm:w-auto">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Term
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Current Terms & Conditions:</Label>
                  <Textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                      placeholder="Terms will be automatically numbered..."
                      rows={6}
                    className="font-mono text-sm"
                  />
                    <div className="text-xs text-gray-500">
                      💡 Tip: Each line will be treated as a separate numbered term. You can edit the full text above or add individual terms using the input above.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">
                    Current terms and conditions:
                  </div>
                  <div className="space-y-2">
                    {termsList.map((term, index) => (
                      <div key={`term-${index}-${term.slice(0, 10)}`} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 mt-1 font-medium text-sm">
                          {term.match(/^\d+\./)?.[0] || `${index + 1}.`}
                        </span>
                        <span className="flex-1 text-sm">{term.replace(/^\d+\.\s*/, '')}</span>
                        {isEditingTerms && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTerm(index)}
                            className="text-red-500 hover:text-red-700"
                            title="Remove this term"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {termsList.length === 0 && (
                      <div className="text-center text-gray-500 py-4">
                        No terms and conditions added yet. Click "Edit" to add some.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Validity Note Section */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
                <h3 className="text-base sm:text-lg font-semibold text-blue-800">Validity Note</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowValidityNote(!showValidityNote)}
                  className={`w-full sm:w-auto ${showValidityNote ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                >
                  {showValidityNote ? (
                    <>
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </>
                  )}
                </Button>
              </div>
              
              {showValidityNote && (
                <div className="space-y-3">
                  <div className="p-4 bg-blue-100 border-2 border-blue-300 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <Textarea
                          value={validityNote}
                          onChange={(e) => setValidityNote(e.target.value)}
                          placeholder="Enter validity note..."
                          rows={3}
                          className="w-full bg-transparent border-none p-0 text-blue-900 font-medium resize-none focus:ring-0 focus:border-none"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setValidityNote('This tax invoice is valid for 30 days from the date of issue. Prices are subject to change without prior notice.')}
                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-200"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-blue-600">
                    This note will appear at the top of the terms and conditions section on the tax invoice PDF.
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

