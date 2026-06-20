import React, { useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Plus, Download, FileText, User, Phone, MapPin, Building, Droplets, Mail, Save, Printer } from 'lucide-react';
import DocumentBrandLogo from '@/components/DocumentBrandLogo';
import { toast } from 'sonner';
import { Customer, Bill, BillItem, CompanyInfo } from '@/types';
import { db } from '@/lib/supabase';
import DocumentBrandPickerDialog from '@/components/DocumentBrandPickerDialog';
import {
  DocumentBrand,
  getCompanyInfoForBrand,
  getDefaultAgreementIntro,
  getDocumentBrandLabel,
  getDocumentSealVariantLabel,
  resolveBrandSealSrc,
} from '@/lib/service-brands';
import DraftToolbar from '@/components/document-drafts/DraftToolbar';
import DocumentGeneratorPageHeader, {
  documentSectionTitleClass,
  DocumentGeneratorActionBar,
  documentDraftBtnClass,
  documentGenerateVioletBtnClass,
  documentOutlineBtnClass,
  documentSaveBtnClass,
} from '@/components/DocumentGeneratorPageHeader';
import { mergeEditableCustomer } from '@/lib/document-drafts';
import { suggestAmcAgreementNumber } from '@/lib/amc-agreement-number';
import { getValidCustomerEmail } from '@/lib/customer-email';
import {
  formatCustomerAddressForBill,
  formatCustomerFullAddressLine,
  normalizeCustomerAddress,
} from '@/lib/customer-address';
import AmcEmailSendDialog from '@/components/amc/AmcEmailSendDialog';
import { normalizeRecipientList } from '@/lib/email-recipients';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';

interface AMCGeneratorProps {
  customer: Customer;
  onPrint?: (bill: Bill) => void;
  onAMCSaved?: () => void;
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

export default function AMCGenerator({ customer, onPrint, onAMCSaved, embedded = false }: AMCGeneratorProps) {
  const [billNumber, setBillNumber] = useState(() => suggestAmcAgreementNumber());
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [notes, setNotes] = useState('');
  const [validity, setValidity] = useState('1 Year');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [roModel, setRoModel] = useState('');
  const [includesPreSedimentFiltration, setIncludesPreSedimentFiltration] = useState(false);
  const [showComputerGeneratedText, setShowComputerGeneratedText] = useState(true);
  const [sealVariant, setSealVariant] = useState<'sign' | 'stamp'>('sign');

  // AMC service period default from settings (same source as "AMC service period (auto job creation)" control)
  const getDefaultServicePeriodFromStorage = (): { kind: '4' | '6' | 'custom' | 'no_auto'; customMonths: number } => {
    if (typeof window === 'undefined') return { kind: '4', customMonths: 4 };
    const stored = localStorage.getItem('amc_default_service_period_months');
    if (stored === null || stored === '') return { kind: '4', customMonths: 4 };
    const n = parseInt(stored, 10);
    if (Number.isNaN(n) || n <= 0) return { kind: 'no_auto', customMonths: 4 };
    if (n === 4) return { kind: '4', customMonths: 4 };
    if (n === 6) return { kind: '6', customMonths: 6 };
    return { kind: 'custom', customMonths: n };
  };

  const defaultServicePeriod = getDefaultServicePeriodFromStorage();
  const [servicePeriodKind, setServicePeriodKind] = useState<'4' | '6' | 'custom' | 'no_auto'>(defaultServicePeriod.kind);
  const [servicePeriodCustomMonths, setServicePeriodCustomMonths] = useState<number>(defaultServicePeriod.customMonths);

  // Generate terms dynamically from pre-sediment filtration + AMC service period (auto job creation)
  const generateTerms = (
    includesPreFilter: boolean,
    periodKind: '4' | '6' | 'custom' | 'no_auto',
    periodCustomMonths: number
  ) => {
    const servicePeriodMonths =
      periodKind === 'no_auto' ? 0
        : periodKind === '4' ? 4
        : periodKind === '6' ? 6
        : Math.max(1, periodCustomMonths);

    let scheduledMaintenanceLine = '';
    if (servicePeriodMonths === 0) {
      scheduledMaintenanceLine =
        'Scheduled maintenance: Routine visits are planned together with you when it suits—there is no fixed automatic visit calendar tied to this agreement.';
    } else if (servicePeriodMonths === 1) {
      scheduledMaintenanceLine =
        'Scheduled maintenance: We usually aim for a routine service visit about once a month or so (we may nudge the date a little to line up with you and keep your purifier happy).';
    } else if (servicePeriodMonths === 12) {
      scheduledMaintenanceLine =
        'Scheduled maintenance: We usually aim for a routine service visit about once a year—roughly every twelve months or so—with a bit of flexibility so we can coordinate with you.';
    } else {
      scheduledMaintenanceLine = `Scheduled maintenance: We usually aim for a routine service visit about every ${servicePeriodMonths} months or so (timings may shift slightly so we can work with your schedule and keep things running smoothly).`;
    }
    const servicesCovered = `SERVICES COVERED BY THE AGREEMENT

Breakdown Support: If any breakdown or problem happens with the RO during the AMC period, the company will provide service without extra charges.

Filters / RO Membrane / Consumables / Electricals / Motor: Company will clean, repair, or replace filters and parts needed for smooth working.

Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.

Clean cosmetics and smooth working of the machine.

Quick service: Any breakdown will be resolved within 24 hours on weekdays and within 48 hours on weekends.

Full Care of RO: The company takes responsibility for complete maintenance and support during the AMC period.`;

    const servicesCoveredWithPreFilter = servicesCovered + `

Includes pre-sediment filtration maintenance and servicing.`;

    const termsAndConditions = `⚖️ TERMS AND CONDITIONS

No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.

Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.

Disputes: Any legal disputes will be handled only in Bangalore courts.

Parts Availability: Replacement of parts is subject to market availability. If specific spare parts are unavailable or discontinued, equivalent alternatives may be used.

Service Timelines: Service timelines are approximate and may vary due to workload, weather, traffic, festivals, emergencies, or operational reasons.

Limitation of Liability: The company shall not be held liable for failure or delay in providing services due to business closure, financial difficulties, natural calamities, supplier issues, government restrictions, strikes, pandemics, acts beyond reasonable control, or discontinuation of operations.

${scheduledMaintenanceLine}

Renewal: After expiry, renewal requires a new agreement.

Customer's Duty: The customer must make the RO available for servicing when the company's authorized representative visits.

If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.

Agreement Modification: Cannot be changed unless written and signed by both parties.`;

    const notCoveredStructural =
      'Exclusions: This agreement does not cover the purifier display or indicator lights, the dispenser tap, the outer housing or cabinet, or the storage tank.';

    const notCoveredWithPreFilter = includesPreFilter
      ? notCoveredStructural
      : `${notCoveredStructural} Pre-sediment filtration is excluded unless it is expressly listed under Services covered above.`;

    const finalServicesCovered = includesPreFilter ? servicesCoveredWithPreFilter : servicesCovered;

    return `${finalServicesCovered}

${termsAndConditions}

${notCoveredWithPreFilter}`;
  };

  const [terms, setTerms] = useState(() =>
    generateTerms(false, defaultServicePeriod.kind, defaultServicePeriod.customMonths)
  );
  const [amcCost, setAmcCost] = useState(7000);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PARTIAL' | 'PENDING'>('PAID');
  const [amountReceived, setAmountReceived] = useState(7000);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [termSection, setTermSection] = useState<'services' | 'terms'>('services');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isEditingIntro, setIsEditingIntro] = useState(false);
  const [agreementIntro, setAgreementIntro] = useState(
    'We <strong>Hydrogen RO</strong> will maintain your <strong>RO Water Purifier</strong> on the terms set out below:'
  );
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSendContext, setEmailSendContext] = useState<{
    bill: Bill;
    brand: DocumentBrand;
    endDateIso: string;
    defaultRecipients: string[];
  } | null>(null);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [pendingBrandAction, setPendingBrandAction] = useState<
    | { type: 'save' }
    | { type: 'document'; action: 'print' | 'pdf'; options?: { termsOnly?: boolean } }
    | { type: 'email' }
  | null>(null);
  const [documentBrand, setDocumentBrand] = useState<DocumentBrand>('hydrogenro');
  /** Skip one terms auto-regen after loading a draft (preserves custom/edited terms). */
  const skipTermsAutoGenRef = useRef(0);

  // Update terms when pre-sediment filtration or AMC service period (auto job creation) changes
  React.useEffect(() => {
    if (skipTermsAutoGenRef.current > 0) {
      skipTermsAutoGenRef.current -= 1;
      return;
    }
    setTerms(generateTerms(includesPreSedimentFiltration, servicePeriodKind, servicePeriodCustomMonths));
  }, [includesPreSedimentFiltration, servicePeriodKind, servicePeriodCustomMonths]);

  // Auto-populate RO model from customer data (brand and/or model)
  React.useEffect(() => {
    if (!customer || roModel) return;
    const brand = (customer.brand || '').trim();
    const model = (customer.model || '').trim();
    if (!brand && !model) return;
    const modelValue = [brand, model].filter(Boolean).join(' ').trim();
    setRoModel(modelValue);
  }, [customer, roModel]);

  // Editable customer information state
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const resolveCustomerAddress = () =>
    normalizeCustomerAddress(customer.address, {
      visible_address: customer.address?.visible_address,
      formattedAddress: customer.location?.formattedAddress,
    });

  const [editableCustomer, setEditableCustomer] = useState(() => {
    const addr = resolveCustomerAddress();
    return {
      name: customer.fullName || '',
      phone: typeof customer.phone === 'string' ? customer.phone : (customer as { phone?: string })?.phone || '',
      email: customer.email || '',
      gst: customer.gstNumber || '',
      address: {
        street: addr.street,
        area: addr.area,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
      },
    };
  });

  React.useEffect(() => {
    if (isEditingCustomer) return;
    const addr = resolveCustomerAddress();
    setEditableCustomer({
      name: customer.fullName || '',
      phone: typeof customer.phone === 'string' ? customer.phone : (customer as { phone?: string })?.phone || '',
      email: customer.email || '',
      gst: customer.gstNumber || '',
      address: {
        street: addr.street,
        area: addr.area,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
      },
    });
  }, [customer, isEditingCustomer]);

  // Calculate totals - use direct AMC cost instead of items
  const subtotal = amcCost;
  const totalAmount = subtotal + serviceCharge;

  React.useEffect(() => {
    if (paymentStatus === 'PAID') {
      setAmountReceived(totalAmount);
    } else if (paymentStatus === 'PENDING') {
      setAmountReceived(0);
    }
  }, [paymentStatus, totalAmount]);

  const resolvedAmountReceived =
    paymentStatus === 'PAID'
      ? totalAmount
      : paymentStatus === 'PENDING'
        ? 0
        : Math.max(0, Math.min(amountReceived, totalAmount));

  const balanceDue = Math.max(0, totalAmount - resolvedAmountReceived);

  const addTerm = () => {
    if (newTerm.trim()) {
      const formattedTerm = newTerm.trim();
      let updatedTerms = '';
      
      if (termSection === 'services') {
        // Add to Services Covered section
        const servicesMatch = terms.match(/(SERVICES COVERED BY THE AGREEMENT[\s\S]*?)(?=⚖️\s*TERMS AND CONDITIONS|Not Covered:|$)/i);
        
        if (servicesMatch) {
          // Add to end of Services Covered section
          updatedTerms = terms.replace(
            /(SERVICES COVERED BY THE AGREEMENT[\s\S]*?)(?=⚖️\s*TERMS AND CONDITIONS|Not Covered:|$)/i,
            `$1\n${formattedTerm}`
          );
        } else {
          // Services section doesn't exist, create it
          const termsMatch = terms.match(/⚖️\s*TERMS AND CONDITIONS/i);
          if (termsMatch) {
            updatedTerms = terms.replace(
              /(⚖️\s*TERMS AND CONDITIONS)/i,
              `SERVICES COVERED BY THE AGREEMENT\n\n${formattedTerm}\n\n$1`
            );
          } else {
            updatedTerms = `SERVICES COVERED BY THE AGREEMENT\n\n${formattedTerm}${terms ? '\n\n' + terms : ''}`;
          }
        }
      } else {
        // Add to Terms and Conditions section
        const termsMatch = terms.match(/⚖️\s*TERMS AND CONDITIONS[\s\S]*?(?=Not Covered:|$)/i);
        
        if (termsMatch) {
          // Add to Terms section (before Not Covered if it exists)
          updatedTerms = terms.replace(
            /(⚖️\s*TERMS AND CONDITIONS[\s\S]*?)(?=Not Covered:|$)/i,
            `$1\n${formattedTerm}`
          );
        } else {
          // Terms section doesn't exist, create it
          const servicesMatch = terms.match(/SERVICES COVERED BY THE AGREEMENT/i);
          if (servicesMatch) {
            updatedTerms = terms + '\n\n⚖️ TERMS AND CONDITIONS\n\n' + formattedTerm;
          } else {
            updatedTerms = (terms ? terms + '\n\n' : '') + '⚖️ TERMS AND CONDITIONS\n\n' + formattedTerm;
          }
        }
      }
      
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

  // Function to calculate dates and years
  const calculateDates = () => {
    let validityEndDate = '';
    const agreementDate = new Date(billDate);
    
    if (validity === 'Custom') {
      validityEndDate = customToDate;
    } else {
      const years = parseInt(validity) || 1;
      const endDate = new Date(agreementDate);
      endDate.setFullYear(endDate.getFullYear() + years);
      endDate.setDate(endDate.getDate() - 1); // Subtract 1 day to get the last day of the period
      validityEndDate = endDate.toISOString().split('T')[0];
    }

    const startDate = validity === 'Custom' ? customFromDate : billDate;
    const start = new Date(startDate);
    const end = new Date(validityEndDate);
    const years = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365));

    return { startDate, endDate: validityEndDate, years: years || 1 };
  };

  // Keep a manually edited intro, but swap the brand name when the intro is still
  // one of the auto-generated defaults (so picking ElevenRO doesn't keep "Hydrogen RO").
  const resolveAgreementIntroForBrand = (currentIntro: string, brand: DocumentBrand): string => {
    const trimmed = (currentIntro || '').trim();
    const isDefault =
      !trimmed ||
      trimmed === getDefaultAgreementIntro('hydrogenro').trim() ||
      trimmed === getDefaultAgreementIntro('elevenro').trim();
    return isDefault ? getDefaultAgreementIntro(brand) : currentIntro;
  };

  const applyBrandToForm = (brand: DocumentBrand) => {
    setDocumentBrand(brand);
    setCompany(getCompanyInfoForBrand(brand));
    setAgreementIntro((prev) => resolveAgreementIntroForBrand(prev, brand));
  };

  // Function to save AMC contract to database
  const persistAmcToDatabase = async (
    brand: DocumentBrand,
    options?: { emailedTo?: string[]; sharedVia?: string }
  ): Promise<{ ok: boolean; error?: string; updated?: boolean }> => {
    applyBrandToForm(brand);
    if (!billNumber.trim()) {
      return { ok: false, error: 'Please enter an agreement number' };
    }

    if (!roModel.trim()) {
      return { ok: false, error: 'Please enter RO Model/Brand before saving' };
    }

    if (validity === 'Custom' && (!customFromDate || !customToDate)) {
      return { ok: false, error: 'Please select both from and to dates for custom validity' };
    }

    if (
      validity === 'Custom' &&
      customFromDate &&
      customToDate &&
      new Date(customFromDate) >= new Date(customToDate)
    ) {
      return { ok: false, error: 'To date must be after from date' };
    }

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        return {
          ok: false,
          error: 'Could not refresh your session. Please try again in a moment.',
        };
      }

      const { startDate, endDate, years } = calculateDates();

      const metadata = {
        agreement_number: billNumber.trim(),
        agreement_date: billDate,
        amc_cost: amcCost,
        service_charge: serviceCharge,
        total_amount: totalAmount,
        ro_model: roModel.trim(),
        validity_period: validity,
        description: description.trim() || null,
        notes: notes || null,
        payment_status: paymentStatus,
        amount_received: resolvedAmountReceived,
        balance_due: balanceDue,
        customer_name: editableCustomer.name,
        customer_phone: editableCustomer.phone,
        customer_email: editableCustomer.email || null,
        customer_gst: editableCustomer.gst || null,
        customer_address: editableCustomer.address,
        agreement_intro: resolveAgreementIntroForBrand(agreementIntro, brand),
        document_brand: brand,
        seal_variant: sealVariant,
        shared_via: options?.sharedVia ?? 'admin_generator',
        emailed_to: options?.emailedTo?.length ? options.emailedTo : null,
        saved_at: new Date().toISOString(),
      };

      const servicePeriodMonths =
        servicePeriodKind === 'no_auto'
          ? 0
          : servicePeriodKind === '4'
            ? 4
            : servicePeriodKind === '6'
              ? 6
              : Math.max(1, servicePeriodCustomMonths);

      const { error: amcError, updated } = await db.amcContracts.create({
        customer_id: customer.id,
        job_id: null,
        start_date: startDate,
        end_date: endDate,
        years: years,
        includes_prefilter: includesPreSedimentFiltration,
        additional_info: JSON.stringify(metadata),
        service_period_months: servicePeriodKind === 'no_auto' ? 0 : servicePeriodMonths,
        service_brand: brand,
      });

      if (amcError) {
        console.error('Failed to save AMC contract to database:', amcError);
        return { ok: false, error: amcError.message || 'Failed to save AMC contract' };
      }

      onAMCSaved?.();
      return { ok: true, updated: Boolean(updated) };
    } catch (error: unknown) {
      console.error('Error saving AMC contract:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to save AMC contract',
      };
    }
  };

  const executeSaveToDatabase = async (brand: DocumentBrand) => {
    setIsSaving(true);

    const result = await persistAmcToDatabase(brand);
    if (result.ok) {
      toast.success(
        result.updated ? 'AMC contract updated in database' : 'AMC contract saved to database successfully',
        {
          description: `Agreement ${billNumber} ${result.updated ? 'updated' : 'saved'} under ${getDocumentBrandLabel(brand)}.`,
        }
      );
    } else {
      toast.error('Failed to save AMC contract to database', {
        description: result.error || 'Please try again.',
      });
    }

    setIsSaving(false);
  };

  const handleSaveToDatabase = () => {
    if (!billNumber.trim()) {
      toast.error('Please enter an agreement number');
      return;
    }
    if (!roModel.trim()) {
      toast.error('Please enter RO Model/Brand before saving', {
        description: 'RO Model is required to save the AMC contract.',
        duration: 6000,
      });
      return;
    }
    setPendingBrandAction({ type: 'save' });
    setBrandPickerOpen(true);
  };

  const validateAmcForm = (): boolean => {
    if (!billNumber.trim()) {
      toast.error('Please enter a bill number');
      return false;
    }
    if (!roModel.trim()) {
      toast.error('Please enter RO Model/Brand before generating AMC Agreement', {
        description: 'RO Model is required to generate the agreement. Please add the brand and model information.',
        duration: 6000,
      });
      return false;
    }
    if (validity === 'Custom' && (!customFromDate || !customToDate)) {
      toast.error('Please select both from and to dates for custom validity');
      return false;
    }
    if (
      validity === 'Custom' &&
      customFromDate &&
      customToDate &&
      new Date(customFromDate) >= new Date(customToDate)
    ) {
      toast.error('To date must be after from date');
      return false;
    }
    if (paymentStatus === 'PARTIAL') {
      if (resolvedAmountReceived <= 0 || resolvedAmountReceived >= totalAmount) {
        toast.error('Enter a partial amount greater than 0 and less than the total');
        return false;
      }
    }
    return true;
  };

  const buildAmcBill = (brand: DocumentBrand): { bill: Bill; endDateIso: string } => {
    const { endDate } = calculateDates();
    const amcItem: BillItem = {
      id: '1',
      description: 'AMC Agreement - 1 Year Service Contract',
      quantity: 1,
      unitPrice: amcCost,
      total: amcCost,
      taxRate: 0,
      taxAmount: 0,
    };

    const billCustomerAddress = formatCustomerAddressForBill(
      normalizeCustomerAddress(editableCustomer.address)
    );

    const bill: Bill = {
      id: Date.now().toString(),
      billNumber,
      billDate,
      company: getCompanyInfoForBrand(brand),
      customer: {
        id: customer.id,
        name: editableCustomer.name,
        address: billCustomerAddress.address,
        city: billCustomerAddress.city,
        state: billCustomerAddress.state,
        pincode: billCustomerAddress.pincode,
        phone: editableCustomer.phone || '',
        email: editableCustomer.email || '',
        gstNumber: editableCustomer.gst || '',
        roModel: roModel.trim(),
      } as Bill['customer'] & { roModel: string },
      items: [amcItem],
      subtotal,
      totalTax: 0,
      serviceCharge,
      totalAmount,
      paymentStatus,
      amountPaid: resolvedAmountReceived,
      notes,
      terms,
      validity:
        validity === 'Custom'
          ? `${new Date(customFromDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} to ${new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
          : `${new Date(billDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} to ${new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      agreementIntro: resolveAgreementIntroForBrand(agreementIntro, brand),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (bill as Bill & { documentBrand: DocumentBrand; sealVariant: typeof sealVariant }).documentBrand = brand;
    (bill as Bill & { sealVariant: typeof sealVariant }).sealVariant = sealVariant;

    return { bill, endDateIso: endDate };
  };

  const executePrint = async (
    brand: DocumentBrand,
    action: 'print' | 'pdf',
    options?: { termsOnly?: boolean }
  ) => {
    applyBrandToForm(brand);
    if (!validateAmcForm()) return;

    const { bill } = buildAmcBill(brand);

    try {
      // Don't save to database automatically - user must explicitly click "Save to Database" button
      // This allows generating/previewing AMC without creating an active contract in the database
      const { generateAMCPDF } = await import('@/lib/amc-pdf-generator');
      generateAMCPDF(bill, action, {
        includeDetails: options?.termsOnly ? false : true,
        showComputerGeneratedText: showComputerGeneratedText,
      });
      onPrint?.(bill);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate AMC Agreement');
    }
  };

  const handleDocument = (action: 'print' | 'pdf', options?: { termsOnly?: boolean }) => {
    if (!billNumber.trim()) {
      toast.error('Please enter a bill number');
      return;
    }
    if (!roModel.trim()) {
      toast.error('Please enter RO Model/Brand before generating AMC Agreement', {
        description: 'RO Model is required to generate the agreement.',
        duration: 6000,
      });
      return;
    }
    setPendingBrandAction({ type: 'document', action, options });
    setBrandPickerOpen(true);
  };

  const customerEmail = getValidCustomerEmail(editableCustomer.email);

  const handleEmailCustomer = () => {
    if (!billNumber.trim()) {
      toast.error('Please enter a bill number');
      return;
    }
    if (!roModel.trim()) {
      toast.error('Please enter RO Model/Brand before emailing AMC Agreement', {
        description: 'RO Model is required to generate the agreement.',
        duration: 6000,
      });
      return;
    }
    setPendingBrandAction({ type: 'email' });
    setBrandPickerOpen(true);
  };

  const openEmailSendDialog = (brand: DocumentBrand) => {
    applyBrandToForm(brand);
    if (!validateAmcForm()) return;

    const { bill, endDateIso } = buildAmcBill(brand);
    const defaultRecipients = normalizeRecipientList(
      customerEmail ? [customerEmail] : []
    );

    setEmailSendContext({ bill, brand, endDateIso, defaultRecipients });
    setEmailDialogOpen(true);
  };

  // ---- Draft snapshot / restore -----------------------------------------------
  const getDraftSnapshot = () => ({
    v: 1,
    billNumber,
    billDate,
    notes,
    validity,
    customFromDate,
    customToDate,
    roModel,
    includesPreSedimentFiltration,
    showComputerGeneratedText,
    sealVariant,
    servicePeriodKind,
    servicePeriodCustomMonths,
    terms,
    amcCost,
    serviceCharge,
    paymentStatus,
    amountReceived,
    agreementIntro,
    description,
    documentBrand,
    editableCustomer,
  });

  const applyDraftSnapshot = (snap: ReturnType<typeof getDraftSnapshot>) => {
    if (!snap || typeof snap !== 'object') return;
    if (typeof snap.billNumber === 'string') setBillNumber(snap.billNumber);
    if (typeof snap.billDate === 'string') setBillDate(snap.billDate);
    if (typeof snap.notes === 'string') setNotes(snap.notes);
    if (typeof snap.validity === 'string') setValidity(snap.validity);
    if (typeof snap.customFromDate === 'string') setCustomFromDate(snap.customFromDate);
    if (typeof snap.customToDate === 'string') setCustomToDate(snap.customToDate);
    if (typeof snap.roModel === 'string') setRoModel(snap.roModel);
    if (typeof snap.includesPreSedimentFiltration === 'boolean')
      setIncludesPreSedimentFiltration(snap.includesPreSedimentFiltration);
    if (typeof snap.showComputerGeneratedText === 'boolean')
      setShowComputerGeneratedText(snap.showComputerGeneratedText);
    if (snap.sealVariant === 'sign' || snap.sealVariant === 'stamp') setSealVariant(snap.sealVariant);
    if (
      snap.servicePeriodKind === '4' ||
      snap.servicePeriodKind === '6' ||
      snap.servicePeriodKind === 'custom' ||
      snap.servicePeriodKind === 'no_auto'
    )
      setServicePeriodKind(snap.servicePeriodKind);
    if (typeof snap.servicePeriodCustomMonths === 'number')
      setServicePeriodCustomMonths(snap.servicePeriodCustomMonths);
    if (typeof snap.terms === 'string') setTerms(snap.terms);
    if (typeof snap.amcCost === 'number') setAmcCost(snap.amcCost);
    if (typeof snap.serviceCharge === 'number') setServiceCharge(snap.serviceCharge);
    if (snap.paymentStatus === 'PAID' || snap.paymentStatus === 'PARTIAL' || snap.paymentStatus === 'PENDING') {
      setPaymentStatus(snap.paymentStatus);
    }
    if (typeof snap.amountReceived === 'number') setAmountReceived(snap.amountReceived);
    if (typeof snap.agreementIntro === 'string') setAgreementIntro(snap.agreementIntro);
    if (typeof snap.description === 'string') setDescription(snap.description);
    if (snap.documentBrand === 'hydrogenro' || snap.documentBrand === 'elevenro') {
      setDocumentBrand(snap.documentBrand);
      // Keep company info in sync so the preview/PDF picks up the right brand.
      try {
        setCompany(getCompanyInfoForBrand(snap.documentBrand));
      } catch {
        /* ignore */
      }
    }
    if (snap.editableCustomer && typeof snap.editableCustomer === 'object')
      setEditableCustomer((prev) => mergeEditableCustomer(prev, snap.editableCustomer));
    skipTermsAutoGenRef.current = 1;
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
      {!embedded ? (
        <div className="flex justify-center">
          <DocumentBrandLogo brand={documentBrand} />
        </div>
      ) : null}

      <DocumentGeneratorPageHeader
        title="AMC Agreement Generator"
        description="Configure agreement details, payment, and terms — then save, print, or download."
        accent="violet"
        embedded={embedded}
        actions={
          <DocumentGeneratorActionBar
            primaryCols={4}
            secondaryLabel="Terms only"
            draft={
              <DraftToolbar
                kind="amc"
                documentNoun="AMC agreement"
                getSnapshot={getDraftSnapshot}
                onLoad={applyDraftSnapshot}
                buildLabel={buildDraftLabel}
                stretch
              />
            }
            primary={
              <>
                <Button
                  onClick={handleSaveToDatabase}
                  className={documentSaveBtnClass}
                  disabled={!billNumber.trim() || isSaving}
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {isSaving ? 'Saving...' : 'Save to DB'}
                  </span>
                </Button>
                <Button
                  onClick={() => handleDocument('print')}
                  className={documentGenerateVioletBtnClass}
                  disabled={!billNumber.trim()}
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span className="truncate">Generate</span>
                </Button>
                <Button
                  onClick={() => handleDocument('pdf')}
                  variant="outline"
                  className={documentOutlineBtnClass}
                  disabled={!billNumber.trim()}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span className="truncate">Download</span>
                </Button>
                <Button
                  onClick={handleEmailCustomer}
                  variant="outline"
                  className={documentOutlineBtnClass}
                  disabled={!billNumber.trim()}
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span className="truncate">Email PDF</span>
                </Button>
              </>
            }
            secondary={
              <>
                <Button
                  variant="outline"
                  onClick={() => handleDocument('print', { termsOnly: true })}
                  className={documentOutlineBtnClass}
                  disabled={!billNumber.trim()}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">Share Terms</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDocument('pdf', { termsOnly: true })}
                  className={documentOutlineBtnClass}
                  disabled={!billNumber.trim()}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span className="truncate">Download Terms</span>
                </Button>
              </>
            }
          />
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
        {/* Form Section */}
        <div className="space-y-4 sm:space-y-6">
          {/* AMC Cost - Prominently at the top */}
          <Card className="border-2 border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Droplets className="w-5 h-5" />
                AMC Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="amcCost" className="text-base font-semibold">AMC Agreement Cost (₹) *</Label>
                <Input
                  id="amcCost"
                  type="number"
                  value={amcCost}
                  onChange={(e) => setAmcCost(parseFloat(e.target.value) || 0)}
                  placeholder="7000"
                  min="0"
                  step="1"
                  className="mt-2 text-lg font-semibold"
                />
                <p className="text-xs text-gray-600 mt-2">
                  Enter the total cost for the AMC Agreement
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bill Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                AMC Agreement Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="billNumber">Agreement Number *</Label>
                  <Input
                    id="billNumber"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    placeholder="AMC-2026-001"
                  />
                </div>
                <div>
                  <Label htmlFor="billDate">Agreement Date *</Label>
                  <DatePicker
                    value={billDate}
                    onChange={(v) => v && setBillDate(v)}
                    placeholder="Pick date"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="validity">Validity Period *</Label>
                  <Select value={validity} onValueChange={setValidity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select validity period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1 Year">1 Year</SelectItem>
                      <SelectItem value="2 Years">2 Years</SelectItem>
                      <SelectItem value="3 Years">3 Years</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {validity === 'Custom' && (
                  <div className="col-span-1 sm:col-span-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <Label htmlFor="customFromDate">From Date</Label>
                        <DatePicker
                            value={customFromDate}
                            onChange={(v) => v && setCustomFromDate(v)}
                            placeholder="Pick date"
                            className="mt-1"
                          />
                      </div>
                      <div>
                        <Label htmlFor="customToDate">To Date</Label>
                        <DatePicker
                            value={customToDate}
                            onChange={(v) => v && setCustomToDate(v)}
                            placeholder="Pick date"
                            className="mt-1"
                          />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customer Info */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
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
            <CardContent className="space-y-4">
              {/* RO Model Field - Always visible and editable */}
              <div>
                <Label htmlFor="roModel">RO Model *</Label>
                <Input
                  id="roModel"
                  value={roModel}
                  onChange={(e) => setRoModel(e.target.value)}
                  placeholder="e.g., AO Smith P6, AquaGuard Marvel, etc."
                  className={!roModel.trim() ? 'border-red-300 focus:border-red-500' : ''}
                />
                {!roModel.trim() && (
                  <p className="text-xs text-red-500 mt-1">
                    RO Model is required to generate the AMC Agreement
                  </p>
                )}
              </div>
              {isEditingCustomer ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="amc-customer-name">Customer Name</Label>
                      <Input
                        id="amc-customer-name"
                        value={editableCustomer.name}
                        onChange={(e) => setEditableCustomer(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter customer name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="amc-customer-phone">Phone</Label>
                      <Input
                        id="amc-customer-phone"
                        value={editableCustomer.phone}
                        onChange={(e) => setEditableCustomer(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="amc-customer-email">Email (Optional)</Label>
                      <Input
                        id="amc-customer-email"
                        type="email"
                        value={editableCustomer.email}
                        onChange={(e) => setEditableCustomer(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter email address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="amc-customer-gst">GST Number (Optional)</Label>
                      <Input
                        id="amc-customer-gst"
                        value={editableCustomer.gst}
                        onChange={(e) => setEditableCustomer(prev => ({ ...prev, gst: e.target.value }))}
                        placeholder="Enter GST number"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Address</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="amc-address-street">Street</Label>
                        <Input
                          id="amc-address-street"
                          value={editableCustomer.address.street}
                          onChange={(e) => setEditableCustomer(prev => ({ 
                            ...prev, 
                            address: { ...prev.address, street: e.target.value }
                          }))}
                          placeholder="Enter street address"
                        />
                      </div>
                      <div>
                        <Label htmlFor="amc-address-area">Area</Label>
                        <Input
                          id="amc-address-area"
                          value={editableCustomer.address.area}
                          onChange={(e) => setEditableCustomer(prev => ({ 
                            ...prev, 
                            address: { ...prev.address, area: e.target.value }
                          }))}
                          placeholder="Enter area"
                        />
                      </div>
                      <div>
                        <Label htmlFor="amc-address-city">City</Label>
                        <Input
                          id="amc-address-city"
                          value={editableCustomer.address.city}
                          onChange={(e) => setEditableCustomer(prev => ({ 
                            ...prev, 
                            address: { ...prev.address, city: e.target.value }
                          }))}
                          placeholder="Enter city"
                        />
                      </div>
                      <div>
                        <Label htmlFor="amc-address-state">State</Label>
                        <Input
                          id="amc-address-state"
                          value={editableCustomer.address.state}
                          onChange={(e) => setEditableCustomer(prev => ({ 
                            ...prev, 
                            address: { ...prev.address, state: e.target.value }
                          }))}
                          placeholder="Enter state"
                        />
                      </div>
                      <div>
                        <Label htmlFor="amc-address-pincode">Pincode</Label>
                        <Input
                          id="amc-address-pincode"
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
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{editableCustomer.name}</span>
                    <Badge variant="outline">{customer.customerId}</Badge>
                  </div>
                  {editableCustomer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <span>{editableCustomer.phone}</span>
                    </div>
                  )}
                  {editableCustomer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span>{editableCustomer.email}</span>
                    </div>
                  )}
                  {(editableCustomer.address.street ||
                    editableCustomer.address.area ||
                    editableCustomer.address.city) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span>
                        {formatCustomerFullAddressLine(
                          normalizeCustomerAddress(editableCustomer.address)
                        )}
                      </span>
                    </div>
                  )}
                  {editableCustomer.gst && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span>GST: {editableCustomer.gst}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-amber-200 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg text-amber-900">Payment on agreement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-600">
                Printed on the agreement PDF with a legal payment acknowledgement (paid, partial, or pending).
              </p>
              <div>
                <Label htmlFor="paymentStatus">Payment status</Label>
                <Select
                  value={paymentStatus}
                  onValueChange={(v: 'PAID' | 'PARTIAL' | 'PENDING') => setPaymentStatus(v)}
                >
                  <SelectTrigger id="paymentStatus" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">Paid in full</SelectItem>
                    <SelectItem value="PARTIAL">Partial payment</SelectItem>
                    <SelectItem value="PENDING">Payment pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentStatus === 'PARTIAL' && (
                <div>
                  <Label htmlFor="amountReceived">Amount received (₹)</Label>
                  <Input
                    id="amountReceived"
                    type="number"
                    min={0}
                    max={totalAmount}
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Balance due: ₹{balanceDue.toLocaleString('en-IN')}
                  </p>
                </div>
              )}
              {paymentStatus === 'PENDING' && (
                <p className="text-sm text-amber-900 font-medium">
                  Full amount pending: ₹{totalAmount.toLocaleString('en-IN')}
                </p>
              )}
              {paymentStatus === 'PAID' && (
                <p className="text-sm text-green-800 font-medium">
                  Received in full: ₹{totalAmount.toLocaleString('en-IN')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Pre-Sediment Filtration Option */}
          <Card>
            <CardHeader>
              <CardTitle>Pre-Sediment Filtration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includesPreSedimentFiltration"
                  checked={includesPreSedimentFiltration}
                  onCheckedChange={(checked) => setIncludesPreSedimentFiltration(checked === true)}
                />
                <Label
                  htmlFor="includesPreSedimentFiltration"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Include Pre-Sediment Filtration Maintenance
                </Label>
              </div>
              <p className="text-xs text-gray-500 mt-2 ml-6">
                {includesPreSedimentFiltration 
                  ? "Pre-sediment filtration will be included in Services Covered section"
                  : "Pre-sediment filtration exclusion will be mentioned in Not Covered section"}
              </p>
            </CardContent>
          </Card>

          {/* Computer Generated Text Option */}
          <Card>
            <CardHeader>
              <CardTitle>Document Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="amcSealVariant">Authorized signatory image</Label>
                <Select
                  value={sealVariant}
                  onValueChange={(v: 'sign' | 'stamp') => setSealVariant(v)}
                >
                  <SelectTrigger id="amcSealVariant" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sign">{getDocumentSealVariantLabel('sign')}</SelectItem>
                    <SelectItem value="stamp">{getDocumentSealVariantLabel('stamp')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-2">
                  PDF uses {resolveBrandSealSrc(documentBrand, sealVariant).replace(/^\//, '')} for{' '}
                  {getDocumentBrandLabel(documentBrand)}.
                </p>
              </div>
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
              <p className="text-xs text-gray-500 mt-2 ml-6">
                {showComputerGeneratedText 
                  ? "The computer generated text will be displayed in the footer"
                  : "The computer generated text will be hidden"}
              </p>
            </CardContent>
          </Card>

          {/* Description/Summary Section */}
          <Card>
            <CardHeader>
              <CardTitle>Description / Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="description" className="text-sm font-medium mb-2 block">
                  Contract Description
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter a description or summary of this AMC contract for future reference (e.g., 'Annual maintenance for Kent RO, includes filter replacement, customer requested quarterly visits')"
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-gray-500 mt-2">
                  This description will be saved with the contract for easy identification in the future.
                </p>
              </div>
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
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Enter new note..."
                      onKeyPress={(e) => e.key === 'Enter' && addNote()}
                      className="flex-1"
                    />
                    <Button onClick={addNote} size="sm" className="w-full sm:w-auto">
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

          {/* Agreement Introduction Section */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle>Agreement Introduction</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingIntro(!isEditingIntro)}
                  className="w-full sm:w-auto"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {isEditingIntro ? 'View' : 'Edit'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isEditingIntro ? (
                <div className="space-y-2">
                  <Textarea
                    value={agreementIntro}
                    onChange={(e) => setAgreementIntro(e.target.value)}
                    placeholder="Enter agreement introduction text"
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <div className="text-xs text-gray-500">
                    💡 Tip: Use HTML tags like &lt;strong&gt; for bold text (e.g., &lt;strong&gt;Hydrogen RO&lt;/strong&gt;)
                  </div>
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap">
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: DOMPurify.sanitize(agreementIntro, {
                        ALLOWED_TAGS: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'span'],
                        ALLOWED_ATTR: []
                      })
                    }} 
                  />
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
                    Edit AMC terms and conditions. Choose which section to add the new term to.
                  </div>
                  <div className="space-y-2">
                    <Select value={termSection} onValueChange={(value: 'services' | 'terms') => setTermSection(value)}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="services">Services Covered</SelectItem>
                        <SelectItem value="terms">Terms & Conditions</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      placeholder="Enter new term (e.g., 'Service response within 24 hours' or multi-line text)"
                      rows={4}
                      className="resize-none"
                    />
                    <Button onClick={addTerm} size="sm" disabled={!newTerm.trim()} className="w-full sm:w-auto">
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
          <Card className="sticky top-4 sm:top-6">
            <CardHeader>
              <CardTitle className={documentSectionTitleClass}>AMC Agreement Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm sm:text-base">
                  <span>AMC Cost:</span>
                  <span>₹{amcCost.toLocaleString()}</span>
                </div>
                {serviceCharge > 0 && (
                  <div className="flex justify-between text-sm sm:text-base">
                    <span>Additional Charges:</span>
                    <span>₹{serviceCharge.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base sm:text-lg border-t pt-2">
                  <span>Total Amount:</span>
                  <span>₹{totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm sm:text-base pt-1">
                  <span>Payment:</span>
                  <span className={
                    paymentStatus === 'PAID'
                      ? 'text-green-700 font-medium'
                      : paymentStatus === 'PARTIAL'
                        ? 'text-amber-700 font-medium'
                        : 'text-red-700 font-medium'
                  }>
                    {paymentStatus === 'PAID'
                      ? 'Paid in full'
                      : paymentStatus === 'PARTIAL'
                        ? `Partial — ₹${resolvedAmountReceived.toLocaleString('en-IN')} received, ₹${balanceDue.toLocaleString('en-IN')} due`
                        : 'Payment pending'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Label className="text-sm font-medium">AMC service period (auto job creation)</Label>
                <Select
                  value={servicePeriodKind}
                  onValueChange={(v: '4' | '6' | 'custom' | 'no_auto') => setServicePeriodKind(v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">Every 4 months</SelectItem>
                    <SelectItem value="6">Every 6 months</SelectItem>
                    <SelectItem value="custom">Custom (months)</SelectItem>
                    <SelectItem value="no_auto">No auto</SelectItem>
                  </SelectContent>
                </Select>
                {servicePeriodKind === 'custom' && (
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={servicePeriodCustomMonths}
                    onChange={(e) => setServicePeriodCustomMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="mt-1"
                    placeholder="Months"
                  />
                )}
                <p className="text-xs text-gray-500">
                  {servicePeriodKind === 'no_auto'
                    ? 'No automatic AMC service jobs will be created for this contract.'
                    : `An AMC service job is auto-created ${servicePeriodKind === '4' ? '4' : servicePeriodKind === '6' ? '6' : servicePeriodCustomMonths} months after the customer's last completed service (any type). If that next visit would be after the AMC end date, a final job is auto-created 10 days before the AMC expires instead.`}
                </p>
              </div>

              <p className="text-xs text-slate-500 border-t pt-3 leading-relaxed">
                Save stores contract details including description, dates, costs, and prefilter settings.
                Terms-only PDFs include clauses without customer or agreement details.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <DocumentBrandPickerDialog
        open={brandPickerOpen}
        onOpenChange={(open) => {
          setBrandPickerOpen(open);
          if (!open) setPendingBrandAction(null);
        }}
        title={
          pendingBrandAction?.type === 'save'
            ? 'Which brand gave this AMC?'
            : pendingBrandAction?.type === 'email'
              ? 'Which brand is sending this AMC?'
              : 'Which brand is this agreement for?'
        }
        description={
          pendingBrandAction?.type === 'save'
            ? 'Select Hydrogen RO or Eleven RO. This brand is stored on the AMC contract when you save.'
            : pendingBrandAction?.type === 'email'
              ? 'The PDF attachment and email will use the selected brand address, logo, and sender.'
              : 'The agreement PDF will use the selected brand address and logo.'
        }
        onSelect={(brand) => {
          if (pendingBrandAction?.type === 'save') {
            void executeSaveToDatabase(brand);
          } else if (pendingBrandAction?.type === 'document') {
            void executePrint(brand, pendingBrandAction.action, pendingBrandAction.options);
          } else if (pendingBrandAction?.type === 'email') {
            openEmailSendDialog(brand);
          }
          setPendingBrandAction(null);
        }}
      />
      <AmcEmailSendDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        bill={emailSendContext?.bill ?? null}
        brand={emailSendContext?.brand ?? null}
        endDateIso={emailSendContext?.endDateIso ?? ''}
        defaultRecipients={emailSendContext?.defaultRecipients ?? []}
        pdfOptions={{
          includeDetails: true,
          showComputerGeneratedText,
        }}
        onPersistAfterEmail={async (recipients) => {
          const brand = emailSendContext?.brand;
          if (!brand) {
            return { ok: false, error: 'Agreement brand is missing' };
          }
          return persistAmcToDatabase(brand, {
            emailedTo: recipients,
            sharedVia: 'admin_email',
          });
        }}
        onSent={() => {
          if (emailSendContext?.bill) onPrint?.(emailSendContext.bill);
        }}
      />
    </div>
  );
}
