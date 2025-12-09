import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { generateVendorInvoicePDF, VendorInvoicePDFData } from '@/lib/vendor-invoice-pdf-generator';

const defaultCompanyInfo = {
  name: "Hydrogen RO",
  address: "Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560020",
  phone: "9886944288 & 8884944288",
  email: "mail@hydrogenro.com",
  gstNumber: "29LIJPS5140P1Z6",
  website: "hydrogenro.com"
};

interface InvoiceItem {
  description: string;
  quantity: number;
  taxableValue: number;
  gstAmount: number;
  totalValue: number;
  serviceDate: string;
}

const VendorInvoiceTracker = () => {
  const navigate = useNavigate();
  
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendor, setVendor] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    gstNumber: ''
  });
  const [referenceDetails, setReferenceDetails] = useState({
    referenceNumber: '',
    referenceDate: '',
    poNumber: '',
    poDate: ''
  });
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      description: '',
      quantity: 1,
      taxableValue: 0,
      gstAmount: 0,
      totalValue: 0,
      serviceDate: new Date().toISOString().split('T')[0]
    }
  ]);
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: '',
    bankName: '',
    branchName: '',
    accountType: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    note: ''
  });
  const [declaration, setDeclaration] = useState('');

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-calculate totalValue when taxableValue or gstAmount changes
    if (field === 'taxableValue' || field === 'gstAmount') {
      const taxableValue = field === 'taxableValue' ? Number(value) : newItems[index].taxableValue;
      const gstAmount = field === 'gstAmount' ? Number(value) : newItems[index].gstAmount;
      newItems[index].totalValue = taxableValue + gstAmount;
    }
    
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, {
      description: '',
      quantity: 1,
      taxableValue: 0,
      gstAmount: 0,
      totalValue: 0,
      serviceDate: new Date().toISOString().split('T')[0]
    }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    } else {
      toast.error('At least one item is required');
    }
  };

  const handleGeneratePDF = () => {
    // Validation
    if (!invoiceNumber.trim()) {
      toast.error('Please enter Invoice Number');
      return;
    }
    if (!vendor.name.trim()) {
      toast.error('Please enter Vendor Name');
      return;
    }
    if (items.some(item => !item.description.trim())) {
      toast.error('Please fill in all item descriptions');
      return;
    }

    const pdfData: VendorInvoicePDFData = {
      invoiceNumber,
      invoiceDate,
      company: defaultCompanyInfo,
      vendor,
      referenceDetails: Object.fromEntries(
        Object.entries(referenceDetails).filter(([_, value]) => value.trim() !== '')
      ),
      items: items.map(item => ({
        ...item,
        taxableValue: Number(item.taxableValue) || 0,
        gstAmount: Number(item.gstAmount) || 0,
        totalValue: Number(item.totalValue) || 0
      })),
      bankDetails: Object.keys(bankDetails).some(key => bankDetails[key as keyof typeof bankDetails]?.trim()) 
        ? bankDetails 
        : undefined,
      declaration: declaration.trim() || undefined
    };

    generateVendorInvoicePDF(pdfData, 'pdf');
    toast.success('Vendor Invoice PDF generated successfully!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
            <div className="flex items-center">
              <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Vendor Invoice Tracker</h1>
                <p className="text-xs sm:text-sm text-gray-600">Create and generate vendor invoice PDFs</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/settings')}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="space-y-6">
          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>Basic invoice information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceNumber">Invoice Number *</Label>
                  <Input
                    id="invoiceNumber"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Enter invoice number"
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date *</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vendor Details */}
          <Card>
            <CardHeader>
              <CardTitle>Bill To (Vendor Details)</CardTitle>
              <CardDescription>Vendor information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vendorName">Vendor Name *</Label>
                  <Input
                    id="vendorName"
                    value={vendor.name}
                    onChange={(e) => setVendor({ ...vendor, name: e.target.value })}
                    placeholder="Enter vendor name"
                  />
                </div>
                <div>
                  <Label htmlFor="vendorGst">GST Number</Label>
                  <Input
                    id="vendorGst"
                    value={vendor.gstNumber}
                    onChange={(e) => setVendor({ ...vendor, gstNumber: e.target.value })}
                    placeholder="Enter GST number"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="vendorAddress">Address</Label>
                  <Input
                    id="vendorAddress"
                    value={vendor.address}
                    onChange={(e) => setVendor({ ...vendor, address: e.target.value })}
                    placeholder="Enter address"
                  />
                </div>
                <div>
                  <Label htmlFor="vendorCity">City</Label>
                  <Input
                    id="vendorCity"
                    value={vendor.city}
                    onChange={(e) => setVendor({ ...vendor, city: e.target.value })}
                    placeholder="Enter city"
                  />
                </div>
                <div>
                  <Label htmlFor="vendorState">State</Label>
                  <Input
                    id="vendorState"
                    value={vendor.state}
                    onChange={(e) => setVendor({ ...vendor, state: e.target.value })}
                    placeholder="Enter state"
                  />
                </div>
                <div>
                  <Label htmlFor="vendorPincode">Pincode</Label>
                  <Input
                    id="vendorPincode"
                    value={vendor.pincode}
                    onChange={(e) => setVendor({ ...vendor, pincode: e.target.value })}
                    placeholder="Enter pincode"
                  />
                </div>
                <div>
                  <Label htmlFor="vendorPhone">Phone</Label>
                  <Input
                    id="vendorPhone"
                    value={vendor.phone}
                    onChange={(e) => setVendor({ ...vendor, phone: e.target.value })}
                    placeholder="Enter phone"
                  />
                </div>
                <div>
                  <Label htmlFor="vendorEmail">Email</Label>
                  <Input
                    id="vendorEmail"
                    type="email"
                    value={vendor.email}
                    onChange={(e) => setVendor({ ...vendor, email: e.target.value })}
                    placeholder="Enter email"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reference Details */}
          <Card>
            <CardHeader>
              <CardTitle>Reference Details</CardTitle>
              <CardDescription>Additional reference information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="referenceNumber">Reference Number</Label>
                  <Input
                    id="referenceNumber"
                    value={referenceDetails.referenceNumber}
                    onChange={(e) => setReferenceDetails({ ...referenceDetails, referenceNumber: e.target.value })}
                    placeholder="Enter reference number"
                  />
                </div>
                <div>
                  <Label htmlFor="referenceDate">Reference Date</Label>
                  <Input
                    id="referenceDate"
                    type="date"
                    value={referenceDetails.referenceDate}
                    onChange={(e) => setReferenceDetails({ ...referenceDetails, referenceDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="poNumber">PO Number</Label>
                  <Input
                    id="poNumber"
                    value={referenceDetails.poNumber}
                    onChange={(e) => setReferenceDetails({ ...referenceDetails, poNumber: e.target.value })}
                    placeholder="Enter PO number"
                  />
                </div>
                <div>
                  <Label htmlFor="poDate">PO Date</Label>
                  <Input
                    id="poDate"
                    type="date"
                    value={referenceDetails.poDate}
                    onChange={(e) => setReferenceDetails({ ...referenceDetails, poDate: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoice Items</CardTitle>
                  <CardDescription>Add items to track in the invoice</CardDescription>
                </div>
                <Button onClick={addItem} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">Item {index + 1}</h4>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Label>Description *</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        placeholder="Enter item description"
                      />
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <Label>Taxable Value (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.taxableValue}
                        onChange={(e) => handleItemChange(index, 'taxableValue', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>GST Amount (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.gstAmount}
                        onChange={(e) => handleItemChange(index, 'gstAmount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Total Value (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.totalValue}
                        onChange={(e) => handleItemChange(index, 'totalValue', parseFloat(e.target.value) || 0)}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                    <div>
                      <Label>Service Date</Label>
                      <Input
                        type="date"
                        value={item.serviceDate}
                        onChange={(e) => handleItemChange(index, 'serviceDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
              <CardDescription>Bank account information for payment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="accountHolder">Account Holder Name</Label>
                  <Input
                    id="accountHolder"
                    value={bankDetails.accountHolderName}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountHolderName: e.target.value })}
                    placeholder="Enter account holder name"
                  />
                </div>
                <div>
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={bankDetails.bankName}
                    onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                    placeholder="Enter bank name"
                  />
                </div>
                <div>
                  <Label htmlFor="branchName">Branch Name</Label>
                  <Input
                    id="branchName"
                    value={bankDetails.branchName}
                    onChange={(e) => setBankDetails({ ...bankDetails, branchName: e.target.value })}
                    placeholder="Enter branch name"
                  />
                </div>
                <div>
                  <Label htmlFor="accountType">Account Type</Label>
                  <Input
                    id="accountType"
                    value={bankDetails.accountType}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountType: e.target.value })}
                    placeholder="e.g., Savings, Current"
                  />
                </div>
                <div>
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={bankDetails.accountNumber}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                    placeholder="Enter account number"
                  />
                </div>
                <div>
                  <Label htmlFor="ifscCode">IFSC Code</Label>
                  <Input
                    id="ifscCode"
                    value={bankDetails.ifscCode}
                    onChange={(e) => setBankDetails({ ...bankDetails, ifscCode: e.target.value })}
                    placeholder="Enter IFSC code"
                  />
                </div>
                <div>
                  <Label htmlFor="upiId">UPI ID</Label>
                  <Input
                    id="upiId"
                    value={bankDetails.upiId}
                    onChange={(e) => setBankDetails({ ...bankDetails, upiId: e.target.value })}
                    placeholder="Enter UPI ID"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="bankNote">Payment Note</Label>
                  <Input
                    id="bankNote"
                    value={bankDetails.note}
                    onChange={(e) => setBankDetails({ ...bankDetails, note: e.target.value })}
                    placeholder="Additional payment instructions"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Declaration */}
          <Card>
            <CardHeader>
              <CardTitle>Declaration</CardTitle>
              <CardDescription>Terms and conditions or declaration text</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={declaration}
                onChange={(e) => setDeclaration(e.target.value)}
                placeholder="Enter declaration text (optional)"
                rows={4}
              />
            </CardContent>
          </Card>

          {/* Generate PDF Button */}
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/settings')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGeneratePDF}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Generate PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorInvoiceTracker;

