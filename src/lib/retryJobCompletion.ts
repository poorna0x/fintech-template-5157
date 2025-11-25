// Retry Job Completion Service
// Processes queued job completions and submits them when network is available

import { db } from '@/lib/supabase';
import {
  getQueuedJobCompletions,
  removeQueuedJobCompletion,
  updateQueuedCompletionRetry,
  OfflineJobCompletion,
} from './offlineJobCompletion';
import { isOnline } from './offlinePhotoQueue';
import { toast } from 'sonner';
import { isTimeoutError, isSlowNetworkError } from './networkTimeout';

let isProcessing = false;
let retryInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Process a single queued job completion
 */
const processQueuedCompletion = async (completion: OfflineJobCompletion): Promise<boolean> => {
  try {
    // Map payment mode to database allowed values
    let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | null = null;
    if (completion.paymentMode === 'CASH') {
      dbPaymentMethod = 'CASH';
    } else if (completion.paymentMode === 'ONLINE') {
      dbPaymentMethod = 'UPI';
    }

    const updateData: any = {
      status: 'COMPLETED',
      end_time: new Date().toISOString(),
      completion_notes: completion.completionNotes.trim(),
      completed_by: completion.userId || completion.technicianId || 'technician',
      completed_at: new Date().toISOString(),
      actual_cost: parseFloat(completion.billAmount) || 0,
      payment_amount: parseFloat(completion.billAmount) || 0,
      payment_method: dbPaymentMethod || 'CASH',
    };

    // Handle requirements - merge bill photos and AMC info
    const { data: jobData } = await db.jobs.getById(completion.jobId);
    if (!jobData) {
      throw new Error('Job not found');
    }

    const currentRequirements = (jobData as any).requirements || [];
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

    // Remove existing entries
    requirements = requirements.filter((req: any) => 
      !req.bill_photos && !req.payment_photos && !req.qr_photos && !req.amc_info
    );

    // Only add bill photos if they are uploaded Cloudinary URLs
    // Photos that failed to upload are queued separately and will be added later
    const uploadedBillPhotos = completion.billPhotos.filter((url: string) => 
      url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
    );
    if (uploadedBillPhotos.length > 0) {
      requirements.push({ bill_photos: uploadedBillPhotos });
    }

    // Add QR code photos if payment is online
    if (completion.paymentMode === 'ONLINE' && completion.selectedQrCodeId) {
      const qrPhotos: any = {
        qr_code_type: completion.qrCodeType,
        selected_qr_code_id: completion.selectedQrCodeId,
        payment_screenshot: completion.paymentScreenshot || null,
      };
      
      if (completion.selectedQrCodeUrl) {
        qrPhotos.selected_qr_code_url = completion.selectedQrCodeUrl;
      }
      if (completion.selectedQrCodeName) {
        qrPhotos.selected_qr_code_name = completion.selectedQrCodeName;
      }
      
      requirements.push({ qr_photos: qrPhotos });
    }

    // Add AMC info if provided
    if (completion.hasAMC && completion.amcDateGiven && completion.amcEndDate) {
      requirements.push({ 
        amc_info: {
          date_given: completion.amcDateGiven,
          end_date: completion.amcEndDate,
          years: completion.amcYears,
          includes_prefilter: completion.amcIncludesPrefilter
        }
      });
    }

    // Update requirements if we have any changes
    if (completion.billPhotos.length > 0 || 
        (completion.paymentMode === 'ONLINE' && completion.qrCodeType) || 
        (completion.hasAMC && completion.amcDateGiven && completion.amcEndDate)) {
      updateData.requirements = JSON.stringify(requirements);
    }

    // Update job
    const { error } = await db.jobs.update(completion.jobId, updateData);

    if (error) {
      throw new Error(error.message);
    }

    // Update customer prefilter status if provided
    if (completion.customerHasPrefilter !== null && jobData.customerId) {
      await db.customers.update(jobData.customerId, {
        has_prefilter: completion.customerHasPrefilter
      });
    }

    console.log('✅ Successfully submitted queued job completion:', completion.id);
    
    // Remove from queue on success
    removeQueuedJobCompletion(completion.id);
    
    return true;
  } catch (error: any) {
    console.error('❌ Failed to submit queued job completion:', completion.id, error);
    
    // Check if it's a network/timeout error
    const isNetworkError = isSlowNetworkError(error) || !isOnline();
    
    if (!isNetworkError) {
      // Non-network error - increment retry count
      updateQueuedCompletionRetry(completion.id);
      console.log(`⚠️ Non-network error for completion ${completion.id}, retry count incremented`);
    } else {
      console.log(`🌐 Network/timeout error for completion ${completion.id}, will retry when network improves`);
    }
    
    return false;
  }
};

/**
 * Process all queued job completions
 */
export const processQueuedJobCompletions = async (): Promise<{ success: number; failed: number }> => {
  if (!isOnline()) {
    console.log('📴 Offline - skipping job completion processing');
    return { success: 0, failed: 0 };
  }

  if (isProcessing) {
    console.log('⏳ Already processing queued job completions');
    return { success: 0, failed: 0 };
  }

  const queuedCompletions = getQueuedJobCompletions();
  
  if (queuedCompletions.length === 0) {
    return { success: 0, failed: 0 };
  }

  isProcessing = true;
  console.log(`🔄 Processing ${queuedCompletions.length} queued job completion(s)...`);

  let successCount = 0;
  let failedCount = 0;

  // Process completions one by one
  for (const completion of queuedCompletions) {
    const success = await processQueuedCompletion(completion);
    if (success) {
      successCount++;
    } else {
      failedCount++;
    }
    
    // Small delay between submissions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  isProcessing = false;

  if (successCount > 0) {
    toast.success(`✅ ${successCount} saved job completion(s) submitted successfully!`, {
      duration: 4000,
    });
  }

  if (failedCount > 0 && isOnline()) {
    toast.warning(`⚠️ ${failedCount} job completion(s) still waiting. Will retry automatically.`, {
      duration: 5000,
    });
  }

  return { success: successCount, failed: failedCount };
};

/**
 * Start automatic retry processing
 */
export const startJobCompletionRetryProcessing = (intervalMs: number = 30000): void => {
  if (retryInterval) {
    return; // Already started
  }

  // Process immediately
  processQueuedJobCompletions();

  // Then process periodically
  retryInterval = setInterval(() => {
    if (isOnline() && !isProcessing) {
      processQueuedJobCompletions();
    }
  }, intervalMs);

  console.log('🚀 Started automatic job completion retry processing');
};

/**
 * Stop automatic retry processing
 */
export const stopJobCompletionRetryProcessing = (): void => {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    console.log('🛑 Stopped automatic job completion retry processing');
  }
};

/**
 * Process queued completions when network comes back online
 */
export const setupJobCompletionOnlineListener = (): (() => void) => {
  const handleOnline = () => {
    console.log('🌐 Network online - processing queued job completions immediately');
    // Process immediately when network comes back
    setTimeout(() => {
      processQueuedJobCompletions();
    }, 500); // Small delay to ensure network is stable
  };

  window.addEventListener('online', handleOnline);
  
  // Also check network status periodically and process if online
  const networkCheckInterval = setInterval(() => {
    if (isOnline() && !isProcessing) {
      const queuedCount = getQueuedJobCompletions().length;
      if (queuedCount > 0) {
        console.log(`🌐 Network available - processing ${queuedCount} queued job completion(s)...`);
        processQueuedJobCompletions();
      }
    }
  }, 10000); // Check every 10 seconds
  
  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(networkCheckInterval);
  };
};

