import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Download, Edit, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';

interface QuotationGeneratorProps {
  customer?: Customer;
  onPrint?: (quotation: Bill, action?: 'print' | 'pdf') => void;
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

const defaultQuotationItems: BillItem[] = [
  {
    id: '1',
    description: 'RO Water Purifier Installation',
    quantity: 1,
    unitPrice: 15000,
    total: 15000,
    taxRate: 18, // Default 18% GST for RO services
    taxAmount: 2700 // 18% of 15000
  }
];

const defaultBankDetails = {
  accountHolderName: 'HYDROGEN RO',
  bankName: 'HDFC Bank',
  branchName: 'BOMMANAHALLY',
  accountNumber: '50200095252857',
  ifscCode: 'HDFC0001048',
  accountType: 'Current Account',
  upiId: '',
  note: 'Account Type: Current Account. Please share the payment confirmation once the transfer is complete.'
};

export default function QuotationGenerator({ customer, onPrint }: QuotationGeneratorProps) {
  // Safe customer data extraction
  const customerName = customer?.fullName || (customer as any)?.full_name || 'Customer Name';
  const customerPhone = typeof customer?.phone === 'string' ? customer.phone : (customer as any)?.phone || '';
  const customerEmail = customer?.email || '';
  const customerAddress = customer?.address || {};
  const customerGst = customer?.gstNumber || '';
  const customerServiceType = customer?.serviceType || 'RO';

  // State management
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<BillItem[]>(defaultQuotationItems);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [validityNote, setValidityNote] = useState('This quotation is valid for 30 days from the date of issue. Prices are subject to change without prior notice.');
  const [showValidityNote, setShowValidityNote] = useState(true);
  const [gstOption, setGstOption] = useState<'normal' | 'exclude' | 'include'>('include'); // Default to including GST
  const [addGSTNoteToNotes, setAddGSTNoteToNotes] = useState(false); // Option to add GST note to Additional Info
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [bankDetails, setBankDetails] = useState(defaultBankDetails);
  
  // Computed values for backward compatibility
  const includeGST = gstOption === 'include';
  const showGST = gstOption !== 'normal';
  
  // GST-specific state
  const [placeOfSupply, setPlaceOfSupply] = useState(customerAddress.state || 'Karnataka');
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState('29'); // Karnataka state code
  
  // Customer editing state
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editableCustomer, setEditableCustomer] = useState({
    name: customerName,
    phone: customerPhone,
    email: customerEmail,
    gst: customerGst,
    address: {
      street: customerAddress.street || '',
      area: customerAddress.area || '',
      city: customerAddress.city || '',
      state: customerAddress.state || '',
      pincode: customerAddress.pincode || ''
    }
  });

  // Update editable customer when customer prop changes
  useEffect(() => {
    setEditableCustomer({
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
      gst: customerGst,
      address: {
        street: customerAddress.street || '',
        area: customerAddress.area || '',
        city: customerAddress.city || '',
        state: customerAddress.state || '',
        pincode: customerAddress.pincode || ''
      }
    });
  }, [customerName, customerPhone, customerEmail, customerGst, customerAddress]);

  // Generate quotation number
  useEffect(() => {
    if (!quotationNumber) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      setQuotationNumber(`QUO-${year}-${month}-${day}-${randomNum}`);
    }
  }, [quotationNumber]);

  const addItem = () => {
    const newItem: BillItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
      taxRate: 0,
      taxAmount: 0
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof BillItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate totals when quantity or unitPrice changes
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
          // Only calculate tax if GST option is 'include'
          if (gstOption === 'include' && updatedItem.taxRate > 0) {
            updatedItem.taxAmount = updatedItem.total * (updatedItem.taxRate / 100);
          } else {
            updatedItem.taxAmount = 0;
          }
        }
        
        // Recalculate tax when taxRate changes (only if GST is included)
        if (field === 'taxRate') {
          if (gstOption === 'include' && updatedItem.taxRate > 0) {
            updatedItem.taxAmount = updatedItem.total * (updatedItem.taxRate / 100);
          } else {
            updatedItem.taxAmount = 0;
          }
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
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

  const handleBankDetailChange = (field: keyof typeof bankDetails, value: string) => {
    setBankDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  // Only calculate tax if GST option is 'include'
  const totalTax = gstOption === 'include' ? items.reduce((sum, item) => sum + item.taxAmount, 0) : 0;
  
  // Determine if intra-state (same state) or inter-state (different state)
  const isIntraState = placeOfSupply === defaultCompanyInfo.state;
  
  // Calculate CGST, SGST (for intra-state) or IGST (for inter-state)
  const calculateTaxSplit = () => {
    if (gstOption === 'normal' || gstOption === 'exclude' || totalTax === 0) {
      return { cgst: 0, sgst: 0, igst: 0 };
    }
    
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
  
  // Calculate total based on GST option
  // Normal: no GST shown at all
  // Exclude: GST shown but not added to total
  // Include: GST shown and added to total
  const totalAmount = gstOption === 'include' 
    ? subtotal + totalTax + serviceCharge 
    : subtotal + serviceCharge;

  const handlePrint = (action: 'print' | 'pdf' = 'print') => {
    const quotation: Bill = {
      id: Date.now().toString(),
      billNumber: quotationNumber,
      billDate: quotationDate,
      company: defaultCompanyInfo,
      customer: {
        id: customer?.id || '',
        fullName: editableCustomer.name,
        phone: editableCustomer.phone,
        email: editableCustomer.email,
        address: {
          street: editableCustomer.address.street,
          area: editableCustomer.address.area,
          city: editableCustomer.address.city,
          state: editableCustomer.address.state,
          pincode: editableCustomer.address.pincode,
          country: 'India'
        },
        gstNumber: editableCustomer.gst,
        serviceType: customerServiceType,
        createdAt: customer?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      items,
      subtotal,
      totalTax,
      serviceCharge,
      totalAmount,
      paymentStatus: 'pending',
      paymentMethod: 'cash',
      notes: notes.join('\n'),
      terms: showValidityNote ? validityNote : '', // Include validity note as terms for quotations
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;

    // Add GST option and GST data
    (quotation as any).gstOption = gstOption;
    (quotation as any).includeGST = gstOption === 'include'; // For backward compatibility
    if (gstOption !== 'normal') {
      (quotation as any).gstData = {
        placeOfSupply,
        placeOfSupplyCode,
        isIntraState,
        taxSplit
      };
    }

    if (showBankDetails) {
      (quotation as any).bankDetails = bankDetails;
    }

    onPrint?.(quotation, action);
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 text-center sm:text-left">Generate Quotation</h1>
        <div className="flex justify-center sm:justify-end">
          <Button onClick={() => handlePrint('print')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto min-w-[140px]">
            <Download className="w-4 h-4 mr-2" />
            Download Quotation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Quotation Information */}
        <Card>
          <CardHeader>
            <CardTitle>Quotation Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="quotationNumber">Quotation Number</Label>
                <Input
                  id="quotationNumber"
                  value={quotationNumber}
                  onChange={(e) => setQuotationNumber(e.target.value)}
                  placeholder="QUO-2024-001"
                />
              </div>
              <div>
                <Label htmlFor="quotationDate">Quotation Date</Label>
                <DatePicker
                    value={quotationDate}
                    onChange={(v) => v && setQuotationDate(v)}
                    placeholder="Pick date"
                  />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="gstOption">GST Option</Label>
                <Select
                  value={gstOption}
                  onValueChange={(value: 'normal' | 'exclude' | 'include') => {
                    setGstOption(value);
                    // If switching to normal or exclude, clear tax amounts and remove GST note
                    if (value === 'normal' || value === 'exclude') {
                      // Clear all tax amounts
                      setItems(items.map(item => ({ ...item, taxAmount: 0 })));
                      if (value === 'normal' && addGSTNoteToNotes) {
                        setAddGSTNoteToNotes(false);
                      }
                      setNotes(notes.filter(note => 
                        !note.includes('Prices include GST') && !note.includes('GST not included') && !note.includes('Prices exclude GST')
                      ));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select GST option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal (No GST Mention)</SelectItem>
                    <SelectItem value="exclude">Exclude GST (GST not included)</SelectItem>
                    <SelectItem value="include">Include GST (Add to total)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {gstOption === 'normal' && 'No GST will be calculated or shown'}
                  {gstOption === 'exclude' && 'GST not included - prices exclude GST'}
                  {gstOption === 'include' && 'GST will be calculated and added to the total amount'}
                </p>
                {(gstOption === 'include' || gstOption === 'exclude') && (
                  <div className="flex items-center space-x-2 mt-2">
                    <input
                      type="checkbox"
                      id="addGSTNoteToNotes"
                      checked={addGSTNoteToNotes}
                      onChange={(e) => {
                        setAddGSTNoteToNotes(e.target.checked);
                        
                        if (e.target.checked) {
                          // Add GST note to notes
                          const gstNoteText = gstOption === 'include'
                            ? '* Prices include GST.'
                            : '* GST not included. Applicable GST will be charged separately if applicable.';
                          
                          // Remove any existing GST notes first
                          const filteredNotes = notes.filter(note => 
                            !note.includes('Prices include GST') && !note.includes('GST not included') && !note.includes('Prices exclude GST')
                          );
                          
                          // Add new GST note
                          setNotes([...filteredNotes, gstNoteText]);
                        } else {
                          // Remove GST note from notes
                          setNotes(notes.filter(note => 
                            !note.includes('Prices include GST') && !note.includes('GST not included') && !note.includes('Prices exclude GST')
                          ));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <Label htmlFor="addGSTNoteToNotes" className="text-xs cursor-pointer">
                      Add GST note to Additional Info
                    </Label>
                  </div>
                )}
              </div>
              {gstOption === 'include' && (
                <>
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
                  <div>
                    <Label htmlFor="placeOfSupplyCode">State Code</Label>
                    <Input
                      id="placeOfSupplyCode"
                      value={placeOfSupplyCode}
                      onChange={(e) => setPlaceOfSupplyCode(e.target.value)}
                      placeholder="29"
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5" />
                Customer Information
              </CardTitle>
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
                  <div>
                    <Label htmlFor="customer-gst">GST Number (Optional)</Label>
                    <Input
                      id="customer-gst"
                      value={editableCustomer.gst}
                      onChange={(e) => setEditableCustomer(prev => ({ ...prev, gst: e.target.value }))}
                      placeholder="Enter GST number"
                    />
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Edit className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{editableCustomer.name}</span>
                  <span className="text-sm text-gray-500">({customer?.customerId || 'N/A'})</span>
                </div>
                {editableCustomer.phone && (
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-gray-500" />
                    <span>{editableCustomer.phone}</span>
                  </div>
                )}
                {editableCustomer.email && (
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-gray-500" />
                    <span>{editableCustomer.email}</span>
                  </div>
                )}
                {(editableCustomer.address.street || editableCustomer.address.area || editableCustomer.address.city) && (
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-gray-500" />
                    <span>{editableCustomer.address.street}, {editableCustomer.address.area}, {editableCustomer.address.city}</span>
                  </div>
                )}
                {editableCustomer.gst && (
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-gray-500" />
                    <span>GST: {editableCustomer.gst}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quotation Items */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:gap-4">
            <CardTitle className="text-lg sm:text-xl">Quotation Items</CardTitle>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      min="1"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Price</Label>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                    {gstOption === 'include' && (
                      <div className="flex-1">
                        <Label>Tax %</Label>
                        <Input
                          type="number"
                          value={item.taxRate}
                          onChange={(e) => updateItem(item.id, 'taxRate', parseFloat(e.target.value) || 0)}
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Total and Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="text-sm text-gray-600">
                    <strong>Total: ₹{item.total.toLocaleString()}</strong>
                    {gstOption === 'include' && item.taxAmount > 0 && (
                      <span className="ml-2">(Tax: ₹{item.taxAmount.toLocaleString()})</span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quotation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Quotation Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex justify-between text-lg">
              <span>Subtotal:</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            {serviceCharge > 0 && (
              <div className="flex justify-between">
                <span>Service Charge:</span>
                <span>₹{serviceCharge.toLocaleString()}</span>
              </div>
            )}
            {gstOption !== 'normal' && totalTax > 0 && gstOption === 'include' && (
              <>
                {isIntraState ? (
                  <>
                    <div className="flex justify-between">
                      <span>CGST (9%):</span>
                      <span>₹{taxSplit.cgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST (9%):</span>
                      <span>₹{taxSplit.sgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span>IGST (18%):</span>
                    <span>₹{taxSplit.igst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t pt-1 mt-1">
                  <span>Total GST:</span>
                  <span>₹{totalTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total Amount {gstOption === 'normal' ? '' : gstOption === 'exclude' ? '(Excl. GST)' : '(Incl. GST)'}:</span>
              <span>₹{totalAmount.toLocaleString()}</span>
            </div>
            {gstOption === 'exclude' && (
              <div className="text-xs text-gray-500 italic mt-2">
                * Note: GST not included. Applicable GST will be charged separately if applicable.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Validity Note Section */}
      <Card className="border-gray-200 bg-gray-50/30">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-lg sm:text-xl text-gray-800">Validity Note</CardTitle>
            <div className="flex gap-2">
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
          </div>
        </CardHeader>
        {showValidityNote && (
          <CardContent className="space-y-3 mb-4">
            <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Textarea
                    value={validityNote}
                    onChange={(e) => setValidityNote(e.target.value)}
                    placeholder="Enter validity note..."
                    rows={3}
                    className="w-full bg-transparent border-none p-0 text-gray-900 font-medium resize-none focus:ring-0 focus:border-none"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setValidityNote('This quotation is valid for 30 days from the date of issue. Prices are subject to change without prior notice.')}
                  className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-200"
                >
                  <Edit className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-gray-600">
              This note will appear prominently on the quotation PDF.
            </div>
          </CardContent>
        )}
      </Card>

      {/* Additional Info Section */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl text-blue-800">Additional Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Note */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Enter additional information..."
                onKeyPress={(e) => e.key === 'Enter' && (editingNoteIndex !== null ? updateNote() : addNote())}
                className="flex-1"
              />
              <div className="flex gap-2">
                {editingNoteIndex !== null ? (
                  <>
                    <Button onClick={updateNote} size="sm" className="bg-green-600 hover:bg-green-700">
                      <Edit className="w-4 h-4 mr-1" />
                      Update
                    </Button>
                    <Button onClick={cancelEdit} variant="outline" size="sm">
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={addNote} size="sm" className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Note
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Notes List */}
          {notes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-blue-700">Current Notes:</Label>
              <div className="space-y-2">
                {notes.map((note, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-white border border-blue-200 rounded-lg">
                    <div className="flex-1 text-sm text-gray-700">
                      {note}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editNote(index)}
                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeNote(index)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Details Section */}
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-lg sm:text-xl text-green-800">Bank Details</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBankDetails(!showBankDetails)}
                className={`w-full sm:w-auto ${showBankDetails ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
              >
                {showBankDetails ? (
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
              {showBankDetails && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBankDetails(defaultBankDetails)}
                  className="w-full sm:w-auto"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Enable this section to display bank / UPI details at the bottom of the generated quotation for quick payments.
          </p>
        </CardHeader>
        {showBankDetails && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="accountHolderName">Account Holder Name</Label>
                <Input
                  id="accountHolderName"
                  value={bankDetails.accountHolderName}
                  onChange={(e) => handleBankDetailChange('accountHolderName', e.target.value)}
                  placeholder="Hydrogen RO"
                />
              </div>
              <div>
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={bankDetails.bankName}
                  onChange={(e) => handleBankDetailChange('bankName', e.target.value)}
                  placeholder="State Bank of India"
                />
              </div>
              <div>
                <Label htmlFor="branchName">Branch</Label>
                <Input
                  id="branchName"
                  value={bankDetails.branchName}
                  onChange={(e) => handleBankDetailChange('branchName', e.target.value)}
                  placeholder="BOMMANAHALLY"
                />
              </div>
              <div>
                <Label htmlFor="accountType">Account Type</Label>
                <Input
                  id="accountType"
                  value={bankDetails.accountType || ''}
                  onChange={(e) => handleBankDetailChange('accountType', e.target.value)}
                  placeholder="Current Account"
                />
              </div>
              <div>
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  value={bankDetails.accountNumber}
                  onChange={(e) => handleBankDetailChange('accountNumber', e.target.value)}
                  placeholder="123456789012"
                />
              </div>
              <div>
                <Label htmlFor="ifscCode">IFSC Code</Label>
                <Input
                  id="ifscCode"
                  value={bankDetails.ifscCode}
                  onChange={(e) => handleBankDetailChange('ifscCode', e.target.value)}
                  placeholder="SBIN0001234"
                />
              </div>
              <div>
                <Label htmlFor="upiId">UPI ID (Optional)</Label>
                <Input
                  id="upiId"
                  value={bankDetails.upiId}
                  onChange={(e) => handleBankDetailChange('upiId', e.target.value)}
                  placeholder="hydrogenro@oksbi"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="bankNote">Payment Note (Optional)</Label>
              <Textarea
                id="bankNote"
                value={bankDetails.note}
                onChange={(e) => handleBankDetailChange('note', e.target.value)}
                placeholder="Share the payment confirmation once transferred..."
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                This note appears below the bank details in the quotation PDF.
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
