import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ImageUpload from '@/components/ImageUpload';
import { Job, Technician } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { getCachedQrCodes, CommonQrCode } from '@/lib/qrCodeManager';
import { useAuth } from '@/contexts/AuthContext';

interface CompleteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  commonQrCodes: CommonQrCode[];
  onLoadQrCodes: () => Promise<void>;
  onJobCompleted: () => void;
}

// Helper function to get today's date in local timezone (YYYY-MM-DD format)
const getTodayLocalDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const CompleteJobDialog: React.FC<CompleteJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  commonQrCodes,
  onLoadQrCodes,
  onJobCompleted
}) => {
  const { user } = useAuth();
  const [completionNotes, setCompletionNotes] = useState('');
  const [completeJobStep, setCompleteJobStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [billAmount, setBillAmount] = useState<string>('');
  const [billPhotos, setBillPhotos] = useState<string[]>([]);
  const [amcDateGiven, setAmcDateGiven] = useState<string>('');
  const [amcEndDate, setAmcEndDate] = useState<string>('');
  const [amcYears, setAmcYears] = useState<number>(1);
  const [amcIncludesPrefilter, setAmcIncludesPrefilter] = useState<boolean>(false);
  const [hasAMC, setHasAMC] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | ''>('');
  const [customerHasPrefilter, setCustomerHasPrefilter] = useState<boolean | null>(null);
  const [qrCodeType, setQrCodeType] = useState<string>('');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<string>('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [billAmountConfirmOpen, setBillAmountConfirmOpen] = useState(false);
  const [localCommonQrCodes, setLocalCommonQrCodes] = useState<CommonQrCode[]>(commonQrCodes);

  // Calculate AMC end date: agreement date + years - 1 day
  const calculateAMCEndDate = (agreementDate: string, years: number) => {
    if (!agreementDate) return;
    const startDate = new Date(agreementDate);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + years);
    // Subtract 1 day (AMC covers up to that date - 1 day)
    endDate.setDate(endDate.getDate() - 1);
    setAmcEndDate(endDate.toISOString().split('T')[0]);
  };

  // Load QR codes when dialog opens
  useEffect(() => {
    if (open && job) {
      const cachedQrCodes = getCachedQrCodes();
      if (!cachedQrCodes || cachedQrCodes.length === 0) {
        onLoadQrCodes().then(() => {
          const updated = getCachedQrCodes();
          if (updated) setLocalCommonQrCodes(updated);
        }).catch(err => console.error('Error loading QR codes:', err));
      } else {
        setLocalCommonQrCodes(cachedQrCodes);
      }
    }
  }, [open, job, onLoadQrCodes]);

  // Initialize form when dialog opens
  useEffect(() => {
    if (open && job) {
      setCompletionNotes('');
      setCompleteJobStep(1);
      setBillAmount('');
      setBillPhotos([]);
      const today = getTodayLocalDate();
      setAmcDateGiven(today);
      setAmcYears(1);
      calculateAMCEndDate(today, 1);
      setAmcIncludesPrefilter(false);
      setHasAMC(false);
      setPaymentMode('');
      const customerPrefilter = job.customer 
        ? ((job.customer as any).has_prefilter ?? (job.customer as any).hasPrefilter ?? null)
        : null;
      setCustomerHasPrefilter(customerPrefilter);
      setQrCodeType('');
      setSelectedQrCodeId('');
      setPaymentScreenshot('');
    }
  }, [open, job]);

  // Sync commonQrCodes prop with local state
  useEffect(() => {
    if (commonQrCodes.length > 0) {
      setLocalCommonQrCodes(commonQrCodes);
    }
  }, [commonQrCodes]);

  const handleClose = () => {
    setCompleteJobStep(1);
    setBillAmount('');
    setBillPhotos([]);
    const today = getTodayLocalDate();
    setAmcDateGiven(today);
    setAmcEndDate('');
    setAmcYears(1);
    setAmcIncludesPrefilter(false);
    setHasAMC(false);
    setPaymentMode('');
    setCustomerHasPrefilter(null);
    setQrCodeType('');
    setSelectedQrCodeId('');
    setPaymentScreenshot('');
    setCompletionNotes('');
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!job) return;

    // Step 1: Bill Photo (optional) - move to step 2
    if (completeJobStep === 1) {
      setCompleteJobStep(2);
      return;
    }

    // Step 2: Bill Amount - validate and show confirmation
    if (completeJobStep === 2) {
      if (!billAmount || parseFloat(billAmount) <= 0) {
        toast.error('Please enter a valid bill amount');
        return;
      }
      setBillAmountConfirmOpen(true);
      return;
    }

    // Step 3: Payment Mode - validate and move to step 4 (payment screenshot) or step 5 (AMC)
    if (completeJobStep === 3) {
      if (!paymentMode) {
        toast.error('Please select a payment mode');
        return;
      }
      if (paymentMode === 'CASH') {
        setCompleteJobStep(5);
        return;
      }
      if (paymentMode === 'ONLINE') {
        if (!selectedQrCodeId) {
          toast.error('Please select a QR code');
          return;
        }
        setCompleteJobStep(4);
        return;
      }
    }

    // Step 4: Payment Screenshot (optional) - move to step 5 (AMC)
    if (completeJobStep === 4) {
      setCompleteJobStep(5);
      return;
    }

    // Step 5: AMC - move to step 6 (Prefilter)
    if (completeJobStep === 5) {
      setCompleteJobStep(6);
      return;
    }

    // On step 6, submit the form
    try {
      let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | null = null;
      if (paymentMode === 'CASH') {
        dbPaymentMethod = 'CASH';
      } else if (paymentMode === 'ONLINE') {
        dbPaymentMethod = 'UPI';
      }
      
      const updateData: any = {
        status: 'COMPLETED',
        end_time: new Date().toISOString(),
        completion_notes: completionNotes.trim(),
        completed_by: user?.id || 'admin',
        completed_at: new Date().toISOString(),
        actual_cost: parseFloat(billAmount) || 0,
        payment_amount: parseFloat(billAmount) || 0,
        payment_method: dbPaymentMethod || null,
        customer_has_prefilter: customerHasPrefilter,
      };

      // Handle requirements
      const currentRequirements = job.requirements || [];
      let requirements: any[] = [];
      
      if (Array.isArray(currentRequirements)) {
        requirements = [...currentRequirements];
      } else if (typeof currentRequirements === 'string') {
        try {
          requirements = JSON.parse(currentRequirements);
          if (!Array.isArray(requirements)) {
            requirements = [];
          }
        } catch {
          requirements = [];
        }
      }

      requirements = requirements.filter((req: any) => !req.bill_photos && !req.payment_photos && !req.qr_photos && !req.amc_info);

      if (billPhotos.length > 0) {
        requirements.push({ bill_photos: billPhotos });
      }

      if (paymentMode === 'ONLINE' && selectedQrCodeId) {
        const qrPhotos: any = {
          qr_code_type: qrCodeType,
          selected_qr_code_id: selectedQrCodeId,
          payment_screenshot: paymentScreenshot || null
        };
        
        if (selectedQrCodeId.startsWith('common_')) {
          const qrId = selectedQrCodeId.replace('common_', '');
          const selectedQr = localCommonQrCodes.find(qr => qr.id === qrId);
          if (selectedQr) {
            qrPhotos.selected_qr_code_url = selectedQr.qrCodeUrl;
            qrPhotos.selected_qr_code_name = selectedQr.name;
          }
        } else if (selectedQrCodeId.startsWith('technician_')) {
          const techId = selectedQrCodeId.replace('technician_', '');
          const selectedTech = technicians.find(t => t.id === techId);
          if (selectedTech && (selectedTech as any).qrCode) {
            qrPhotos.selected_qr_code_url = (selectedTech as any).qrCode;
            qrPhotos.selected_qr_code_name = selectedTech.fullName || 'Technician';
          }
        }
        
        requirements.push({ qr_photos: qrPhotos });
      }

      if (hasAMC && amcDateGiven && amcEndDate) {
        requirements.push({ 
          amc_info: {
            date_given: amcDateGiven,
            end_date: amcEndDate,
            years: amcYears,
            includes_prefilter: amcIncludesPrefilter
          }
        });
      }

      if (billPhotos.length > 0 || (paymentMode === 'ONLINE' && selectedQrCodeId) || (hasAMC && amcDateGiven && amcEndDate)) {
        updateData.requirements = JSON.stringify(requirements);
      }

      const { error } = await db.jobs.update(job.id, updateData);

      if (error) {
        throw new Error(error.message);
      }

      toast.success('Job completed successfully');
      handleClose();
      onJobCompleted();
    } catch (error) {
      toast.error('Failed to complete job');
    }
  };

  if (!job) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[95vw] sm:w-[500px] max-w-[500px] h-[85vh] sm:h-[600px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>Complete Job</DialogTitle>
            <DialogDescription>
              {completeJobStep === 1 && 'Upload bill photo (optional)'}
              {completeJobStep === 2 && 'Enter the bill amount for this job'}
              {completeJobStep === 3 && 'Select payment mode and QR code'}
              {completeJobStep === 4 && 'Upload payment screenshot (optional)'}
              {completeJobStep === 5 && 'Add AMC information (optional)'}
              {completeJobStep === 6 && 'Does the customer have a prefilter?'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="p-3 bg-gray-50 rounded-lg mb-4">
              <div className="text-sm font-medium text-gray-900">
                Job: {(job as any).job_number || job.jobNumber}
              </div>
              <div className="text-sm text-gray-600">
                {(job.serviceType || (job as any).service_type || 'N/A')} - {(job.serviceSubType || (job as any).service_sub_type || 'N/A')}
              </div>
              <div className="text-sm text-gray-600">
                Customer: {
                  job.customer?.fullName || 
                  (job.customer as any)?.full_name ||
                  (job.customer as any)?.name ||
                  'Unknown'
                }
              </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  1
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 2 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 2 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  2
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 3 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 3 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  3
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 4 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 4 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  4
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 5 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 5 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  5
                </div>
              </div>
            </div>

            {/* Step 1: Bill Photo */}
            {completeJobStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label>Upload Bill Photo (Optional)</Label>
                  <ImageUpload
                    onImagesChange={(images) => setBillPhotos(images)}
                    maxImages={5}
                    folder="bills"
                    title=""
                    description=""
                    maxWidth={1024}
                    quality={0.5}
                    aggressiveCompression={true}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Bill Amount */}
            {completeJobStep === 2 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bill-amount">Bill Amount *</Label>
                  <Input
                    id="bill-amount"
                    type="number"
                    placeholder="Enter bill amount"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="mt-1"
                    min="0"
                    step="0.01"
                  />
                  {billAmount && parseFloat(billAmount) > 0 && (
                    <p className="text-sm text-gray-600 mt-2">
                      Bill Amount: ₹{parseFloat(billAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="completion-notes">Completion Notes (Optional)</Label>
                  <Textarea
                    id="completion-notes"
                    placeholder="Add any notes about the job completion..."
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Payment Mode */}
            {completeJobStep === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="payment-mode">Payment Mode *</Label>
                  <Select 
                    value={paymentMode} 
                    onValueChange={(value: 'CASH' | 'ONLINE') => {
                      setPaymentMode(value);
                      if (value === 'CASH') {
                        setQrCodeType('');
                        setSelectedQrCodeId('');
                        setPaymentScreenshot('');
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {paymentMode === 'ONLINE' && (
                  <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                    <div>
                      <Label htmlFor="qr-code-type">Select QR Code *</Label>
                      <Select 
                        value={selectedQrCodeId} 
                        onValueChange={(value) => {
                          setSelectedQrCodeId(value);
                          if (value.startsWith('common_')) {
                            setQrCodeType('common');
                          } else if (value.startsWith('technician_')) {
                            setQrCodeType('technician');
                          }
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select QR code" />
                        </SelectTrigger>
                        <SelectContent className="!z-[100]">
                          {localCommonQrCodes.length === 0 && technicians.filter(t => (t as any).qrCode).length === 0 ? (
                            <SelectItem value="no-qr" disabled>
                              No QR codes available
                            </SelectItem>
                          ) : (
                            <>
                              {localCommonQrCodes.length > 0 && (
                                <>
                                  {localCommonQrCodes.map((qr) => (
                                    <SelectItem key={`common_${qr.id}`} value={`common_${qr.id}`}>
                                      {qr.name}
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                              {technicians
                                .filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '')
                                .map((tech) => (
                                  <SelectItem key={`technician_${tech.id}`} value={`technician_${tech.id}`}>
                                    {tech.fullName}'s QR Code
                                  </SelectItem>
                                ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedQrCodeId && (
                      <div className="mt-4 p-4 bg-primary/10 border border-primary rounded-lg">
                        <p className="text-sm font-semibold text-primary mb-3 text-center">
                          QR Code - Show to Customer
                        </p>
                        <div className="flex justify-center">
                          {selectedQrCodeId.startsWith('common_') ? (() => {
                            const qrId = selectedQrCodeId.replace('common_', '');
                            const selectedQr = localCommonQrCodes.find(qr => qr.id === qrId);
                            if (!selectedQr) {
                              return (
                                <div className="text-center p-4">
                                  <p className="text-sm text-red-500">QR code not found</p>
                                </div>
                              );
                            }
                            return (
                              <div className="text-center">
                                <p className="text-sm font-medium mb-3 text-gray-700">{selectedQr.name}</p>
                                <img 
                                  src={selectedQr.qrCodeUrl} 
                                  alt={selectedQr.name}
                                  className="w-64 h-64 object-contain mx-auto border-2 border-primary rounded-lg shadow-lg bg-white p-3"
                                  onError={(e) => {
                                    console.error('Failed to load QR code:', selectedQr.qrCodeUrl);
                                  }}
                                />
                              </div>
                            );
                          })() : selectedQrCodeId.startsWith('technician_') ? (() => {
                            const techId = selectedQrCodeId.replace('technician_', '');
                            const selectedTech = technicians.find(t => t.id === techId);
                            if (!selectedTech || !(selectedTech as any).qrCode) {
                              return (
                                <div className="text-center p-4">
                                  <p className="text-sm text-red-500">QR code not found</p>
                                  <p className="text-xs text-gray-500 mt-1">Technician QR code not available</p>
                                </div>
                              );
                            }
                            return (
                              <div className="text-center">
                                <p className="text-sm font-medium mb-3 text-gray-700">
                                  {selectedTech.fullName}'s QR Code
                                </p>
                                <img 
                                  src={(selectedTech as any).qrCode} 
                                  alt={`${selectedTech.fullName}'s QR Code`}
                                  className="w-64 h-64 object-contain mx-auto border-2 border-primary rounded-lg shadow-lg bg-white p-3"
                                  onError={(e) => {
                                    console.error('Failed to load technician QR code:', (selectedTech as any).qrCode);
                                  }}
                                />
                              </div>
                            );
                          })() : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Payment Screenshot */}
            {completeJobStep === 4 && paymentMode === 'ONLINE' && (
              <div className="space-y-4">
                <div>
                  <Label>Payment Screenshot (Optional)</Label>
                  <p className="text-sm text-gray-500 mb-2">Upload payment confirmation screenshot</p>
                  <ImageUpload
                    onImagesChange={(images) => setPaymentScreenshot(images[0] || '')}
                    maxImages={1}
                    folder="payment-receipts"
                    title=""
                    description=""
                    maxWidth={800}
                    quality={0.3}
                    aggressiveCompression={true}
                    useSecondaryAccount={true}
                  />
                </div>
              </div>
            )}

            {/* Step 5: AMC Info */}
            {completeJobStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="has-amc"
                    checked={hasAMC}
                    onChange={(e) => {
                      setHasAMC(e.target.checked);
                      if (e.target.checked) {
                        const today = getTodayLocalDate();
                        setAmcDateGiven(today);
                        setAmcYears(1);
                        calculateAMCEndDate(today, 1);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="has-amc" className="cursor-pointer">This job includes AMC</Label>
                </div>

                {hasAMC && (
                  <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                    <div>
                      <Label htmlFor="amc-date-given">AMC Date of Agreement *</Label>
                      <Input
                        id="amc-date-given"
                        type="date"
                        value={amcDateGiven}
                        onChange={(e) => {
                          setAmcDateGiven(e.target.value);
                          if (e.target.value) {
                            calculateAMCEndDate(e.target.value, amcYears);
                          }
                        }}
                        className="mt-1"
                        max={getTodayLocalDate()}
                      />
                    </div>
                    <div>
                      <Label htmlFor="amc-years">Number of Years *</Label>
                      <Select value={amcYears.toString()} onValueChange={(value) => {
                        const years = parseInt(value);
                        setAmcYears(years);
                        if (amcDateGiven) {
                          calculateAMCEndDate(amcDateGiven, years);
                        }
                      }}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 Year</SelectItem>
                          <SelectItem value="2">2 Years</SelectItem>
                          <SelectItem value="3">3 Years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="amc-end-date">AMC End Date *</Label>
                      <Input
                        id="amc-end-date"
                        type="date"
                        value={amcEndDate}
                        onChange={(e) => setAmcEndDate(e.target.value)}
                        className="mt-1"
                        min={amcDateGiven}
                        readOnly
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="amc-prefilter"
                        checked={amcIncludesPrefilter}
                        onChange={(e) => setAmcIncludesPrefilter(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="amc-prefilter" className="cursor-pointer">Includes Prefilter</Label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Prefilter Question */}
            {completeJobStep === 6 && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Does the customer have a prefilter?</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setCustomerHasPrefilter(true)}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        customerHasPrefilter === true
                          ? 'border-black bg-black text-white shadow-md'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          customerHasPrefilter === true
                            ? 'border-white bg-white'
                            : 'border-gray-400'
                        }`}>
                          {customerHasPrefilter === true && (
                            <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                          )}
                        </div>
                        <span className="font-medium text-sm">Yes</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerHasPrefilter(false)}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        customerHasPrefilter === false
                          ? 'border-black bg-black text-white shadow-md'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          customerHasPrefilter === false
                            ? 'border-white bg-white'
                            : 'border-gray-400'
                        }`}>
                          {customerHasPrefilter === false && (
                            <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                          )}
                        </div>
                        <span className="font-medium text-sm">No</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 flex-shrink-0 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (completeJobStep > 1) {
                  setCompleteJobStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5 | 6);
                } else {
                  handleClose();
                }
              }}
            >
              {completeJobStep > 1 ? 'Back' : 'Cancel'}
            </Button>
            {completeJobStep === 2 && (
              <Button
                variant="outline"
                onClick={() => {
                  setCompleteJobStep(3);
                }}
              >
                Skip
              </Button>
            )}
            {completeJobStep === 5 && hasAMC && (!amcDateGiven || !amcEndDate) && (
              <Button
                variant="outline"
                onClick={() => {
                  setHasAMC(false);
                  setAmcDateGiven('');
                  setAmcEndDate('');
                  setAmcIncludesPrefilter(false);
                }}
              >
                Skip AMC
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              className="bg-black hover:bg-gray-800 !text-white font-semibold"
              disabled={(completeJobStep === 3 && !paymentMode) || (completeJobStep === 3 && paymentMode === 'ONLINE' && !qrCodeType) || (completeJobStep === 5 && hasAMC && (!amcDateGiven || !amcEndDate))}
            >
              {completeJobStep === 6 ? 'Complete Job' : 'Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill Amount Confirmation Dialog */}
      <AlertDialog open={billAmountConfirmOpen} onOpenChange={setBillAmountConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bill Amount</AlertDialogTitle>
            <AlertDialogDescription>
              Please confirm the bill amount before proceeding:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                ₹{parseFloat(billAmount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-500">
                Job: {(job as any).job_number || job.jobNumber}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setBillAmountConfirmOpen(false);
                setCompleteJobStep(3);
              }}
              className="bg-black hover:bg-gray-800 !text-white font-semibold"
            >
              Confirm & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

