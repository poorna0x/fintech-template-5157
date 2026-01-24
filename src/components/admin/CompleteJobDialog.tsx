import React, { useState, useEffect, useRef } from 'react';
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
import { RefreshCw } from 'lucide-react';

interface CompleteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  commonQrCodes: CommonQrCode[];
  onLoadQrCodes: () => Promise<void>;
  selectedTechnicianId?: string; // Technician who completed the job (from admin page)
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
  selectedTechnicianId,
  onJobCompleted
}) => {
  const { user } = useAuth();
  const [completionNotes, setCompletionNotes] = useState('');
  const [completeJobStep, setCompleteJobStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const completeJobScrollRef = useRef<HTMLDivElement>(null);
  const [billAmount, setBillAmount] = useState<string>('');
  const [billPhotos, setBillPhotos] = useState<string[]>([]);
  const [amcDateGiven, setAmcDateGiven] = useState<string>('');
  const [amcEndDate, setAmcEndDate] = useState<string>('');
  const [amcYears, setAmcYears] = useState<number>(0);
  const [amcIncludesPrefilter, setAmcIncludesPrefilter] = useState<boolean>(false);
  const [amcAdditionalInfo, setAmcAdditionalInfo] = useState<string>('');
  const [hasAMC, setHasAMC] = useState<boolean | null>(null);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | ''>('');
  const [billAmountConfirmOpen, setBillAmountConfirmOpen] = useState(false);
  const [customerHasPrefilter, setCustomerHasPrefilter] = useState<boolean | null>(null);
  const [qrCodeType, setQrCodeType] = useState<string>('');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<string>('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [localCommonQrCodes, setLocalCommonQrCodes] = useState<CommonQrCode[]>(commonQrCodes);
  const [isSubmittingJobCompletion, setIsSubmittingJobCompletion] = useState(false);
  const [isBillPhotosUploading, setIsBillPhotosUploading] = useState(false);
  const [isPaymentScreenshotUploading, setIsPaymentScreenshotUploading] = useState(false);

  // Helper functions
  const isBillAmountZero = (): boolean => {
    const billAmountNum = parseFloat(billAmount);
    return billAmount === '' || isNaN(billAmountNum) || billAmountNum === 0;
  };

  const isSoftenerService = (): boolean => {
    if (!job) return false;
    const serviceType = ((job as any).service_type || job.serviceType || '').toUpperCase();
    const serviceSubType = ((job as any).service_sub_type || job.serviceSubType || '').toUpperCase();
    return serviceType === 'SOFTENER' || 
           serviceSubType.includes('SOFTENER') || 
           serviceSubType.includes('SOFTNER');
  };

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
      setAmcYears(0);
      setAmcEndDate('');
      setAmcIncludesPrefilter(false);
      setAmcAdditionalInfo('');
      setHasAMC(null);
      setPaymentMode('');
      const customerPrefilter = job.customer 
        ? ((job.customer as any).has_prefilter ?? (job.customer as any).hasPrefilter ?? null)
        : null;
      setCustomerHasPrefilter(customerPrefilter);
      setQrCodeType('');
      setSelectedQrCodeId('');
      setPaymentScreenshot('');
      setIsSubmittingJobCompletion(false);
      setIsBillPhotosUploading(false);
      setIsPaymentScreenshotUploading(false);
    }
  }, [open, job]);

  // Always show AMC question first when entering step 3
  useEffect(() => {
    if (completeJobStep === 3) {
      setHasAMC(null);
    }
  }, [completeJobStep]);

  // Scroll to top when step changes (fixes iOS scrolling issue)
  useEffect(() => {
    if (open && completeJobScrollRef.current) {
      setTimeout(() => {
        if (completeJobScrollRef.current) {
          completeJobScrollRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [completeJobStep, open]);

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
    setAmcYears(0);
    setAmcIncludesPrefilter(false);
    setAmcAdditionalInfo('');
    setHasAMC(null);
    setPaymentMode('');
    setCustomerHasPrefilter(null);
    setQrCodeType('');
    setSelectedQrCodeId('');
    setPaymentScreenshot('');
    setCompletionNotes('');
    setIsSubmittingJobCompletion(false);
    setIsBillPhotosUploading(false);
    setIsPaymentScreenshotUploading(false);
    onOpenChange(false);
  };

  // Extract submission logic to a separate function so it can be called directly
  const performJobSubmission = async () => {
    if (!job) return;

    // If softener service, customerHasPrefilter should be null (not applicable)
    if (isSoftenerService()) {
      setCustomerHasPrefilter(null);
    }
    
    // Determine payment mode - if bill is zero, payment mode should be empty
    const finalPaymentMode = isBillAmountZero() ? '' : (paymentMode as 'CASH' | 'ONLINE' | '');
    const finalPaymentScreenshot = isBillAmountZero() ? '' : paymentScreenshot;
    const finalQrCodeType = isBillAmountZero() ? '' : qrCodeType;
    const finalSelectedQrCodeId = isBillAmountZero() ? '' : selectedQrCodeId;
    
    setIsSubmittingJobCompletion(true);
    
    try {
      let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | null = null;
      if (!isBillAmountZero()) {
        if (finalPaymentMode === 'CASH') {
          dbPaymentMethod = 'CASH';
        } else if (finalPaymentMode === 'ONLINE') {
          dbPaymentMethod = 'UPI';
        }
      }
      
      // Determine who completed the job
      const completedByTechnicianId = selectedTechnicianId || user?.technicianId || user?.id || null;
      
      // Debug logging
      console.log('🔍 [CompleteJobDialog] Submitting job completion:', {
        jobId: job.id,
        selectedTechnicianId,
        userTechnicianId: user?.technicianId,
        userId: user?.id,
        completedByTechnicianId,
        billAmount,
        paymentMode: finalPaymentMode,
        isBillAmountZero: isBillAmountZero(),
        isSoftener: isSoftenerService()
      });
    
      const updateData: any = {
        status: 'COMPLETED',
        end_time: new Date().toISOString(),
        completion_notes: completionNotes.trim(),
        completed_by: completedByTechnicianId,
        completed_at: new Date().toISOString(),
        actual_cost: parseFloat(billAmount) || 0,
        payment_amount: parseFloat(billAmount) || 0,
        payment_method: dbPaymentMethod || (isBillAmountZero() ? null : 'CASH'),
      };

      // If completing from admin page with selected technician, ensure job is assigned to that technician
      if (selectedTechnicianId) {
        // Validate technician ID format before adding to update
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(selectedTechnicianId)) {
          updateData.assigned_technician_id = selectedTechnicianId;
          console.log('✅ [CompleteJobDialog] Valid technician ID, adding to update:', selectedTechnicianId);
        } else {
          console.error('❌ [CompleteJobDialog] Invalid technician ID format:', selectedTechnicianId);
          toast.error('Invalid technician ID. Please try again.');
          setIsSubmittingJobCompletion(false);
          return;
        }
      }
      
      console.log('📤 [CompleteJobDialog] Update payload:', updateData);

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

      if (!isBillAmountZero() && finalPaymentMode === 'ONLINE' && finalSelectedQrCodeId) {
        const qrPhotos: any = {
          qr_code_type: finalQrCodeType,
          selected_qr_code_id: finalSelectedQrCodeId,
          payment_screenshot: finalPaymentScreenshot || null
        };
        
        if (finalSelectedQrCodeId.startsWith('common_')) {
          const qrId = finalSelectedQrCodeId.replace('common_', '');
          const selectedQr = localCommonQrCodes.find(qr => qr.id === qrId);
          if (selectedQr) {
            qrPhotos.selected_qr_code_url = selectedQr.qrCodeUrl;
            qrPhotos.selected_qr_code_name = selectedQr.name;
          }
        } else if (finalSelectedQrCodeId.startsWith('technician_')) {
          const techId = finalSelectedQrCodeId.replace('technician_', '');
          const selectedTech = technicians.find(t => t.id === techId);
          if (selectedTech && (selectedTech as any).qrCode) {
            qrPhotos.selected_qr_code_url = (selectedTech as any).qrCode;
            qrPhotos.selected_qr_code_name = selectedTech.fullName || 'Technician';
          }
        }
        
        requirements.push({ qr_photos: qrPhotos });
      }

      // Only add AMC if it was actually set (hasAMC === true and years > 0)
      const effectiveHasAMC = hasAMC === true && amcYears > 0;
      if (effectiveHasAMC && amcDateGiven && amcEndDate) {
        requirements.push({ 
          amc_info: {
            date_given: amcDateGiven,
            end_date: amcEndDate,
            years: amcYears,
            includes_prefilter: amcIncludesPrefilter,
            additional_info: amcAdditionalInfo || null
          }
        });
      }

      if (billPhotos.length > 0 || (!isBillAmountZero() && finalPaymentMode === 'ONLINE' && finalSelectedQrCodeId) || (effectiveHasAMC && amcDateGiven && amcEndDate)) {
        updateData.requirements = JSON.stringify(requirements);
      }

      console.log('🚀 [CompleteJobDialog] Calling db.jobs.update with:', {
        jobId: job.id,
        updateData,
        updateDataKeys: Object.keys(updateData)
      });
      
      const { data: updatedJob, error } = await db.jobs.update(job.id, updateData);

      if (error) {
        console.error('❌ [CompleteJobDialog] Update error:', {
          error,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          errorCode: error.code,
          jobId: job.id,
          updateData
        });
        throw new Error(error.message || `Failed to update job: ${error.code || 'Unknown error'}`);
      }

      console.log('✅ [CompleteJobDialog] Job updated successfully:', updatedJob);
      
      // Update customer's has_prefilter field (same as technician dashboard)
      if (customerHasPrefilter !== null && !isSoftenerService()) {
        try {
          // Get customer UUID from job - prioritize customer.id (UUID) over customer_id
          const customerId = 
            (job.customer as any)?.id ||  // UUID from joined customer object (most reliable)
            job.customer?.id ||           // UUID from customer object
            job.customer_id ||            // UUID from job's customer_id field
            (job as any).customer_id;     // Alternative field name
          
          if (customerId) {
            console.log('🔄 [CompleteJobDialog] Updating customer prefilter status:', {
              customerId,
              hasPrefilter: customerHasPrefilter,
              jobId: job.id
            });
            
            const { error: customerUpdateError } = await db.customers.update(customerId, {
              has_prefilter: customerHasPrefilter
            });
            
            if (customerUpdateError) {
              console.error('❌ [CompleteJobDialog] Failed to update customer prefilter status:', {
                error: customerUpdateError,
                customerId,
                hasPrefilter: customerHasPrefilter,
                errorMessage: customerUpdateError.message,
                errorCode: customerUpdateError.code
              });
              // Don't fail the job completion if customer update fails - just log it
            } else {
              console.log('✅ [CompleteJobDialog] Customer prefilter status updated successfully');
            }
          } else {
            console.warn('⚠️ [CompleteJobDialog] Could not find customer ID to update prefilter status');
          }
        } catch (error: any) {
          console.error('❌ [CompleteJobDialog] Exception updating customer prefilter:', {
            error,
            errorMessage: error?.message,
            errorStack: error?.stack,
            hasPrefilter: customerHasPrefilter
          });
          // Don't fail the job completion if customer update fails - just log it
        }
      }

      toast.success('Job completed successfully');
      handleClose();
      onJobCompleted();
    } catch (error: any) {
      console.error('❌ [CompleteJobDialog] Exception during job completion:', {
        error,
        errorMessage: error?.message,
        errorStack: error?.stack,
        jobId: job?.id
      });
      toast.error(`Failed to complete job: ${error?.message || 'Unknown error'}`);
      setIsSubmittingJobCompletion(false);
    }
  };

  const handleSubmit = async () => {
    if (!job) return;

    // Step 1: Bill Amount - validate and show confirmation
    if (completeJobStep === 1) {
      const billAmountNum = parseFloat(billAmount);
      if (!billAmount || isNaN(billAmountNum) || billAmountNum < 0) {
        toast.error('Please enter a valid bill amount');
        return;
      }
      // Show confirmation dialog
      setBillAmountConfirmOpen(true);
      return;
    }

    // Step 2: Bill Photo (optional) - move to next step
    if (completeJobStep === 2) {
      // Check if we should skip AMC step (step 3)
      const billIsZero = isBillAmountZero();
      const isSoftener = isSoftenerService();
      const shouldSkipAMC = billIsZero || isSoftener;
      
      // Determine next step:
      // - If should skip AMC: go directly to step 4 (payment) or step 6 (prefilter/submit)
      // - If not skipping AMC: go to step 3 (AMC)
      let nextStep: 3 | 4 | 6 = 3;
      if (shouldSkipAMC) {
        if (billIsZero) {
          // Skip AMC and payment steps, go directly to prefilter (or submit if softener)
          nextStep = 6;
        } else {
          // Skip AMC but go to payment step (step 4)
          nextStep = 4;
        }
      }
      
      // If skipping AMC and bill is zero and softener, submit directly
      if (shouldSkipAMC && billIsZero && isSoftener) {
        setHasAMC(false);
        setCustomerHasPrefilter(null);
        setCompleteJobStep(6);
        // Directly call submission for softener with zero bill
        await performJobSubmission();
        return;
      } else {
        setCompleteJobStep(nextStep);
        return;
      }
    }

    // Step 3: AMC Information (optional, can skip) - move to next step
    if (completeJobStep === 3) {
      // Skip AMC step if bill is zero or service is softener (shouldn't reach here, but safety check)
      const billIsZeroStep3 = isBillAmountZero();
      const isSoftenerStep3 = isSoftenerService();
      if (billIsZeroStep3 || isSoftenerStep3) {
        // Auto-skip AMC and proceed
        setHasAMC(false);
        const nextStep = billIsZeroStep3 ? 6 : 4;
        if (billIsZeroStep3 && isSoftenerStep3) {
          setCustomerHasPrefilter(null);
          setCompleteJobStep(6);
          // Directly call submission for softener with zero bill
          await performJobSubmission();
          return;
        } else {
          setCompleteJobStep(nextStep);
          return;
        }
      }
      
      // Only allow proceeding if hasAMC is not null (question has been answered)
      if (hasAMC === null) {
        toast.error('Please answer whether the customer needs AMC or not');
          return;
        }
      
      // If years is 0, treat it as no AMC
      const effectiveHasAMC = hasAMC === true && amcYears > 0;
      
      // Check if bill amount is zero - if so, skip payment steps (4 and 5)
      const billIsZeroStep3Continue = isBillAmountZero();
      
      // Determine next step:
      // - If bill is zero: skip to step 6 (prefilter) or submit if softener
      // - If bill is not zero: go to step 4 (payment mode)
      let nextStep: 4 | 6 = 4;
      const billIsZeroStep3Final = billIsZeroStep3Continue;
      if (billIsZeroStep3Final) {
        // Skip payment steps, go directly to prefilter (or submit if softener)
        nextStep = 6;
      }
      
      // If bill is zero and service is softener, skip prefilter step and submit directly
      if (billIsZeroStep3Final && isSoftenerService()) {
        // Set customerHasPrefilter to null (not applicable for softener)
        setCustomerHasPrefilter(null);
        setCompleteJobStep(6);
        // Directly call submission for softener with zero bill
        await performJobSubmission();
        return;
      } else {
        setCompleteJobStep(nextStep);
        return;
      }
    }

    // Step 4: Payment Mode - validate and move to step 5
    if (completeJobStep === 4) {
      // Skip payment step if bill amount is zero (shouldn't reach here, but safety check)
      if (isBillAmountZero()) {
        // Skip to step 6 (prefilter) or submit if softener
        const isSoftener = isSoftenerService();
        if (isSoftener) {
          setCustomerHasPrefilter(null);
          setCompleteJobStep(6);
          // Directly call submission for softener with zero bill
          await performJobSubmission();
          return;
        } else {
          setCompleteJobStep(6);
          return;
        }
      }
      
      // Validate payment mode only if bill amount is not zero
      if (!paymentMode) {
        toast.error('Please select a payment mode');
        return;
      }
      // If Online, need to check QR code selection first
      if (paymentMode === 'ONLINE') {
        if (!selectedQrCodeId) {
          toast.error('Please select a QR code');
          return;
        }
      }
      // Move to step 5 (Payment Screenshot)
      setCompleteJobStep(5);
      return;
    }

    // Step 5: Payment Screenshot (optional) - move to step 6 (Prefilter) or submit if softener
    if (completeJobStep === 5) {
      // If service is softener, skip prefilter step and submit directly
      if (isSoftenerService()) {
        // Set customerHasPrefilter to null (not applicable for softener)
        setCustomerHasPrefilter(null);
        setCompleteJobStep(6);
        // Directly call submission for softener
        await performJobSubmission();
        return;
      } else {
        setCompleteJobStep(6);
        return;
      }
    }

    // Step 6: Prefilter - submit the form (or submit directly if softener service skipped this step)
    if (completeJobStep === 6) {
      // Call the extracted submission function
      await performJobSubmission();
      return;
    }
  };

  if (!job) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => {
        if (!open && !isSubmittingJobCompletion) {
          handleClose();
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-[500px] max-w-[500px] h-[85vh] sm:h-[600px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>Complete Job</DialogTitle>
            <DialogDescription>
              {isSubmittingJobCompletion ? (
                <span className="text-blue-600 font-medium">
                  💾 Submitting job completion... Your data is saved safely.
                </span>
              ) : (
                <>
                  {completeJobStep === 1 && 'Enter the bill amount for this job'}
                  {completeJobStep === 2 && 'Upload bill photo (optional)'}
                  {completeJobStep === 3 && 'AMC Information (Optional - Can Skip)'}
                  {completeJobStep === 4 && 'Select payment mode and QR code'}
                  {completeJobStep === 5 && 'Upload payment screenshot (optional)'}
                  {completeJobStep === 6 && !isSoftenerService() && 'Does the customer have a prefilter?'}
                  {completeJobStep === 6 && isSoftenerService() && 'Complete Job'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {/* Scrollable Content - iOS Safari fix for scrolling */}
          <div 
            ref={completeJobScrollRef}
            className="flex-1 overflow-y-auto px-6 py-4"
            style={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
              overscrollBehavior: 'contain',
              minHeight: 0,
              position: 'relative',
            }}
          >
            {job && (
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
            )}

            {/* Step Indicator - Fixed horizontal scroll and border clipping */}
            <div className="flex items-center justify-center mb-6 overflow-x-auto pb-2 -mx-2 px-2">
              <div className="flex items-center space-x-0.5 sm:space-x-1 min-w-0 flex-shrink-0 py-1">
                {/* Step 1 - Bill Amount */}
                <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                  completeJobStep === 1 ? 'bg-black text-white' : 
                  completeJobStep > 1 ? 'bg-black text-white' : 
                  'bg-gray-200 text-gray-600'
                }`}>
                  {completeJobStep === 1 && (
                    <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                  )}
                  <span className="relative z-10">1</span>
                </div>
                <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                  completeJobStep >= 2 ? 'bg-black' : 'bg-gray-200'
                }`}></div>
                
                {/* Step 2 - Bill Photo */}
                <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                  completeJobStep === 2 ? 'bg-black text-white' : 
                  completeJobStep > 2 ? 'bg-black text-white' : 
                  'bg-gray-200 text-gray-600'
                }`}>
                  {completeJobStep === 2 && (
                    <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                  )}
                  <span className="relative z-10">2</span>
                </div>
                <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                  completeJobStep >= 3 ? 'bg-black' : 'bg-gray-200'
                }`}></div>
                
                {/* Step 3 - AMC Info */}
                <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                  completeJobStep === 3 ? 'bg-black text-white' : 
                  completeJobStep > 3 ? 'bg-black text-white' : 
                  'bg-gray-200 text-gray-600'
                }`}>
                  {completeJobStep === 3 && (
                    <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                  )}
                  <span className="relative z-10">3</span>
                </div>
                <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                  completeJobStep >= 4 ? 'bg-black' : 'bg-gray-200'
                }`}></div>
                
                {/* Step 4 - Payment Mode */}
                <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                  completeJobStep === 4 ? 'bg-black text-white' : 
                  completeJobStep > 4 ? 'bg-black text-white' : 
                  'bg-gray-200 text-gray-600'
                }`}>
                  {completeJobStep === 4 && (
                    <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                  )}
                  <span className="relative z-10">4</span>
                </div>
                <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                  completeJobStep >= 5 ? 'bg-black' : 'bg-gray-200'
                }`}></div>
                
                {/* Step 5 - Payment Screenshot */}
                <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                  completeJobStep === 5 ? 'bg-black text-white' : 
                  completeJobStep > 5 ? 'bg-black text-white' : 
                  'bg-gray-200 text-gray-600'
                }`}>
                  {completeJobStep === 5 && (
                    <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                  )}
                  <span className="relative z-10">5</span>
                </div>
                <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                  completeJobStep >= 6 ? 'bg-black' : 'bg-gray-200'
                }`}></div>
                
                {/* Step 6 - Prefilter */}
                <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                  completeJobStep === 6 ? 'bg-black text-white' : 
                  'bg-gray-200 text-gray-600'
                }`}>
                  {completeJobStep === 6 && (
                    <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                  )}
                  <span className="relative z-10">6</span>
                </div>
              </div>
            </div>

            {/* Step 1: Bill Amount */}
            {completeJobStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bill-amount">Bill Amount *</Label>
                  <Input
                    id="bill-amount"
                    type="number"
                    placeholder="Enter bill amount"
                    value={billAmount}
                    onChange={(e) => {
                      setBillAmount(e.target.value);
                    }}
                    className="mt-1"
                    min="0"
                    step="0.01"
                  />
                  {billAmount && parseFloat(billAmount) > 0 && (
                    <p className="text-sm text-gray-600 mt-2">
                      Bill Amount: ₹{(() => {
                        const amount = parseFloat(billAmount || '0');
                        const formatted = amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                        return formatted.replace(/\.00$/, '');
                      })()}
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

            {/* Step 2: Bill Photo */}
            {completeJobStep === 2 && (
              <div className="space-y-4">
                <div>
                  <Label>Upload Bill Photo (Optional)</Label>
                  <ImageUpload
                    onImagesChange={(images) => {
                      setBillPhotos(images);
                    }}
                    maxImages={5}
                    folder="bills"
                    title=""
                    description=""
                    maxWidth={1024}
                    quality={0.5}
                    aggressiveCompression={true}
                    onUploadStart={() => setIsBillPhotosUploading(true)}
                    onUploadEnd={() => setIsBillPhotosUploading(false)}
                  />
                </div>
              </div>
            )}

            {/* Step 3: AMC Info */}
            {completeJobStep === 3 && !isBillAmountZero() && !isSoftenerService() && (
              <div className="space-y-4">
                {hasAMC === null ? (
                  <>
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Does the customer need AMC?</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => {
                            setHasAMC(true);
                            const today = getTodayLocalDate();
                            setAmcDateGiven(today);
                            setAmcYears(1);
                            calculateAMCEndDate(today, 1);
                          }}
                          className="p-4 rounded-lg border-2 transition-all duration-200 border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center border-gray-400">
                            </div>
                            <span className="font-medium text-sm">Yes</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHasAMC(false);
                            setAmcDateGiven('');
                            setAmcEndDate('');
                            setAmcYears(0);
                            setAmcIncludesPrefilter(false);
                            setAmcAdditionalInfo('');
                            // Auto-advance to next step if No
                            setCompleteJobStep(4);
                          }}
                          className="p-4 rounded-lg border-2 transition-all duration-200 border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center border-gray-400">
                            </div>
                            <span className="font-medium text-sm">No</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </>
                ) : hasAMC === true ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="amc-date-given">AMC Date of Agreement *</Label>
                      <Input
                        id="amc-date-given"
                        type="date"
                        value={amcDateGiven}
                        onChange={(e) => {
                          setAmcDateGiven(e.target.value);
                          if (e.target.value && amcYears > 0) {
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
                    <div>
                      <Label htmlFor="amc-additional-info">Additional Information (Optional)</Label>
                      <Textarea
                        id="amc-additional-info"
                        placeholder="Any additional notes about the AMC..."
                        value={amcAdditionalInfo}
                        onChange={(e) => setAmcAdditionalInfo(e.target.value)}
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Step 4: Payment Mode */}
            {completeJobStep === 4 && !isBillAmountZero() && (
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

            {/* Step 5: Payment Screenshot */}
            {completeJobStep === 5 && !isBillAmountZero() && (
              <div className="space-y-4">
                <div>
                  <Label>Payment Screenshot (Optional)</Label>
                  <p className="text-sm text-gray-500 mb-2">
                    {paymentMode === 'ONLINE' 
                      ? 'Upload payment confirmation screenshot' 
                      : 'Upload payment receipt (optional)'}
                  </p>
                  <ImageUpload
                    onImagesChange={(images) => {
                      setPaymentScreenshot(images[0] || '');
                    }}
                    maxImages={1}
                    folder="payment-receipts"
                    title=""
                    description=""
                    maxWidth={800}
                    quality={0.3}
                    aggressiveCompression={true}
                    useSecondaryAccount={true}
                    onUploadStart={() => setIsPaymentScreenshotUploading(true)}
                    onUploadEnd={() => setIsPaymentScreenshotUploading(false)}
                  />
                </div>
              </div>
            )}

            {/* Step 6: Prefilter Question or Softener Complete */}
            {completeJobStep === 6 && isSoftenerService() && (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <p className="text-gray-600">Completing job...</p>
                </div>
              </div>
            )}

            {completeJobStep === 6 && !isSoftenerService() && (
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
              disabled={isSubmittingJobCompletion}
            >
              {completeJobStep > 1 ? 'Back' : 'Cancel'}
            </Button>
            {completeJobStep === 2 && (
              <Button
                variant="outline"
                onClick={() => {
                  // Skip bill photo step
                  const billIsZero = isBillAmountZero();
                  const isSoftener = isSoftenerService();
                  const shouldSkipAMC = billIsZero || isSoftener;
                  
                  let nextStep: 3 | 4 | 6 = 3;
                  if (shouldSkipAMC) {
                    if (billIsZero) {
                      nextStep = 6;
                    } else {
                      nextStep = 4;
                    }
                  }
                  
                  if (shouldSkipAMC && billIsZero && isSoftener) {
                    setHasAMC(false);
                    setCustomerHasPrefilter(null);
                    setCompleteJobStep(6);
                  } else {
                    setCompleteJobStep(nextStep);
                  }
                }}
                disabled={isSubmittingJobCompletion}
              >
                Skip
              </Button>
            )}
            {completeJobStep === 3 && !isBillAmountZero() && !isSoftenerService() && (
              <Button
                variant="outline"
                onClick={() => {
                  // Skip AMC step - go to payment step (step 4)
                  setHasAMC(false);
                  setAmcDateGiven('');
                  setAmcEndDate('');
                  setAmcYears(0);
                  setAmcIncludesPrefilter(false);
                  setAmcAdditionalInfo('');
                  setCompleteJobStep(4);
                }}
                disabled={isSubmittingJobCompletion}
              >
                Skip AMC
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              className="bg-black hover:bg-gray-800 !text-white font-semibold"
              disabled={
                isSubmittingJobCompletion || 
                (completeJobStep === 6 && (isBillPhotosUploading || isPaymentScreenshotUploading)) ||
                // Step 4 validation: only require payment mode if bill amount is not zero
                (completeJobStep === 4 && !isBillAmountZero() && !paymentMode) || 
                (completeJobStep === 4 && !isBillAmountZero() && paymentMode === 'ONLINE' && !selectedQrCodeId)
              }
            >
              {isSubmittingJobCompletion || (completeJobStep === 6 && (isBillPhotosUploading || isPaymentScreenshotUploading)) ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {isSubmittingJobCompletion ? 'Completing...' : 'Uploading...'}
                </>
              ) : (
                (completeJobStep === 6 || (completeJobStep === 3 && isBillAmountZero() && isSoftenerService()) || (completeJobStep === 5 && isSoftenerService())) 
                  ? 'Complete Job' 
                  : 'Next'
              )}
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
                ₹{(() => {
                  const amount = parseFloat(billAmount || '0');
                  const formatted = amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                  return formatted.replace(/\.00$/, '');
                })()}
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
                setCompleteJobStep(2);
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
