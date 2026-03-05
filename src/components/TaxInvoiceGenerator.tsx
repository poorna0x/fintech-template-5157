import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { db, supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Download, Edit, X, FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';

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
  onTaxInvoiceSaved?: () => void;
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
  bankName: "HDFC Bank",
  accountNumber: "50200095252857",
  ifscCode: "HDFC0001048",
  branchName: "BOMMANAHALLY",
  accountHolderName: "HYDROGEN RO",
  accountType: "Current Account",
  upiId: "",
  note: "Account Type: Current Account. Please share the payment confirmation once the transfer is complete."
};
// Removed preset - invoice numbers are now generated dynamically

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

export default function TaxInvoiceGenerator({ customer, onPrint, onTaxInvoiceSaved }: TaxInvoiceGeneratorProps) {
  // Safe customer data extraction
  const customerName = customer?.fullName || (customer as any)?.full_name || 'Customer Name';
  const customerPhone = typeof customer?.phone === 'string' ? customer.phone : (customer as any)?.phone || '';
  const customerEmail = customer?.email || '';
  const customerAddress = customer?.address || {};
  const customerGst = customer?.gstNumber || '';
  const customerServiceType = customer?.serviceType || 'RO';

  // Get preview invoice number (doesn't increment - just shows what the next number would be)
  const getPreviewInvoiceNumber = async (): Promise<string> => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = `INV-${year}-${month}`;
      
      // Query database directly for last saved invoice number (don't use function that might increment)
      const { data: invoices, error } = await db.taxInvoices.getAll(10000, 0);
      
      if (!error && invoices && invoices.length > 0) {
        // Filter invoices for current month/year and find the highest number
        const monthInvoices = invoices.filter(inv => 
          inv.invoice_number && inv.invoice_number.startsWith(prefix)
        );
        
        if (monthInvoices.length > 0) {
          // Sort by invoice number descending and get the first one
          monthInvoices.sort((a, b) => {
            const aNum = parseInt(a.invoice_number.match(/\d{3}$/)?.[0] || '0');
            const bNum = parseInt(b.invoice_number.match(/\d{3}$/)?.[0] || '0');
            return bNum - aNum;
          });
          
          const lastInvoice = monthInvoices[0];
          const match = lastInvoice.invoice_number.match(/\d{3}$/);
          if (match) {
            const nextNumber = parseInt(match[0], 10) + 1;
            return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to query database for invoice numbers, using localStorage fallback:', error);
    }
    
    // Fallback: Generate with month/year pattern using localStorage
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}-${month}`;
    
    // Try to get last number from localStorage for this month
    const storageKey = `lastTaxInvoiceNumber_${year}_${month}`;
    const lastNumber = localStorage.getItem(storageKey);
    let nextNumber = 1;
    
    if (lastNumber && lastNumber.startsWith(prefix)) {
      const match = lastNumber.match(/-\d{3}$/);
      if (match) {
        nextNumber = parseInt(match[0].substring(1), 10) + 1;
      }
    }
    
    return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  };

  // Get next invoice number for actual saving (only called when saving)
  const getNextInvoiceNumberForSave = async (): Promise<string> => {
    // Use the same logic as preview, but this ensures we get the latest number at save time
    return await getPreviewInvoiceNumber();
  };

  // State management
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [signatureDate, setSignatureDate] = useState('');
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  
  // Initialize signature date with bill date on mount and when bill date changes (if not manually set)
  useEffect(() => {
    if (!signatureDate) {
      setSignatureDate(billDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billDate]);
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
  const [isSaving, setIsSaving] = useState(false);
  const [roundOff, setRoundOff] = useState(true);
  const [customerGstRequired, setCustomerGstRequired] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'B2B' | 'B2C'>('B2C'); // B2B = Business to Business, B2C = Business to Consumer
  const [bankDetails, setBankDetails] = useState(defaultBankDetails);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [showComputerGeneratedText, setShowComputerGeneratedText] = useState(true);
  const [showFooterText, setShowFooterText] = useState(true);
  const [showDigitallySignedText, setShowDigitallySignedText] = useState(false);
  
  // DSC (Digital Signature Certificate) options
  const [useDSC, setUseDSC] = useState(false);
  const [dscAuthorizedSignatory, setDscAuthorizedSignatory] = useState('Authorized Signatory');
  const [dscNameDesignation, setDscNameDesignation] = useState('Srujan - Proprietor');
  const [dscCompanyName, setDscCompanyName] = useState('Hydrogen RO');
  const [dscBoxWidth, setDscBoxWidth] = useState(75); // Default width in mm
  const [dscBoxHeight, setDscBoxHeight] = useState(22.5); // Default height in mm
  
  // Auto-deselect "Computer Generated Invoice" and enable "Digitally Signed Invoice" when DSC is enabled
  useEffect(() => {
    if (useDSC) {
      setShowComputerGeneratedText(false);
      setShowDigitallySignedText(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDSC]);
  
  const [poNumber, setPONumber] = useState('');
  const [showPONumber, setShowPONumber] = useState(false);
  const [poNumberRequired, setPONumberRequired] = useState(false); // For government entities
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

  // Update invoice number when component mounts (preview only - doesn't reserve number)
  useEffect(() => {
    let isMounted = true;
    getPreviewInvoiceNumber().then((invoiceNumber) => {
      if (isMounted) {
        setBillNumber(invoiceNumber);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

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

  // Invoice number generation is now handled by getNextInvoiceNumber() function

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

  // Function to save invoice to database
  const handleSaveToDatabase = async () => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }

    if (!billNumber.trim()) {
      toast.error('Please enter an invoice number');
      return;
    }

    // Validate B2B invoice requires customer GST
    if (invoiceType === 'B2B' && !editableCustomer.gst) {
      toast.error('Customer GSTIN is mandatory for B2B invoices. Please enter customer GST number.');
      return;
    }

    setIsSaving(true);

    try {
      // Check authentication status (for better error messages)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No authentication session found, attempting anonymous insert');
      }

      // Check if invoice number already exists and fetch new one if needed
      try {
        const { exists: invoiceExists, error: checkError } = await db.taxInvoices.checkInvoiceNumberExists(billNumber);
        if (checkError) {
          console.warn('Could not check for duplicate invoice number:', checkError);
          // Continue anyway - the insert will fail if duplicate
        } else if (invoiceExists) {
          // Invoice number was taken - fetch a new one automatically
          console.log(`Invoice number ${billNumber} already exists, fetching new number...`);
          const newInvoiceNumber = await getNextInvoiceNumberForSave();
          setBillNumber(newInvoiceNumber);
          toast.info(`Invoice number updated to ${newInvoiceNumber} (previous number was already used)`);
          // Continue with the new number
        }
      } catch (checkErr) {
        console.warn('Error checking duplicate invoice number:', checkErr);
        // Continue anyway
      }

      // Ensure customer_address is a valid JSONB object (not empty)
      const customerAddress = editableCustomer.address && Object.keys(editableCustomer.address).length > 0
        ? editableCustomer.address
        : {
            street: '',
            area: '',
            city: '',
            state: '',
            pincode: ''
          };

      // Ensure notes is an array
      const notesArray = Array.isArray(notes) ? notes : [];

      const { data: savedInvoice, error: saveError } = await db.taxInvoices.create({
        invoice_number: billNumber,
        invoice_date: billDate,
        invoice_type: invoiceType,
        customer_id: customer.id || null,
        customer_name: editableCustomer.name || 'Unknown Customer',
        customer_address: customerAddress,
        customer_phone: editableCustomer.phone || null,
        customer_email: editableCustomer.email || null,
        customer_gstin: editableCustomer.gst || null,
        company_info: company,
        items: items,
        place_of_supply: placeOfSupply || 'Karnataka',
        place_of_supply_code: placeOfSupplyCode || '29',
        is_intra_state: isIntraState,
        reverse_charge: reverseCharge || false,
        e_way_bill_no: eWayBillNo || null,
        transport_mode: transportMode || null,
        vehicle_no: vehicleNo || null,
        subtotal: subtotal || 0,
        total_discount: totalDiscount || 0,
        service_charge: serviceCharge || 0,
        total_tax: totalTax || 0,
        cgst: taxSplit.cgst || 0,
        sgst: taxSplit.sgst || 0,
        igst: taxSplit.igst || 0,
        round_off: finalRoundOff || 0,
        total_amount: totalAmount || 0,
        gst_breakup: gstBreakup || {},
        invoice_details: {
          invoiceType,
          poNumber: showPONumber ? poNumber : null,
          poNumberRequired,
          paymentDueDate,
          deliveryAddress: showDeliveryAddress ? deliveryAddress : null,
          totalDiscount
        },
        bank_details: bankDetails || {},
        notes: notesArray,
        terms: terms || '',
        validity_note: validityNote || null,
        service_type: customerServiceType || 'RO'
      });
      
      if (saveError) {
        console.error('Database save error details:', {
          error: saveError,
          message: saveError.message,
          details: saveError.details,
          hint: saveError.hint,
          code: saveError.code
        });
        throw new Error(saveError.message || saveError.details || 'Failed to save invoice to database');
      }
      
      // Also save to localStorage as backup with month/year pattern
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const storageKey = `lastTaxInvoiceNumber_${year}_${month}`;
      localStorage.setItem(storageKey, billNumber);
      
      // Fetch next invoice number for the next invoice (only after successful save)
      const nextInvoiceNumber = await getNextInvoiceNumberForSave();
      setBillNumber(nextInvoiceNumber);
      
      // Trigger a custom event to refresh GST invoices page if open
      window.dispatchEvent(new CustomEvent('taxInvoiceCreated'));
      
      toast.success('Invoice saved to database successfully', {
        description: `Invoice ${billNumber} has been saved with all details.`
      });

      // Notify parent to refresh if needed
      if (onTaxInvoiceSaved) {
        onTaxInvoiceSaved();
      }
    } catch (error: any) {
      console.error('Error saving invoice to database:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to save invoice to database', {
        description: errorMessage || 'Please try again or contact support.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async (action: 'print' | 'pdf' = 'print') => {
    if (!customer) {
      toast.error('Please select a customer first');
      return;
    }

    // Validate B2B invoice requires customer GST
    if (invoiceType === 'B2B' && !editableCustomer.gst) {
      toast.error('Customer GSTIN is mandatory for B2B invoices. Please enter customer GST number.');
      return;
    }
    
    // Validate PO Number if required (for government entities)
    if (showPONumber && poNumberRequired && !poNumber.trim()) {
      toast.error('PO Number / Work Order Number is required for government entities');
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
    
    // Add bank details only if showBankDetails is enabled
    (bill as any).bankDetails = showBankDetails ? bankDetails : undefined;
    
    // Add PDF display options
    (bill as any).pdfOptions = {
      showComputerGeneratedText,
      showFooterText,
      showDigitallySignedText,
      signatureDate: signatureDate || billDate
    };
    
    // Add DSC data if enabled
    if (useDSC) {
      (bill as any).dscData = {
        authorizedSignatory: dscAuthorizedSignatory,
        nameDesignation: dscNameDesignation,
        companyName: dscCompanyName,
        signatureDate: signatureDate || billDate,
        boxWidth: dscBoxWidth,
        boxHeight: dscBoxHeight
      };
    }
    
    // Add additional invoice details
    (bill as any).invoiceDetails = {
      invoiceType,
      poNumber: showPONumber ? poNumber : null,
      poNumberRequired,
      paymentDueDate,
      deliveryAddress: showDeliveryAddress ? deliveryAddress : null,
      totalDiscount
    };

    // Don't save to database automatically - user must explicitly click "Save to Database" button
    // This allows generating/previewing invoice without creating a record in the database
    onPrint?.(bill, action);
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 text-center sm:text-left">Generate Tax Invoice</h1>
        <div className="flex flex-col sm:flex-row gap-2 justify-center sm:justify-end">
          <Button 
            onClick={handleSaveToDatabase}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 min-w-[140px]"
            disabled={!billNumber.trim() || isSaving || !customer}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save to Database'}
          </Button>
          <Button onClick={() => handlePrint('print')} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto min-w-[140px]">
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
                  placeholder="INV-001"
                  className="font-mono font-semibold"
                />
                <p className="text-xs text-gray-500 mt-1">Auto-generated sequential number</p>
              </div>
              <div>
                <Label htmlFor="billDate">Invoice Date</Label>
                <div className="flex items-center gap-2 mt-1">
                  <DatePicker
                    value={billDate}
                    onChange={(v) => v && setBillDate(v)}
                    placeholder="Pick date"
                  />
                  {billDate && (
                    <span className="text-sm text-muted-foreground">
                      {new Date(billDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
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
            
            {/* PO Number Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center space-x-2 mb-3 flex-wrap">
                <input
                  type="checkbox"
                  id="showPONumber"
                  checked={showPONumber}
                  onChange={(e) => {
                    setShowPONumber(e.target.checked);
                    if (!e.target.checked) {
                      setPONumber('');
                      setPONumberRequired(false);
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <Label htmlFor="showPONumber" className="text-sm font-medium cursor-pointer">
                  Add PO Number / Work Order Number
                </Label>
                {showPONumber && (
                  <>
                    <input
                      type="checkbox"
                      id="poNumberRequired"
                      checked={poNumberRequired}
                      onChange={(e) => setPONumberRequired(e.target.checked)}
                      className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 ml-4"
                    />
                    <Label htmlFor="poNumberRequired" className="text-xs text-red-600 cursor-pointer">
                      Required (for government entities)
                    </Label>
                  </>
                )}
              </div>
              {showPONumber && (
                <div>
                  <Label htmlFor="poNumber">
                    PO Number / Work Order Number {poNumberRequired && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id="poNumber"
                    value={poNumber}
                    onChange={(e) => setPONumber(e.target.value)}
                    placeholder="Enter PO Number or Work Order Number"
                    required={poNumberRequired}
                    className={poNumberRequired && !poNumber ? 'border-red-500' : ''}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {poNumberRequired ? 'Mandatory for government entities' : 'Optional - for reference'}
                  </p>
                </div>
              )}
            </div>
            
            {/* Payment Due Date */}
            <div className="border-t pt-4 mt-4">
              <Label htmlFor="paymentDueDate">Payment Due Date (Optional)</Label>
              <div className="flex items-center gap-2 mt-1">
                <DatePicker
                  value={paymentDueDate}
                  onChange={(v) => setPaymentDueDate(v ?? '')}
                  placeholder="Pick date"
                />
                {paymentDueDate && (
                  <span className="text-sm text-muted-foreground">
                    {new Date(paymentDueDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
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

            {/* Bank Details Section */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
                  <CardTitle>Bank Details</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showBankDetails"
                      checked={showBankDetails}
                      onCheckedChange={(checked) => setShowBankDetails(checked === true)}
                    />
                    <Label
                      htmlFor="showBankDetails"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Show Bank Details in Invoice
                    </Label>
                  </div>
                </div>
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
                  <div>
                    <Label htmlFor="accountType">Account Type</Label>
                    <Input
                      id="accountType"
                      value={bankDetails.accountType || ''}
                      onChange={(e) => setBankDetails(prev => ({ ...prev, accountType: e.target.value }))}
                      placeholder="Current Account"
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
                  <div className="sm:col-span-2">
                    <Label htmlFor="upiId">UPI ID (Optional)</Label>
                    <Input
                      id="upiId"
                      value={bankDetails.upiId || ''}
                      onChange={(e) => setBankDetails(prev => ({ ...prev, upiId: e.target.value }))}
                      placeholder="example@okhdfcbank"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="bankNote">Payment Note (Optional)</Label>
                  <Textarea
                    id="bankNote"
                    value={bankDetails.note || ''}
                    onChange={(e) => setBankDetails(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="Share payment confirmation once the transfer is complete..."
                    rows={3}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Bank details will appear above Terms & Conditions in the invoice PDF when enabled.
                </p>
              </CardContent>
            </Card>

            {/* Document Options */}
            <Card>
              <CardHeader>
                <CardTitle>Document Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showComputerGeneratedText"
                    checked={showComputerGeneratedText}
                    onCheckedChange={(checked) => setShowComputerGeneratedText(checked === true)}
                  />
                  <Label
                    htmlFor="showComputerGeneratedText"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Show "This is a Computer Generated Invoice. No signature is required. This invoice is valid and legally binding."
                  </Label>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  {showComputerGeneratedText 
                    ? "The computer generated text will be displayed in the invoice"
                    : "The computer generated text will be hidden"}
                </p>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showFooterText"
                    checked={showFooterText}
                    onCheckedChange={(checked) => setShowFooterText(checked === true)}
                  />
                  <Label
                    htmlFor="showFooterText"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Show Footer Text ("Thank you for choosing Hydrogenro!" and contact information)
                  </Label>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  {showFooterText 
                    ? "The footer text will be displayed at the bottom of the invoice"
                    : "The footer text will be hidden"}
                </p>
                
                <div className="flex items-center space-x-2 mt-4">
                  <Checkbox
                    id="showDigitallySignedText"
                    checked={showDigitallySignedText}
                    onCheckedChange={(checked) => setShowDigitallySignedText(checked === true)}
                  />
                  <Label
                    htmlFor="showDigitallySignedText"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Show "Digitally Signed Invoice" disclaimer at bottom
                  </Label>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  {showDigitallySignedText 
                    ? "The digitally signed invoice disclaimer will be displayed at the bottom"
                    : "The digitally signed invoice disclaimer will be hidden"}
                </p>
                
                <div className="mt-4 pt-4 border-t">
                  <Label htmlFor="signatureDate" className="text-sm font-medium mb-2 block">
                    Signature Date (Below Seal)
                  </Label>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      value={signatureDate}
                      onChange={(v) => v && setSignatureDate(v)}
                      placeholder="Pick date"
                    />
                    {signatureDate && (
                      <span className="text-sm text-muted-foreground">
                        {new Date(signatureDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    This date will appear below the seal/signature. Defaults to invoice date but can be customized.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* DSC (Digital Signature Certificate) Options */}
            <Card>
              <CardHeader>
                <CardTitle>Digital Signature Certificate (DSC)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useDSC"
                    checked={useDSC}
                    onCheckedChange={(checked) => setUseDSC(checked === true)}
                  />
                  <Label
                    htmlFor="useDSC"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Use Digital Signature Certificate (DSC)
                  </Label>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  When enabled, the normal seal will be replaced with DSC signature section on the right side of the page.
                </p>
                
                {useDSC && (
                  <div className="space-y-4 mt-4 pl-6 border-l-2 border-blue-200">
                    <div>
                      <Label htmlFor="dscAuthorizedSignatory" className="text-sm font-medium mb-2 block">
                        Authorized Signatory Text <span className="text-green-600">✔ Yes</span> - Shows who is legally responsible
                      </Label>
                      <Input
                        id="dscAuthorizedSignatory"
                        value={dscAuthorizedSignatory}
                        onChange={(e) => setDscAuthorizedSignatory(e.target.value)}
                        placeholder="e.g., Authorized Signatory"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="dscNameDesignation" className="text-sm font-medium mb-2 block">
                        Your Name + Designation <span className="text-green-600">✔ Yes</span> - Must match DSC owner
                      </Label>
                      <Input
                        id="dscNameDesignation"
                        value={dscNameDesignation}
                        onChange={(e) => setDscNameDesignation(e.target.value)}
                        placeholder="e.g., Srujan - Proprietor"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="dscCompanyName" className="text-sm font-medium mb-2 block">
                        Company Name <span className="text-green-600">✔ Yes</span> - Vendor identity
                      </Label>
                      <Input
                        id="dscCompanyName"
                        value={dscCompanyName}
                        onChange={(e) => setDscCompanyName(e.target.value)}
                        placeholder="e.g., Hydrogen RO"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="dscSignatureDate" className="text-sm font-medium mb-2 block">
                        DSC Signature Date
                      </Label>
                      <div className="flex items-center gap-2">
                        <DatePicker
                          value={signatureDate}
                          onChange={(v) => v && setSignatureDate(v)}
                          placeholder="Pick date"
                        />
                        {signatureDate && (
                          <span className="text-sm text-muted-foreground">
                            {new Date(signatureDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Date that will appear in the DSC signature section. Defaults to invoice date.
                      </p>
                    </div>
                    
                    <div className="mt-4 space-y-3">
                      <Label className="text-sm font-medium block">
                        DSC Signature Box Size (mm)
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="dscBoxWidth" className="text-xs text-gray-600 mb-1 block">
                            Width (mm)
                          </Label>
                          <Input
                            id="dscBoxWidth"
                            type="number"
                            min="70"
                            max="100"
                            step="1"
                            value={dscBoxWidth}
                            onChange={(e) => setDscBoxWidth(Number(e.target.value))}
                            className="w-full"
                          />
                          <p className="text-xs text-gray-500 mt-1">Default: 75mm (Range: 70-100mm)</p>
                        </div>
                        <div>
                          <Label htmlFor="dscBoxHeight" className="text-xs text-gray-600 mb-1 block">
                            Height (mm)
                          </Label>
                          <Input
                            id="dscBoxHeight"
                            type="number"
                            min="20"
                            max="35"
                            step="0.5"
                            value={dscBoxHeight}
                            onChange={(e) => setDscBoxHeight(Number(e.target.value))}
                            className="w-full"
                          />
                          <p className="text-xs text-gray-500 mt-1">Default: 22.5mm (Range: 20-35mm)</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-600 mb-2">
                        <strong>Note:</strong> A placeholder box ({dscBoxWidth}mm × {dscBoxHeight}mm) will be created for the DSC signature image. 
                        You can add the actual DSC signature image later using Adobe or other tools.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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

