import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { Plus, Trash2, Download, Edit, X, FileText, Printer, Eye, Share2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';
import ImageUpload from '@/components/ImageUpload';
import { getCustomerGstNumber, normalizeCustomerGstNumber } from '@/lib/customerGst';
import { normalizeCustomerAddress } from '@/lib/customer-address';
import {
  getCompanyStateCode,
  getStateNameByCode,
  INDIAN_GST_STATES,
  isIntraStateSupply,
  normalizeGstStateCode,
  placeOfSupplyFromCustomerGstin,
  preparePlaceOfSupplyForSave,
  resolvePlaceOfSupply,
} from '@/lib/indian-state-codes';
import DocumentBrandPickerDialog from '@/components/DocumentBrandPickerDialog';
import {
  DocumentBrand,
  brandHasGst,
  getCompanyInfoForBrand,
  getDocumentSealVariantLabel,
} from '@/lib/service-brands';
import {
  createQuotationImageBlock,
  normalizeQuotationImageBlocks,
  quotationImageBlocksForPdf,
  type QuotationImageAlign,
  type QuotationImageBlock,
  type QuotationImageColumns,
  type QuotationImageSize,
} from '@/lib/quotation-custom-images';
import DraftToolbar from '@/components/document-drafts/DraftToolbar';
import DocumentGeneratorPageHeader, {
  DocumentGeneratorActionBar,
  documentGenerateBtnClass,
  documentOutlineBtnClass,
} from '@/components/DocumentGeneratorPageHeader';
import { mergeEditableCustomer } from '@/lib/document-drafts';
import { quotationToPreviewHtml, runAfterDialogClose } from '@/lib/document-preview-utils';
import DocumentPreviewDialog from '@/components/document/DocumentPreviewDialog';
import DocumentEmailSendDialog from '@/components/document/DocumentEmailSendDialog';
import DocumentTermsEditor from '@/components/document/DocumentTermsEditor';
import InventoryItemSearchField from '@/components/document/InventoryItemSearchField';
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
import {
  DocumentAddressSelector,
  documentAddressForChoice,
  useDocumentSiteAddress,
} from '@/components/document/DocumentAddressSelector';
import AiDocumentDraftAssistant from '@/components/document-ai/AiDocumentDraftAssistant';

interface QuotationGeneratorProps {
  customer?: Customer;
  onPrint?: (quotation: Bill, action?: 'print' | 'pdf') => void;
  embedded?: boolean;
  initialAiInstruction?: string | null;
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
    total: 17700,
    taxRate: 18,
    taxAmount: 2700,
    hsnCode: '8421',
  } as BillItem,
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

export default function QuotationGenerator({
  customer,
  onPrint,
  embedded = false,
  initialAiInstruction,
}: QuotationGeneratorProps) {
  // Safe customer data extraction (search/slim rows may have string address or missing fields)
  const customerName = customer?.fullName || (customer as any)?.full_name || '';
  const customerPhone = typeof customer?.phone === 'string' ? customer.phone : (customer as any)?.phone || '';
  const customerEmail = customer?.email || '';
  const customerAddress = normalizeCustomerAddress(customer?.address);
  const customerGst = getCustomerGstNumber(customer);
  const customerServiceType = customer?.serviceType || 'RO';

  // State management
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntilDate, setValidUntilDate] = useState(() => {
    const today = new Date();
    const d = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [isValidUntilManuallySet, setIsValidUntilManuallySet] = useState(false);
  const [items, setItems] = useState<BillItem[]>(defaultQuotationItems);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [notesHeading, setNotesHeading] = useState('Additional Info');
  const [customImageBlocks, setCustomImageBlocks] = useState<QuotationImageBlock[]>([]);
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [validityNote, setValidityNote] = useState('This quotation is valid for 30 days from the date of issue. Prices are subject to change without prior notice.');
  const [showValidityNote, setShowValidityNote] = useState(false);
  const [termItems, setTermItems] = useState<ServiceDocumentTermItem[]>(() =>
    createDefaultServiceDocumentTerms()
  );
  const termsForPdf = useMemo(() => formatServiceDocumentTermsForPdf(termItems), [termItems]);
  const [gstOption, setGstOption] = useState<'normal' | 'exclude' | 'include'>('include'); // Default to including GST
  const [addGSTNoteToNotes, setAddGSTNoteToNotes] = useState(false); // Option to add GST note to Additional Info
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [sealVariant, setSealVariant] = useState<'sign' | 'stamp'>('sign');
  const [bankDetails, setBankDetails] = useState(defaultBankDetails);
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
    dueDateIso: string;
  } | null>(null);

  // Computed values for backward compatibility
  const includeGST = gstOption === 'include';
  
  // GST-specific state
  const initialPos = resolvePlaceOfSupply({
    customerState: customerAddress.state,
    customerGstin: customerGst,
    defaultStateCode: getCompanyStateCode(defaultCompanyInfo),
  });
  const [placeOfSupply, setPlaceOfSupply] = useState(initialPos.name);
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState(initialPos.code);
  /** Skip GSTIN→state auto-select while restoring a draft snapshot. */
  const skipGstPlaceOfSupplyAutoRef = useRef(false);

  const companyStateCode = getCompanyStateCode(defaultCompanyInfo);

  const handlePlaceOfSupplyCodeChange = (value: string) => {
    skipGstPlaceOfSupplyAutoRef.current = false;
    const code = normalizeGstStateCode(value);
    setPlaceOfSupplyCode(code);
    const stateName = getStateNameByCode(code);
    if (stateName) setPlaceOfSupply(stateName);
  };

  const handlePlaceOfSupplySelect = (code: string) => {
    skipGstPlaceOfSupplyAutoRef.current = false;
    setPlaceOfSupplyCode(code);
    const stateName = getStateNameByCode(code);
    if (stateName) setPlaceOfSupply(stateName);
  };

  // Customer editing state
  const [isEditingCustomer, setIsEditingCustomer] = useState(true);
  const { addressChoice, setAddressChoice, selectSite, markAddressEdited, isAddressEdited } =
    useDocumentSiteAddress(customer?.id);
  const [editableCustomer, setEditableCustomer] = useState({
    name: customerName,
    phone: customerPhone,
    email: customerEmail,
    gst: customerGst,
    address: {
      street: customerAddress.street || '',
      area: customerAddress.area || '',
      city: '',
      state: '',
      pincode: customerAddress.pincode || ''
    }
  });

  // Update from customer / site picker only when not typing in this form.
  // customerAddress is a new object every render — do not put it in deps (that
  // reset the fields on every keystroke and made the page feel laggy).
  useEffect(() => {
    if (isAddressEdited()) return;
    const selectedAddress = documentAddressForChoice(customer, addressChoice);
    setEditableCustomer({
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
      gst: customerGst,
      address: {
        street: selectedAddress.street,
        area: selectedAddress.area,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode
      }
    });
  }, [
    customer?.id,
    addressChoice,
    customerName,
    customerPhone,
    customerEmail,
    customerGst,
    customer,
  ]);

  const editAddress = normalizeCustomerAddress(editableCustomer.address);

  const patchQuoteAddress = (field: 'street' | 'area' | 'city' | 'state' | 'pincode', value: string) => {
    markAddressEdited();
    setEditableCustomer((prev) => ({
      ...prev,
      address: { ...normalizeCustomerAddress(prev.address), [field]: value },
    }));
  };

  // Auto-select place of supply / state code from customer GSTIN when Include GST is on
  useEffect(() => {
    if (gstOption !== 'include') return;
    if (skipGstPlaceOfSupplyAutoRef.current) return;
    const fromGst = placeOfSupplyFromCustomerGstin(editableCustomer.gst);
    if (!fromGst) return;
    setPlaceOfSupplyCode((prev) => (prev === fromGst.code ? prev : fromGst.code));
    setPlaceOfSupply((prev) => (prev === fromGst.name ? prev : fromGst.name));
  }, [editableCustomer.gst, gstOption]);

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

  // Keep "Valid Until" in sync with quotation date, until user overrides it.
  useEffect(() => {
    if (isValidUntilManuallySet) return;
    if (!quotationDate) return;
    const d = new Date(quotationDate);
    if (Number.isNaN(d.getTime())) return;
    const next = new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setValidUntilDate(next);
  }, [quotationDate, isValidUntilManuallySet]);

  const isIncludeGst = gstOption === 'include';

  const recalculateQuotationItem = (item: BillItem, option: typeof gstOption): BillItem => {
    const baseTotal = item.quantity * item.unitPrice;
    let taxAmount = 0;
    let total = baseTotal;

    if (option === 'include' && item.taxRate > 0) {
      taxAmount = Math.round((baseTotal * item.taxRate) / 100);
      total = baseTotal + taxAmount;
    }

    return { ...item, taxAmount, total };
  };

  const addItem = () => {
    const newItem = recalculateQuotationItem(
      {
        id: Date.now().toString(),
        description: '',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        taxRate: gstOption === 'include' ? 18 : 0,
        taxAmount: 0,
        hsnCode: '8421',
      } as BillItem,
      gstOption
    );
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof BillItem, value: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updatedItem = { ...item, [field]: value };
        if (
          field === 'quantity' ||
          field === 'unitPrice' ||
          field === 'taxRate'
        ) {
          return recalculateQuotationItem(updatedItem, gstOption);
        }
        return updatedItem;
      })
    );
  };

  useEffect(() => {
    setItems((prev) => prev.map((item) => recalculateQuotationItem(item, gstOption)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstOption]);

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
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

  const handleBankDetailChange = (field: keyof typeof bankDetails, value: string) => {
    setBankDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const totalTax =
    gstOption === 'normal'
      ? 0
      : items.reduce((sum, item) => sum + item.taxAmount, 0);

  const calculateGSTBreakup = () => {
    const gstByRate: Record<number, { taxableAmount: number; taxAmount: number }> = {};
    if (gstOption !== 'include') return gstByRate;

    items.forEach((item) => {
      if (item.taxRate > 0) {
        const taxableAmount = item.quantity * item.unitPrice;
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
  
  // Determine if intra-state (same state) or inter-state (different state)
  const isIntraState = isIntraStateSupply(
    companyStateCode,
    placeOfSupplyCode,
    defaultCompanyInfo.state,
    placeOfSupply
  );

  const primaryGstRate =
    items.find((item) => item.taxRate > 0)?.taxRate ?? 18;
  
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

  const buildQuotationDocument = (brand: DocumentBrand): Bill | null => {
    const companyInfo = getCompanyInfoForBrand(brand);
    const effectiveGstOption = brandHasGst(brand) ? gstOption : 'normal';
    const printTotalAmount =
      effectiveGstOption === 'include'
        ? subtotal + totalTax + serviceCharge
        : subtotal + serviceCharge;

    if (effectiveGstOption === 'include') {
      const posForOutput = preparePlaceOfSupplyForSave({
        placeName: placeOfSupply,
        placeCode: placeOfSupplyCode,
        supplierStateCode: companyStateCode,
        supplierStateName: companyInfo.state,
      });

      if (!posForOutput.isValid) {
        toast.error(
          'Please select a valid place of supply (pick a state from the list or enter a 2-digit GST state code).'
        );
        return null;
      }

      setPlaceOfSupply(posForOutput.name);
      setPlaceOfSupplyCode(posForOutput.code);
    }

    const quotation: Bill = {
      id: Date.now().toString(),
      billNumber: quotationNumber,
      billDate: quotationDate,
      company: companyInfo,
      customer: {
        id: customer?.id || '',
        name: editableCustomer.name,
        fullName: editableCustomer.name,
        phone: editableCustomer.phone,
        email: editableCustomer.email,
        address: {
          street: editAddress.street,
          area: editAddress.area,
          city: editAddress.city,
          state: editAddress.state,
          pincode: editAddress.pincode,
          country: 'India',
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
      totalAmount: printTotalAmount,
      paymentStatus: 'pending',
      paymentMethod: 'cash',
      notes: joinNotesHtml(notes),
      notesHeading,
      terms: showValidityNote ? `${validityNote}\n\n${termsForPdf}` : termsForPdf,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as Bill;

    (quotation as Bill & { validUntil?: string }).validUntil = validUntilDate;
    (quotation as Bill & { gstOption?: string }).gstOption = effectiveGstOption;
    (quotation as Bill & { documentBrand?: DocumentBrand }).documentBrand = brand;
    (quotation as Bill & { sealVariant?: typeof sealVariant }).sealVariant = sealVariant;
    (quotation as Bill & { includeGST?: boolean }).includeGST = effectiveGstOption === 'include';

    if (effectiveGstOption === 'include') {
      const posForOutput = preparePlaceOfSupplyForSave({
        placeName: placeOfSupply,
        placeCode: placeOfSupplyCode,
        supplierStateCode: companyStateCode,
        supplierStateName: companyInfo.state,
      });
      const outputIsIntraState = posForOutput.isIntraState;
      const outputTaxSplit =
        totalTax > 0
          ? outputIsIntraState
            ? { cgst: totalTax / 2, sgst: totalTax / 2, igst: 0 }
            : { cgst: 0, sgst: 0, igst: totalTax }
          : { cgst: 0, sgst: 0, igst: 0 };

      (quotation as Bill & { gstData?: object }).gstData = {
        placeOfSupply: posForOutput.name,
        placeOfSupplyCode: posForOutput.code,
        companyStateCode,
        isIntraState: outputIsIntraState,
        taxSplit: outputTaxSplit,
        primaryGstRate,
        gstBreakup,
      };
    }

    if (showBankDetails && brand === 'hydrogenro') {
      (quotation as Bill & { bankDetails?: object }).bankDetails = bankDetails;
    }

    const printableBlocks = quotationImageBlocksForPdf(customImageBlocks);
    if (printableBlocks.length > 0) {
      quotation.customImageBlocks = printableBlocks;
      // Legacy flat fields for older consumers
      quotation.customImages = printableBlocks.flatMap((b) => b.images);
      quotation.customImagesHeading = printableBlocks[0]?.heading || 'Product Images';
    }

    return quotation;
  };

  const executePrintWithBrand = (brand: DocumentBrand, action: 'print' | 'pdf') => {
    const quotation = buildQuotationDocument(brand);
    if (!quotation) return;
    onPrint?.(quotation, action);
  };

  const openPreview = (brand: DocumentBrand) => {
    const quotation = buildQuotationDocument(brand);
    if (!quotation) return;
    setPreviewBill(quotation);
    setPreviewHtml(quotationToPreviewHtml(quotation));
    setPreviewOpen(true);
  };

  const handlePrint = (action: 'print' | 'pdf' = 'print') => {
    setPendingBrandAction(action);
    setBrandPickerOpen(true);
  };

  const openEmailSendDialog = (brand: DocumentBrand) => {
    const quotation = buildQuotationDocument(brand);
    if (!quotation) return;
    const defaultRecipients = normalizeRecipientList(
      getValidCustomerEmail(editableCustomer.email) ? [editableCustomer.email] : []
    );
    setEmailSendContext({
      bill: quotation,
      brand,
      defaultRecipients,
      dueDateIso: validUntilDate,
    });
    setEmailDialogOpen(true);
  };

  const handleEmailCustomer = () => {
    setPendingBrandAction('email');
    setBrandPickerOpen(true);
  };

  const openEmailFromPreview = (brand: DocumentBrand) => {
    openEmailSendDialog(brand);
  };

  const handlePreview = () => {
    setPendingBrandAction('preview');
    setBrandPickerOpen(true);
  };

  // ---- Draft snapshot / restore -------------------------------------------------
  // We serialize only the local form state. The customer prop is restored as-is
  // through the editableCustomer fields the user may have edited.
  const getDraftSnapshot = () => ({
    v: 1,
    quotationNumber,
    quotationDate,
    validUntilDate,
    isValidUntilManuallySet,
    items,
    serviceCharge,
    notes,
    notesHeading,
    customImageBlocks,
    validityNote,
    showValidityNote,
    termItems: serializeTermItems(termItems),
    terms: termsForPdf,
    gstOption,
    addGSTNoteToNotes,
    showBankDetails,
    sealVariant,
    bankDetails,
    placeOfSupply,
    placeOfSupplyCode,
    addressChoice,
    editableCustomer,
  });

  const applyDraftSnapshot = (snap: ReturnType<typeof getDraftSnapshot>) => {
    if (!snap || typeof snap !== 'object') return;
    skipGstPlaceOfSupplyAutoRef.current = true;
    if (typeof snap.quotationNumber === 'string') setQuotationNumber(snap.quotationNumber);
    if (typeof snap.quotationDate === 'string') setQuotationDate(snap.quotationDate);
    if (typeof snap.validUntilDate === 'string') setValidUntilDate(snap.validUntilDate);
    if (typeof snap.isValidUntilManuallySet === 'boolean')
      setIsValidUntilManuallySet(snap.isValidUntilManuallySet);
    if (Array.isArray(snap.items)) setItems(snap.items as BillItem[]);
    if (typeof snap.serviceCharge === 'number') setServiceCharge(snap.serviceCharge);
    if (Array.isArray(snap.notes)) setNotes(snap.notes as string[]);
    if (typeof snap.notesHeading === 'string') setNotesHeading(snap.notesHeading);
    if (Array.isArray(snap.customImageBlocks) || Array.isArray(snap.customImages)) {
      setCustomImageBlocks(
        normalizeQuotationImageBlocks(snap.customImageBlocks, {
          heading: snap.customImagesHeading,
          images: snap.customImages,
        })
      );
    }
    if (typeof snap.validityNote === 'string') setValidityNote(snap.validityNote);
    if (typeof snap.showValidityNote === 'boolean') setShowValidityNote(snap.showValidityNote);
    setTermItems(
      coerceTermItemsFromSnapshot({
        termItems: snap.termItems,
        terms:
          typeof (snap as { termsConditions?: string }).termsConditions === 'string'
            ? (snap as { termsConditions: string }).termsConditions
            : snap.terms,
      })
    );
    if (snap.gstOption === 'normal' || snap.gstOption === 'exclude' || snap.gstOption === 'include')
      setGstOption(snap.gstOption);
    if (typeof snap.addGSTNoteToNotes === 'boolean') setAddGSTNoteToNotes(snap.addGSTNoteToNotes);
    if (typeof snap.showBankDetails === 'boolean') setShowBankDetails(snap.showBankDetails);
    if (snap.sealVariant === 'sign' || snap.sealVariant === 'stamp') setSealVariant(snap.sealVariant);
    if (snap.bankDetails && typeof snap.bankDetails === 'object')
      setBankDetails({ ...defaultBankDetails, ...snap.bankDetails });
    if (typeof snap.placeOfSupply === 'string') setPlaceOfSupply(snap.placeOfSupply);
    if (typeof snap.placeOfSupplyCode === 'string') setPlaceOfSupplyCode(snap.placeOfSupplyCode);
    if (snap.addressChoice === 'secondary') {
      setAddressChoice('secondary');
    } else if (snap.addressChoice === 'primary' || snap.addressChoice === 'omit') {
      setAddressChoice('primary');
    }
    if (snap.editableCustomer && typeof snap.editableCustomer === 'object') {
      markAddressEdited();
      setEditableCustomer((prev) => mergeEditableCustomer(prev, snap.editableCustomer));
    }
  };

  const buildDraftLabel = (snap: ReturnType<typeof getDraftSnapshot>) => {
    const num = snap.quotationNumber || 'Draft';
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
        title="Generate Quotation"
        description="Add items, GST options, and terms — then preview or download the quotation PDF."
        accent="green"
        embedded={embedded}
        actions={
          <DocumentGeneratorActionBar
            primaryCols={4}
            draft={
              <DraftToolbar
                kind="quotation"
                documentNoun="quotation"
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
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">Send PDF</span>
                  </Button>
                </div>
              </div>
            }
          />
        }
      />

      <AiDocumentDraftAssistant
        kind="quotation"
        documentNoun="quotation"
        getSnapshot={getDraftSnapshot}
        onApply={applyDraftSnapshot}
        initialInstruction={initialAiInstruction}
      />

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
              <div>
                <Label htmlFor="validUntilDate">Valid Until</Label>
                <DatePicker
                  value={validUntilDate}
                  onChange={(v) => {
                    if (!v) return;
                    setIsValidUntilManuallySet(true);
                    setValidUntilDate(v);
                  }}
                  placeholder="Pick date"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="gstOption">GST Option</Label>
                <Select
                  value={gstOption}
                  onValueChange={(value: 'normal' | 'exclude' | 'include') => {
                    setGstOption(value);
                    setItems(
                      items.map((item) =>
                        recalculateQuotationItem(
                          {
                            ...item,
                            taxRate: value === 'include' ? item.taxRate || 18 : 0,
                          },
                          value
                        )
                      )
                    );
                    if (value === 'normal' && addGSTNoteToNotes) {
                      setAddGSTNoteToNotes(false);
                    }
                    setNotes(
                      notes.filter(
                        (note) =>
                          !note.includes('Prices include GST') &&
                          !note.includes('GST not included') &&
                          !note.includes('Prices exclude GST')
                      )
                    );
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
                  <div className="sm:col-span-2">
                    <Label htmlFor="placeOfSupplySelect">Place of Supply (India)</Label>
                    <Select
                      value={placeOfSupplyCode || undefined}
                      onValueChange={handlePlaceOfSupplySelect}
                    >
                      <SelectTrigger id="placeOfSupplySelect">
                        <SelectValue placeholder="Select state / UT" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {INDIAN_GST_STATES.map(({ code, name }) => (
                          <SelectItem key={code} value={code}>
                            {code} — {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Supplier: {defaultCompanyInfo.state} ({companyStateCode}).{' '}
                      {isIntraState ? 'Intra-state — CGST + SGST' : 'Inter-state — IGST'}
                      {editableCustomer.gst
                        ? ' · State selected from customer GSTIN.'
                        : ''}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="placeOfSupplyCode">State Code</Label>
                    <Input
                      id="placeOfSupplyCode"
                      value={placeOfSupplyCode}
                      onChange={(e) => handlePlaceOfSupplyCodeChange(e.target.value)}
                      placeholder="e.g. 27"
                      inputMode="numeric"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="placeOfSupply">State Name</Label>
                    <Input
                      id="placeOfSupply"
                      value={placeOfSupply}
                      onChange={(e) => setPlaceOfSupply(e.target.value)}
                      placeholder="State name"
                    />
                    <p className="text-xs text-gray-500 mt-1">Editable after auto-fill from code or GSTIN.</p>
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
            <DocumentAddressSelector
              customer={customer}
              value={addressChoice}
              onChange={(choice, address) => {
                const next = selectSite(choice, address);
                setEditableCustomer((prev) => ({ ...prev, address: next }));
              }}
            />
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
                      onChange={(e) => {
                        skipGstPlaceOfSupplyAutoRef.current = false;
                        setEditableCustomer((prev) => ({
                          ...prev,
                          gst: normalizeCustomerGstNumber(e.target.value),
                        }));
                      }}
                      placeholder="Enter GST number"
                      maxLength={15}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    {gstOption === 'include' && editableCustomer.gst ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        State code auto-fills from GSTIN (first 2 digits).
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Address</Label>
                    <p className="text-xs text-muted-foreground">
                      Change or clear any field for this quotation only. It does not update the
                      customer record.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="address-street">Street</Label>
                      <Input
                        id="address-street"
                        value={editAddress.street}
                        onChange={(e) => patchQuoteAddress('street', e.target.value)}
                        placeholder="Enter street address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-area">Area</Label>
                      <Input
                        id="address-area"
                        value={editAddress.area}
                        onChange={(e) => patchQuoteAddress('area', e.target.value)}
                        placeholder="Enter area"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-city">City</Label>
                      <Input
                        id="address-city"
                        value={editAddress.city}
                        onChange={(e) => patchQuoteAddress('city', e.target.value)}
                        placeholder="Enter city"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-state">State</Label>
                      <Input
                        id="address-state"
                        value={editAddress.state}
                        onChange={(e) => patchQuoteAddress('state', e.target.value)}
                        placeholder="Enter state"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address-pincode">Pincode</Label>
                      <Input
                        id="address-pincode"
                        value={editAddress.pincode}
                        onChange={(e) => patchQuoteAddress('pincode', e.target.value)}
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
                {(editAddress.street || editAddress.area || editAddress.city) && (
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-gray-500" />
                    <span>{[editAddress.street, editAddress.area, editAddress.city].filter(Boolean).join(', ')}</span>
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
            {items.map((item) => (
              <div key={item.id} className="space-y-3 sm:space-y-4 p-3 sm:p-4 border rounded-lg">
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 ${
                    gstOption === 'include' ? 'lg:grid-cols-5' : 'lg:grid-cols-3'
                  }`}
                >
                  <div className={gstOption === 'include' ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-2'}>
                    <Label>Description</Label>
                    <InventoryItemSearchField
                      value={item.description}
                      onChange={(v) => updateItem(item.id, 'description', v)}
                      placeholder="Item description or search inventory…"
                    />
                  </div>
                  {gstOption === 'include' && (
                    <div>
                      <Label>HSN/SAC</Label>
                      <Input
                        value={(item as BillItem & { hsnCode?: string }).hsnCode || ''}
                        onChange={(e) =>
                          updateItem(item.id, 'hsnCode' as keyof BillItem, e.target.value)
                        }
                        placeholder="8421"
                      />
                    </div>
                  )}
                  <div>
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label>Unit Price</Label>
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                {gstOption === 'include' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                    <div className="sm:col-span-1">
                      <Label>GST Rate (%)</Label>
                      <Select
                        value={item.taxRate.toString()}
                        onValueChange={(value) =>
                          updateItem(item.id, 'taxRate', parseFloat(value) || 0)
                        }
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
                )}
                <div
                  className={`pt-2 border-t ${
                    gstOption === 'include'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'
                      : 'flex items-center justify-between'
                  }`}
                >
                  {gstOption === 'include' && (
                    <>
                      <div className="text-sm">
                        <span className="text-gray-500">Base Amount: </span>
                        <span className="font-semibold">
                          ₹{(item.quantity * item.unitPrice).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">Taxable Value: </span>
                        <span className="font-semibold">
                          ₹{(item.quantity * item.unitPrice).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">GST ({item.taxRate}%): </span>
                        <span className="font-semibold">
                          ₹{item.taxAmount.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="text-sm sm:col-span-2">
                    <span className="text-gray-500">Total: </span>
                    <span className="font-semibold text-lg">
                      ₹{item.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {gstOption === 'exclude' ? ' (excl. GST)' : ''}
                    </span>
                  </div>
                  {gstOption !== 'include' && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {gstOption === 'include' && Object.keys(gstBreakup).length > 0 && (
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
                        CGST: ₹{(data.taxAmount / 2).toLocaleString()} | SGST: ₹
                        {(data.taxAmount / 2).toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600">
                        IGST: ₹{data.taxAmount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quotation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Quotation Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex justify-between text-lg">
              <span>{gstOption === 'include' ? 'Taxable Value:' : 'Subtotal:'}</span>
              <span>₹{subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            {serviceCharge > 0 && (
              <div className="flex justify-between">
                <span>Service Charge:</span>
                <span>₹{serviceCharge.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {gstOption === 'include' && totalTax > 0 && (
              <>
                {isIntraState ? (
                  <>
                    <div className="flex justify-between">
                      <span>CGST ({primaryGstRate / 2}%):</span>
                      <span>₹{taxSplit.cgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST ({primaryGstRate / 2}%):</span>
                      <span>₹{taxSplit.sgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span>IGST ({primaryGstRate}%):</span>
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
              <span>₹{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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

      {/* Terms & Conditions Section */}
      <Card>
        <CardHeader>
          <CardTitle>Terms & Conditions</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentTermsEditor items={termItems} onChange={setTermItems} />
        </CardContent>
      </Card>

      {/* Additional Info Section */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl text-blue-800">{notesHeading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Label htmlFor="notesHeading-quotation" className="text-sm font-medium text-blue-800">
              Heading
            </Label>
            <Input
              id="notesHeading-quotation"
              value={notesHeading}
              onChange={(e) => setNotesHeading(e.target.value)}
              placeholder="e.g. Warranty Notes"
              className="w-full sm:w-72"
            />
          </div>
          {/* Add New Note */}
          <div className="space-y-3">
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

          {/* Notes List */}
          {notes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-blue-700">Current Notes:</Label>
              <div className="space-y-2">
                {notes.map((note, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-white border border-blue-200 rounded-lg">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Document Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="quotationSealVariant">Authorized signatory image</Label>
          <Select
            value={sealVariant}
            onValueChange={(v: 'sign' | 'stamp') => setSealVariant(v)}
          >
            <SelectTrigger id="quotationSealVariant" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sign">{getDocumentSealVariantLabel('sign')}</SelectItem>
              <SelectItem value="stamp">{getDocumentSealVariantLabel('stamp')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            Default uses the signatory seal (hydrogenro-seal-sign / elevenro-seal-sign) for the brand you pick at print.
          </p>
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

      {/* Custom images at end of quotation PDF (before signature) */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg sm:text-xl text-violet-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 shrink-0" />
                Custom Images
              </CardTitle>
              <p className="text-xs text-gray-600 mt-1">
                Add one or more sections with their own heading, layout, size, and alignment. Printed before the signature.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-violet-300 text-violet-800 hover:bg-violet-100 shrink-0"
              onClick={() =>
                setCustomImageBlocks((prev) => [
                  ...prev,
                  createQuotationImageBlock({
                    heading: prev.length === 0 ? 'Product Images' : `Section ${prev.length + 1}`,
                  }),
                ])
              }
            >
              <Plus className="w-4 h-4 mr-1" />
              Add section
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {customImageBlocks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No image sections yet. Click <span className="font-medium">Add section</span> to attach photos with a custom heading.
            </p>
          )}
          {customImageBlocks.map((block, blockIndex) => {
            const updateBlock = (patch: Partial<QuotationImageBlock>) => {
              setCustomImageBlocks((prev) =>
                prev.map((b) => (b.id === block.id ? { ...b, ...patch } : b))
              );
            };
            return (
              <div
                key={block.id}
                className="rounded-lg border border-violet-200 bg-white/80 p-3 sm:p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-violet-900">Section {blockIndex + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                    onClick={() =>
                      setCustomImageBlocks((prev) => prev.filter((b) => b.id !== block.id))
                    }
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-violet-900">Heading</Label>
                    <Input
                      value={block.heading}
                      onChange={(e) => updateBlock({ heading: e.target.value })}
                      placeholder="Product Images"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-violet-900">Subheading (optional)</Label>
                    <Input
                      value={block.subheading}
                      onChange={(e) => updateBlock({ subheading: e.target.value })}
                      placeholder="e.g. Installation examples"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-violet-900">Photos per row</Label>
                    <Select
                      value={String(block.columns)}
                      onValueChange={(v) =>
                        updateBlock({ columns: Number(v) as QuotationImageColumns })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 per row</SelectItem>
                        <SelectItem value="2">2 per row</SelectItem>
                        <SelectItem value="3">3 per row</SelectItem>
                        <SelectItem value="4">4 per row</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-violet-900">Image size</Label>
                    <Select
                      value={block.size}
                      onValueChange={(v) => updateBlock({ size: v as QuotationImageSize })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                        <SelectItem value="full">Full width</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-violet-900">Alignment</Label>
                    <Select
                      value={block.align}
                      onValueChange={(v) => updateBlock({ align: v as QuotationImageAlign })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ImageUpload
                  key={block.id}
                  onImagesChange={(images) => updateBlock({ images })}
                  initialImages={block.images}
                  maxImages={12}
                  folder="quotation-attachments"
                  title={`Section ${blockIndex + 1} images`}
                  description="Upload photos for this section"
                  compact
                  skipOfflineQueue
                  maxWidth={1600}
                  quality={0.85}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <DocumentBrandPickerDialog
        open={brandPickerOpen}
        onOpenChange={setBrandPickerOpen}
        title={
          pendingBrandAction === 'preview'
            ? 'Which brand should this preview use?'
            : pendingBrandAction === 'email'
              ? 'Which brand is sending this quotation?'
              : 'Which brand is this quotation for?'
        }
        description={
          pendingBrandAction === 'preview'
            ? 'The preview will show the quotation with the selected brand logo and address.'
            : pendingBrandAction === 'email'
              ? 'The PDF attachment and email will use the selected brand address, logo, and sender.'
              : 'Hydrogen RO can show GST. Eleven RO issues quotations without GST.'
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
        title="Quotation Preview"
        previewTitle={previewBill ? `Quotation ${previewBill.billNumber}` : 'Quotation preview'}
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
        kind="quotation"
        bill={emailSendContext?.bill ?? null}
        brand={emailSendContext?.brand ?? null}
        defaultRecipients={emailSendContext?.defaultRecipients ?? []}
        dueDateIso={emailSendContext?.dueDateIso}
      />
    </div>
  );
}
