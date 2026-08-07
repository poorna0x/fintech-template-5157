import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Plus, Trash2, Download, Edit, X, FileText, Printer, Eye, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Bill, BillItem, CompanyInfo, Customer } from '@/types';
import { getCustomerGstNumber } from '@/lib/customerGst';
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
import DocumentPaymentStatusCard from '@/components/document/DocumentPaymentStatusCard';
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
  type DocumentPaymentStatus,
  documentPaymentSummaryClass,
  documentPaymentSummaryLabel,
  isDocumentPaymentStatus,
  resolveDocumentPayment,
  validatePartialPaymentAmount,
} from '@/lib/document-payment';
import {
  type EditableNumber,
  num,
} from '@/lib/editable-number-input';
import { db } from '@/lib/supabase';
import { getOfficeJobParts } from '@/lib/adminUtils';
import { getInventoryBillName } from '@/lib/inventoryBillName';

type BillMode = 'normal' | 'set';
type ExtraChargeKind = 'service' | 'visiting';

const EXTRA_CHARGE_LABELS: Record<ExtraChargeKind, string> = {
  service: 'Service Charge',
  visiting: 'Visiting Charge',
};

const SET_TOTAL_LINE_ID = 'set-total';

const makeSetTotalLine = (amount = 0): BillItem => ({
  id: SET_TOTAL_LINE_ID,
  description: 'Set total',
  quantity: 1,
  unitPrice: amount,
  total: amount,
  taxRate: 0,
  taxAmount: 0,
});

const makeZeroPriceLine = (description: string, quantity: number): BillItem => ({
  id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  description,
  quantity: Math.max(1, quantity),
  unitPrice: 0,
  total: 0,
  taxRate: 0,
  taxAmount: 0,
});

const isSetTotalLine = (item: BillItem) => item.id === SET_TOTAL_LINE_ID;

type CompletedJobOption = {
  id: string;
  job_number: string | null;
  status: string | null;
  service_type: string | null;
  completed_at: string | null;
  label: string;
  isToday: boolean;
};

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
  const customerGst = getCustomerGstNumber(customer);
  const customerServiceType = customer?.serviceType || 'RO';

  // State management
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [items, setItems] = useState<BillItem[]>(defaultBillItems);
  const [billMode, setBillMode] = useState<BillMode>('normal');
  const [completedJobs, setCompletedJobs] = useState<CompletedJobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jobsLoading, setJobsLoading] = useState(false);
  const [autofillLoading, setAutofillLoading] = useState(false);
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
  const [extraChargeKind, setExtraChargeKind] = useState<ExtraChargeKind>('service');
  const extraChargeLabel = EXTRA_CHARGE_LABELS[extraChargeKind];
  const [paymentStatus, setPaymentStatus] = useState<DocumentPaymentStatus>('PAID');
  const [amountReceived, setAmountReceived] = useState<EditableNumber>(0);
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

  // Keep editable customer in sync when async full customer load brings GSTIN / address
  useEffect(() => {
    setEditableCustomer({
      name: customerName || '',
      phone: customerPhone || '',
      email: customerEmail || '',
      gst: customerGst || '',
      address: {
        street: customerAddress.street || '',
        area: customerAddress.area || '',
        city: customerAddress.city || '',
        state: customerAddress.state || '',
        pincode: customerAddress.pincode || '',
      },
    });
  }, [customerName, customerPhone, customerEmail, customerGst, customerAddress]);

  // Calculate totals — set mode uses package amount only (ignore any leaked part prices)
  const rawSubtotal = items.reduce((sum, item) => sum + item.total, 0);
  const setTotalAmount = items.find(isSetTotalLine)?.unitPrice ?? 0;
  const subtotal = billMode === 'set' ? setTotalAmount : rawSubtotal;
  const totalAmount = subtotal + serviceCharge;

  const updateSetTotalAmount = (amount: number) => {
    const safe = Math.max(0, Number.isFinite(amount) ? amount : 0);
    setItems((prev) => {
      const others = prev.filter((i) => !isSetTotalLine(i)).map((i) => ({
        ...i,
        unitPrice: 0,
        total: 0,
      }));
      return [...others, makeSetTotalLine(safe)];
    });
  };

  const zeroPartPrices = (list: BillItem[]): BillItem[] =>
    list.map((i) =>
      isSetTotalLine(i) ? i : { ...i, unitPrice: 0, total: 0 }
    );

  // Keep a set-total line present whenever set mode is active; keep part prices at 0
  useEffect(() => {
    if (billMode !== 'set') return;
    setItems((prev) => {
      let next = zeroPartPrices(prev);
      if (!next.some(isSetTotalLine)) {
        next = [...next, makeSetTotalLine(0)];
      }
      const changed =
        next.length !== prev.length ||
        next.some((n, idx) => {
          const p = prev[idx];
          return !p || n.unitPrice !== p.unitPrice || n.total !== p.total || n.id !== p.id;
        });
      return changed ? next : prev;
    });
  }, [billMode]);

  const todayJobId = useMemo(
    () => completedJobs.find((j) => j.isToday)?.id || '',
    [completedJobs]
  );
  const lastJobId = useMemo(() => completedJobs[0]?.id || '', [completedJobs]);

  const loadCompletedJobs = useCallback(async (customerId: string) => {
    setJobsLoading(true);
    try {
      const { data, error } = await db.jobs.getByCustomerIdForPicker(customerId);
      if (error) throw error;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const completed = (data || [])
        .filter((j: any) => String(j.status || '').toUpperCase() === 'COMPLETED' && j.completed_at)
        .sort(
          (a: any, b: any) =>
            new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
        )
        .map((j: any): CompletedJobOption => {
          const completedAt = j.completed_at ? new Date(j.completed_at) : null;
          const isToday = !!completedAt && completedAt.getTime() >= startOfToday;
          const dateLabel = completedAt
            ? completedAt.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '';
          const typeLabel = [j.service_type, j.service_sub_type].filter(Boolean).join(' · ') || 'Job';
          return {
            id: j.id,
            job_number: j.job_number || null,
            status: j.status || null,
            service_type: j.service_type || null,
            completed_at: j.completed_at || null,
            isToday,
            label: `${isToday ? 'Today · ' : ''}${j.job_number || 'Job'} · ${typeLabel}${dateLabel ? ` · ${dateLabel}` : ''}`,
          };
        });
      setCompletedJobs(completed);
      const preferred = completed.find((j) => j.isToday)?.id || completed[0]?.id || '';
      setSelectedJobId((prev) => (prev && completed.some((j) => j.id === prev) ? prev : preferred));
    } catch (e: any) {
      console.error('Failed to load completed jobs for bill autofill', e);
      setCompletedJobs([]);
      setSelectedJobId('');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customer?.id) {
      setCompletedJobs([]);
      setSelectedJobId('');
      return;
    }
    void loadCompletedJobs(customer.id);
  }, [customer?.id, loadCompletedJobs]);

  const switchBillMode = (mode: BillMode) => {
    if (mode === billMode) return;
    setBillMode(mode);
    if (mode === 'set') {
      setItems((prev) => {
        const parts = prev
          .filter((i) => !isSetTotalLine(i) && i.description.trim())
          .map((p) => ({ ...p, unitPrice: 0, total: 0 }));
        const setLine = prev.find(isSetTotalLine) || makeSetTotalLine(0);
        if (parts.length === 0) return [setLine];
        return [...parts, isSetTotalLine(setLine) ? setLine : makeSetTotalLine(0)];
      });
    } else {
      setItems((prev) => {
        const parts = prev.filter((i) => !isSetTotalLine(i));
        if (parts.length === 0) {
          return defaultBillItems.map((it) => ({ ...it, id: Date.now().toString() }));
        }
        return parts;
      });
    }
  };

  const autofillFromJob = async (jobId?: string, modeOverride?: BillMode) => {
    const id = jobId || selectedJobId;
    const mode = modeOverride ?? billMode;
    if (!id) {
      toast.error('Select a completed job first');
      return;
    }
    setAutofillLoading(true);
    try {
      const [{ data: parts, error: partsError }, { data: job, error: jobError }] =
        await Promise.all([
          db.jobPartsUsed.getByJob(id),
          db.jobs.getByIdSlim(id),
        ]);
      if (partsError) throw partsError;
      if (jobError) throw jobError;

      const lines: BillItem[] = [];
      const seen = new Set<string>();

      for (const part of parts || []) {
        const inv = (part as any).inventory as
          | { product_name?: string; full_name?: string | null; code?: string | null }
          | null
          | undefined;
        const description = getInventoryBillName({
          product_name: inv?.product_name,
          full_name: inv?.full_name,
          custom_name: (part as any).custom_name,
        });
        if (!description) continue;
        const qty = Math.max(1, Math.floor(Number((part as any).quantity_used) || 1));
        if (seen.has(description.toLowerCase())) {
          const existing = lines.find(
            (l) => l.description.toLowerCase() === description.toLowerCase()
          );
          if (existing) {
            existing.quantity += qty;
            continue;
          }
        }
        seen.add(description.toLowerCase());
        lines.push(makeZeroPriceLine(description, qty));
      }

      const officeParts = getOfficeJobParts(job);
      if (officeParts.length > 0) {
        const ids = officeParts.map((p) => p.inventory_id).filter(Boolean);
        let fullNameById = new Map<string, string | null>();
        if (ids.length > 0) {
          const { data: catalog } = await db.inventory.getCatalogSlim();
          fullNameById = new Map(
            (catalog || []).map((c: any) => [c.id, c.full_name ?? null])
          );
        }
        for (const op of officeParts) {
          const description = getInventoryBillName({
            product_name: op.product_name,
            full_name: fullNameById.get(op.inventory_id) || null,
          });
          if (!description) continue;
          const qty = Math.max(1, op.quantity || 1);
          const existing = lines.find(
            (l) => l.description.toLowerCase() === description.toLowerCase()
          );
          if (existing) {
            existing.quantity += qty;
          } else {
            lines.push(makeZeroPriceLine(description, qty));
          }
        }
      }

      setItems((prev) => {
        if (mode === 'set') {
          const prevSet = prev.find(isSetTotalLine);
          const setLine = makeSetTotalLine(prevSet?.unitPrice || 0);
          if (lines.length === 0) return [setLine];
          return [...lines, setLine];
        }
        if (lines.length === 0) {
          return defaultBillItems.map((it) => ({ ...it, id: Date.now().toString() }));
        }
        return lines;
      });
      if (lines.length === 0) {
        toast.message(
          mode === 'set'
            ? 'No parts found on that job — add items or enter set total'
            : 'No parts found on that job'
        );
      } else {
        toast.success(`Loaded ${lines.length} item${lines.length === 1 ? '' : 's'} from job`);
      }
      setSelectedJobId(id);
    } catch (e: any) {
      console.error('Bill autofill failed', e);
      toast.error(e?.message || 'Failed to load job parts');
    } finally {
      setAutofillLoading(false);
    }
  };

  useEffect(() => {
    if (paymentStatus === 'PAID') {
      setAmountReceived(totalAmount);
    } else if (paymentStatus === 'PENDING') {
      setAmountReceived(0);
    }
  }, [paymentStatus, totalAmount]);

  const resolvedPayment = resolveDocumentPayment({
    paymentStatus,
    totalAmount,
    amountPaid: num(amountReceived),
  });

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
    if (billMode === 'set') {
      const setLine = items.find(isSetTotalLine) || makeSetTotalLine(0);
      const others = items.filter((i) => !isSetTotalLine(i));
      setItems([...others, newItem, setLine]);
    } else {
      setItems([...items, newItem]);
    }
  };

  const removeItem = (id: string) => {
    if (isSetTotalLine({ id } as BillItem) && billMode === 'set') {
      toast.error('Set total line cannot be removed in set bill mode');
      return;
    }
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

        if (isSetTotalLine(item) && field === 'quantity') {
          updatedItem.quantity = 1;
        }

        // In set mode, part lines stay at price 0
        if (billMode === 'set' && !isSetTotalLine(item) && field === 'unitPrice') {
          updatedItem.unitPrice = 0;
        }

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

    if (billMode === 'set' && setTotalAmount <= 0) {
      toast.error('Enter the set total amount');
      return null;
    }

    const partialError = validatePartialPaymentAmount(
      paymentStatus,
      resolvedPayment.paid,
      totalAmount
    );
    if (partialError) {
      toast.error(partialError);
      return null;
    }

    const brandCompany = getCompanyInfoForBrand(brand);
    setCompany(brandCompany);

    const billItems =
      billMode === 'set'
        ? items
            .filter((item) => !isSetTotalLine(item))
            .map((item) => ({ ...item, unitPrice: 0, total: 0 }))
        : items;
    const billSubtotal = billMode === 'set' ? setTotalAmount : subtotal;
    const billTotal = billSubtotal + serviceCharge;

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
      items: billItems,
      subtotal: billSubtotal,
      totalTax: 0,
      serviceCharge,
      serviceChargeLabel: extraChargeLabel,
      totalAmount: billTotal,
      paymentStatus: resolvedPayment.status,
      amountPaid: resolvedPayment.paid,
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
    billMode,
    selectedJobId,
    items,
    notes,
    notesHeading,
    validityNote,
    showValidityNote,
    termItems: serializeTermItems(termItems),
    terms: termsForPdf,
    serviceCharge,
    extraChargeKind,
    paymentStatus,
    amountReceived: num(amountReceived),
    hideGstInHeader,
    editableCustomer,
  });

  const applyDraftSnapshot = (snap: ReturnType<typeof getDraftSnapshot> & {
    billMode?: BillMode;
    selectedJobId?: string;
  }) => {
    if (!snap || typeof snap !== 'object') return;
    if (typeof snap.billNumber === 'string') setBillNumber(snap.billNumber);
    if (typeof snap.billDate === 'string') setBillDate(snap.billDate);
    if (snap.billMode === 'set' || snap.billMode === 'normal') setBillMode(snap.billMode);
    if (typeof snap.selectedJobId === 'string') setSelectedJobId(snap.selectedJobId);
    if (Array.isArray(snap.items)) {
      let next = snap.items as BillItem[];
      if (snap.billMode === 'set') {
        next = zeroPartPrices(next);
        if (!next.some(isSetTotalLine)) {
          next = [...next, makeSetTotalLine(0)];
        }
      } else {
        next = next.filter((i) => !isSetTotalLine(i));
      }
      setItems(next);
    }
    if (Array.isArray(snap.notes)) setNotes(snap.notes as string[]);
    if (typeof snap.notesHeading === 'string') setNotesHeading(snap.notesHeading);
    if (typeof snap.validityNote === 'string') setValidityNote(snap.validityNote);
    if (typeof snap.showValidityNote === 'boolean') setShowValidityNote(snap.showValidityNote);
    setTermItems(coerceTermItemsFromSnapshot(snap));
    if (typeof snap.serviceCharge === 'number') setServiceCharge(snap.serviceCharge);
    if (snap.extraChargeKind === 'service' || snap.extraChargeKind === 'visiting') {
      setExtraChargeKind(snap.extraChargeKind);
    }
    if (isDocumentPaymentStatus(snap.paymentStatus)) setPaymentStatus(snap.paymentStatus);
    if (typeof snap.amountReceived === 'number') setAmountReceived(snap.amountReceived);
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
                    <span className="truncate">Send PDF</span>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className={documentSectionTitleClass}>Bill Items</CardTitle>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 self-start">
                <Button
                  type="button"
                  size="sm"
                  variant={billMode === 'normal' ? 'default' : 'ghost'}
                  className="h-8"
                  onClick={() => switchBillMode('normal')}
                >
                  Normal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={billMode === 'set' ? 'default' : 'ghost'}
                  className="h-8"
                  onClick={() => switchBillMode('set')}
                >
                  Set bill
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
              {billMode === 'set' ? (
                <p className="text-sm text-slate-700">
                  Items list name + qty at ₹0. Type the package amount in <span className="font-medium">Set total</span> below — that becomes the bill total.
                </p>
              ) : (
                <p className="text-sm text-slate-700">
                  Autofill parts from a completed job (name + qty). Enter prices per item as needed.
                </p>
              )}
              {!customer?.id ? (
                <p className="text-sm text-amber-800">Select a customer to autofill from a completed job.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label>Completed job</Label>
                      <Select
                        value={selectedJobId || undefined}
                        onValueChange={setSelectedJobId}
                        disabled={jobsLoading || completedJobs.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              jobsLoading
                                ? 'Loading jobs…'
                                : completedJobs.length === 0
                                  ? 'No completed jobs'
                                  : 'Select job'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {completedJobs.map((j) => (
                            <SelectItem key={j.id} value={j.id}>
                              {j.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void autofillFromJob()}
                      disabled={!selectedJobId || autofillLoading}
                      className="w-full sm:w-auto"
                    >
                      {autofillLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Autofill items
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!todayJobId || autofillLoading}
                      onClick={() => void autofillFromJob(todayJobId)}
                    >
                      Today&apos;s job
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!lastJobId || autofillLoading}
                      onClick={() => void autofillFromJob(lastJobId)}
                    >
                      Last completed
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Select
                  value={extraChargeKind}
                  onValueChange={(v) => setExtraChargeKind(v as ExtraChargeKind)}
                >
                  <SelectTrigger className="w-full sm:w-[160px]" id="extraChargeKind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service Charge</SelectItem>
                    <SelectItem value="visiting">Visiting Charge</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="serviceCharge"
                  type="number"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-full sm:w-24"
                  placeholder="0"
                  aria-label={extraChargeLabel}
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
            {items
              .filter((item) => !(billMode === 'set' && isSetTotalLine(item)))
              .map((item) => {
              const partInSetMode = billMode === 'set';
              return (
              <div
                key={item.id}
                className="space-y-3 sm:space-y-4 p-3 sm:p-4 border rounded-lg"
              >
                {/* Mobile-first grid layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <Label>Description</Label>
                    <InventoryItemSearchField
                      value={item.description}
                      onChange={(v) => updateItem(item.id, 'description', v)}
                      placeholder="Item description or search inventory…"
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
                      {partInSetMode ? (
                        <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                          —
                        </div>
                      ) : (
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.01"
                        />
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      disabled={billMode === 'normal' && items.length === 1}
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
                    <span className="font-semibold">
                      {billMode === 'set' || item.total === 0
                        ? '—'
                        : `₹${item.total.toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          {billMode === 'set' && (
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="setTotalAmount" className="text-emerald-950 font-semibold">
                    Set total (₹) *
                  </Label>
                  <Input
                    id="setTotalAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={setTotalAmount || ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        updateSetTotalAmount(0);
                        return;
                      }
                      updateSetTotalAmount(parseFloat(raw) || 0);
                    }}
                    placeholder="Enter package amount"
                    className="bg-white text-lg font-semibold h-11"
                  />
                  <p className="text-xs text-emerald-800">
                    This is the one price for all items on this set bill.
                  </p>
                </div>
                <div className="sm:text-right shrink-0 pb-1">
                  <div className="text-sm text-emerald-800">Grand total</div>
                  <div className="text-xl font-bold text-emerald-950">
                    ₹{totalAmount.toLocaleString()}
                  </div>
                  {serviceCharge > 0 && (
                    <div className="text-xs text-emerald-700">includes {extraChargeLabel.toLowerCase()}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentPaymentStatusCard
        title="Payment on bill"
        description="Printed on the bill PDF with a payment acknowledgement (paid, partial, or pending)."
        paymentStatus={paymentStatus}
        onPaymentStatusChange={setPaymentStatus}
        amountReceived={amountReceived}
        onAmountReceivedChange={setAmountReceived}
        totalAmount={totalAmount}
      />

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
                <span>{extraChargeLabel}:</span>
                <span>₹{serviceCharge.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold border-t pt-4">
              <span>Total Amount:</span>
              <span>₹{totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm sm:text-base pt-1">
              <span>Payment:</span>
              <span className={documentPaymentSummaryClass(resolvedPayment.status)}>
                {documentPaymentSummaryLabel(resolvedPayment)}
              </span>
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