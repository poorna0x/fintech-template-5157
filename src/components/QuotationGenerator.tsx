import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    taxRate: 0,
    taxAmount: 0
  }
];

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
        }
        
        // Recalculate tax when taxRate changes
        if (field === 'taxRate') {
          updatedItem.taxAmount = updatedItem.total * (updatedItem.taxRate / 100);
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

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const totalAmount = subtotal + totalTax + serviceCharge;

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
    };

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
                <Input
                  id="quotationDate"
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </div>
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
                  </div>
                </div>
                
                {/* Total and Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="text-sm text-gray-600">
                    <strong>Total: ₹{item.total.toLocaleString()}</strong>
                    {item.taxAmount > 0 && (
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
            {totalTax > 0 && (
              <div className="flex justify-between">
                <span>Tax:</span>
                <span>₹{totalTax.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total Amount:</span>
              <span>₹{totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validity Note Section */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-lg sm:text-xl text-blue-800">Validity Note</CardTitle>
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
          <CardContent className="space-y-3">
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
                  onClick={() => setValidityNote('This quotation is valid for 30 days from the date of issue. Prices are subject to change without prior notice.')}
                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-200"
                >
                  <Edit className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-blue-600">
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
    </div>
  );
}
