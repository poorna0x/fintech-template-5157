import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';

interface BillGeneratorProps {
  customer?: Customer;
  onPrint?: (bill: Bill) => void;
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
    taxRate: 18,
    taxAmount: 2700
  }
];

export default function BillGenerator({ customer, onPrint }: BillGeneratorProps) {
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
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
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'OVERDUE'>('PENDING');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const totalAmount = subtotal + totalTax;

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
      taxRate: 18,
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
        
        // Recalculate totals when quantity, unitPrice, or taxRate changes
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
          updatedItem.taxAmount = (updatedItem.total * updatedItem.taxRate) / 100;
        } else if (field === 'taxRate') {
          updatedItem.taxAmount = (updatedItem.total * updatedItem.taxRate) / 100;
        }
        
        return updatedItem;
      }
      return item;
    }));
  };


  const handlePrint = () => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }

    const bill: Bill = {
      id: Date.now().toString(),
      billNumber,
      billDate,
      dueDate,
      company,
      customer: {
        id: customer.id,
        name: customer.fullName,
        address: `${customer.address.street}, ${customer.address.area}`,
        city: customer.address.city,
        state: customer.address.state,
        pincode: customer.address.pincode,
        phone: customer.phone,
        email: customer.email,
        gstNumber: customer.gstNumber
      },
      items,
      subtotal,
      totalTax,
      totalAmount,
      paymentStatus,
      paymentMethod,
      notes,
      terms,
      serviceType: customer.serviceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onPrint?.(bill);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Generate Bill</h1>
        <div className="flex gap-2">
          <Button onClick={handlePrint} className="bg-green-600 hover:bg-green-700">
            <Download className="w-4 h-4 mr-2" />
            Print Bill
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bill Information */}
        <Card>
          <CardHeader>
            <CardTitle>Bill Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="paymentStatus">Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(value: any) => setPaymentStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="OVERDUE">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-2">
                <div className="font-semibold text-lg">{customer.fullName}</div>
                <div className="text-sm text-gray-600">
                  <div>{customer.address.street}, {customer.address.area}</div>
                  <div>{customer.address.city}, {customer.address.state} - {customer.address.pincode}</div>
                  <div>Phone: {customer.phone}</div>
                  <div>Email: {customer.email}</div>
                  {customer.gstNumber && <div>GST: {customer.gstNumber}</div>}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-4">
                No customer selected
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bill Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Bill Items</CardTitle>
            <Button onClick={addItem} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 gap-4 items-end p-4 border rounded-lg">
                <div className="col-span-5">
                  <Label>Description</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Item description"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                    min="1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Unit Price</Label>
                  <Input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Tax Rate (%)</Label>
                  <Input
                    type="number"
                    value={item.taxRate}
                    onChange={(e) => updateItem(item.id, 'taxRate', parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="col-span-12 grid grid-cols-3 gap-4 mt-2">
                  <div className="text-sm">
                    <span className="text-gray-500">Subtotal: </span>
                    <span className="font-semibold">₹{item.total.toLocaleString()}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Tax: </span>
                    <span className="font-semibold">₹{item.taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Total: </span>
                    <span className="font-semibold">₹{(item.total + item.taxAmount).toLocaleString()}</span>
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
            <div className="flex justify-between text-lg">
              <span>Total Tax:</span>
              <span>₹{totalTax.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-xl font-bold">
              <span>Total Amount:</span>
              <span>₹{totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for the customer..."
              rows={4}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Terms and conditions..."
              rows={4}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
