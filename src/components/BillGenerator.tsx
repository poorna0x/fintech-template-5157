import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Download, Edit, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';

interface BillGeneratorProps {
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

const defaultBillItems: BillItem[] = [
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

export default function BillGenerator({ customer, onPrint }: BillGeneratorProps) {
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
  const [items, setItems] = useState<BillItem[]>(defaultBillItems);
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [validityNote, setValidityNote] = useState('This bill is valid for 30 days from the date of issue. Prices are subject to change without prior notice.');
  const [showValidityNote, setShowValidityNote] = useState(false);
  const [terms, setTerms] = useState(`1. Goods once sold will not be taken back and refund or exchange.
2. There is 60 Days warranty for RO & PUMP. No Warranty for other spare parts.
3. Without the bill there will not be any warranty / free service given.
4. There is no warranty on the water purifier used for more than 750 PPM water TDS level.
5. Once the order placed cannot be cancelled and advance amount will not be returned.
6. Charges of Rs. 500/- extra to be paid on collection of the cash against cheque return.
7. Company is not responsible for any transactions done personally with the technicians.`);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [hideGstInHeader, setHideGstInHeader] = useState(false);

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

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const totalAmount = subtotal + serviceCharge;

  // Generate bill number
  useEffect(() => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setBillNumber(`BILL-${year}-${month}-${randomNum}`);
  }, []);

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
        
        // Recalculate totals when quantity or unitPrice changes
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
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
  const notesList = notes; // notes is already an array now

  const handlePrint = (action: 'print' | 'pdf' = 'print') => {
    if (!customer) {
      toast.error('Please select a customer first');
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
      totalTax: 0,
      serviceCharge,
      totalAmount,
      paymentStatus: 'PENDING',
      paymentMethod: 'CASH',
      notes: notes.join('\n'),
      terms: showValidityNote ? `${validityNote}\n\n${terms}` : terms,
      serviceType: customerServiceType,
      hideGstInHeader,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;

    onPrint?.(bill, action);
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 text-center sm:text-left">Generate Bill</h1>
        <div className="flex justify-center sm:justify-end">
          <Button onClick={() => handlePrint('print')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto min-w-[140px]">
            <Download className="w-4 h-4 mr-2" />
            Download Bill
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Bill Information */}
        <Card>
          <CardHeader>
            <CardTitle>Bill Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b">
              <input
                type="checkbox"
                id="hideGstInHeader"
                checked={hideGstInHeader}
                onChange={(e) => setHideGstInHeader(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <Label htmlFor="hideGstInHeader" className="text-sm font-medium cursor-pointer">
                Hide GST Number in Header
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="billNumber">Bill Number</Label>
                <Input
                  id="billNumber"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="BILL-2024-001"
                />
              </div>
              <div>
                <Label htmlFor="billDate">Bill Date</Label>
                <Input
                  id="billDate"
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
              </div>
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

      {/* Bill Items */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:gap-4">
            <CardTitle className="text-lg sm:text-xl">Bill Items</CardTitle>
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
                      />
                    </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                  <div className="text-sm">
                    <span className="text-gray-500">Quantity: </span>
                    <span className="font-semibold">{item.quantity}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Total: </span>
                    <span className="font-semibold">₹{item.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bill Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Bill Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex justify-between text-lg">
              <span>Subtotal:</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            {serviceCharge > 0 && (
              <div className="flex justify-between text-lg">
                <span>Service Charge:</span>
                <span>₹{serviceCharge.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold border-t pt-4">
              <span>Total Amount:</span>
              <span>₹{totalAmount.toLocaleString()}</span>
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
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
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
                        onClick={() => setValidityNote('This bill is valid for 30 days from the date of issue. Prices are subject to change without prior notice.')}
                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-200"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-blue-600">
                    This note will appear at the top of the terms and conditions section on the bill PDF.
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