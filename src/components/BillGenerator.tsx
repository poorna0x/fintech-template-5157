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
  const customerPhone = customer?.phone || '';
  const customerEmail = customer?.email || '';
  const customerAddress = customer?.address || {};
  const customerGst = customer?.gstNumber || '';
  const customerServiceType = customer?.serviceType || 'RO';

  // State management
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [items, setItems] = useState<BillItem[]>(defaultBillItems);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(`Terms & Conditions
1. Goods once sold will not be taken back and refund or exchange.
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
  const [newNote, setNewNote] = useState('');

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
      const updatedTerms = [...currentTerms, newTerm.trim()].join('\n');
      setTerms(updatedTerms);
      setNewTerm('');
    }
  };

  const removeTerm = (index: number) => {
    const currentTerms = terms.split('\n').filter(line => line.trim());
    const updatedTerms = currentTerms.filter((_, i) => i !== index).join('\n');
    setTerms(updatedTerms);
  };

  const addNote = () => {
    if (newNote.trim()) {
      const currentNotes = notes.split('\n').filter(line => line.trim());
      const updatedNotes = [...currentNotes, newNote.trim()].join('\n');
      setNotes(updatedNotes);
      setNewNote('');
    }
  };

  const removeNote = (index: number) => {
    const currentNotes = notes.split('\n').filter(line => line.trim());
    const updatedNotes = currentNotes.filter((_, i) => i !== index).join('\n');
    setNotes(updatedNotes);
  };

  const termsList = terms.split('\n').filter(line => line.trim());
  const notesList = notes.split('\n').filter(line => line.trim());

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
        name: customerName,
        address: `${customerAddress.street || ''}, ${customerAddress.area || ''}`.trim() || '',
        city: customerAddress.city || '',
        state: customerAddress.state || '',
        pincode: customerAddress.pincode || '',
        phone: customerPhone,
        email: customerEmail,
        gstNumber: customerGst
      },
      items,
      subtotal,
      totalTax: 0,
      serviceCharge,
      totalAmount,
      paymentStatus: 'PENDING',
      paymentMethod: 'CASH',
      notes,
      terms,
      serviceType: customerServiceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onPrint?.(bill, action);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Generate Bill</h1>
        <div className="flex gap-2">
          <Button onClick={() => handlePrint('print')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            Print Bill
          </Button>
          <Button onClick={() => handlePrint('pdf')} variant="outline" className="w-full sm:w-auto">
            <FileText className="w-4 h-4 mr-2" />
            Save as PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Bill Information */}
        <Card>
          <CardHeader>
            <CardTitle>Bill Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="font-semibold text-lg">{customerName}</div>
              <div className="text-sm text-gray-600">
                {(customerAddress.street || customerAddress.area) && (
                  <div>{customerAddress.street || ''}, {customerAddress.area || ''}</div>
                )}
                {(customerAddress.city || customerAddress.state || customerAddress.pincode) && (
                  <div>{customerAddress.city || ''}, {customerAddress.state || ''} - {customerAddress.pincode || ''}</div>
                )}
                {customerPhone && <div>Phone: {customerPhone}</div>}
                {customerEmail && <div>Email: {customerEmail}</div>}
                {customerGst && <div>GST: {customerGst}</div>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bill Items */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Bill Items</CardTitle>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="serviceCharge" className="text-sm font-medium whitespace-nowrap">Service Charge:</Label>
                <Input
                  id="serviceCharge"
                  type="number"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-24"
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
        <CardContent>
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="space-y-4 p-4 border rounded-lg">
                {/* Mobile-first grid layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      <Label>Unit Price</Label>
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
          <CardTitle>Bill Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Notes Section */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Notes</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                  className="w-full sm:w-auto"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {isEditingNotes ? 'View' : 'Edit'}
                </Button>
              </div>
              
              {isEditingNotes ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Add new notes. Each line will be treated as a separate bullet point.
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Enter new note..."
                      onKeyPress={(e) => e.key === 'Enter' && addNote()}
                    />
                    <Button onClick={addNote} size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add
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
                  <div className="text-sm text-gray-600">
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
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Terms & Conditions</h3>
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
                    Add new terms and conditions. Each line will be treated as a separate bullet point.
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      placeholder="Enter new term..."
                      onKeyPress={(e) => e.key === 'Enter' && addTerm()}
                    />
                    <Button onClick={addTerm} size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add
                    </Button>
                  </div>
                  <Textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Or edit all terms at once..."
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">
                    Current terms and conditions:
                  </div>
                  <div className="space-y-2">
                    {termsList.map((term, index) => (
                      <div key={`term-${index}-${term.slice(0, 10)}`} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-400 mt-1">•</span>
                        <span className="flex-1 text-sm">{term}</span>
                        {isEditingTerms && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTerm(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {termsList.length === 0 && (
                      <div className="text-center text-gray-500 py-4">
                        No terms and conditions added yet.
                      </div>
                    )}
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