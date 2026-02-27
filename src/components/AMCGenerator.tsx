import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Plus, Download, FileText, User, Phone, MapPin, Building, Droplets, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Customer, Bill, BillItem, CompanyInfo } from '@/types';
import { generateAMCPDF } from '@/lib/amc-pdf-generator';
import { db } from '@/lib/supabase';

interface AMCGeneratorProps {
  customer: Customer;
  onPrint?: (bill: Bill) => void;
  onAMCSaved?: () => void;
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

export default function AMCGenerator({ customer, onPrint, onAMCSaved }: AMCGeneratorProps) {
  const [billNumber, setBillNumber] = useState(`AMC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo);
  const [notes, setNotes] = useState('');
  const [validity, setValidity] = useState('1 Year');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [roModel, setRoModel] = useState('');
  const [includesPreSedimentFiltration, setIncludesPreSedimentFiltration] = useState(false);
  const [showComputerGeneratedText, setShowComputerGeneratedText] = useState(true);

  // Generate terms dynamically based on pre-sediment filtration checkbox
  const generateTerms = (includesPreFilter: boolean) => {
    const servicesCovered = `SERVICES COVERED BY THE AGREEMENT

Breakdown Support: If any breakdown or problem happens with the RO during the AMC period, the company will provide service without extra charges.

Filters / RO Membrane / Consumables / Electricals / Motor: Company will clean, repair, or replace filters and parts needed for smooth working.

Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.

Clean cosmetics and smooth working of the machine.

Quick service: Any breakdown will be resolved within 24 hours.

Full Care of RO: The company takes responsibility for complete maintenance and support during the AMC period.`;

    const servicesCoveredWithPreFilter = servicesCovered + `

Includes pre-sediment filtration maintenance and servicing.`;

    const termsAndConditions = `⚖️ TERMS AND CONDITIONS

No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.

Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.

Disputes: Any legal disputes will be handled only in Bangalore courts.

Renewal: After expiry, renewal requires a new agreement.

Customer's Duty: The customer must make the RO available for servicing when the company's authorized representative visits.

If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.

Agreement Modification: Cannot be changed unless written and signed by both parties.`;

    const notCoveredBase = `Not Covered: Display and lights of the RO, RO tap, body, and tank are not covered under this AMC.`;
    
    const notCoveredWithPreFilter = includesPreFilter 
      ? notCoveredBase
      : notCoveredBase.replace('are not covered under this AMC.', 'are not covered under this AMC. Pre-sediment filtration is not included in this agreement.');

    const finalServicesCovered = includesPreFilter ? servicesCoveredWithPreFilter : servicesCovered;

    return `${finalServicesCovered}

${termsAndConditions}

${notCoveredWithPreFilter}`;
  };

  const [terms, setTerms] = useState(generateTerms(false));
  const [amcCost, setAmcCost] = useState(7000);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [termSection, setTermSection] = useState<'services' | 'terms'>('services');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isEditingIntro, setIsEditingIntro] = useState(false);
  const [agreementIntro, setAgreementIntro] = useState('We <strong>Hydrogen RO</strong>, Authorized Service Provider, undertake to maintain your <strong>RO Water Purifier</strong> Unit as detailed below:');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // AMC service period for auto job creation: 4 months, 6 months, custom, or no auto
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

  // Update terms when pre-sediment filtration checkbox changes
  React.useEffect(() => {
    setTerms(generateTerms(includesPreSedimentFiltration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includesPreSedimentFiltration]);

  // Auto-populate RO model from customer data
  React.useEffect(() => {
    if (customer && customer.model && !roModel) {
      // Format: Brand + Model (e.g., "Kent Grand Plus")
      const modelValue = customer.brand && customer.model 
        ? `${customer.brand} ${customer.model}`.trim()
        : customer.model;
      setRoModel(modelValue);
    }
  }, [customer, roModel]);

  // Editable customer information state
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editableCustomer, setEditableCustomer] = useState({
    name: customer.fullName || '',
    phone: typeof customer.phone === 'string' ? customer.phone : (customer as any)?.phone || '',
    email: customer.email || '',
    gst: customer.gstNumber || '',
    address: {
      street: customer.address.street || '',
      area: customer.address.area || '',
      city: customer.address.city || '',
      state: customer.address.state || '',
      pincode: customer.address.pincode || ''
    }
  });

  // Calculate totals - use direct AMC cost instead of items
  const subtotal = amcCost;
  const totalAmount = subtotal + serviceCharge;


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

  // Function to save AMC contract to database
  const handleSaveToDatabase = async () => {
    if (!billNumber.trim()) {
      toast.error('Please enter an agreement number');
      return;
    }

    // Validate RO Model/Brand
    if (!roModel.trim()) {
      toast.error('Please enter RO Model/Brand before saving', {
        description: 'RO Model is required to save the AMC contract.',
        duration: 6000
      });
      return;
    }

    if (validity === 'Custom' && (!customFromDate || !customToDate)) {
      toast.error('Please select both from and to dates for custom validity');
      return;
    }

    if (validity === 'Custom' && customFromDate && customToDate && new Date(customFromDate) >= new Date(customToDate)) {
      toast.error('To date must be after from date');
      return;
    }

    setIsSaving(true);

    try {
      const { startDate, endDate, years } = calculateDates();

      // Prepare comprehensive metadata to store in additional_info
      const metadata = {
        agreement_number: billNumber,
        agreement_date: billDate,
        amc_cost: amcCost,
        service_charge: serviceCharge,
        total_amount: totalAmount,
        ro_model: roModel.trim(),
        validity_period: validity,
        description: description.trim() || null,
        notes: notes || null,
        customer_name: editableCustomer.name,
        customer_phone: editableCustomer.phone,
        customer_email: editableCustomer.email || null,
        customer_gst: editableCustomer.gst || null,
        customer_address: editableCustomer.address,
        agreement_intro: agreementIntro,
        saved_at: new Date().toISOString()
      };

      // Resolve service period months: 0 = no auto
      const servicePeriodMonths =
        servicePeriodKind === 'no_auto' ? 0
          : servicePeriodKind === '4' ? 4
          : servicePeriodKind === '6' ? 6
          : Math.max(1, servicePeriodCustomMonths);

      // Save AMC contract to database
      const { error: amcError } = await db.amcContracts.create({
        customer_id: customer.id,
        job_id: null, // AMC created from generator, not from a job
        start_date: startDate,
        end_date: endDate,
        years: years,
        includes_prefilter: includesPreSedimentFiltration,
        additional_info: JSON.stringify(metadata),
        service_period_months: servicePeriodKind === 'no_auto' ? 0 : servicePeriodMonths
      });

      if (amcError) {
        console.error('Failed to save AMC contract to database:', amcError);
        toast.error('Failed to save AMC contract to database', {
          description: amcError.message || 'Please try again or contact support.'
        });
      } else {
        toast.success('AMC contract saved to database successfully', {
          description: `Agreement ${billNumber} has been saved with all details.`
        });
        // Notify parent to refresh AMC status
        if (onAMCSaved) {
          onAMCSaved();
        }
      }
    } catch (error: any) {
      console.error('Error saving AMC contract:', error);
      toast.error('Failed to save AMC contract', {
        description: error.message || 'An unexpected error occurred. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async (options?: { termsOnly?: boolean }) => {
    if (!billNumber.trim()) {
      toast.error('Please enter a bill number');
      return;
    }

    // Validate RO Model/Brand
    if (!roModel.trim()) {
      toast.error('Please enter RO Model/Brand before generating AMC Agreement', {
        description: 'RO Model is required to generate the agreement. Please add the brand and model information.',
        duration: 6000
      });
      return;
    }

    if (validity === 'Custom' && (!customFromDate || !customToDate)) {
      toast.error('Please select both from and to dates for custom validity');
      return;
    }

    if (validity === 'Custom' && customFromDate && customToDate && new Date(customFromDate) >= new Date(customToDate)) {
      toast.error('To date must be after from date');
      return;
    }

    const { startDate, endDate, years } = calculateDates();

    // Use the current terms state (preserves any manual edits)
    // Create a single item from the AMC cost
    const amcItem: BillItem = {
      id: '1',
      description: 'AMC Agreement - 1 Year Service Contract',
      quantity: 1,
      unitPrice: amcCost,
      total: amcCost,
      taxRate: 0,
      taxAmount: 0
    };

    const bill: Bill = {
      id: Date.now().toString(),
      billNumber,
      billDate,
      company,
      customer: {
        id: customer.id,
        name: editableCustomer.name,
        address: `${editableCustomer.address.street || ''}, ${editableCustomer.address.area || ''}`.trim() || '',
        city: editableCustomer.address.city || '',
        state: editableCustomer.address.state || '',
        pincode: editableCustomer.address.pincode || '',
        phone: editableCustomer.phone || '',
        email: editableCustomer.email || '',
        gstNumber: editableCustomer.gst || '',
        roModel: roModel.trim()
      } as any,
      items: [amcItem],
      subtotal,
      totalTax: 0,
      serviceCharge,
      totalAmount,
      paymentStatus: 'PENDING',
      notes,
      terms,
      validity: validity === 'Custom' ? 
        `${new Date(customFromDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} to ${new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 
        `${new Date(billDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} to ${new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      agreementIntro,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      // Don't save to database automatically - user must explicitly click "Save to Database" button
      // This allows generating/previewing AMC without creating an active contract in the database
      generateAMCPDF(bill, 'print', { 
        includeDetails: options?.termsOnly ? false : true,
        showComputerGeneratedText: showComputerGeneratedText
      });
      onPrint?.(bill);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate AMC Agreement');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header */}
      <div className="text-center mb-4 sm:mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-center mb-3 sm:mb-4 gap-3 sm:gap-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-lg flex items-center justify-center sm:mr-3">
            <Droplets className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-600 mb-0">Hydrogen RO</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0">AMC Agreement Generator</p>
          </div>
        </div>
      </div>

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
                        <Input
                          id="customFromDate"
                          type="date"
                          value={customFromDate}
                          onChange={(e) => setCustomFromDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="customToDate">To Date</Label>
                        <Input
                          id="customToDate"
                          type="date"
                          value={customToDate}
                          onChange={(e) => setCustomToDate(e.target.value)}
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
                  {(editableCustomer.address.street || editableCustomer.address.area || editableCustomer.address.city) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span>{editableCustomer.address.street}, {editableCustomer.address.area}, {editableCustomer.address.city}</span>
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
            <CardContent>
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
              <CardTitle>AMC Agreement Details</CardTitle>
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
                  Next AMC service job is auto-created from last service date (or AMC start if no service yet).
                </p>
              </div>

              <Button 
                onClick={handleSaveToDatabase}
                className="w-full text-sm sm:text-base bg-green-600 hover:bg-green-700"
                disabled={!billNumber.trim() || isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save to Database'}
              </Button>
              <Button 
                onClick={() => handlePrint()} 
                className="w-full text-sm sm:text-base"
                disabled={!billNumber.trim()}
              >
                <Download className="w-4 h-4 mr-2" />
                Generate AMC Agreement
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePrint({ termsOnly: true })}
                className="w-full text-sm sm:text-base"
                disabled={!billNumber.trim()}
              >
                <FileText className="w-4 h-4 mr-2" />
                Share Terms Only
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Save to Database stores all contract details including description, dates, costs, and prefilter settings. Terms-only mode removes customer and agreement details, leaving just clauses.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
