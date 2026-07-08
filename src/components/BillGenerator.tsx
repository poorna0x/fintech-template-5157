import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Download, Edit, X, FileText, Printer, Eye, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';
import DocumentBrandPickerDialog from '@/components/DocumentBrandPickerDialog';
import {
  DocumentBrand,
  brandHasGst,
  getCompanyInfoForBrand,
} from '@/lib/service-brands';
import DraftToolbar from '@/components/document-drafts/DraftToolbar';
import DocumentGeneratorPageHeader, {
  documentSectionTitleClass,
  DocumentGeneratorActionBar,
  documentGenerateBtnClass,
  documentOutlineBtnClass,
} from '@/components/DocumentGeneratorPageHeader';
import { mergeEditableCustomer } from '@/lib/document-drafts';
import { billToPreviewHtml, runAfterDialogClose } from '@/lib/document-preview-utils';
import DocumentPreviewDialog from '@/components/document/DocumentPreviewDialog';
import DocumentEmailSendDialog from '@/components/document/DocumentEmailSendDialog';
import DocumentTermsEditor from '@/components/document/DocumentTermsEditor';
import RichTextEditor from '@/components/letterhead/RichTextEditor';
import { joinNotesHtml, sanitizeHTML, stripHtmlToText } from '@/lib/sanitize';
import { normalizeRecipientList } from '@/lib/email-recipients';
import { getValidCustomerEmail } from '@/lib/customer-email';
import {
  coerceTermItemsFromSnapshot,
  createDefaultServiceDocumentTerms,
  formatServiceDocumentTermsForPdf,
  serializeTermItems,
  type ServiceDocumentTermItem,
} from '@/lib/service-document-terms';

interface BillGeneratorProps {
  customer?: Customer;
  onPrint?: (bill: Bill, action?: 'print' | 'pdf') => void;
  /** Hide page title when parent (modal / page shell) already shows one */
  embedded?: boolean;
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

export default function BillGenerator({ customer, onPrint, embedded = false }: BillGeneratorProps) {
  // Safe customer data extraction (search/slim rows may have string address or missing fields)
  const customerName = customer?.fullName || (customer as any)?.full_name || 'Customer Name';
  const customerPhone = typeof customer?.phone === 'string' ? customer.phone : (customer as any)?.phone || '';
  const customerEmail = customer?.email || '';
  const customerAddress =
    customer?.address && typeof customer.address === 'object'
      ? customer.address
      : {
          street: typeof customer?.address === 'string' ? customer.address : '',
          area: '',
          city: '',
          state: '',
          pincode: '',
        };
  const customerGst = customer?.gstNumber || '';
  const customerServiceType = customer?.serviceType || 'RO';

  // State management
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [items, setItems] = useState<BillItem[]>(defaultBillItems);
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [notesHeading, setNotesHeading] = useState('Additional Info');
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [validityNote, setValidityNote] = useState('This bill is valid for 30 days from the date of issue. Prices are subject to change without prior notice.');
  const [showValidityNote, setShowValidityNote] = useState(false);
  const [termItems, setTermItems] = useState<ServiceDocumentTermItem[]>(() =>
    createDefaultServiceDocumentTerms()
  );
  const termsForPdf = useMemo(() => formatServiceDocumentTermsForPdf(termItems), [termItems]);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [hideGstInHeader, setHideGstInHeader] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [pendingBrandAction, setPendingBrandAction] = useState<'print' | 'pdf' | 'preview' | 'email'>('pdf');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewBill, setPreviewBill] = useState<Bill | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSendContext, setEmailSendContext] = useState<{
    bill: Bill;
    brand: DocumentBrand;
    defaultRecipients: string[];
  } | null>(null);

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

  // Generate bill number only when empty (preserve restored drafts / manual entry)
  useEffect(() => {
    setBillNumber((prev) => {
      if (prev.trim()) return prev;
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `BILL-${year}-${month}-${randomNum}`;
    });
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
    if (stripHtmlToText(newNote)) {
      setNotes([...notes, newNote.trim()]);
      setNewNote('');
    }
  };

  const editNote = (index: number) => {
    setEditingNoteIndex(index);
    setNewNote(notes[index]);
  };

  const updateNote = () => {
    if (editingNoteIndex !== null && stripHtmlToText(newNote)) {
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

  const notesList = notes; // notes is already an array now

  const buildBillDocument = (brand: DocumentBrand): Bill | null => {
    if (!customer) {
      toast.error('Please select a customer first');
      return null;
    }

    const brandCompany = getCompanyInfoForBrand(brand);
    setCompany(brandCompany);

    return {
      id: Date.now().toString(),
      billNumber,
      billDate,
      company: brandCompany,
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
      notes: joinNotesHtml(notes),
      notesHeading,
      terms: showValidityNote ? `${validityNote}\n\n${termsForPdf}` : termsForPdf,
      serviceType: customerServiceType,
      hideGstInHeader: !brandHasGst(brand) || hideGstInHeader,
      documentBrand: brand,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as Bill;
  };

  const executePrintWithBrand = (brand: DocumentBrand, action: 'print' | 'pdf') => {
    const bill = buildBillDocument(brand);
    if (!bill) return;
    onPrint?.(bill, action);
  };

  const openPreview = (brand: DocumentBrand) => {
    const bill = buildBillDocument(brand);
    if (!bill) return;
    setPreviewBill(bill);
    setPreviewHtml(billToPreviewHtml(bill));
    setPreviewOpen(true);
  };

  const handlePrint = (action: 'print' | 'pdf' = 'print') => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }
    setPendingBrandAction(action);
    setBrandPickerOpen(true);
  };

  const openEmailSendDialog = (brand: DocumentBrand) => {
    const bill = buildBillDocument(brand);
    if (!bill) return;
    const defaultRecipients = normalizeRecipientList(
      getValidCustomerEmail(editableCustomer.email) ? [editableCustomer.email] : []
    );
    setEmailSendContext({ bill, brand, defaultRecipients });
    setEmailDialogOpen(true);
  };

  const handleEmailCustomer = () => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }
    setPendingBrandAction('email');
    setBrandPickerOpen(true);
  };

  const openEmailFromPreview = (brand: DocumentBrand) => {
    openEmailSendDialog(brand);
  };

  const handlePreview = () => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }
    setPendingBrandAction('preview');
    setBrandPickerOpen(true);
  };

  // ---- Draft snapshot / restore -----------------------------------------------
  const getDraftSnapshot = () => ({
    v: 1,
    billNumber,
    billDate,
    items,
    notes,
    notesHeading,
    validityNote,
    showValidityNote,
    termItems: serializeTermItems(termItems),
    terms: termsForPdf,
    serviceCharge,
    hideGstInHeader,
    editableCustomer,
  });

  const applyDraftSnapshot = (snap: ReturnType<typeof getDraftSnapshot>) => {
    if (!snap || typeof snap !== 'object') return;
    if (typeof snap.billNumber === 'string') setBillNumber(snap.billNumber);
    if (typeof snap.billDate === 'string') setBillDate(snap.billDate);
    if (Array.isArray(snap.items)) setItems(snap.items as BillItem[]);
    if (Array.isArray(snap.notes)) setNotes(snap.notes as string[]);
    if (typeof snap.notesHeading === 'string') setNotesHeading(snap.notesHeading);
    if (typeof snap.validityNote === 'string') setValidityNote(snap.validityNote);
    if (typeof snap.showValidityNote === 'boolean') setShowValidityNote(snap.showValidityNote);
    setTermItems(coerceTermItemsFromSnapshot(snap));
    if (typeof snap.serviceCharge === 'number') setServiceCharge(snap.serviceCharge);
    if (typeof snap.hideGstInHeader === 'boolean') setHideGstInHeader(snap.hideGstInHeader);
    if (snap.editableCustomer && typeof snap.editableCustomer === 'object')
      setEditableCustomer((prev) => mergeEditableCustomer(prev, snap.editableCustomer));
  };

  const buildDraftLabel = (snap: ReturnType<typeof getDraftSnapshot>) => {
    const num = snap.billNumber || 'Draft';
    const who = snap.editableCustomer?.name || 'Customer';
    return `${num} — ${who}`;
  };

  return (
    <div
      className={
        embedded
          ? 'max-w-4xl mx-auto space-y-4'
          : 'max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6'
      }
    >
      <DocumentGeneratorPageHeader
        title="Generate Bill"
        description="Fill in customer and item details — preview, then generate or download PDF."
        accent="green"
        embedded={embedded}
        actions={
          <DocumentGeneratorActionBar
            primaryCols={4}
            draft={
              <DraftToolbar
                kind="bill"
                documentNoun="bill"
                getSnapshot={getDraftSnapshot}
                onLoad={applyDraftSnapshot}
                buildLabel={buildDraftLabel}
                stretch
              />
            }
            primary={
              <div className="col-span-full w-full">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Review &amp; export
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Button
                    onClick={handlePreview}
                    variant="outline"
                    className={documentOutlineBtnClass}
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span className="truncate">Preview</span>
                  </Button>
                  <Button
                    onClick={() => handlePrint('print')}
                    className={documentGenerateBtnClass}
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    <span className="truncate">Generate</span>
                  </Button>
                  <Button
                    onClick={() => handlePrint('pdf')}
                    variant="outline"
                    className={documentOutlineBtnClass}
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span className="truncate">Download</span>
                  </Button>
                  <Button
                    onClick={handleEmailCustomer}
                    variant="outline"
                    className={documentOutlineBtnClass}
                  >
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">Email PDF</span>
                  </Button>
                </div>
              </div>
            }
          />
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Bill Information */}
        <Card>
          <CardHeader>
            <CardTitle className={documentSectionTitleClass}>Bill Information</CardTitle>
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
                <DatePicker
                    value={billDate}
                    onChange={(v) => v && setBillDate(v)}
                    placeholder="Pick date"
                  />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className={documentSectionTitleClass}>Customer Information</CardTitle>
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
            <CardTitle className={documentSectionTitleClass}>Bill Items</CardTitle>
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
          <CardTitle className={documentSectionTitleClass}>Bill Summary</CardTitle>
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
          <CardTitle className={`${documentSectionTitleClass} text-blue-900`}>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Notes Section */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-blue-800">{notesHeading}</h3>
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

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                <Label htmlFor="notesHeading" className="text-sm font-medium text-blue-800 sm:w-60">
                  Additional Info heading
                </Label>
                <Input
                  id="notesHeading"
                  value={notesHeading}
                  onChange={(e) => setNotesHeading(e.target.value)}
                  placeholder="e.g. Warranty Notes"
                  className="w-full sm:w-72"
                />
              </div>
              
              {isEditingNotes ? (
                <div className="space-y-4">
                  <div className="text-sm text-blue-600">
                    Same formatting as Custom Document (Bold, headings, lists, alignment, links).
                  </div>
                  <div className="flex flex-col gap-2">
                    <RichTextEditor
                      value={newNote}
                      onChange={setNewNote}
                      placeholder="Enter additional information…"
                      minHeight={140}
                    />
                    <div className="flex flex-col sm:flex-row gap-2">
                      {editingNoteIndex !== null ? (
                        <>
                          <Button onClick={updateNote} size="sm" className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                            <Edit className="w-4 h-4 mr-1" />
                            Update
                          </Button>
                          <Button onClick={cancelEdit} variant="outline" size="sm" className="w-full sm:w-auto">
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={addNote}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                          disabled={!stripHtmlToText(newNote)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Note
                        </Button>
                      )}
                    </div>
                  </div>
                  {notes.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-blue-700">Current Notes:</Label>
                      {notes.map((note, index) => (
                        <div key={`note-${index}`} className="flex items-start gap-2 p-3 bg-white border border-blue-200 rounded-lg">
                          <div
                            className="flex-1 text-sm text-gray-700 break-words prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
                            dangerouslySetInnerHTML={{ __html: sanitizeHTML(note, true) }}
                          />
                          <div className="flex gap-1 flex-shrink-0">
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
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-blue-600">
                    Current notes:
                  </div>
                  <div className="space-y-2">
                    {notesList.map((note, index) => (
                      <div key={`note-${index}-${note.slice(0, 10)}`} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                        <div
                          className="flex-1 text-sm break-words prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
                          dangerouslySetInnerHTML={{ __html: sanitizeHTML(note, true) }}
                        />
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
              <h3 className="text-base sm:text-lg font-semibold">Terms & Conditions</h3>
              <DocumentTermsEditor items={termItems} onChange={setTermItems} />
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

      <DocumentBrandPickerDialog
        open={brandPickerOpen}
        onOpenChange={setBrandPickerOpen}
        title={
          pendingBrandAction === 'preview'
            ? 'Which brand should this preview use?'
            : pendingBrandAction === 'email'
              ? 'Which brand is sending this bill?'
              : 'Which brand is this bill for?'
        }
        description={
          pendingBrandAction === 'preview'
            ? 'The preview will show the bill with the selected brand logo and address.'
            : pendingBrandAction === 'email'
              ? 'The PDF attachment and email will use the selected brand address, logo, and sender.'
              : 'Hydrogen RO includes GST on documents. Eleven RO does not use GST.'
        }
        onSelect={(brand) => {
          if (pendingBrandAction === 'preview') {
            openPreview(brand);
          } else if (pendingBrandAction === 'email') {
            openEmailSendDialog(brand);
          } else {
            executePrintWithBrand(brand, pendingBrandAction);
          }
        }}
      />
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) {
            setPreviewHtml(null);
            setPreviewBill(null);
          }
        }}
        title="Bill Preview"
        previewTitle={previewBill ? `Bill ${previewBill.billNumber}` : 'Bill preview'}
        previewHtml={previewHtml}
        accent="green"
        onDownload={() => {
          if (!previewBill) return;
          const brand = (previewBill as Bill & { documentBrand?: DocumentBrand }).documentBrand;
          if (!brand) return;
          setPreviewOpen(false);
          runAfterDialogClose(() => executePrintWithBrand(brand, 'pdf'));
        }}
        onPrint={() => {
          if (!previewBill) return;
          const brand = (previewBill as Bill & { documentBrand?: DocumentBrand }).documentBrand;
          if (!brand) return;
          setPreviewOpen(false);
          runAfterDialogClose(() => executePrintWithBrand(brand, 'print'));
        }}
        onEmail={() => {
          if (!previewBill) return;
          const brand = (previewBill as Bill & { documentBrand?: DocumentBrand }).documentBrand;
          if (!brand) return;
          setPreviewOpen(false);
          runAfterDialogClose(() => openEmailFromPreview(brand));
        }}
      />
      <DocumentEmailSendDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        kind="service_bill"
        bill={emailSendContext?.bill ?? null}
        brand={emailSendContext?.brand ?? null}
        defaultRecipients={emailSendContext?.defaultRecipients ?? []}
        dueDateIso={emailSendContext?.bill?.billDate}
      />
    </div>
  );
}