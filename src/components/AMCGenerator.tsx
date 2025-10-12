import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Edit, Plus, Download, FileText, User, Phone, MapPin, Building, Droplets } from 'lucide-react';
import { toast } from 'sonner';
import { Customer, Bill, BillItem, CompanyInfo } from '@/types';
import { generateAMCPDF } from '@/lib/amc-pdf-generator';

interface AMCGeneratorProps {
  customer: Customer;
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

const defaultAMCItems: BillItem[] = [
  {
    id: '1',
    description: 'AMC Agreement - 1 Year Service Contract',
    quantity: 1,
    unitPrice: 7000,
    total: 7000,
    taxRate: 0,
    taxAmount: 0
  }
];

export default function AMCGenerator({ customer, onPrint }: AMCGeneratorProps) {
  const [billNumber, setBillNumber] = useState(`AMC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [items, setItems] = useState<BillItem[]>(defaultAMCItems);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(`SERVICES COVERED BY THE AGREEMENT

Breakdown Support: If any breakdown or problem happens with the RO during this 1-year period, the company will provide service without extra charges.

Filters / RO Membrane / Consumables: Company will clean, repair, or replace filters and parts needed for smooth working.

Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.

Clean cosmetics and smooth working of the machine.

Quick service: Any breakdown will be resolved within 24 hours.

Full Care of RO: The company takes responsibility for complete maintenance and support for 1 year, including Pre Sediment Filtration (with terms & conditions).

⚖️ TERMS AND CONDITIONS

No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.

Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.

Disputes: Any legal disputes will be handled only in Bangalore courts.

Renewal: After expiry, renewal requires a new agreement.

Customer's Duty: The customer must make the RO available for servicing when the company's authorized representative visits.

If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.

Agreement Modification: Cannot be changed unless written and signed by both parties.

Not Covered: Display and lights of the RO are not covered under this AMC.

🔍 Summary in Simple Words

You (the customer) paid ₹7000 for 1-year full AMC service of your AO Smith P6 RO.

All repairs, filters, and breakdown services are included, with a guarantee of 24-hour resolution.

The service covers water quality maintenance (50–150 TDS) and overall machine health.

Extra travel charges apply if your location is outside the municipal area.

You can't cancel/transfer this AMC until it expires.

Legal disputes go to Bangalore court.

The AMC does not cover display and lights of the RO.`);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const totalAmount = subtotal + serviceCharge;

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

  const updateItem = (id: string, field: keyof BillItem, value: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice' || field === 'taxRate') {
          updated.total = updated.quantity * updated.unitPrice;
          updated.taxAmount = updated.total * (updated.taxRate / 100);
        }
        return updated;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
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

  const addNote = () => {
    if (newNote.trim()) {
      setNotes(prev => prev + '\n' + newNote);
      setNewNote('');
    }
  };

  const handlePrint = () => {
    if (!billNumber.trim()) {
      toast.error('Please enter a bill number');
      return;
    }

    const bill: Bill = {
      id: Date.now().toString(),
      billNumber,
      billDate,
      company,
      customer: {
        id: customer.id,
        name: customer.fullName,
        address: `${customer.address.street || ''}, ${customer.address.area || ''}`.trim() || '',
        city: customer.address.city || '',
        state: customer.address.state || '',
        pincode: customer.address.pincode || '',
        phone: customer.phone || '',
        email: customer.email || '',
        gstNumber: customer.gstNumber || ''
      },
      items,
      subtotal,
      totalTax: items.reduce((sum, item) => sum + item.taxAmount, 0),
      serviceCharge,
      totalAmount,
      paymentStatus: 'PENDING',
      notes,
      terms,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      generateAMCPDF(bill);
      toast.success('AMC Agreement generated successfully!');
      onPrint?.(bill);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate AMC Agreement');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
            <Droplets className="w-8 h-8 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-bold text-blue-600 mb-0">Hydrogen RO</h1>
            <p className="text-sm text-gray-600 mt-0">AMC Agreement Generator</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Section */}
        <div className="space-y-6">
          {/* Bill Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                AMC Agreement Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="billNumber">Agreement Number *</Label>
                  <Input
                    id="billNumber"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    placeholder="AMC-2024-001"
                  />
                </div>
                <div>
                  <Label htmlFor="billDate">Agreement Date *</Label>
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

          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <span className="font-medium">{customer.fullName}</span>
                <Badge variant="outline">{customer.customerId}</Badge>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {(customer.address.street || customer.address.area || customer.address.city) && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span>{customer.address.street}, {customer.address.area}, {customer.address.city}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>AMC Services</CardTitle>
                <Button onClick={addItem} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Service
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      placeholder="Service description"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Price</Label>
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Total</Label>
                    <Input
                      value={item.total}
                      readOnly
                      className="bg-gray-50"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      onClick={() => removeItem(item.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Service Charge */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Charges</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="serviceCharge">Service Charge (₹)</Label>
                <Input
                  id="serviceCharge"
                  type="number"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes Section */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle>Additional Info</CardTitle>
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
            </CardHeader>
            <CardContent>
              {isEditingNotes ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Add additional notes or special instructions.
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
                  {notes ? (
                    <div className="text-sm whitespace-pre-wrap">{notes}</div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No additional notes</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Terms & Conditions Section */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle>AMC Terms & Conditions</CardTitle>
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
            </CardHeader>
            <CardContent>
              {isEditingTerms ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Edit AMC terms and conditions. Each term will be automatically numbered.
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      placeholder="Enter new term (e.g., 'Service response within 24 hours')"
                      onKeyPress={(e) => e.key === 'Enter' && addTerm()}
                      className="flex-1"
                    />
                    <Button onClick={addTerm} size="sm" disabled={!newTerm.trim()}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Term
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Current AMC Terms & Conditions:</Label>
                    <Textarea
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      placeholder="Terms will be automatically numbered..."
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <div className="text-xs text-gray-500">
                      💡 Tip: Each line will be treated as a separate numbered term. You can edit the full text above or add individual terms using the input above.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm whitespace-pre-wrap">{terms}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Section */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>AMC Agreement Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                {serviceCharge > 0 && (
                  <div className="flex justify-between">
                    <span>Service Charge:</span>
                    <span>₹{serviceCharge.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total Amount:</span>
                  <span>₹{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <Button 
                onClick={handlePrint} 
                className="w-full"
                disabled={!billNumber.trim()}
              >
                <Download className="w-4 h-4 mr-2" />
                Generate AMC Agreement
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
